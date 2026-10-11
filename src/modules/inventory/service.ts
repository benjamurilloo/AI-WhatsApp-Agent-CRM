import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  deriveStockStatus,
  getActiveProductForService,
  getCurrentPrices,
  getProduct,
  lockProductForStockChange,
  searchActiveProductsForService,
  searchProducts,
  type Product,
  type ProductActivityFilter,
  type ServiceProduct,
  type StockStatus,
} from "@/modules/catalog";
import {
  authorize,
  getMemberSummaries,
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
import { optionalCalendarDate } from "@/shared/calendar";
import type { DbTransaction } from "@/shared/db";
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

const ZERO_BALANCE: repository.Balance = { onHand: "0.000", reserved: "0.000" };

// Desde la 19.3 (ADR 0020, punto 7; brief-19.3, D-10) hay dos derivaciones del estado de stock:
// las pantallas usan lo disponible (saldo físico menos lo reservado), y las lecturas de servicio
// del agente siguen con el saldo físico, porque read-v1 no cambia.
export type ProductStock = Product & {
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  stockStatus: StockStatus;
};

// Pantallas: el estado y el orden por stock usan lo disponible.
export function withAvailableStock(
  product: Product,
  balances: Map<string, repository.Balance>,
): ProductStock {
  const balance = balances.get(product.id) ?? ZERO_BALANCE;
  const available =
    quantityFromDatabase(balance.onHand) -
    quantityFromDatabase(balance.reserved);
  return {
    ...product,
    quantityOnHand: balance.onHand,
    quantityReserved: balance.reserved,
    quantityAvailable: quantityToDatabase(available),
    stockStatus: deriveStockStatus(
      available,
      quantityFromDatabase(product.reorderPoint),
    ),
  };
}

// Lecturas de servicio: el saldo físico, como antes de la 19.3. No mirar lo reservado acá es lo
// que mantiene read-v1 sin cambios; lo fijan read-api.test.ts y read-api-product-stock.test.ts.
function withPhysicalStock(
  product: Pick<Product, "id" | "reorderPoint">,
  balances: Map<string, repository.Balance>,
): { quantityOnHand: string; stockStatus: StockStatus } {
  const quantityOnHand = (balances.get(product.id) ?? ZERO_BALANCE).onHand;
  return {
    quantityOnHand,
    stockStatus: deriveStockStatus(
      quantityFromDatabase(quantityOnHand),
      quantityFromDatabase(product.reorderPoint),
    ),
  };
}

export const PRODUCTS_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

export type StockStatusFilter = "all" | StockStatus;

// Órdenes del listado (brief-15.2, D-1). Sin orden, por nombre, como antes de la 15.2.
export const PRODUCT_SORTS = [
  "name_asc",
  "name_desc",
  "sku_asc",
  "stock_asc",
  "stock_desc",
  "price_asc",
  "price_desc",
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export type ProductListFilters = {
  text: string;
  stockStatus: StockStatusFilter;
  activity: ProductActivityFilter;
  page: number;
  // Marca y categoría exactas (brief-15.2, D-4); vacías no filtran.
  brand?: string;
  category?: string;
  sort?: ProductSort;
  // Filas por página (brief-15.2, D-2); fuera de 1 a 50, PRODUCTS_PAGE_SIZE.
  pageSize?: number;
};

export function productPageSize(pageSize: number | undefined): number {
  return pageSize !== undefined &&
    Number.isInteger(pageSize) &&
    pageSize >= 1 &&
    pageSize <= MAX_PAGE_SIZE
    ? pageSize
    : PRODUCTS_PAGE_SIZE;
}

export type ProductStockPage = {
  products: ProductStock[];
  total: number;
  page: number;
  pageCount: number;
};

const collator = new Intl.Collator("es", { sensitivity: "base" });

const byName = (a: ProductStock, b: ProductStock) =>
  collator.compare(a.name, b.name) ||
  collator.compare(a.sku, b.sku) ||
  a.id.localeCompare(b.id);

const bySku = (a: ProductStock, b: ProductStock) =>
  collator.compare(a.sku, b.sku) || a.id.localeCompare(b.id);

// Por lo disponible desde la 19.3 (ADR 0020, punto 7).
const byStock = (a: ProductStock, b: ProductStock) => {
  const left = quantityFromDatabase(a.quantityAvailable);
  const right = quantityFromDatabase(b.quantityAvailable);
  return left === right ? 0 : left < right ? -1 : 1;
};

// El comparador de cada orden. A igual valor, por nombre: una fila no salta de página. Un
// producto sin precio va al final en los dos sentidos. Por precio, los montos solo se comparan
// dentro de una moneda: primero se agrupa por moneda, en orden alfabético en los dos sentidos.
function comparator(
  sort: ProductSort,
  prices: Map<string, SortPrice>,
): (a: ProductStock, b: ProductStock) => number {
  switch (sort) {
    case "name_asc":
      return byName;
    case "name_desc":
      return (a, b) => byName(b, a);
    case "sku_asc":
      return bySku;
    case "stock_asc":
      return (a, b) => byStock(a, b) || byName(a, b);
    case "stock_desc":
      return (a, b) => byStock(b, a) || byName(a, b);
    case "price_asc":
    case "price_desc": {
      const sign = sort === "price_asc" ? 1 : -1;
      return (a, b) => {
        const left = prices.get(a.id);
        const right = prices.get(b.id);
        if (left === undefined || right === undefined) {
          if (left !== right) return left === undefined ? 1 : -1;
          return byName(a, b);
        }
        if (left.currency !== right.currency) {
          return left.currency < right.currency ? -1 : 1;
        }
        return (
          sign * (Number(left.amount) - Number(right.amount)) || byName(a, b)
        );
      };
    }
  }
}

type SortPrice = { amount: string; currency: string };

// Filtra por estado, ordena y pagina. Una página fuera de rango se lleva a la última. prices
// (id → monto y moneda) solo hace falta para ordenar por precio.
export function composeProductStockPage(
  products: Product[],
  balances: Map<string, repository.Balance>,
  filters: Pick<
    ProductListFilters,
    "stockStatus" | "page" | "sort" | "pageSize"
  >,
  prices: Map<string, SortPrice> = new Map(),
): ProductStockPage {
  const pageSize = productPageSize(filters.pageSize);
  const matching = products
    .map((product) => withAvailableStock(product, balances))
    .filter(
      (product) =>
        filters.stockStatus === "all" ||
        product.stockStatus === filters.stockStatus,
    )
    .sort(comparator(filters.sort ?? "name_asc", prices));

  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const start = (page - 1) * pageSize;
  return {
    products: matching.slice(start, start + pageSize),
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
  const ids = found.products.map((product) => product.id);
  const balances = await repository.findBalances(context.organizationId, ids);
  // El precio de todos los que cumplen el filtro, solo para ordenar por precio (brief-15.2, H-2).
  const prices = new Map<string, SortPrice>();
  if (filters.sort === "price_asc" || filters.sort === "price_desc") {
    const current = await getCurrentPrices(context, ids);
    if (!current.ok) return current;
    for (const [id, price] of current.prices) {
      prices.set(id, { amount: price.amount, currency: price.currency });
    }
  }
  return {
    ok: true,
    ...composeProductStockPage(found.products, balances, filters, prices),
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
  return { ok: true, product: withAvailableStock(found.product, balances) };
}

// Lecturas de servicio de la API (brief-11.3, D-3): catalog aporta los activos con su precio, y
// acá se suma el estado de stock, como en la pantalla 3. **Sin la cantidad**: el agente recibe el
// estado, no el saldo (D-4). La organización sale de la credencial que autenticó la API. Desde la
// 16.6 el saldo sale solo por getProductStockForService, en su propia ruta.
export type ServiceCatalogProduct = ServiceProduct & {
  stockStatus: StockStatus;
};

async function withStockStatus(
  organizationId: string,
  products: ServiceProduct[],
): Promise<ServiceCatalogProduct[]> {
  const balances = await repository.findBalances(
    organizationId,
    products.map((product) => product.id),
  );
  return products.map((product) => ({
    ...product,
    stockStatus: withPhysicalStock(product, balances).stockStatus,
  }));
}

export async function searchCatalogForService(
  organizationId: string,
  query: { text: string; limit: number },
): Promise<ServiceCatalogProduct[]> {
  const products = await searchActiveProductsForService(organizationId, query);
  return withStockStatus(organizationId, products);
}

export async function getCatalogProductForService(
  organizationId: string,
  productId: string,
): Promise<ServiceCatalogProduct | null> {
  const product = await getActiveProductForService(organizationId, productId);
  if (!product) return null;
  const [withStatus] = await withStockStatus(organizationId, [product]);
  return withStatus ?? null;
}

// La cantidad disponible de un producto activo, para la API de lectura (brief-16.6, D-1 y D-3;
// FR-API-09). Es la única lectura de servicio que expone el saldo. El estado se deriva de esa
// misma cantidad, así que nunca contradice el número. Sin fila de inventario, el saldo es 0 (D-7
// de la 4.3). Un producto inactivo, de otra organización o inexistente da null, sin distinguir.
export type ServiceProductStock = {
  productId: string;
  unit: string;
  quantityOnHand: string;
  stockStatus: StockStatus;
};

export async function getProductStockForService(
  organizationId: string,
  productId: string,
): Promise<ServiceProductStock | null> {
  const product = await getActiveProductForService(organizationId, productId);
  if (!product) return null;
  const balances = await repository.findBalances(organizationId, [product.id]);
  const stock = withPhysicalStock(product, balances);
  return {
    productId: product.id,
    unit: product.unit,
    quantityOnHand: stock.quantityOnHand,
    stockStatus: stock.stockStatus,
  };
}

// Ajuste manual de stock (brief-4.3.1): movimiento, saldo y auditoría en una sola transacción
// (FR-PROD-06 a 08). Las cantidades se calculan en milésimas, nunca con number.

export type StockMovementType = repository.StockMovementType;

// El ajuste manual acepta solo sus dos tipos: order_delivery lo escribe la entrega de un pedido
// (ADR 0020, punto 4).
const ADJUSTMENT_TYPES = [
  "adjustment_positive",
  "adjustment_negative",
] as const;
export type StockAdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

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
  type: StockAdjustmentType;
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
  type: z.enum(ADJUSTMENT_TYPES),
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

export type BalanceRule = "negative_stock" | "below_reserved" | "stock_limit";

// Saldo resultante: nunca negativo (ADR 0008), nunca por debajo de lo reservado (ADR 0020,
// punto 5) ni mayor que el máximo de numeric(14, 3).
export function computeBalanceAfter(
  current: Quantity,
  type: StockAdjustmentType,
  quantity: Quantity,
  reserved: Quantity = 0n,
): { ok: true; balanceAfter: Quantity } | { ok: false; rule: BalanceRule } {
  const balanceAfter =
    type === "adjustment_positive" ? current + quantity : current - quantity;
  if (balanceAfter < 0n) return { ok: false, rule: "negative_stock" };
  if (balanceAfter < reserved) return { ok: false, rule: "below_reserved" };
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
        // Desde la 19.3: lo reservado bajo el mismo bloqueo, para explicar below_reserved.
        currentQuantityReserved: string;
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

      const balance = await repository.lockBalance(
        tx,
        organizationId,
        productId,
      );
      const current = quantityFromDatabase(balance.onHand);
      const reserved = quantityFromDatabase(balance.reserved);
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
        reserved,
      );
      if (!computed.ok) {
        throw new AdjustmentRejected({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: computed.rule,
          currentQuantityOnHand: quantityToDatabase(current),
          currentQuantityReserved: quantityToDatabase(reserved),
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

  // Autores sin JOIN con users: la lectura devuelve también a los desactivados.
  const authors = new Map(
    (
      await getMemberSummaries(query.organizationId, [
        ...new Set(rows.map((row) => row.createdBy)),
      ])
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

// El stock de un pedido (ADR 0020, punto 4; brief-19.3, D-2): orders abre la transacción, ya
// bloqueó la cabecera y los productos, y la pasa por tipo. Cada función bloquea los saldos
// ordenados por producto, sin depender del orden de quien llama. inventory no conoce los pedidos:
// recibe líneas y, para la entrega, el motivo ya escrito.

export type StockLine = { productId: string; quantity: string };

export type StockShortage = {
  productId: string;
  requested: string;
  available: string;
};

type LockedLine = {
  productId: string;
  quantity: Quantity;
  onHand: Quantity;
  reserved: Quantity;
};

async function lockLines(
  tx: DbTransaction,
  organizationId: string,
  lines: StockLine[],
): Promise<LockedLine[]> {
  const sorted = [...lines].sort((a, b) =>
    a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0,
  );
  const locked: LockedLine[] = [];
  for (const [index, line] of sorted.entries()) {
    // Un producto repetido es un defecto de quien llama: en un pedido lo impide el UNIQUE.
    if (index > 0 && sorted[index - 1]!.productId === line.productId) {
      throw new Error(`producto repetido en las líneas: ${line.productId}`);
    }
    const balance = await repository.lockBalance(
      tx,
      organizationId,
      line.productId,
    );
    locked.push({
      productId: line.productId,
      quantity: quantityFromDatabase(line.quantity),
      onHand: quantityFromDatabase(balance.onHand),
      reserved: quantityFromDatabase(balance.reserved),
    });
  }
  return locked;
}

// Reserva todas las líneas o ninguna. Si alguna pide más que lo disponible, no escribe nada y
// devuelve las que no alcanzan; quien llama revierte la transacción (la fila en 0 que pudo crear
// lockBalance se va con ella).
export async function reserveStock(
  tx: DbTransaction,
  organizationId: string,
  lines: StockLine[],
): Promise<{ ok: true } | { ok: false; shortages: StockShortage[] }> {
  const locked = await lockLines(tx, organizationId, lines);
  const shortages = locked
    .filter((line) => line.onHand - line.reserved < line.quantity)
    .map((line) => ({
      productId: line.productId,
      requested: quantityToDatabase(line.quantity),
      available: quantityToDatabase(line.onHand - line.reserved),
    }));
  if (shortages.length > 0) return { ok: false, shortages };
  for (const line of locked) {
    await repository.setReserved(
      tx,
      organizationId,
      line.productId,
      quantityToDatabase(line.reserved + line.quantity),
    );
  }
  return { ok: true };
}

// Libera lo reservado de un pedido confirmado que se cancela. Nunca se rechaza por el producto:
// lo reservado tiene que poder liberarse siempre (ADR 0020, punto 4). Si no alcanzara, es un
// defecto, y el CHECK de la base es la última defensa.
export async function releaseStock(
  tx: DbTransaction,
  organizationId: string,
  lines: StockLine[],
): Promise<void> {
  const locked = await lockLines(tx, organizationId, lines);
  for (const line of locked) {
    if (line.reserved < line.quantity) {
      throw new Error(`reservado insuficiente para liberar: ${line.productId}`);
    }
    await repository.setReserved(
      tx,
      organizationId,
      line.productId,
      quantityToDatabase(line.reserved - line.quantity),
    );
  }
}

// La salida física de un pedido entregado: un movimiento order_delivery por línea, y el saldo y
// lo reservado bajan juntos. Lo entregado ya estaba reservado, así que nunca deja el saldo por
// debajo de lo reservado ni negativo.
export async function deliverStock(
  tx: DbTransaction,
  delivery: {
    organizationId: string;
    lines: StockLine[];
    reason: string;
    createdBy: string;
  },
): Promise<void> {
  const locked = await lockLines(tx, delivery.organizationId, delivery.lines);
  for (const line of locked) {
    if (line.reserved < line.quantity || line.onHand < line.quantity) {
      throw new Error(
        `reservado insuficiente para entregar: ${line.productId}`,
      );
    }
    await repository.applyDelivery(tx, {
      organizationId: delivery.organizationId,
      productId: line.productId,
      quantity: quantityToDatabase(line.quantity),
      balanceAfter: quantityToDatabase(line.onHand - line.quantity),
      reservedAfter: quantityToDatabase(line.reserved - line.quantity),
      reason: delivery.reason,
      createdBy: delivery.createdBy,
    });
  }
}

// Lo disponible de varios productos, para el detalle de un pedido pendiente (brief-19.3, D-9).
// Los dos roles: un viewer ya ve el stock en productos. Sin fila, 0.
export async function getAvailableStock(
  context: AuthContext,
  productIds: string[],
): Promise<
  { ok: true; available: Map<string, string> } | Failure<"FORBIDDEN">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const balances = await repository.findBalances(
    context.organizationId,
    productIds,
  );
  const available = new Map(
    productIds.map((id) => {
      const balance = balances.get(id) ?? ZERO_BALANCE;
      return [
        id,
        quantityToDatabase(
          quantityFromDatabase(balance.onHand) -
            quantityFromDatabase(balance.reserved),
        ),
      ];
    }),
  );
  return { ok: true, available };
}
