import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { saleLines, saleVoidReason, saleVoids, sales } from "./schema";

// Acceso a sales, sale_lines y, desde la 20.4, sale_voids (ADR 0021; brief-20.2; brief-20.4). Toda
// consulta filtra por organization_id en SQL. Las únicas escrituras son insertSale, insertSaleLines
// e insertSaleVoid, y nada actualiza ni borra: lo vigila tests/guards/sale-writes.test.ts (D-3). Los
// triggers de la 0039 y la 0041 son la segunda defensa.

type Executor = Db | DbTransaction;

// Desde la 20.3, sin pedido o sin cliente en una venta sin pedido (brief-20.3, D-2).
export type SaleRow = {
  id: string;
  number: number;
  orderId: string | null;
  clientId: string | null;
  currency: string;
  // Con la escala de la base ("1234.50").
  total: string;
  // Desde la 20.4: la venta anulada del mismo pedido a la que reemplaza (brief-20.4, D-3).
  replacesSaleId: string | null;
  createdBy: string;
  createdAt: Date;
};

const saleColumns = {
  id: sales.id,
  number: sales.number,
  orderId: sales.orderId,
  clientId: sales.clientId,
  currency: sales.currency,
  total: sales.total,
  replacesSaleId: sales.replacesSaleId,
  createdBy: sales.createdBy,
  createdAt: sales.createdAt,
};

export type SaleLineRow = {
  productId: string;
  position: number;
  // numeric(14, 3) y numeric(14, 2), como texto con la escala de la base.
  quantity: string;
  unitPrice: string;
  currency: string;
  lineTotal: string;
};

const lineColumns = {
  productId: saleLines.productId,
  position: saleLines.position,
  quantity: saleLines.quantity,
  unitPrice: saleLines.unitPrice,
  currency: saleLines.currency,
  lineTotal: saleLines.lineTotal,
};

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

export type NewSale = {
  organizationId: string;
  number: number;
  orderId: string | null;
  clientId: string | null;
  currency: string;
  total: string;
  replacesSaleId: string | null;
  createdBy: string;
};

export async function insertSale(
  tx: DbTransaction,
  sale: NewSale,
): Promise<SaleRow> {
  const rows = await tx.insert(sales).values(sale).returning(saleColumns);
  return rows[0]!;
}

export async function insertSaleLines(
  tx: DbTransaction,
  organizationId: string,
  saleId: string,
  lines: SaleLineRow[],
): Promise<void> {
  await tx
    .insert(saleLines)
    .values(lines.map((line) => ({ ...line, organizationId, saleId })));
}

// drizzle-orm envuelve el error de pg; el código y la constraint quedan en la causa. La regla se lee
// por el nombre de la restricción: sales tiene varias reglas únicas, y no todas son la misma regla de
// negocio (brief-20.4, H-5).
function uniqueViolation(error: unknown): string | null {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return source?.code === "23505" ? (source.constraint ?? null) : null;
}

// Un pedido con su venta vigente (ADR 0021, punto 3): una segunda primera venta choca con el índice
// parcial, y un segundo reemplazo de la misma venta anulada, con sales_replaces_sale_unique. El
// número no es esta regla. Una venta sin pedido no pasa por ninguno de los dos (brief-20.3, H-4).
export function isOrderAlreadySold(error: unknown): boolean {
  const constraint = uniqueViolation(error);
  return (
    constraint === "sales_organization_order_first_unique" ||
    constraint === "sales_replaces_sale_unique"
  );
}

// Una venta anulada dos veces (ADR 0021, punto 6; brief-20.4, D-4).
export function isSaleAlreadyVoided(error: unknown): boolean {
  return uniqueViolation(error) === "sale_voids_sale_unique";
}

export async function findSale(
  organizationId: string,
  saleId: string,
): Promise<SaleRow | undefined> {
  const rows = await getDb()
    .select(saleColumns)
    .from(sales)
    .where(and(eq(sales.organizationId, organizationId), eq(sales.id, saleId)))
    .limit(1);
  return rows[0];
}

