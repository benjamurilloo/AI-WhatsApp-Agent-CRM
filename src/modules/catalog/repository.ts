import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { products, searchNormalized } from "./schema";

// Acceso a products. Toda consulta filtra por organization_id en SQL (brief-4.2).

type Executor = Db | DbTransaction;

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorderPoint: string;
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
};

const productColumns = {
  id: products.id,
  sku: products.sku,
  name: products.name,
  description: products.description,
  unit: products.unit,
  reorderPoint: products.reorderPoint,
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

// % y _ del texto buscado se escapan: LIKE los trata como literales.
function likePrefix(text: string): string {
  return `${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Prefijo de nombre o SKU exacto, sin distinguir mayúsculas ni acentos (brief-4.2, D-3;
// brief-9.0.2). Sin límite: el estado de stock se filtra y la lista se pagina en memoria (D-1).
//
// La expresión del nombre sale de `searchNormalized`, la misma función que define el índice
// `products_organization_name_unaccent_idx`. No están escritas dos veces a propósito: si se
// separaran, el índice dejaría de usarse y la búsqueda recorrería la tabla **sin que ningún test
// falle**, solo más lento. Un test con EXPLAIN comprueba que el índice se usa (brief-9.0.2, AC-4).
//
// El SKU no se normaliza: es igualdad exacta sobre un código, con un índice único que define la
// identidad del producto. Tocarlo cambiaría qué SKUs colisionan (brief-9.0.2, hallazgo 6).
export function findProducts(
  organizationId: string,
  filters: { text: string; activity: ActivityFilter },
): Promise<ProductRow[]> {
  const conditions: SQL[] = [eq(products.organizationId, organizationId)];
  if (filters.activity !== "all") {
    conditions.push(eq(products.isActive, filters.activity === "active"));
  }
  if (filters.text !== "") {
    conditions.push(
      or(
        sql`${searchNormalized(products.name)} like immutable_unaccent(lower(${likePrefix(filters.text)}))`,
        sql`lower(${products.sku}) = lower(${filters.text})`,
      )!,
    );
  }
  return getDb()
    .select(productColumns)
    .from(products)
    .where(and(...conditions));
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
