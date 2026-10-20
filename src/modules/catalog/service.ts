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
  hasCapability,
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
import { computeMargin, type Margin } from "./margin";
import * as repository from "./repository";
import {
  hasVariants,
  prepareVariantWrite,
  type VariantField,
  type VariantInput,
  type VariantRejection,
} from "./variants";
import {
  DIMENSION_SCALE,
  PRODUCT_FIELD_LIMITS,
  productCondition,
  stockTracking,
  WEIGHT_SCALE,
} from "./schema";

// Casos de uso de productos (brief-4.2): FR-PROD-01 a 03, con auditoría en la misma
// transacción (FR-AUD-01), y el estado de stock de FR-PROD-05. Marca, categoría y condición
// (FR-PROD-10), la búsqueda por palabras (FR-PROD-11) y el precio (FR-PROD-12 y 13), brief-11.1.
// Los campos de operación y la búsqueda por código de barras (FR-PROD-14 y 15), brief-17.2.
// El costo y el margen (FR-PROD-19 a 21), brief-18.2: solo admin.

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
  // Desde la 17.2, con la misma regla: obligatorios en el tipo, vacío se guarda como nulo.
  barcode: string | null;
  weightKg: string | null;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  location: string | null;
  shelf: string | null;
  // Desde la 29.2, el modelo y los atributos (brief-29.2, D-5): solo con la capacidad variants. Sin
  // este campo, el producto conserva su modelo y sus valores.
  variant?: VariantInput;
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

// Número opcional mayor a 0, con coma o punto, con los dígitos que admite su columna (brief-17.2,
// D-5). Vacío se guarda como nulo; el resto, con la escala de la base ("1.500", "10.0").
function optionalPositiveDecimal(scale: {
  integerDigits: number;
  decimals: number;
}) {
  const pattern = new RegExp(
    `^(\\d{1,${scale.integerDigits}})(?:[.,](\\d{1,${scale.decimals}}))?$`,
  );
  return z
    .string()
    .nullish()
    .transform((value, ctx) => {
      const trimmed = value?.trim() ?? "";
      if (trimmed === "") return null;
      const match = pattern.exec(trimmed);
      const integer = match ? BigInt(match[1]!) : 0n;
      const fraction = (match?.[2] ?? "").padEnd(scale.decimals, "0");
      if (!match || (integer === 0n && BigInt(fraction) === 0n)) {
        ctx.addIssue({ code: "custom", message: "número inválido" });
        return z.NEVER;
      }
      return `${integer}.${fraction}`;
    });
}

const DIMENSION_FIELDS = ["lengthCm", "widthCm", "heightCm"] as const;

