import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import {
  authorize,
  getMemberSummaries,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  currencyDecimals,
  moneyToDatabase,
  parseMoneyInput,
  type AmountRejection,
  type CurrencyRejection,
} from "@/shared/money";
import {
  parseQuantityInput,
  quantityToDatabase,
  type Quantity,
} from "@/shared/quantity";
import * as repository from "./repository";
import { productCondition } from "./schema";

// Casos de uso de productos (brief-4.2): FR-PROD-01 a 03, con auditoría en la misma
// transacción (FR-AUD-01), y el estado de stock de FR-PROD-05. Marca, categoría y condición
// (FR-PROD-10), la búsqueda por palabras (FR-PROD-11) y el precio (FR-PROD-12 y 13), brief-11.1.

export type Product = repository.ProductRow;
export type ProductActivityFilter = repository.ActivityFilter;
export type ProductCondition = repository.ProductCondition;
export const PRODUCT_CONDITIONS = productCondition.enumValues;

export type StockStatus = "disponible" | "bajo_stock" | "sin_stock";

// Único umbral: reorder_point (subfase 1.2, D-10). Comparación exacta en milésimas (D-2).
export function deriveStockStatus(
  quantityOnHand: Quantity,
  reorderPoint: Quantity,
): StockStatus {
  if (quantityOnHand <= 0n) return "sin_stock";
  if (quantityOnHand <= reorderPoint) return "bajo_stock";
  return "disponible";
}

export type ProductField = keyof repository.ProductValues;

export type ProductInput = {
  sku: string;
  name: string;
  description?: string | null;
  unit: string;
  reorderPoint: string;
  // Obligatorios en el tipo, aunque admitan vacío: un llamador que los omitiera por olvido los
  // borraría al editar (brief-11.1, AC-2). Vacío o solo espacios se guarda como nulo.
  brand: string | null;
  category: string | null;
  condition: string;
};

// Texto opcional recortado: vacío se guarda como nulo.
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));
}

// Límites de brief-4.2, D-4, y de brief-11.1, D-2. Los textos se recortan antes de validar.
const productInputSchema = z.object({
  sku: z.string().trim().min(1).max(64).regex(/^\S+$/),
  name: z.string().trim().min(1).max(200),
  description: optionalText(2000),
  unit: z.string().trim().min(1).max(32),
  reorderPoint: z.string().transform((value, ctx) => {
    const quantity = parseQuantityInput(value);
    if (quantity === null) {
      ctx.addIssue({ code: "custom", message: "cantidad inválida" });
      return z.NEVER;
    }
    return quantityToDatabase(quantity);
  }),
  brand: optionalText(100),
  category: optionalText(100),
  condition: z.enum(productCondition.enumValues),
});

const PRODUCT_FIELDS: ProductField[] = [
  "sku",
  "name",
  "description",
  "unit",
  "reorderPoint",
  "brand",
  "category",
  "condition",
];

export function validateProductInput(
  input: ProductInput,
):
  | { ok: true; values: repository.ProductValues }
  | Failure<"VALIDATION_ERROR", { fields: ProductField[] }> {
  const parsed = productInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fields = new Set<ProductField>();
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (PRODUCT_FIELDS.includes(field as ProductField)) {
      fields.add(field as ProductField);
    }
  }
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: PRODUCT_FIELDS.filter((field) => fields.has(field)),
  };
}

const productIdSchema = z.uuid();

// Lecturas: admin y viewer. Un producto de otra organización da NOT_FOUND (brief-3.4, D-3).

export async function getProduct(
  context: AuthContext,
  productId: string,
): Promise<
  | { ok: true; product: Product }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return failure("VALIDATION_ERROR");
  }
  const product = await repository.findProduct(
    context.organizationId,
    productId,
  );
  if (!product) return failure("NOT_FOUND");
  return { ok: true, product };
}

// Productos que cumplen texto y actividad, sin orden ni página: los compone inventory (D-1).
export async function searchProducts(
  context: AuthContext,
  filters: { text: string; activity: ProductActivityFilter },
): Promise<{ ok: true; products: Product[] } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const products = await repository.findProducts(context.organizationId, {
    text: filters.text.trim(),
    activity: filters.activity,
  });
  return { ok: true, products };
}

// Marcas y categorías ya usadas en la organización, para el formulario (brief-11.1, D-2).
export type ProductSuggestions = { brands: string[]; categories: string[] };