// La anulación de una venta, si la tiene (desde la 20.4). Un bigint llega como texto: se convierte
// con mapWith, como hace Drizzle con las columnas (revisión independiente de la 20.4, R-5).
const voidNumberOf = sql<number | null>`(
  select v.number from sale_voids v
  where v.organization_id = "sales"."organization_id" and v.sale_id = "sales"."id")`.mapWith(
  Number,
);

export type CurrentSaleRow = SaleRow & { voidNumber: number | null };

// La última venta de un pedido: la que ninguna otra reemplaza (brief-20.4, D-3, H-4). Las ventas de
// un pedido forman una sola cadena, así que es una sola; si está anulada, el pedido está libre para
// otra. Con tx, dentro de la transacción de la emisión, con el pedido ya bloqueado.
export async function findLastSaleByOrder(
  organizationId: string,
  orderId: string,
  executor: Executor = getDb(),
): Promise<CurrentSaleRow | undefined> {
  const rows = await executor
    .select({ ...saleColumns, voidNumber: voidNumberOf })
    .from(sales)
    .where(
      and(
        eq(sales.organizationId, organizationId),
        eq(sales.orderId, orderId),
        sql`not exists (
          select 1 from sales r
          where r.organization_id = "sales"."organization_id"
            and r.replaces_sale_id = "sales"."id")`,
      ),
    )
    .limit(1);
  return rows[0];
}

// La venta que reemplazó a una anulada, para el detalle (brief-20.4, D-7).
export async function findSaleReplacing(
  organizationId: string,
  saleId: string,
): Promise<SaleRow | undefined> {
  const rows = await getDb()
    .select(saleColumns)
    .from(sales)
    .where(
      and(
        eq(sales.organizationId, organizationId),
        eq(sales.replacesSaleId, saleId),
      ),
    )
    .limit(1);
  return rows[0];
}

export type SaleVoidReason = (typeof saleVoidReason.enumValues)[number];

export const SALE_VOID_REASONS = saleVoidReason.enumValues;

export type SaleVoidRow = {
  id: string;
  number: number;
  saleId: string;
  currency: string;
  total: string;
  reason: SaleVoidReason;
  createdBy: string;
  createdAt: Date;
};

const voidColumns = {
  id: saleVoids.id,
  number: saleVoids.number,
  saleId: saleVoids.saleId,
  currency: saleVoids.currency,
  total: saleVoids.total,
  reason: saleVoids.reason,
  createdBy: saleVoids.createdBy,
  createdAt: saleVoids.createdAt,
};

export type NewSaleVoid = {
  organizationId: string;
  number: number;
  saleId: string;
  currency: string;
  total: string;
  reason: SaleVoidReason;
  createdBy: string;
};

export async function insertSaleVoid(
  tx: DbTransaction,
  saleVoid: NewSaleVoid,
): Promise<SaleVoidRow> {
  const rows = await tx
    .insert(saleVoids)
    .values(saleVoid)
    .returning(voidColumns);
  return rows[0]!;
}