// Límites de brief-4.2, D-4, de brief-11.1, D-2, y de brief-17.2, D-3 a D-6. Los textos se
// recortan antes de validar.
const productInputSchema = z
  .object({
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
    barcode: optionalText(PRODUCT_FIELD_LIMITS.barcode).refine(
      (value) => value === null || /^\S+$/.test(value),
    ),
    weightKg: optionalPositiveDecimal(WEIGHT_SCALE),
    lengthCm: optionalPositiveDecimal(DIMENSION_SCALE),
    widthCm: optionalPositiveDecimal(DIMENSION_SCALE),
    heightCm: optionalPositiveDecimal(DIMENSION_SCALE),
    location: optionalText(PRODUCT_FIELD_LIMITS.location),
    shelf: optionalText(PRODUCT_FIELD_LIMITS.shelf),
  })
  // Las tres dimensiones van juntas o ninguna (D-5): se marcan las que faltan.
  .superRefine((values, ctx) => {
    const missing = DIMENSION_FIELDS.filter((field) => values[field] === null);
    if (missing.length === 0 || missing.length === DIMENSION_FIELDS.length) {
      return;
    }
    for (const field of missing) {
      ctx.addIssue({ code: "custom", path: [field], message: "falta" });
    }
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
  "barcode",
  "weightKg",
  "lengthCm",
  "widthCm",
  "heightCm",
  "location",
  "shelf",
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

// Varios productos por id, activos o no, para componer en memoria las líneas de un pedido sin JOIN
// (brief-19.2, ampliación del 2026-10-11). Un id de otra organización no vuelve.
export async function getProductsByIds(
  context: AuthContext,
  productIds: string[],
): Promise<
  { ok: true; products: Product[] } | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const unique = [...new Set(productIds)];
  if (!unique.every((id) => productIdSchema.safeParse(id).success)) {
    return failure("VALIDATION_ERROR");
  }
  const products = await repository.findProductsByIds(
    context.organizationId,
    unique,
  );
  return { ok: true, products };
}

// Productos que cumplen texto, actividad, marca y categoría, sin orden ni página: los compone
// inventory (D-1). Marca y categoría vacías no filtran (brief-15.2, D-4).
export type ProductSearchFilters = {
  text: string;
  activity: ProductActivityFilter;
  brand?: string;
  category?: string;
  // Desde la 29.2 (D-4): un id que no es un modelo de la organización no encuentra nada.
  modelId?: string;
};

export async function searchProducts(
  context: AuthContext,
  filters: ProductSearchFilters,
): Promise<{ ok: true; products: Product[] } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const products = await repository.findProducts(context.organizationId, {
    text: filters.text.trim(),
    activity: filters.activity,
    brand: filters.brand?.trim() || undefined,
    category: filters.category?.trim() || undefined,
    // Sin la capacidad, el parámetro se ignora, como antes de la 29.2 (invariante 1).
    modelId:
      filters.modelId &&
      productIdSchema.safeParse(filters.modelId).success &&
      (await hasVariants(context))
        ? filters.modelId
        : undefined,
  });
  return { ok: true, products };
}

// Marcas y categorías ya usadas en la organización, para el formulario (brief-11.1, D-2), y desde
// la 17.2 las ubicaciones (D-6).
export type ProductSuggestions = { brands: string[]; categories: string[] };
export type ProductFormSuggestions = ProductSuggestions & {
  locations: string[];
};

export async function listProductSuggestions(
  context: AuthContext,
): Promise<({ ok: true } & ProductFormSuggestions) | Failure<"FORBIDDEN">> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const [brands, categories, locations] = await Promise.all([
    repository.findDistinctValues(context.organizationId, "brand"),
    repository.findDistinctValues(context.organizationId, "category"),
    repository.findDistinctValues(context.organizationId, "location"),
  ]);
  return { ok: true, brands, categories, locations };
}

// Las mismas listas, para los filtros del listado (brief-15.2, D-4): admin y viewer, que ya ven
// la marca y la categoría de cada producto. Con el tope de SUGGESTIONS_LIMIT.
export async function listProductFilterOptions(
  context: AuthContext,
): Promise<({ ok: true } & ProductSuggestions) | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const [brands, categories] = await Promise.all([
    repository.findDistinctValues(context.organizationId, "brand"),
    repository.findDistinctValues(context.organizationId, "category"),
  ]);
  return { ok: true, brands, categories };
}

// Sugerencias del buscador de productos (brief-15.2, D-6): la regla de la búsqueda del listado
// (palabras sobre nombre, marca y categoría, o SKU exacto), solo activos, primero el SKU exacto y
// después por relevancia. Desde SUGGEST_MIN_LENGTH caracteres; con menos, ninguna. Desde la 20.3,
// también el código de barras exacto, que ordena primero como el SKU: un lector USB lo escribe como
// un teclado (brief-20.3, D-5; precisa el brief-17.2, D-4).
export const SUGGEST_LIMIT = 8;
export const SUGGEST_MIN_LENGTH = 2;

// Desde la 29.5, con el seguimiento: la recepción pide los IMEI de un producto por unidad.
export type ProductSuggestion = {
  id: string;
  name: string;
  sku: string;
  tracking: StockTracking;
};