export async function listProductSuggestions(
  context: AuthContext,
): Promise<({ ok: true } & ProductSuggestions) | Failure<"FORBIDDEN">> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const [brands, categories] = await Promise.all([
    repository.findDistinctValues(context.organizationId, "brand"),
    repository.findDistinctValues(context.organizationId, "category"),
  ]);
  return { ok: true, brands, categories };
}

// Para el ajuste de stock de inventory (brief-4.3.1, D-1): verifica y bloquea el producto dentro
// de la transacción de quien ajusta, que ya autorizó. Exige la transacción, como recordAudit.
export async function lockProductForStockChange(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
): Promise<"active" | "inactive" | "not_found"> {
  const product = await repository.lockProductShared(
    tx,
    organizationId,
    productId,
  );
  if (!product) return "not_found";
  return product.isActive ? "active" : "inactive";
}

// Historial de auditoría del producto (FR-AUD-02, brief-4.4, D-1 y su ajuste 1). audit no
// autoriza ni conoce a auth: catalog, dueño del producto, verifica el rol y la organización y
// compone el nombre del autor. El producto reúne sus ediciones (product) y sus ajustes de
// stock (inventory, con el id del producto, brief-4.3.1, D-4).

export type ProductAuditEntry = NamedAuditLogEntry;

export type ProductAuditResult =
  | {
      ok: true;
      entries: ProductAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function listProductAudit(
  context: AuthContext,
  productId: string,
  page: number,
): Promise<ProductAuditResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return failure("VALIDATION_ERROR");
  }
  const product = await repository.findProduct(
    context.organizationId,
    productId,
  );
  if (!product) return failure("NOT_FOUND");

  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["product", "inventory"],
    entityId: product.id,
    page,
  });
  const names = new Map(
    (
      await getMemberSummaries(
        context.organizationId,
        auditUserIds(found.entries),
      )
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    entries: nameAuditActors(found.entries, names),
    total: found.total,
    page: found.page,
    pageCount: found.pageCount,
  };
}

// Escrituras: solo admin.

export type CreateProductResult =
  | { ok: true; productId: string }
  | Failure<"FORBIDDEN" | "CONFLICT">
  | Failure<"VALIDATION_ERROR", { fields: ProductField[] }>;

export async function createProduct(
  context: AuthContext,
  input: ProductInput,
): Promise<CreateProductResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validateProductInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return repository.withTransaction(
    async (tx): Promise<CreateProductResult> => {
      const productId = await repository.insertProduct(
        tx,
        context.organizationId,
        values,
      );
      if (productId === "sku_taken") return failure("CONFLICT");
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "product",
        entityId: productId,
        action: "create",
        diff: { before: null, after: { ...values, isActive: true } },
      });
      return { ok: true, productId };
    },
  );
}

// changed en false: el producto ya estaba así; no se escribe ni se audita.
export type UpdateProductResult =
  | { ok: true; changed: boolean }
  // VALIDATION_ERROR sin fields: id inválido (brief-4.4, D-6). Con fields: el formulario.
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: ProductField[] }>;

export async function updateProduct(
  context: AuthContext,
  productId: string,
  input: ProductInput,
): Promise<UpdateProductResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    // Un id de la URL no es un campo del formulario: va sin fields (brief-4.4, D-6).
    return failure("VALIDATION_ERROR");
  }
  const validated = validateProductInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return repository.withTransaction(
    async (tx): Promise<UpdateProductResult> => {
      const current = await repository.findProduct(
        context.organizationId,
        productId,
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");

      const changedFields = PRODUCT_FIELDS.filter(
        (field) => current[field] !== values[field],
      );
      if (changedFields.length === 0) return { ok: true, changed: false };

      const before = Object.fromEntries(
        changedFields.map((field) => [field, current[field]]),
      );
      const after = Object.fromEntries(
        changedFields.map((field) => [field, values[field]]),
      );
      const updated = await repository.updateProductValues(
        tx,
        context.organizationId,
        productId,
        after,
      );
      if (updated === "sku_taken") return failure("CONFLICT");
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "product",
        entityId: productId,
        action: "update",
        diff: { before, after },
      });
      return { ok: true, changed: true };
    },
  );
}

export type ProductActiveResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

async function setProductActive(
  context: AuthContext,
  productId: string,
  isActive: boolean,
): Promise<ProductActiveResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return failure("VALIDATION_ERROR");
  }

  return repository.withTransaction(
    async (tx): Promise<ProductActiveResult> => {
      const current = await repository.findProduct(
        context.organizationId,
        productId,
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      if (current.isActive === isActive) return { ok: true, changed: false };

      await repository.updateProductActive(
        tx,
        context.organizationId,
        productId,
        isActive,
      );
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "product",
        entityId: productId,
        action: isActive ? "reactivate" : "deactivate",
        diff: {
          before: { isActive: current.isActive },
          after: { isActive },
        },
      });
      return { ok: true, changed: true };
    },
  );
}

