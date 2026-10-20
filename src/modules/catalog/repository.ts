import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { searchQuery } from "@/shared/search";
import {
  productCondition,
  productCosts,
  productPrices,
  products,
  productSearchCondition,
  stockTracking,
} from "./schema";

// Acceso a products, product_prices y product_costs. Toda consulta filtra por organization_id en
// SQL (brief-4.2). La única escritura de product_prices es insertProductPrice, que vigila
// tests/guards/price-writes.test.ts (brief-11.1, AC-10), y la de product_costs, insertProductCost,
// que vigila tests/guards/cost-writes.test.ts (brief-18.2, AC-7).

type Executor = Db | DbTransaction;

export type ProductCondition = (typeof productCondition.enumValues)[number];
export type StockTracking = (typeof stockTracking.enumValues)[number];

// modelId no es un campo del formulario general: lo escribe la capacidad variants (brief-29.2, D-4).
// tracking tampoco: lo cambia inventory con writeProductTracking, desde la 29.5 (brief-29.5, D-3).
// isService, desde la 29.6, lo fija el alta del producto de servicio y no cambia (brief-29.6, D-5).
export type ProductRow = { id: string } & ProductValues & {
    modelId: string | null;
    tracking: StockTracking;
    isService: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };

// Campos de operación (brief-17.2): texto o nulo; los números, con la escala de la base
// ("1.500" kg, "10.0" cm).
export type ProductOperationValues = {
  barcode: string | null;
  weightKg: string | null;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  location: string | null;
  shelf: string | null;
};

// Campos editables, con reorderPoint ya normalizado a la escala de la base.
export type ProductValues = {
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorderPoint: string;
  brand: string | null;
  category: string | null;
  condition: ProductCondition;
} & ProductOperationValues;

const productColumns = {
  id: products.id,
  sku: products.sku,
  name: products.name,
  description: products.description,
  unit: products.unit,
  reorderPoint: products.reorderPoint,
  brand: products.brand,
  category: products.category,
  condition: products.condition,
  barcode: products.barcode,
  weightKg: products.weightKg,
  lengthCm: products.lengthCm,
  widthCm: products.widthCm,
  heightCm: products.heightCm,
  location: products.location,
  shelf: products.shelf,
  modelId: products.modelId,
  tracking: products.tracking,
  isService: products.isService,
  isActive: products.isActive,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

// forUpdate: la escritura bloquea la fila y calcula el diff sobre lo leído (brief-4.2, D-5).
export async function findProduct(
  organizationId: string,
  productId: string,
  executor: Executor = getDb(),
  { forUpdate = false } = {},
): Promise<ProductRow | undefined> {
  const query = executor
    .select(productColumns)
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.id, productId),
      ),
    )
    .limit(1);
  const rows = forUpdate ? await query.for("update") : await query;
  return rows[0];
}

// FOR SHARE: convive con otros ajustes de stock del mismo producto, y la edición y la
// desactivación, que toman FOR UPDATE, esperan a que el ajuste termine (brief-4.3.1, D-1).
export async function lockProductShared(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
): Promise<
  { isActive: boolean; tracking: StockTracking; isService: boolean } | undefined
> {
  const rows = await tx
    .select({
      isActive: products.isActive,
      tracking: products.tracking,
      isService: products.isService,
    })
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.id, productId),
      ),
    )
    .limit(1)
    .for("share");
  return rows[0];
}

export async function findProductsByIds(
  organizationId: string,
  productIds: string[],
): Promise<ProductRow[]> {
  if (productIds.length === 0) return [];
  return getDb()
    .select(productColumns)
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        inArray(products.id, productIds),
      ),
    );
}

