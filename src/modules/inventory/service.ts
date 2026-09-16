import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import { getUserSummaries } from "@/modules/auth";
import {
  deriveStockStatus,
  getProduct,
  lockProductForStockChange,
  searchProducts,
  type Product,
  type ProductActivityFilter,
  type StockStatus,
} from "@/modules/catalog";
import {
  authorize,
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
import { optionalCalendarDate } from "@/shared/calendar";
import { failure, type Failure } from "@/shared/errors";
import {
  MAX_QUANTITY,
  parseQuantityInput,
  quantityFromDatabase,
  quantityToDatabase,
  type Quantity,
} from "@/shared/quantity";
import * as repository from "./repository";
import { inventoryMovementType } from "./schema";

// Productos con saldo y estado de stock (brief-4.2, D-1): catalog aporta los productos y deriva
// el estado; inventory aporta el saldo y compone en memoria, sin JOIN entre módulos.

const ZERO_BALANCE = "0.000";

export type ProductStock = Product & {
  quantityOnHand: string;
  stockStatus: StockStatus;
};

export function withStock(
  product: Product,
  balances: Map<string, string>,
): ProductStock {
  const quantityOnHand = balances.get(product.id) ?? ZERO_BALANCE;
  return {
    ...product,
    quantityOnHand,
    stockStatus: deriveStockStatus(
      quantityFromDatabase(quantityOnHand),
      quantityFromDatabase(product.reorderPoint),
    ),
  };
}

export const PRODUCTS_PAGE_SIZE = 25;

export type StockStatusFilter = "all" | StockStatus;

export type ProductListFilters = {
  text: string;
  stockStatus: StockStatusFilter;
  activity: ProductActivityFilter;
  page: number;
};

export type ProductStockPage = {
  products: ProductStock[];
  total: number;
  page: number;
  pageCount: number;
};

const collator = new Intl.Collator("es", { sensitivity: "base" });

// Filtra por estado, ordena por nombre y pagina. Una página fuera de rango se lleva a la última.
export function composeProductStockPage(
  products: Product[],
  balances: Map<string, string>,
  filters: Pick<ProductListFilters, "stockStatus" | "page">,
): ProductStockPage {
  const matching = products
    .map((product) => withStock(product, balances))
    .filter(
      (product) =>
        filters.stockStatus === "all" ||
        product.stockStatus === filters.stockStatus,
    )
    .sort(
      (a, b) =>
        collator.compare(a.name, b.name) ||
        collator.compare(a.sku, b.sku) ||
        a.id.localeCompare(b.id),
    );

  const pageCount = Math.max(
    1,
    Math.ceil(matching.length / PRODUCTS_PAGE_SIZE),
  );
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const start = (page - 1) * PRODUCTS_PAGE_SIZE;
  return {
    products: matching.slice(start, start + PRODUCTS_PAGE_SIZE),
    total: matching.length,
    page,
    pageCount,
  };
}

// Lista de la pantalla 3 (FR-PROD-04). Límite aceptado: lee todos los productos que cumplen
// texto y actividad; se revisa en la Fase 8 o con más de 2 000 productos (D-1).
export async function listProductStock(
  context: AuthContext,
  filters: ProductListFilters,
): Promise<({ ok: true } & ProductStockPage) | Failure<"FORBIDDEN">> {
  const found = await searchProducts(context, filters);
  if (!found.ok) return found;
  const balances = await repository.findBalances(
    context.organizationId,
    found.products.map((product) => product.id),
  );
  return {
    ok: true,
    ...composeProductStockPage(found.products, balances, filters),
  };
}

// Detalle de la pantalla 4: el producto con su saldo y estado.
export async function getProductStock(
  context: AuthContext,
  productId: string,
): Promise<
  | { ok: true; product: ProductStock }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const found = await getProduct(context, productId);
  if (!found.ok) return found;
  const balances = await repository.findBalances(context.organizationId, [
    found.product.id,
  ]);
  return { ok: true, product: withStock(found.product, balances) };
}

// Ajuste manual de stock (brief-4.3.1): movimiento, saldo y auditoría en una sola transacción
// (FR-PROD-06 a 08). Las cantidades se calculan en milésimas, nunca con number.

export type StockMovementType = repository.StockMovementType;

// Datos de un formulario: todo llega como texto y se valida aquí (D-5).
export type StockAdjustmentInput = {
  type: string;
  quantity: string;
  // Saldo que vio quien ajusta; si cambió, el ajuste da CONFLICT (D-2).
  expectedQuantityOnHand: string;
  reason: string;
};

export type StockAdjustmentField = keyof StockAdjustmentInput;