export async function suggestProducts(
  context: AuthContext,
  text: string,
): Promise<{ ok: true; products: ProductSuggestion[] } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const trimmed = text.trim();
  if (trimmed.length < SUGGEST_MIN_LENGTH) return { ok: true, products: [] };
  const rows = await repository.findActiveProductsRanked(
    context.organizationId,
    trimmed,
    SUGGEST_LIMIT,
    { barcode: true },
  );
  return {
    ok: true,
    products: rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      tracking: row.tracking,
    })),
  };
}

// Para el ajuste de stock de inventory (brief-4.3.1, D-1): verifica y bloquea el producto dentro
// de la transacción de quien ajusta, que ya autorizó. Exige la transacción, como recordAudit. Desde
// la 29.5 devuelve también el seguimiento: el ajuste de cantidad se rechaza en un producto por unidad,
// y el alta y la baja de una unidad lo exigen (brief-29.5, D-4).
export type StockTracking = repository.StockTracking;
export const STOCK_TRACKINGS = stockTracking.enumValues;

export async function lockProductForStockChange(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
): Promise<
  | {
      status: "active" | "inactive";
      tracking: StockTracking;
      isService: boolean;
    }
  | "not_found"
> {
  const product = await repository.lockProductShared(
    tx,
    organizationId,
    productId,
  );
  if (!product) return "not_found";
  return {
    status: product.isActive ? "active" : "inactive",
    tracking: product.tracking,
    // Desde la 29.6: el producto de servicio no tiene stock (brief-29.6, D-5).
    isService: product.isService,
  };
}

// El cambio del seguimiento (ADR 0024, punto 6; brief-29.5, D-3). catalog no lee inventory: el cambio
// lo hace inventory, que bloquea el producto con lockProductForTrackingChange, comprueba que no tiene
// movimientos y escribe con writeProductTracking, en su transacción. El bloqueo es FOR UPDATE: toda
// escritura del stock toma el producto FOR SHARE, así que ninguna corre a la vez que el cambio.
// tests/guards/unit-writes.test.ts fija que solo changeProductTracking de inventory las llama.
export async function lockProductForTrackingChange(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
): Promise<{
  isActive: boolean;
  tracking: StockTracking;
  isService: boolean;
} | null> {
  if (!productIdSchema.safeParse(productId).success) return null;
  return (
    (await repository.lockProductExclusive(tx, organizationId, productId)) ??
    null
  );
}

export function writeProductTracking(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
  tracking: StockTracking,
): Promise<void> {
  return repository.updateProductTracking(
    tx,
    organizationId,
    productId,
    tracking,
  );
}

// El seguimiento de productos que quien llama ya bloqueó, para que inventory compruebe sus líneas
// (brief-29.5, D-4). Un id de otra organización no vuelve.
export function findProductTrackings(
  tx: DbTransaction,
  organizationId: string,
  productIds: string[],
): Promise<Map<string, StockTracking>> {
  return repository.findTrackings(tx, organizationId, [...new Set(productIds)]);
}

// Los productos de un pedido, para orders (brief-19.2; ADR 0020, puntos 3 y 6): los bloquea en modo
// compartido, ordenados por id, y lee su precio vigente en la misma transacción, así que un cambio
// de precio simultáneo no se cruza con el alta. orders ya autorizó; un id que no es de la
// organización no vuelve. Desde la 29.5, con el seguimiento: un producto por unidad no entra en un
// pedido ni en una venta hasta la 29.5.2 (brief-29.5, D-1), y la recepción pide sus IMEI.
export type OrderProduct = {
  id: string;
  isActive: boolean;
  tracking: StockTracking;
  // Desde la 29.6: el producto de servicio no entra en un pedido ni en una venta de la pantalla, y la
  // venta de una reparación lo exige (brief-29.6, D-5 y D-6).
  isService: boolean;
  price: ProductPrice | null;
};