// Los productos de un pedido, en modo compartido y ordenados por id (ADR 0020, punto 6; brief-19.2,
// D-3): el ORDER BY va antes del bloqueo, así que las filas se bloquean en ese orden y dos altas
// con los mismos productos no se traban. Un cambio de precio o una desactivación, que toman
// FOR UPDATE, esperan a que el alta termine.
export async function lockProductsShared(
  tx: DbTransaction,
  organizationId: string,
  productIds: string[],
): Promise<
  {
    id: string;
    isActive: boolean;
    tracking: StockTracking;
    isService: boolean;
  }[]
> {
  if (productIds.length === 0) return [];
  return tx
    .select({
      id: products.id,
      isActive: products.isActive,
      tracking: products.tracking,
      isService: products.isService,
    })
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        inArray(products.id, productIds),
      ),
    )
    .orderBy(products.id)
    .for("share");
}

export type ActivityFilter = "active" | "inactive" | "all";

// Palabras sueltas sobre nombre, marca y categoría, o SKU exacto, sin distinguir mayúsculas ni
// acentos (brief-11.1, D-4; FR-PROD-11). Sin límite: el estado de stock se filtra y la lista se
// pagina en memoria (brief-4.2, D-1). Marca y categoría, si vienen, con coincidencia exacta
// (brief-15.2, D-4): son los valores que ya existen, elegidos de una lista.
//
// La condición es `productSearchCondition`, cuya consulta sale de `searchQuery` en
// src/shared/search: normaliza y parte el texto igual que la columna generada `search`. Un test
// con EXPLAIN comprueba que usa el índice GIN (brief-11.1, AC-4).
//
// El SKU no se normaliza: es igualdad exacta sobre un código, con un índice único que define la
// identidad del producto. Tocarlo cambiaría qué SKUs colisionan (brief-9.0.2, hallazgo 6).
export function findProducts(
  organizationId: string,
  filters: {
    text: string;
    activity: ActivityFilter;
    brand?: string;
    category?: string;
    // Desde la 29.2, el modelo (D-4): solo lo manda una organización con la capacidad.
    modelId?: string;
  },
): Promise<ProductRow[]> {
  const conditions: SQL[] = [eq(products.organizationId, organizationId)];
  if (filters.modelId) conditions.push(eq(products.modelId, filters.modelId));
  if (filters.activity !== "all") {
    conditions.push(eq(products.isActive, filters.activity === "active"));
  }
  if (filters.brand) conditions.push(eq(products.brand, filters.brand));
  if (filters.category) {
    conditions.push(eq(products.category, filters.category));
  }
  if (filters.text !== "") {
    conditions.push(
      or(
        productSearchCondition(filters.text),
        sql`lower(${products.sku}) = lower(${filters.text})`,
        // La lista y, desde la 20.3, las sugerencias del buscador (brief-20.3, D-5); la búsqueda del
        // agente no busca por código de barras (brief-17.2, D-4). La misma expresión que el índice
        // único parcial.
        sql`lower(${products.barcode}) = lower(${filters.text})`,
      )!,
    );
  }
  return getDb()
    .select(productColumns)
    .from(products)
    .where(and(...conditions));
}

// Búsqueda de la API de lectura (brief-11.3, D-4): solo activos, con la misma coincidencia que
// findProducts, pero ordenada y cortada en SQL. Primero el SKU exacto, que es la señal más fuerte;
// después la relevancia, con desempate por nombre y por id. Un texto sin palabras deja la
// consulta en NULL, y `coalesce` evita que ese NULL ordene primero. Desde la 20.3, con
// `barcode: true` encuentra también el código de barras exacto, que ordena con el SKU exacto: lo
// pasan solo las sugerencias del buscador (brief-20.3, D-5). La API de lectura no lo pasa, así que
// read-v1 y read-v2 no cambian.
//
// Desde la 29.5, con `excludeUsed: true` deja afuera los productos usados: lo pasa solo la búsqueda
// del agente, que no los ve hasta la 29.8 (brief-29.5, D-7). Los buscadores de la aplicación sí.
// Desde la 29.6, el producto de servicio nunca sale: se vende solo por su orden de servicio, y ni el
// agente ni los buscadores de los comprobantes lo ofrecen (brief-29.6, D-5).
export function findActiveProductsRanked(
  organizationId: string,
  text: string,
  limit: number,
  options: { barcode?: boolean; excludeUsed?: boolean } = {},
): Promise<ProductRow[]> {
  const skuMatch = options.barcode
    ? sql`(lower(${products.sku}) = lower(${text}) or lower(${products.barcode}) = lower(${text}))`
    : sql`lower(${products.sku}) = lower(${text})`;
  const rank = sql`coalesce(ts_rank(${products.search}, ${searchQuery(text)}), 0)`;
  return getDb()
    .select(productColumns)
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.isActive, true),
        eq(products.isService, false),
        options.excludeUsed ? ne(products.condition, "used") : undefined,
        or(productSearchCondition(text), skuMatch),
      ),
    )
    .orderBy(desc(skuMatch), desc(rank), products.name, products.id)
    .limit(limit);
}