const STOCK_ADJUSTMENT_FIELDS: StockAdjustmentField[] = [
  "type",
  "quantity",
  "expectedQuantityOnHand",
  "reason",
];

export type StockAdjustmentValues = {
  type: StockMovementType;
  quantity: Quantity;
  expectedQuantityOnHand: Quantity;
  reason: string;
};

function quantityAtLeast(min: Quantity) {
  return z.string().transform((value, ctx) => {
    const quantity = parseQuantityInput(value);
    if (quantity === null || quantity < min) {
      ctx.addIssue({ code: "custom", message: "cantidad inválida" });
      return z.NEVER;
    }
    return quantity;
  });
}

const stockAdjustmentSchema = z.object({
  type: z.enum(inventoryMovementType.enumValues),
  quantity: quantityAtLeast(1n),
  expectedQuantityOnHand: quantityAtLeast(0n),
  reason: z.string().trim().min(1).max(500),
});

export function validateStockAdjustmentInput(
  input: StockAdjustmentInput,
):
  | { ok: true; values: StockAdjustmentValues }
  | Failure<"VALIDATION_ERROR", { fields: StockAdjustmentField[] }> {
  const parsed = stockAdjustmentSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: STOCK_ADJUSTMENT_FIELDS.filter((field) => fields.has(field)),
  };
}

export type BalanceRule = "negative_stock" | "stock_limit";

// Saldo resultante: nunca negativo (ADR 0008) ni mayor que el máximo de numeric(14, 3).
export function computeBalanceAfter(
  current: Quantity,
  type: StockMovementType,
  quantity: Quantity,
): { ok: true; balanceAfter: Quantity } | { ok: false; rule: BalanceRule } {
  const balanceAfter =
    type === "adjustment_positive" ? current + quantity : current - quantity;
  if (balanceAfter < 0n) return { ok: false, rule: "negative_stock" };
  if (balanceAfter > MAX_QUANTITY) return { ok: false, rule: "stock_limit" };
  return { ok: true, balanceAfter };
}

// Cantidades en la escala de la base ("6.000"), como texto (D-3).
export type StockAdjustmentResult =
  | { ok: true; quantityOnHand: string }
  // VALIDATION_ERROR sin fields: id inválido (brief-4.4, D-6). Con fields: el formulario.
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: StockAdjustmentField[] }>
  | Failure<"CONFLICT", { currentQuantityOnHand: string }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "inactive_product" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      {
        rule: BalanceRule;
        currentQuantityOnHand: string;
        requestedQuantity: string;
      }
    >;

type StockAdjustmentRejection = Exclude<StockAdjustmentResult, { ok: true }>;

// Un rechazo se lanza para revertir la transacción entera: también la fila de inventories
// que acaba de crear el primer ajuste de un producto (hallazgo 4).
class AdjustmentRejected extends Error {
  constructor(readonly result: StockAdjustmentRejection) {
    super(result.code);
    this.name = "AdjustmentRejected";
  }
}

const productIdSchema = z.uuid();

// Solo admin. Orden de bloqueos fijo: el producto en modo compartido y después su saldo (D-1).
export async function adjustStock(
  context: AuthContext,
  productId: string,
  input: StockAdjustmentInput,
): Promise<StockAdjustmentResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  // Un id de la URL no es un campo del formulario: va sin fields (brief-4.4, D-6).
  if (!productIdSchema.safeParse(productId).success) {
    return failure("VALIDATION_ERROR");
  }
  const validated = validateStockAdjustmentInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  const { organizationId, userId } = context;

  try {
    return await repository.withTransaction(async (tx) => {
      const product = await lockProductForStockChange(
        tx,
        organizationId,
        productId,
      );
      if (product === "not_found") {
        throw new AdjustmentRejected(failure("NOT_FOUND"));
      }
      if (product === "inactive") {
        throw new AdjustmentRejected({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "inactive_product",
        });
      }

      const current = quantityFromDatabase(
        await repository.lockBalance(tx, organizationId, productId),
      );
      if (current !== values.expectedQuantityOnHand) {
        throw new AdjustmentRejected({
          ok: false,
          code: "CONFLICT",
          currentQuantityOnHand: quantityToDatabase(current),
        });
      }

      const computed = computeBalanceAfter(
        current,
        values.type,
        values.quantity,
      );
      if (!computed.ok) {
        throw new AdjustmentRejected({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: computed.rule,
          currentQuantityOnHand: quantityToDatabase(current),
          requestedQuantity: quantityToDatabase(values.quantity),
        });
      }

      const before = quantityToDatabase(current);
      const balanceAfter = quantityToDatabase(computed.balanceAfter);
      await repository.applyStockChange(tx, {
        organizationId,
        productId,
        type: values.type,
        quantity: quantityToDatabase(values.quantity),
        balanceAfter,
        reason: values.reason,
        createdBy: userId,
      });
      // entity_id es el producto: su historial reúne ediciones y ajustes (D-4).
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "inventory",
        entityId: productId,
        action: "stock_adjustment",
        diff: {
          before: { quantityOnHand: before },
          after: { quantityOnHand: balanceAfter },
        },
      });
      return { ok: true as const, quantityOnHand: balanceAfter };
    });
  } catch (error) {
    if (error instanceof AdjustmentRejected) return error.result;
    throw error;
  }
}