export async function lockProductsForOrder(
  tx: DbTransaction,
  organizationId: string,
  productIds: string[],
): Promise<Map<string, OrderProduct>> {
  const ids = [...new Set(productIds)].filter(
    (id) => productIdSchema.safeParse(id).success,
  );
  const locked = await repository.lockProductsShared(tx, organizationId, ids);
  const prices = await repository.findCurrentPrices(
    organizationId,
    locked.map((product) => product.id),
    tx,
  );
  return new Map(
    locked.map((product) => {
      const price = prices.get(product.id);
      return [
        product.id,
        {
          id: product.id,
          isActive: product.isActive,
          tracking: product.tracking,
          isService: product.isService,
          price: price ? toPrice(price) : null,
        },
      ];
    }),
  );
}

// El producto de servicio de las reparaciones (ADR 0024, punto 10; brief-29.6, D-5): uno por
// organización, que se vende solo por su orden de servicio y nunca tiene stock. Lo crea el script de
// capacidades al activar repairs con el perfil, con el admin que nombró y dentro de su transacción: no
// autoriza nada, como applyAttributeTemplate. tests/guards/capability-reads.test.ts fija que nada de
// src/ fuera de catalog lo nombra. Si ya existe, no hace nada.
export const SERVICE_PRODUCT_SKU = "REPARACION";

export async function createServiceProduct(
  tx: DbTransaction,
  input: { organizationId: string; actorUserId: string },
): Promise<{ status: "created" | "exists"; productId: string }> {
  const { organizationId, actorUserId } = input;
  const existing = await repository.findServiceProduct(organizationId, tx);
  if (existing) return { status: "exists", productId: existing.id };
  const values: repository.ProductValues = {
    sku: SERVICE_PRODUCT_SKU,
    name: "Reparación",
    description: null,
    unit: "unidad",
    reorderPoint: "0.000",
    brand: null,
    category: null,
    condition: "new",
    barcode: null,
    weightKg: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    location: null,
    shelf: null,
  };
  const productId = await repository.insertServiceProduct(
    tx,
    organizationId,
    values,
  );
  if (isUniqueViolation(productId)) {
    throw new Error(
      `El SKU ${SERVICE_PRODUCT_SKU} ya es de otro producto de la organización: cambialo y volvé a correr el comando.`,
    );
  }
  await recordAudit(tx, {
    organizationId,
    actorUserId,
    entityType: "product",
    entityId: productId,
    action: "create",
    diff: {
      before: null,
      after: { ...values, isService: true, isActive: true, origen: "perfil" },
    },
  });
  return { status: "created", productId };
}