// Valores distintos de marca y categoría que ya existen en la organización, para sugerirlos en el
// formulario (brief-11.1, D-2): reducen las variantes de escritura de un texto libre. Con tope,
// porque es una ayuda y no un listado.
export const SUGGESTIONS_LIMIT = 200;

// Desde la 17.2, también las ubicaciones (D-6).
export async function findDistinctValues(
  organizationId: string,
  column: "brand" | "category" | "location",
): Promise<string[]> {
  const target = {
    brand: products.brand,
    category: products.category,
    location: products.location,
  }[column];
  const rows = await getDb()
    .selectDistinct({ value: target })
    .from(products)
    .where(and(eq(products.organizationId, organizationId), isNotNull(target)))
    .orderBy(target)
    .limit(SUGGESTIONS_LIMIT);
  return rows.map((row) => row.value!);
}

// Un SKU o un código de barras que ya tiene otro producto de la organización (brief-17.2, D-3).
export type ProductUniqueViolation = "sku_taken" | "barcode_taken";

const UNIQUE_CONSTRAINTS: Record<string, ProductUniqueViolation> = {
  products_organization_sku_lower_unique: "sku_taken",
  products_organization_barcode_lower_unique: "barcode_taken",
};

// drizzle-orm envuelve el error de pg; el código y la constraint quedan en la causa.
function uniqueViolation(error: unknown): ProductUniqueViolation | null {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  if (source?.code !== "23505" || !source.constraint) return null;
  return Object.hasOwn(UNIQUE_CONSTRAINTS, source.constraint)
    ? UNIQUE_CONSTRAINTS[source.constraint]!
    : null;
}

// Corre en un savepoint: un SKU o un código repetido deshace solo esta escritura y la transacción
// sigue usable.
async function inSavepoint<T>(
  tx: DbTransaction,
  work: (savepoint: DbTransaction) => Promise<T>,
): Promise<T | ProductUniqueViolation> {
  try {
    return await tx.transaction(work);
  } catch (error) {
    const violation = uniqueViolation(error);
    if (violation) return violation;
    throw error;
  }
}

export function insertProduct(
  tx: DbTransaction,
  organizationId: string,
  values: ProductValues,
): Promise<string | ProductUniqueViolation> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(products)
      .values({ organizationId, ...values })
      .returning({ id: products.id });
    return rows[0]!.id;
  });
}

// El producto de servicio de la organización (brief-29.6, D-5): a lo sumo uno, por el índice único
// parcial. El alta lo crea con su marca, que ninguna otra escritura toca.
export function insertServiceProduct(
  tx: DbTransaction,
  organizationId: string,
  values: ProductValues,
): Promise<string | ProductUniqueViolation> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(products)
      .values({ organizationId, ...values, isService: true })
      .returning({ id: products.id });
    return rows[0]!.id;
  });
}

export async function findServiceProduct(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<{ id: string; isActive: boolean } | undefined> {
  const rows = await executor
    .select({ id: products.id, isActive: products.isActive })
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.isService, true),
      ),
    )
    .limit(1);
  return rows[0];
}

