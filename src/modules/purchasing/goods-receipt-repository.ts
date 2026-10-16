import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { goodsReceiptLines, goodsReceipts } from "./schema";

// Acceso a goods_receipts y goods_receipt_lines (ADR 0023, punto 4; brief-22.4). Toda consulta
// filtra por organization_id en SQL, también las lecturas por id (D-8). Las únicas escrituras son
// insertGoodsReceipt e insertGoodsReceiptLines, y ninguna cambia ni borra: el trigger de la 0049 es
// la segunda defensa.

type Executor = Db | DbTransaction;

export type GoodsReceiptRow = {
  id: string;
  number: number;
  supplierId: string;
  purchaseOrderId: string | null;
  currency: string;
  // Con la escala de la base ("1234.50").
  total: string;
  supplierReference: string | null;
  createdBy: string;
  createdAt: Date;
};

const receiptColumns = {
  id: goodsReceipts.id,
  number: goodsReceipts.number,
  supplierId: goodsReceipts.supplierId,
  purchaseOrderId: goodsReceipts.purchaseOrderId,
  currency: goodsReceipts.currency,
  total: goodsReceipts.total,
  supplierReference: goodsReceipts.supplierReference,
  createdBy: goodsReceipts.createdBy,
  createdAt: goodsReceipts.createdAt,
};

export type GoodsReceiptLineRow = {
  purchaseOrderLineId: string | null;
  productId: string;
  position: number;
  // numeric(14, 3) y numeric(14, 2), como texto con la escala de la base.
  quantity: string;
  unitCost: string;
  lineTotal: string;
};

const lineColumns = {
  purchaseOrderLineId: goodsReceiptLines.purchaseOrderLineId,
  productId: goodsReceiptLines.productId,
  position: goodsReceiptLines.position,
  quantity: goodsReceiptLines.quantity,
  unitCost: goodsReceiptLines.unitCost,
  lineTotal: goodsReceiptLines.lineTotal,
};

export type NewGoodsReceipt = {
  organizationId: string;
  number: number;
  supplierId: string;
  purchaseOrderId: string | null;
  currency: string;
  total: string;
  supplierReference: string | null;
  createdBy: string;
};

export async function insertGoodsReceipt(
  tx: DbTransaction,
  receipt: NewGoodsReceipt,
): Promise<GoodsReceiptRow> {
  const rows = await tx
    .insert(goodsReceipts)
    .values(receipt)
    .returning(receiptColumns);
  return rows[0]!;
}

export type NewGoodsReceiptLine = GoodsReceiptLineRow;

export async function insertGoodsReceiptLines(
  tx: DbTransaction,
  organizationId: string,
  goodsReceiptId: string,
  lines: NewGoodsReceiptLine[],
): Promise<void> {
  await tx
    .insert(goodsReceiptLines)
    .values(lines.map((line) => ({ ...line, organizationId, goodsReceiptId })));
}