// El producto de servicio de la organización, para la venta de una reparación (brief-29.6, D-6):
// service lo busca y sales lo bloquea con lockProductsForOrder. Null si la organización no lo tiene.
export async function findServiceProduct(
  organizationId: string,
): Promise<{ id: string; isActive: boolean } | null> {
  return (await repository.findServiceProduct(organizationId)) ?? null;
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

// El campo repetido: el SKU o, desde la 17.2, el código de barras (D-3).
export type ProductConflictField = "sku" | "barcode";
export type ProductConflict = Failure<
  "CONFLICT",
  { field: ProductConflictField }
>;

function productConflict(
  violation: repository.ProductUniqueViolation,
): ProductConflict {
  return {
    ok: false,
    code: "CONFLICT",
    field: violation === "barcode_taken" ? "barcode" : "sku",
  };
}

function isUniqueViolation(
  value: unknown,
): value is repository.ProductUniqueViolation {
  return value === "sku_taken" || value === "barcode_taken";
}

// El modelo o un atributo inválidos, o el duplicado de variante (brief-29.2, D-5 y D-6).
export type ProductVariantRejection =
  | Failure<
      "VALIDATION_ERROR",
      { fields: ProductField[]; variantFields: VariantField[] }
    >
  | Failure<
      "CONFLICT",
      { field: "variant"; duplicate: { id: string; name: string } }
    >;

function variantFailure(rejection: VariantRejection): ProductVariantRejection {
  return rejection.kind === "duplicate"
    ? {
        ok: false,
        code: "CONFLICT",
        field: "variant",
        duplicate: rejection.product,
      }
    : {
        ok: false,
        code: "VALIDATION_ERROR",
        fields: [],
        variantFields: rejection.fields,
      };
}

// Mandar el modelo y los atributos sin la capacidad es una sección que no existe (D-3).
async function variantAllowed(
  context: AuthContext,
  input: ProductInput,
): Promise<boolean> {
  return (
    input.variant === undefined ||
    (await hasCapability(context.organizationId, "variants"))
  );
}

// La condición used existe solo con la capacidad serialized_units (brief-29.5, D-2): sin ella, el
// formulario no la ofrece y el servicio la rechaza como una condición inválida (invariante 1).
async function usedNotAllowed(
  context: AuthContext,
  condition: ProductCondition,
): Promise<Failure<"VALIDATION_ERROR", { fields: ProductField[] }> | null> {
  if (
    condition !== "used" ||
    (await hasCapability(context.organizationId, "serialized_units"))
  ) {
    return null;
  }
  return { ok: false, code: "VALIDATION_ERROR", fields: ["condition"] };
}

export type CreateProductResult =
  | { ok: true; productId: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | ProductConflict
  | Failure<"VALIDATION_ERROR", { fields: ProductField[] }>
  | ProductVariantRejection;

export async function createProduct(
  context: AuthContext,
  input: ProductInput,
): Promise<CreateProductResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!(await variantAllowed(context, input))) return failure("NOT_FOUND");
  const validated = validateProductInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  const used = await usedNotAllowed(context, values.condition);
  if (used) return used;

  return repository.withTransaction(
    async (tx): Promise<CreateProductResult> => {
      // Primero el modelo, bloqueado, y el duplicado; después el producto (D-6). Nada se escribe
      // antes de saber que el alta se acepta.
      const variant = input.variant
        ? await prepareVariantWrite(tx, context.organizationId, {
            productId: null,
            currentModelId: null,
            currentCondition: null,
            wasActive: false,
            condition: values.condition,
            isActive: true,
            input: input.variant,
          })
        : null;
      if (variant && !variant.ok) return variantFailure(variant.rejection);
      const productId = await repository.insertProduct(
        tx,
        context.organizationId,
        values,
      );
      if (isUniqueViolation(productId)) return productConflict(productId);
      const written = variant ? await variant.commit(productId) : null;
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "product",
        entityId: productId,
        action: "create",
        diff: {
          before: null,
          after: { ...values, ...written?.after, isActive: true },
        },
      });
      return { ok: true, productId };
    },
  );
}

