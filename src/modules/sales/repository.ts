import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { saleLines, sales } from "./schema";

// Acceso a sales y sale_lines (ADR 0021; brief-20.2). Toda consulta filtra por organization_id en
// SQL. Las únicas escrituras son insertSale e insertSaleLines, y nada actualiza ni borra: lo vigila
// tests/guards/sale-writes.test.ts (D-3). El trigger de la 0039 es la segunda defensa.

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

// El índice único de un pedido por venta (ADR 0021, punto 3). Una venta sin pedido no pasa por él:
// su order_id es nulo, y los nulos no chocan (brief-20.3, H-4). drizzle-orm envuelve el error de pg;
// el código y la constraint quedan en la causa.
export function isOrderAlreadySold(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "sales_organization_order_unique"
  );
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

// Con tx, dentro de la transacción de la emisión, con el pedido ya bloqueado.
export async function findSaleByOrder(
  organizationId: string,
  orderId: string,
  executor: Executor = getDb(),
): Promise<SaleRow | undefined> {
  const rows = await executor
    .select(saleColumns)
    .from(sales)
    .where(
      and(eq(sales.organizationId, organizationId), eq(sales.orderId, orderId)),
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

export type SaleListRow = SaleRow & { lineCount: number };

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
    })
    .from(sales)
    .where(listConditions(query))
    .orderBy(desc(sales.createdAt), desc(sales.id))
    .limit(limit)
    .offset(offset);
}