// Con tx, dentro de la anulación, después de los bloqueos que la serializan (brief-20.4, D-4).
export async function findVoidBySale(
  organizationId: string,
  saleId: string,
  executor: Executor = getDb(),
): Promise<SaleVoidRow | undefined> {
  const rows = await executor
    .select(voidColumns)
    .from(saleVoids)
    .where(
      and(
        eq(saleVoids.organizationId, organizationId),
        eq(saleVoids.saleId, saleId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function findSaleLines(
  organizationId: string,
  saleId: string,
): Promise<SaleLineRow[]> {
  return getDb()
    .select(lineColumns)
    .from(saleLines)
    .where(
      and(
        eq(saleLines.organizationId, organizationId),
        eq(saleLines.saleId, saleId),
      ),
    )
    .orderBy(asc(saleLines.position));
}

export type SaleListQuery = {
  organizationId: string;
  clientId: string | null;
  number: number | null;
  // El número de una anulación: trae la venta que anula (brief-20.4, D-8).
  voidNumber: number | null;
  // Desde la 20.4: todas, las vigentes o las anuladas (brief-20.4, D-8).
  status: "all" | "current" | "voided";
  // Días YYYY-MM-DD de la zona de la organización: [from 00:00, to + 1 día 00:00), como el
  // período de las conversaciones (brief-20.2, D-6).
  from: string | null;
  to: string | null;
  timezone: string;
};

function listConditions(query: SaleListQuery): SQL | undefined {
  return and(
    eq(sales.organizationId, query.organizationId),
    query.clientId ? eq(sales.clientId, query.clientId) : undefined,
    query.number !== null ? eq(sales.number, query.number) : undefined,
    query.voidNumber !== null
      ? sql`exists (
          select 1 from sale_voids v
          where v.organization_id = ${sales.organizationId} and v.sale_id = ${sales.id}
            and v.number = ${query.voidNumber})`
      : undefined,
    query.status === "voided"
      ? sql`exists (
          select 1 from sale_voids v
          where v.organization_id = ${sales.organizationId} and v.sale_id = ${sales.id})`
      : undefined,
    query.status === "current"
      ? sql`not exists (
          select 1 from sale_voids v
          where v.organization_id = ${sales.organizationId} and v.sale_id = ${sales.id})`
      : undefined,
    query.from
      ? sql`${sales.createdAt} >= (${query.from}::date::timestamp at time zone ${query.timezone})`
      : undefined,
    query.to
      ? sql`${sales.createdAt} < ((${query.to}::date + 1)::timestamp at time zone ${query.timezone})`
      : undefined,
  );
}

export async function countSales(query: SaleListQuery): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(sales)
    .where(listConditions(query));
  return rows[0]!.total;
}

export type SaleListRow = SaleRow & {
  lineCount: number;
  voidNumber: number | null;
};

// De la más reciente a la más vieja, paginada en SQL (brief-20.2, D-6). La cantidad de líneas es
// una subconsulta sobre la tabla del mismo módulo, como en orders.
export function findSales(
  query: SaleListQuery,
  limit: number,
  offset: number,
): Promise<SaleListRow[]> {
  return getDb()
    .select({
      ...saleColumns,
      lineCount: sql<number>`(
        select count(*)::int from sale_lines l
        where l.organization_id = "sales"."organization_id"
          and l.sale_id = "sales"."id")`,
      voidNumber: voidNumberOf,
    })
    .from(sales)
    .where(listConditions(query))
    .orderBy(desc(sales.createdAt), desc(sales.id))
    .limit(limit)
    .offset(offset);
}

// Lecturas para cash (ADR 0022, punto 13; brief-21.3, D-4): la venta que se cobra y las ventas de un
// cliente para la imputación. Reciben la transacción de cash y no bloquean: una venta no se puede
// bloquear (ADR 0022, punto 4). Anulada es que tenga su anulación.
export type SaleForReceiptRow = {
  id: string;
  number: number;
  clientId: string | null;
  currency: string;
  total: string;
  createdAt: Date;
  voided: boolean;
};

const saleForReceiptColumns = {
  id: sales.id,
  number: sales.number,
  clientId: sales.clientId,
  currency: sales.currency,
  total: sales.total,
  createdAt: sales.createdAt,
  voided: sql<boolean>`exists (
    select 1 from sale_voids v
    where v.organization_id = "sales"."organization_id" and v.sale_id = "sales"."id")`,
};

export async function findSaleForReceipt(
  tx: DbTransaction,
  organizationId: string,
  saleId: string,
): Promise<SaleForReceiptRow | undefined> {
  const rows = await tx
    .select(saleForReceiptColumns)
    .from(sales)
    .where(and(eq(sales.organizationId, organizationId), eq(sales.id, saleId)))
    .limit(1);
  return rows[0];
}

// Todas, anuladas incluidas, de la más vieja a la más nueva por emisión y número (ADR 0022, punto 9).
export function findClientSalesForAccount(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
): Promise<SaleForReceiptRow[]> {
  return tx
    .select(saleForReceiptColumns)
    .from(sales)
    .where(
      and(
        eq(sales.organizationId, organizationId),
        eq(sales.clientId, clientId),
      ),
    )
    .orderBy(asc(sales.createdAt), asc(sales.number));
}