// El llamador ya leyó la fila filtrada por organización y con FOR UPDATE en esta misma
// transacción, así que cero filas actualizadas no es una carrera: es un defecto de
// programación. Se lanza dentro de la transacción, que revierte (9.0.1, D-1).
function assertUpdatedOne(rows: unknown[], what: string): void {
  if (rows.length === 0) {
    throw new Error(`${what}: la fila no existe en esta organización`);
  }
}

export function updateProductValues(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
  values: Partial<ProductValues>,
): Promise<void | ProductUniqueViolation> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .update(products)
      .set(values)
      .where(
        and(
          eq(products.organizationId, organizationId),
          eq(products.id, productId),
        ),
      )
      .returning({ id: products.id });
    assertUpdatedOne(rows, "updateProductValues");
  });
}

// El seguimiento del stock (brief-29.5, D-3): el producto FOR UPDATE, para que ninguna escritura del
// stock, que lo toma FOR SHARE, corra a la vez que el cambio.
export async function lockProductExclusive(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
): Promise<
  { isActive: boolean; tracking: StockTracking; isService: boolean } | undefined
> {
  const rows = await tx
    .select({
      isActive: products.isActive,
      tracking: products.tracking,
      isService: products.isService,
    })
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.id, productId),
      ),
    )
    .limit(1)
    .for("update");
  return rows[0];
}

export async function updateProductTracking(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
  tracking: StockTracking,
): Promise<void> {
  const rows = await tx
    .update(products)
    .set({ tracking })
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.id, productId),
      ),
    )
    .returning({ id: products.id });
  assertUpdatedOne(rows, "updateProductTracking");
}

// El seguimiento de varios productos, para inventory, en la transacción de quien ya los bloqueó.
export async function findTrackings(
  tx: DbTransaction,
  organizationId: string,
  productIds: string[],
): Promise<Map<string, StockTracking>> {
  if (productIds.length === 0) return new Map();
  const rows = await tx
    .select({ id: products.id, tracking: products.tracking })
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        inArray(products.id, productIds),
      ),
    );
  return new Map(rows.map((row) => [row.id, row.tracking]));
}

export async function updateProductActive(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
  isActive: boolean,
): Promise<void> {
  const rows = await tx
    .update(products)
    .set({ isActive })
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.id, productId),
      ),
    )
    .returning({ id: products.id });
  assertUpdatedOne(rows, "updateProductActive");
}

// Precios (brief-11.1, D-5). Montos como texto con la escala de la base ("1234.50").

export type PriceRow = {
  id: string;
  productId: string;
  amount: string;
  currency: string;
  createdBy: string;
  createdAt: Date;
};

const priceColumns = {
  id: productPrices.id,
  productId: productPrices.productId,
  amount: productPrices.amount,
  currency: productPrices.currency,
  createdBy: productPrices.createdBy,
  createdAt: productPrices.createdAt,
};

// El precio vigente de cada producto: su última fila, por hora de inserción y, ante un empate,
// por id. Un producto sin filas no aparece: no tiene precio. El orden coincide con el índice
// (organization_id, product_id, created_at desc), pensado para esta consulta; que el plan lo use no
// está medido (revisión independiente de la 11.1, M-6). Queda para la 11.3, cuando sea una
// lectura de servicio.
export async function findCurrentPrices(
  organizationId: string,
  productIds: string[],
  executor: Executor = getDb(),
): Promise<Map<string, PriceRow>> {
  if (productIds.length === 0) return new Map();
  const rows = await executor
    .selectDistinctOn([productPrices.productId], priceColumns)
    .from(productPrices)
    .where(
      and(
        eq(productPrices.organizationId, organizationId),
        inArray(productPrices.productId, productIds),
      ),
    )
    .orderBy(
      productPrices.productId,
      desc(productPrices.createdAt),
      desc(productPrices.id),
    );
  return new Map(rows.map((row) => [row.productId, row]));
}