// Historial de movimientos de un producto (brief-4.3.3, FR-PROD-09): paginado en SQL (D-2),
// con período en días de la zona de la organización (D-3 y D-4) y autor compuesto desde auth.

export const MOVEMENTS_PAGE_SIZE = 25;

// Filtros de la URL, como texto. type es "all" o un tipo; from y to vacíos no limitan.
export type MovementHistoryFilters = {
  type: string;
  from: string;
  to: string;
  page: number;
};

export type MovementHistoryField = "type" | "from" | "to";

const MOVEMENT_HISTORY_FIELDS: MovementHistoryField[] = ["type", "from", "to"];

export type MovementHistoryValues = {
  type: StockMovementType | null;
  from: string | null;
  to: string | null;
};

const movementHistorySchema = z
  .object({
    type: z
      .union([z.literal("all"), z.enum(inventoryMovementType.enumValues)])
      .transform((type) => (type === "all" ? null : type)),
    from: optionalCalendarDate,
    to: optionalCalendarDate,
  })
  .superRefine((values, ctx) => {
    // Las fechas YYYY-MM-DD se comparan como texto.
    if (values.from && values.to && values.from > values.to) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "invertido" });
      ctx.addIssue({ code: "custom", path: ["to"], message: "invertido" });
    }
  });

export function validateMovementHistoryFilters(
  filters: MovementHistoryFilters,
):
  | { ok: true; values: MovementHistoryValues }
  | Failure<"VALIDATION_ERROR", { fields: MovementHistoryField[] }> {
  const parsed = movementHistorySchema.safeParse(filters);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: MOVEMENT_HISTORY_FIELDS.filter((field) => fields.has(field)),
  };
}

// Una página fuera de rango se lleva a la última; una no numérica o menor que 1, a la primera.
export function movementPageBounds(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / MOVEMENTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  return { page, pageCount, offset: (page - 1) * MOVEMENTS_PAGE_SIZE };
}

export type StockMovement = {
  id: string;
  type: StockMovementType;
  quantity: string;
  balanceAfter: string;
  reason: string;
  createdAt: Date;
  author: { id: string; name: string };
};

export type StockMovementPage = {
  movements: StockMovement[];
  total: number;
  page: number;
  pageCount: number;
  // Zona IANA en la que se interpretó el período y en la que se muestran las fechas.
  timezone: string;
  // Con filtros y sin filas: distingue "sin resultados" de "sin movimientos" (hallazgo 9).
  productHasMovements: boolean;
};

export type StockMovementHistoryResult =
  | ({ ok: true } & StockMovementPage)
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: MovementHistoryField[] }>;

// Lectura para admin y viewer. getProduct resuelve autorización, id y organización (hallazgo 7).
export async function listStockMovements(
  context: AuthContext,
  productId: string,
  filters: MovementHistoryFilters,
): Promise<StockMovementHistoryResult> {
  const found = await getProduct(context, productId);
  if (!found.ok) return found;
  const validated = validateMovementHistoryFilters(filters);
  if (!validated.ok) return validated;
  const { values } = validated;

  const query: repository.MovementQuery = {
    organizationId: context.organizationId,
    productId: found.product.id,
    ...values,
    timezone: await getOrganizationTimezone(context),
  };
  const total = await repository.countMovements(query);
  const { page, pageCount, offset } = movementPageBounds(total, filters.page);
  const rows =
    total === 0
      ? []
      : await repository.findMovements(query, MOVEMENTS_PAGE_SIZE, offset);

  const filtered =
    values.type !== null || values.from !== null || values.to !== null;
  const productHasMovements =
    total > 0 ||
    (filtered &&
      (await repository.hasMovements(query.organizationId, query.productId)));

  // Autores sin JOIN con users: auth devuelve también a los desactivados.
  const authors = new Map(
    (
      await getUserSummaries([...new Set(rows.map((row) => row.createdBy))])
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    movements: rows.map(({ createdBy, ...row }) => ({
      ...row,
      author: { id: createdBy, name: authors.get(createdBy) ?? "" },
    })),
    total,
    page,
    pageCount,
    timezone: query.timezone,
    productHasMovements,
  };
}