export async function findGoodsReceipt(
  organizationId: string,
  goodsReceiptId: string,
): Promise<GoodsReceiptRow | undefined> {
  const rows = await getDb()
    .select(receiptColumns)
    .from(goodsReceipts)
    .where(
      and(
        eq(goodsReceipts.organizationId, organizationId),
        eq(goodsReceipts.id, goodsReceiptId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function findGoodsReceiptLines(
  organizationId: string,
  goodsReceiptId: string,
): Promise<GoodsReceiptLineRow[]> {
  return getDb()
    .select(lineColumns)
    .from(goodsReceiptLines)
    .where(
      and(
        eq(goodsReceiptLines.organizationId, organizationId),
        eq(goodsReceiptLines.goodsReceiptId, goodsReceiptId),
      ),
    )
    .orderBy(asc(goodsReceiptLines.position));
}

// Lo recibido de cada línea de una orden, sumado en la base (D-7). La recepción lo lee con la
// cabecera de la orden ya bloqueada FOR UPDATE: otra recepción de la misma orden espera ahí, así que
// la suma incluye todo lo confirmado antes (AC-5). En la 22.4 toda recepción es vigente; la 22.5
// excluye las anuladas (D-9).
export async function sumReceivedByOrderLine(
  organizationId: string,
  purchaseOrderId: string,
  executor: Executor = getDb(),
): Promise<Map<string, string>> {
  const rows = await executor
    .select({
      purchaseOrderLineId: goodsReceiptLines.purchaseOrderLineId,
      received: sql<string>`sum(${goodsReceiptLines.quantity})::numeric(14, 3)::text`,
    })
    .from(goodsReceiptLines)
    .innerJoin(
      goodsReceipts,
      and(
        eq(goodsReceipts.organizationId, goodsReceiptLines.organizationId),
        eq(goodsReceipts.id, goodsReceiptLines.goodsReceiptId),
      ),
    )
    .where(
      and(
        eq(goodsReceipts.organizationId, organizationId),
        eq(goodsReceipts.purchaseOrderId, purchaseOrderId),
      ),
    )
    .groupBy(goodsReceiptLines.purchaseOrderLineId);
  return new Map(
    rows.flatMap((row) =>
      row.purchaseOrderLineId ? [[row.purchaseOrderLineId, row.received]] : [],
    ),
  );
}

// Cuántas recepciones tiene una orden: la cancelación y el cierre a mano la leen con la cabecera ya
// bloqueada (D-9).
export async function countOrderGoodsReceipts(
  organizationId: string,
  purchaseOrderId: string,
  executor: Executor = getDb(),
): Promise<number> {
  const rows = await executor
    .select({ total: count() })
    .from(goodsReceipts)
    .where(
      and(
        eq(goodsReceipts.organizationId, organizationId),
        eq(goodsReceipts.purchaseOrderId, purchaseOrderId),
      ),
    );
  return rows[0]!.total;
}

export type GoodsReceiptListQuery = {
  organizationId: string;
  supplierId: string | null;
  purchaseOrderId: string | null;
  number: number | null;
};

function listConditions(query: GoodsReceiptListQuery): SQL | undefined {
  return and(
    eq(goodsReceipts.organizationId, query.organizationId),
    query.supplierId
      ? eq(goodsReceipts.supplierId, query.supplierId)
      : undefined,
    query.purchaseOrderId
      ? eq(goodsReceipts.purchaseOrderId, query.purchaseOrderId)
      : undefined,
    query.number !== null ? eq(goodsReceipts.number, query.number) : undefined,
  );
}

export async function countGoodsReceipts(
  query: GoodsReceiptListQuery,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(goodsReceipts)
    .where(listConditions(query));
  return rows[0]!.total;
}

export type GoodsReceiptListRow = GoodsReceiptRow & {
  supplierName: string;
  purchaseOrderNumber: number | null;
  lineCount: number;
};

// De la más reciente a la más vieja, paginada en SQL (D-12). El nombre del proveedor, el número de
// la orden y la cantidad de líneas son subconsultas sobre tablas del mismo módulo, con alias
// explícitos, como en la lista de órdenes.
export function findGoodsReceipts(
  query: GoodsReceiptListQuery,
  limit: number,
  offset: number,
): Promise<GoodsReceiptListRow[]> {
  return getDb()
    .select({
      ...receiptColumns,
      supplierName: sql<string>`(
        select s.name from suppliers s
        where s.organization_id = "goods_receipts"."organization_id"
          and s.id = "goods_receipts"."supplier_id")`,
      purchaseOrderNumber: sql<number | null>`(
        select o.number from purchase_orders o
        where o.organization_id = "goods_receipts"."organization_id"
          and o.id = "goods_receipts"."purchase_order_id")`.mapWith(
        (value: string | number | null) =>
          value === null ? null : Number(value),
      ),
      lineCount: sql<number>`(
        select count(*)::int from goods_receipt_lines l
        where l.organization_id = "goods_receipts"."organization_id"
          and l.goods_receipt_id = "goods_receipts"."id")`,
    })
    .from(goodsReceipts)
    .where(listConditions(query))
    .orderBy(desc(goodsReceipts.createdAt), desc(goodsReceipts.id))
    .limit(limit)
    .offset(offset);
}