function priceHistoryCondition(organizationId: string, productId: string) {
  return and(
    eq(productPrices.organizationId, organizationId),
    eq(productPrices.productId, productId),
  );
}

export async function countPrices(
  organizationId: string,
  productId: string,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(productPrices)
    .where(priceHistoryCondition(organizationId, productId));
  return rows[0]!.total;
}

// Historial, del más reciente al más antiguo: el primero es el vigente.
export function findPrices(
  organizationId: string,
  productId: string,
  limit: number,
  offset: number,
): Promise<PriceRow[]> {
  return getDb()
    .select(priceColumns)
    .from(productPrices)
    .where(priceHistoryCondition(organizationId, productId))
    .orderBy(desc(productPrices.createdAt), desc(productPrices.id))
    .limit(limit)
    .offset(offset);
}

export type NewPrice = {
  organizationId: string;
  productId: string;
  amount: string;
  currency: string;
  createdBy: string;
};

// Única escritura de product_prices (FR-PROD-13): un precio se agrega, nunca se modifica ni se
// borra. Exige la transacción que ya bloqueó el producto (brief-11.1, D-7).
export async function insertProductPrice(
  tx: DbTransaction,
  price: NewPrice,
): Promise<PriceRow> {
  const rows = await tx
    .insert(productPrices)
    .values(price)
    .returning(priceColumns);
  return rows[0]!;
}

// Costos (brief-18.2): la forma de los precios, sobre product_costs. Las lecturas no miran el rol:
// solo las llama el servicio, después de exigir admin (D-1).

export type CostRow = PriceRow;

const costColumns = {
  id: productCosts.id,
  productId: productCosts.productId,
  amount: productCosts.amount,
  currency: productCosts.currency,
  createdBy: productCosts.createdBy,
  createdAt: productCosts.createdAt,
};

// El costo vigente de cada producto: su última fila, como findCurrentPrices.
export async function findCurrentCosts(
  organizationId: string,
  productIds: string[],
  executor: Executor = getDb(),
): Promise<Map<string, CostRow>> {
  if (productIds.length === 0) return new Map();
  const rows = await executor
    .selectDistinctOn([productCosts.productId], costColumns)
    .from(productCosts)
    .where(
      and(
        eq(productCosts.organizationId, organizationId),
        inArray(productCosts.productId, productIds),
      ),
    )
    .orderBy(
      productCosts.productId,
      desc(productCosts.createdAt),
      desc(productCosts.id),
    );
  return new Map(rows.map((row) => [row.productId, row]));
}

function costHistoryCondition(organizationId: string, productId: string) {
  return and(
    eq(productCosts.organizationId, organizationId),
    eq(productCosts.productId, productId),
  );
}

export async function countCosts(
  organizationId: string,
  productId: string,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(productCosts)
    .where(costHistoryCondition(organizationId, productId));
  return rows[0]!.total;
}

// Historial, del más reciente al más antiguo: el primero es el vigente.
export function findCosts(
  organizationId: string,
  productId: string,
  limit: number,
  offset: number,
): Promise<CostRow[]> {
  return getDb()
    .select(costColumns)
    .from(productCosts)
    .where(costHistoryCondition(organizationId, productId))
    .orderBy(desc(productCosts.createdAt), desc(productCosts.id))
    .limit(limit)
    .offset(offset);
}

export type NewCost = NewPrice;

// Única escritura de product_costs (FR-PROD-20): un costo se agrega, nunca se modifica ni se
// borra. Exige la transacción que ya bloqueó el producto (brief-18.2, D-5).
export async function insertProductCost(
  tx: DbTransaction,
  cost: NewCost,
): Promise<CostRow> {
  const rows = await tx
    .insert(productCosts)
    .values(cost)
    .returning(costColumns);
  return rows[0]!;
}