// changed en false: el producto ya estaba así; no se escribe ni se audita.
export type UpdateProductResult =
  | { ok: true; changed: boolean }
  // VALIDATION_ERROR sin fields: id inválido (brief-4.4, D-6). Con fields: el formulario.
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | ProductConflict
  | Failure<"VALIDATION_ERROR", { fields: ProductField[] }>
  | ProductVariantRejection
  // Desde la 29.5 (brief-29.5, D-3): la condición de un producto por unidad no cambia. Sus unidades
  // se cargaron con esa condición: un iPhone nuevo no pasa a usado sin pasar por la baja.
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "unit_condition_locked" }>;

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
  if (!(await variantAllowed(context, input))) return failure("NOT_FOUND");
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
      if (
        current.tracking === "unit" &&
        values.condition !== current.condition
      ) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "unit_condition_locked",
        };
      }
      if (current.condition !== values.condition) {
        const used = await usedNotAllowed(context, values.condition);
        if (used) return used;
      }

      // Con modelo, el duplicado se vuelve a comprobar aunque solo cambie la condición (D-6). El
      // producto ya está bloqueado; el modelo se bloquea después, siempre en ese orden.
      const variant =
        input.variant !== undefined || current.modelId !== null
          ? await prepareVariantWrite(tx, context.organizationId, {
              productId,
              currentModelId: current.modelId,
              currentCondition: current.condition,
              wasActive: current.isActive,
              condition: values.condition,
              isActive: current.isActive,
              input: input.variant,
            })
          : null;
      if (variant && !variant.ok) return variantFailure(variant.rejection);

      const changedFields = PRODUCT_FIELDS.filter(
        (field) => current[field] !== values[field],
      );
      const before: Record<string, string | null> = Object.fromEntries(
        changedFields.map((field) => [field, current[field]]),
      );
      const after: Record<string, string | null> = Object.fromEntries(
        changedFields.map((field) => [field, values[field]]),
      );
      if (changedFields.length > 0) {
        const updated = await repository.updateProductValues(
          tx,
          context.organizationId,
          productId,
          Object.fromEntries(
            changedFields.map((field) => [field, values[field]]),
          ),
        );
        if (isUniqueViolation(updated)) return productConflict(updated);
      }
      if (variant) {
        const written = await variant.commit(productId);
        for (const key of Object.keys(written.after)) {
          if (written.before[key] !== written.after[key]) {
            before[key] = written.before[key] ?? null;
            after[key] = written.after[key] ?? null;
          }
        }
      }
      if (Object.keys(after).length === 0) return { ok: true, changed: false };
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
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  // Desde la 29.2: reactivar un producto que hoy sería un duplicado de variante (D-6).
  | Failure<
      "CONFLICT",
      { field: "variant"; duplicate: { id: string; name: string } }
    >;

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
      if (isActive && current.modelId !== null) {
        const variant = await prepareVariantWrite(tx, context.organizationId, {
          productId,
          currentModelId: current.modelId,
          currentCondition: current.condition,
          wasActive: false,
          condition: current.condition,
          isActive: true,
          input: undefined,
        });
        if (!variant.ok) {
          if (variant.rejection.kind === "duplicate") {
            return {
              ok: false,
              code: "CONFLICT",
              field: "variant",
              duplicate: variant.rejection.product,
            };
          }
          // Sin input, solo falla si el modelo del producto ya no existe: un defecto.
          throw new Error("reactivación: el modelo del producto no existe");
        }
      }

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

// El texto y el límite llegan ya validados por la API (D-4). Desde la 29.5, las lecturas de servicio
// dejan afuera los productos usados: read-v1 y read-v2 admiten solo new y refurbished, y el agente no
// ofrece usados hasta el contrato de la 29.8 (ADR 0024, punto 15; brief-29.5, D-7). No cambia la forma
// del contrato: cambia qué productos aparecen.
export async function searchActiveProductsForService(
  organizationId: string,
  query: { text: string; limit: number },
): Promise<ServiceProduct[]> {
  const rows = await repository.findActiveProductsRanked(
    organizationId,
    query.text.trim(),
    query.limit,
    { excludeUsed: true },
  );
  return withCurrentPrices(organizationId, rows);
}

