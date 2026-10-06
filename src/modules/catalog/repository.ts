import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { searchQuery } from "@/shared/search";
import {
  productCondition,
  productPrices,
  products,
  productSearchCondition,
} from "./schema";

// Acceso a products y product_prices. Toda consulta filtra por organization_id en SQL (brief-4.2).
// La única escritura de product_prices es insertProductPrice, que vigila
// tests/guards/price-writes.test.ts (brief-11.1, AC-10).

type Executor = Db | DbTransaction;

export type ProductCondition = (typeof productCondition.enumValues)[number];

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorderPoint: string;
  brand: string | null;
  category: string | null;
  condition: ProductCondition;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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
};

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
): Promise<{ isActive: boolean } | undefined> {
  const rows = await tx
    .select({ isActive: products.isActive })
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
  },
): Promise<ProductRow[]> {
  const conditions: SQL[] = [eq(products.organizationId, organizationId)];
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
// consulta en NULL, y `coalesce` evita que ese NULL ordene primero.
export function findActiveProductsRanked(
  organizationId: string,
  text: string,
  limit: number,
): Promise<ProductRow[]> {
  const skuMatch = sql`lower(${products.sku}) = lower(${text})`;
  const rank = sql`coalesce(ts_rank(${products.search}, ${searchQuery(text)}), 0)`;
  return getDb()
    .select(productColumns)
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.isActive, true),
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

export async function findDistinctValues(
  organizationId: string,
  column: "brand" | "category",
): Promise<string[]> {
  const target = column === "brand" ? products.brand : products.category;
  const rows = await getDb()
    .selectDistinct({ value: target })
    .from(products)
    .where(and(eq(products.organizationId, organizationId), isNotNull(target)))
    .orderBy(target)
    .limit(SUGGESTIONS_LIMIT);
  return rows.map((row) => row.value!);
}

// drizzle-orm envuelve el error de pg; el código y la constraint quedan en la causa.
function isSkuUniqueViolation(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "products_organization_sku_lower_unique"
  );
}

// Corre en un savepoint: un SKU repetido deshace solo esta escritura y la transacción sigue usable.
async function inSavepoint<T>(
  tx: DbTransaction,
  work: (savepoint: DbTransaction) => Promise<T>,
): Promise<T | "sku_taken"> {
  try {
    return await tx.transaction(work);
  } catch (error) {
    if (isSkuUniqueViolation(error)) return "sku_taken";
    throw error;
  }
}

export function insertProduct(
  tx: DbTransaction,
  organizationId: string,
  values: ProductValues,
): Promise<string | "sku_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(products)
      .values({ organizationId, ...values })
      .returning({ id: products.id });
    return rows[0]!.id;
  });
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
): Promise<void | "sku_taken"> {
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