export function deactivateProduct(
  context: AuthContext,
  productId: string,
): Promise<ProductActiveResult> {
  return setProductActive(context, productId, false);
}

export function reactivateProduct(
  context: AuthContext,
  productId: string,
): Promise<ProductActiveResult> {
  return setProductActive(context, productId, true);
}

// Precio de venta (brief-11.1, FR-PROD-12 y FR-PROD-13). product_prices es de solo inserción: un
// precio nuevo se agrega y el anterior queda en el historial. El vigente es el último (D-5).

export type ProductPrice = {
  id: string;
  // Con la escala de la base ("1234.50"); se muestra con formatMoney.
  amount: string;
  currency: string;
  createdAt: Date;
};

function toPrice(row: repository.PriceRow): ProductPrice {
  return {
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    createdAt: row.createdAt,
  };
}

// Datos de un formulario: todo llega como texto y se valida acá.
export type PriceInput = {
  amount: string;
  currency: string;
  // Id del precio vigente que vio quien fija el precio, o vacío si no había. Si cambió, la
  // respuesta es CONFLICT (D-7).
  expectedPriceId: string;
};

export type PriceField = "amount" | "currency";

export type PriceValues = {
  amount: string;
  currency: string;
  expectedPriceId: string | null;
};

// Con fields: el formulario, y por qué se rechazó el campo, para decirlo en pantalla (D-6).
export type PriceValidationFailure = Failure<
  "VALIDATION_ERROR",
  {
    fields: PriceField[];
    amountReason: AmountRejection | null;
    currencyReason: CurrencyRejection | null;
  }
>;

// La moneda primero: sin ella no se sabe cuántos decimales admite el monto.
export function validatePriceInput(
  input: PriceInput,
):
  | { ok: true; values: PriceValues }
  | PriceValidationFailure
  | Failure<"VALIDATION_ERROR"> {
  const expected = input.expectedPriceId.trim();
  // Un id oculto que no es un uuid no es un error del formulario: va sin fields.
  if (expected !== "" && !productIdSchema.safeParse(expected).success) {
    return failure("VALIDATION_ERROR");
  }
  const currency = input.currency.trim();
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["currency"],
      amountReason: null,
      currencyReason: decimals.reason,
    };
  }
  const amount = parseMoneyInput(input.amount, decimals.decimals);
  if (!amount.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["amount"],
      amountReason: amount.reason,
      currencyReason: null,
    };
  }
  return {
    ok: true,
    values: {
      amount: moneyToDatabase(amount.amount),
      currency,
      expectedPriceId: expected === "" ? null : expected,
    },
  };
}

// Precio vigente de varios productos, para las pantallas 3 y 4: admin y viewer.
export async function getCurrentPrices(
  context: AuthContext,
  productIds: string[],
): Promise<
  { ok: true; prices: Map<string, ProductPrice> } | Failure<"FORBIDDEN">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const ids = productIds.filter((id) => productIdSchema.safeParse(id).success);
  const rows = await repository.findCurrentPrices(context.organizationId, ids);
  return {
    ok: true,
    prices: new Map(
      [...rows].map(([productId, row]) => [productId, toPrice(row)]),
    ),
  };
}

// Lecturas de servicio (brief-11.3, D-3). Las llama la API de lectura, que ya autenticó una
// credencial de alcance `read`: la organización sale de esa credencial y no hay persona ni rol,
// así que no pasan por `authorize`. Solo productos activos. La guarda
// tests/guards/service-read-entry-points.test.ts exige que fuera de los módulos solo las importe
// src/app/api/read/: una pantalla que las usara se saltearía el rol del usuario.

export type ServiceProduct = Product & { price: ProductPrice | null };

async function withCurrentPrices(
  organizationId: string,
  rows: Product[],
): Promise<ServiceProduct[]> {
  const prices = await repository.findCurrentPrices(
    organizationId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => {
    const price = prices.get(row.id);
    return { ...row, price: price ? toPrice(price) : null };
  });
}

// El texto y el límite llegan ya validados por la API (D-4).
export async function searchActiveProductsForService(
  organizationId: string,
  query: { text: string; limit: number },
): Promise<ServiceProduct[]> {
  const rows = await repository.findActiveProductsRanked(
    organizationId,
    query.text.trim(),
    query.limit,
  );
  return withCurrentPrices(organizationId, rows);
}