// Un producto inactivo, usado, de otra organización o inexistente da null, sin distinguir. Desde la
// 29.6, también el producto de servicio (brief-29.6, D-5).
export async function getActiveProductForService(
  organizationId: string,
  productId: string,
): Promise<ServiceProduct | null> {
  if (!productIdSchema.safeParse(productId).success) return null;
  const row = await repository.findProduct(organizationId, productId);
  if (!row?.isActive || row.condition === "used" || row.isService) return null;
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

// Costo y margen (brief-18.2; ADR 0019, punto 5). product_costs es de solo inserción, como el
// precio: un costo nuevo se agrega y el anterior queda en el historial. **Solo admin lee y escribe**
// (D-1): es el primer dato de un producto que un viewer no ve, así que cada función exige el rol
// antes de tocar la base. Ninguna lectura de servicio lee el costo: el agente no lo ve (D-7).

export type ProductCost = ProductPrice;

const toCost: (row: repository.CostRow) => ProductCost = toPrice;

export type CostInput = {
  amount: string;
  currency: string;
  // Id del costo vigente que vio quien fija el costo, o vacío si no había (D-5).
  expectedCostId: string;
};

export type CostValues = {
  amount: string;
  currency: string;
  expectedCostId: string | null;
};

// Las reglas del precio, sin excepciones (D-5): la misma validación, con el id esperado del costo.
export function validateCostInput(
  input: CostInput,
):
  | { ok: true; values: CostValues }
  | PriceValidationFailure
  | Failure<"VALIDATION_ERROR"> {
  const validated = validatePriceInput({
    amount: input.amount,
    currency: input.currency,
    expectedPriceId: input.expectedCostId,
  });
  if (!validated.ok) return validated;
  const { amount, currency, expectedPriceId } = validated.values;
  return {
    ok: true,
    values: { amount, currency, expectedCostId: expectedPriceId },
  };
}

// El costo vigente, el precio vigente y el margen entre los dos, para la tarjeta del resumen y la
// página de costos (D-3), con el producto, que la página necesita para su encabezado.
export type ProductCostSummaryResult =
  | {
      ok: true;
      product: Product;
      cost: ProductCost | null;
      price: ProductPrice | null;
      margin: Margin;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function getProductCostSummary(
  context: AuthContext,
  productId: string,
): Promise<ProductCostSummaryResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const found = await getProduct(context, productId);
  if (!found.ok) return found;
  const { organizationId } = context;
  const id = found.product.id;
  const [costs, prices] = await Promise.all([
    repository.findCurrentCosts(organizationId, [id]),
    repository.findCurrentPrices(organizationId, [id]),
  ]);
  const cost = costs.get(id);
  const price = prices.get(id);
  return {
    ok: true,
    product: found.product,
    cost: cost ? toCost(cost) : null,
    price: price ? toPrice(price) : null,
    margin: computeMargin(price ?? null, cost ?? null),
  };
}

export const COSTS_PAGE_SIZE = PRICES_PAGE_SIZE;

export type ProductCostEntry = ProductPriceEntry;

export type ProductCostHistoryResult =
  | {
      ok: true;
      entries: ProductCostEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

// Historial completo, paginado en SQL, solo para admin. La página se acota como la del precio.
export async function listProductCosts(
  context: AuthContext,
  productId: string,
  requestedPage: number,
): Promise<ProductCostHistoryResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const found = await getProduct(context, productId);
  if (!found.ok) return found;
  const { organizationId } = context;
  const id = found.product.id;

  const total = await repository.countCosts(organizationId, id);
  const pageCount = Math.max(1, Math.ceil(total / COSTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await repository.findCosts(
          organizationId,
          id,
          COSTS_PAGE_SIZE,
          (page - 1) * COSTS_PAGE_SIZE,
        );
  const authors = new Map(
    (
      await getMemberSummaries(organizationId, [
        ...new Set(rows.map((row) => row.createdBy)),
      ])
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    entries: rows.map((row) => ({
      ...toCost(row),
      author: { id: row.createdBy, name: authors.get(row.createdBy) ?? "" },
    })),
    total,
    page,
    pageCount,
  };
}

// changed en false: ya era el costo vigente; no se escribe ni se audita. cost es el vigente después
// de la operación.
export type SetCostResult =
  | { ok: true; changed: boolean; cost: ProductCost }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | PriceValidationFailure
  | Failure<"CONFLICT", { currentCost: ProductCost | null }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "inactive_product" }>;

// Solo admin (FR-PROD-19). El producto se bloquea con FOR UPDATE, como al fijar el precio: dos
// admins que fijan el costo a la vez se ordenan, y el segundo recibe CONFLICT.
export async function setProductCost(
  context: AuthContext,
  productId: string,
  input: CostInput,
): Promise<SetCostResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!productIdSchema.safeParse(productId).success) {
    return failure("VALIDATION_ERROR");
  }
  const validated = validateCostInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  const { organizationId, userId } = context;

  return repository.withTransaction(async (tx): Promise<SetCostResult> => {
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

    const id = product.id;
    const current = (
      await repository.findCurrentCosts(organizationId, [id], tx)
    ).get(id);
    if ((current?.id ?? null) !== values.expectedCostId) {
      return {
        ok: false,
        code: "CONFLICT",
        currentCost: current ? toCost(current) : null,
      };
    }
    if (
      current &&
      current.amount === values.amount &&
      current.currency === values.currency
    ) {
      return { ok: true, changed: false, cost: toCost(current) };
    }

    const cost = await repository.insertProductCost(tx, {
      organizationId,
      productId: id,
      amount: values.amount,
      currency: values.currency,
      createdBy: userId,
    });
    // El primer costo no tiene anterior: sus campos van en null, como el primer precio.
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "product",
      entityId: id,
      action: "cost_change",
      diff: {
        before: {
          amount: current?.amount ?? null,
          currency: current?.currency ?? null,
        },
        after: { amount: cost.amount, currency: cost.currency },
      },
    });
    return { ok: true, changed: true, cost: toCost(cost) };
  });
}

// El costo de una recepción de mercadería (ADR 0023, punto 5; brief-22.4, D-4): el último recibido
// queda como costo vigente. purchasing abre la transacción, ya autorizó, bloqueó los productos en
// modo compartido y comprobó que están activos, y la llama después de la entrada de stock, con los
// saldos tomados. Por eso no bloquea ni compara con lo que alguien vio, como setProductCost.
//
// El costo vigente se lee acá, en esa transacción, y no antes (H-2): dos recepciones del mismo
// producto las ordena el bloqueo del saldo, y con READ COMMITTED esta lectura ve el costo que dejó
// la que confirmó primero. Leído antes, la segunda compararía contra un costo viejo y podría no
// escribir el suyo.
//
// Si el monto o la moneda difieren del vigente, una fila nueva por insertProductCost y su
// cost_change; si son iguales, nada. El origen va en la auditoría con las mismas claves a los dos
// lados (D-6), porque product_costs no lo guarda (D-5). Devuelve los productos cuyo costo cambió.
export type ReceivedCost = {
  productId: string;
  // En la escala de la base ("1234.50").
  amount: string;
  currency: string;
};

export async function recordReceivedCosts(
  tx: DbTransaction,
  receipt: {
    organizationId: string;
    createdBy: string;
    // Como se muestra: RC-000123.
    goodsReceiptNumber: string;
    lines: ReceivedCost[];
  },
): Promise<{ changedProductIds: string[] }> {
  const { organizationId, createdBy, goodsReceiptNumber } = receipt;
  const current = await repository.findCurrentCosts(
    organizationId,
    receipt.lines.map((line) => line.productId),
    tx,
  );
  const origin = {
    source: "goods_receipt",
    goods_receipt_number: goodsReceiptNumber,
  };
  const changedProductIds: string[] = [];
  for (const line of receipt.lines) {
    const before = current.get(line.productId);
    if (
      before &&
      before.amount === line.amount &&
      before.currency === line.currency
    ) {
      continue;
    }
    const cost = await repository.insertProductCost(tx, {
      organizationId,
      productId: line.productId,
      amount: line.amount,
      currency: line.currency,
      createdBy,
    });
    await recordAudit(tx, {
      organizationId,
      actorUserId: createdBy,
      entityType: "product",
      entityId: line.productId,
      action: "cost_change",
      diff: {
        before: {
          amount: before?.amount ?? null,
          currency: before?.currency ?? null,
          ...origin,
        },
        after: { amount: cost.amount, currency: cost.currency, ...origin },
      },
    });
    changedProductIds.push(line.productId);
  }
  return { changedProductIds };
}