// Un producto inactivo, de otra organización o inexistente da null, sin distinguir.
export async function getActiveProductForService(
  organizationId: string,
  productId: string,
): Promise<ServiceProduct | null> {
  if (!productIdSchema.safeParse(productId).success) return null;
  const row = await repository.findProduct(organizationId, productId);
  if (!row?.isActive) return null;
  const [product] = await withCurrentPrices(organizationId, [row]);
  return product ?? null;
}

export const PRICES_PAGE_SIZE = 25;

export type ProductPriceEntry = ProductPrice & {
  author: { id: string; name: string };
};

export type ProductPriceHistoryResult =
  | {
      ok: true;
      current: ProductPrice | null;
      entries: ProductPriceEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

// Historial completo, paginado en SQL, para admin y viewer (FR-PROD-12). Una página fuera de
// rango se lleva a la última; una no numérica o menor que 1, a la primera.
export async function listProductPrices(
  context: AuthContext,
  productId: string,
  requestedPage: number,
): Promise<ProductPriceHistoryResult> {
  const found = await getProduct(context, productId);
  if (!found.ok) return found;
  const { organizationId } = context;
  const id = found.product.id;

  const total = await repository.countPrices(organizationId, id);
  const pageCount = Math.max(1, Math.ceil(total / PRICES_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await repository.findPrices(
          organizationId,
          id,
          PRICES_PAGE_SIZE,
          (page - 1) * PRICES_PAGE_SIZE,
        );
  const current = (
    await repository.findCurrentPrices(organizationId, [id])
  ).get(id);

  // Autores sin JOIN con users: la lectura devuelve también a los desactivados.
  const authors = new Map(
    (
      await getMemberSummaries(organizationId, [
        ...new Set(rows.map((row) => row.createdBy)),
      ])
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    current: current ? toPrice(current) : null,
    entries: rows.map((row) => ({
      ...toPrice(row),
      author: { id: row.createdBy, name: authors.get(row.createdBy) ?? "" },
    })),
    total,
    page,
    pageCount,
  };
}

// changed en false: ya era el precio vigente, con el mismo monto y la misma moneda; no se escribe
// ni se audita (D-7). price es el vigente después de la operación.
export type SetPriceResult =
  | { ok: true; changed: boolean; price: ProductPrice }
  // VALIDATION_ERROR sin fields: el id del producto o el del precio esperado no son válidos.
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | PriceValidationFailure
  | Failure<"CONFLICT", { currentPrice: ProductPrice | null }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "inactive_product" }>;

// Solo admin (FR-PROD-12). El producto se bloquea con FOR UPDATE: dos admins que fijan el precio
// a la vez se ordenan, y el segundo ve el precio del primero y recibe CONFLICT (D-7).
export async function setProductPrice(
  context: AuthContext,
  productId: string,
  input: PriceInput,
): Promise<SetPriceResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return failure("VALIDATION_ERROR");
  }
  const validated = validatePriceInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  const { organizationId, userId } = context;

  return repository.withTransaction(async (tx): Promise<SetPriceResult> => {
    const product = await repository.findProduct(
      organizationId,
      productId,
      tx,
      { forUpdate: true },
    );
    if (!product) return failure("NOT_FOUND");
    if (!product.isActive) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_product",
      };
    }

    // Desde acá, el id que devolvió la base: z.uuid() acepta mayúsculas y PostgreSQL las iguala,
    // pero el precio vigente se busca en un Map por texto (revisión independiente, M-3).
    const id = product.id;
    const current = (
      await repository.findCurrentPrices(organizationId, [id], tx)
    ).get(id);
    if ((current?.id ?? null) !== values.expectedPriceId) {
      return {
        ok: false,
        code: "CONFLICT",
        currentPrice: current ? toPrice(current) : null,
      };
    }
    if (
      current &&
      current.amount === values.amount &&
      current.currency === values.currency
    ) {
      return { ok: true, changed: false, price: toPrice(current) };
    }

    const price = await repository.insertProductPrice(tx, {
      organizationId,
      productId: id,
      amount: values.amount,
      currency: values.currency,
      createdBy: userId,
    });
    // El primer precio no tiene anterior: sus campos van en null. audit exige before en todo lo
    // que no es un alta, y fijar un precio es un cambio del producto, no su alta.
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "product",
      entityId: id,
      action: "price_change",
      diff: {
        before: {
          amount: current?.amount ?? null,
          currency: current?.currency ?? null,
        },
        after: { amount: price.amount, currency: price.currency },
      },
    });
    return { ok: true, changed: true, price: toPrice(price) };
  });
}
