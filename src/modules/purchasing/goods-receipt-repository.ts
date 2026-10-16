import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  goodsReceiptLines,
  goodsReceiptVoidReason,
  goodsReceiptVoids,
  goodsReceipts,
} from "./schema";

// Acceso a goods_receipts y goods_receipt_lines (ADR 0023, punto 4; brief-22.4) y, desde la 22.5,
// goods_receipt_voids (punto 6; brief-22.5). Toda consulta filtra por organization_id en SQL, también
// las lecturas por id (D-8). Las únicas escrituras son insertGoodsReceipt, insertGoodsReceiptLines e
// insertGoodsReceiptVoid, y ninguna cambia ni borra: los triggers de la 0049 y la 0050 son la segunda
// defensa.

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

// Una recepción vigente es una sin anulación (brief-22.5, D-8). goods_receipt_voids_goods_receipt_unique
// sirve a la subconsulta.
const isCurrent = sql`not exists (
  select 1 from goods_receipt_voids v
  where v.organization_id = ${goodsReceipts.organizationId} and v.goods_receipt_id = ${goodsReceipts.id})`;
const isVoided = sql`exists (
  select 1 from goods_receipt_voids v
  where v.organization_id = ${goodsReceipts.organizationId} and v.goods_receipt_id = ${goodsReceipts.id})`;

// Lo recibido de cada línea de una orden, sumado en la base (D-7), con las recepciones vigentes
// (brief-22.5, D-8): lo anulado se puede volver a recibir. La recepción lo lee con la cabecera de la
// orden ya bloqueada FOR UPDATE: otra recepción de la misma orden, o una anulación, espera ahí, así
// que la suma incluye todo lo confirmado antes (AC-5).
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
        isCurrent,
      ),
    )
    .groupBy(goodsReceiptLines.purchaseOrderLineId);
  return new Map(
    rows.flatMap((row) =>
      row.purchaseOrderLineId ? [[row.purchaseOrderLineId, row.received]] : [],
    ),
  );
}

// Cuántas recepciones vigentes tiene una orden: la cancelación y el cierre a mano la leen con la
// cabecera ya bloqueada (D-9; brief-22.5, D-8). La anulación bloquea la misma cabecera, así que la
// cuenta incluye toda anulación confirmada antes.
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
        isCurrent,
      ),
    );
  return rows[0]!.total;
}

// La anulación de una recepción, si la tiene. Un bigint llega como texto: se convierte con mapWith,
// como en la lista de ventas.
const voidNumberOf = sql<number | null>`(
  select v.number from goods_receipt_voids v
  where v.organization_id = "goods_receipts"."organization_id"
    and v.goods_receipt_id = "goods_receipts"."id")`.mapWith(
  (value: string | number | null) => (value === null ? null : Number(value)),
);

export type GoodsReceiptListQuery = {
  organizationId: string;
  supplierId: string | null;
  purchaseOrderId: string | null;
  number: number | null;
  // El número de una anulación: trae la recepción que anula (brief-22.5, D-9, H-8).
  // Sin él, no filtra.
  voidNumber?: number | null;
  // Todas, las vigentes o las anuladas (brief-22.5, D-9); sin él, todas.
  status?: "all" | "current" | "voided";
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
    query.voidNumber != null
      ? sql`exists (
          select 1 from goods_receipt_voids v
          where v.organization_id = ${goodsReceipts.organizationId}
            and v.goods_receipt_id = ${goodsReceipts.id}
            and v.number = ${query.voidNumber})`
      : undefined,
    query.status === "voided" ? isVoided : undefined,
    query.status === "current" ? isCurrent : undefined,
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
  // El número de su anulación; null si está vigente (brief-22.5, D-9).
  voidNumber: number | null;
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
      voidNumber: voidNumberOf,
    })
    .from(goodsReceipts)
    .where(listConditions(query))
    .orderBy(desc(goodsReceipts.createdAt), desc(goodsReceipts.id))
    .limit(limit)
    .offset(offset);
}

// La anulación (ADR 0023, punto 6; brief-22.5, D-1).

export type GoodsReceiptVoidReason =
  (typeof goodsReceiptVoidReason.enumValues)[number];

export const GOODS_RECEIPT_VOID_REASONS = goodsReceiptVoidReason.enumValues;

export type GoodsReceiptVoidRow = {
  id: string;
  number: number;
  goodsReceiptId: string;
  currency: string;
  total: string;
  reason: GoodsReceiptVoidReason;
  createdBy: string;
  createdAt: Date;
};

const voidColumns = {
  id: goodsReceiptVoids.id,
  number: goodsReceiptVoids.number,
  goodsReceiptId: goodsReceiptVoids.goodsReceiptId,
  currency: goodsReceiptVoids.currency,
  total: goodsReceiptVoids.total,
  reason: goodsReceiptVoids.reason,
  createdBy: goodsReceiptVoids.createdBy,
  createdAt: goodsReceiptVoids.createdAt,
};

export type NewGoodsReceiptVoid = Omit<
  GoodsReceiptVoidRow,
  "id" | "createdAt"
> & { organizationId: string };

export async function insertGoodsReceiptVoid(
  tx: DbTransaction,
  receiptVoid: NewGoodsReceiptVoid,
): Promise<GoodsReceiptVoidRow> {
  const rows = await tx
    .insert(goodsReceiptVoids)
    .values(receiptVoid)
    .returning(voidColumns);
  return rows[0]!;
}

// Con tx, dentro de la anulación, después de los bloqueos que la serializan (brief-22.5, D-5).
export async function findVoidByGoodsReceipt(
  organizationId: string,
  goodsReceiptId: string,
  executor: Executor = getDb(),
): Promise<GoodsReceiptVoidRow | undefined> {
  const rows = await executor
    .select(voidColumns)
    .from(goodsReceiptVoids)
    .where(
      and(
        eq(goodsReceiptVoids.organizationId, organizationId),
        eq(goodsReceiptVoids.goodsReceiptId, goodsReceiptId),
      ),
    )
    .limit(1);
  return rows[0];
}

// Una recepción anulada dos veces (brief-22.5, D-5): solo esta restricción, por su nombre. drizzle-orm
// envuelve el error de pg; el código y la constraint quedan en la causa. El número no es esta regla.
export function isGoodsReceiptAlreadyVoided(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "goods_receipt_voids_goods_receipt_unique"
  );
}

// Lo que cash lee de una recepción para pagarla y para la cuenta del proveedor (ADR 0023, puntos 8,
// 9 y 11; brief-22.6, D-5): con la transacción de cash, sin bloquear, porque una recepción es de solo
// inserción y no se puede bloquear (punto 10). Anuladas incluidas, con su anulación.
export type GoodsReceiptForAccountRow = {
  id: string;
  number: number;
  supplierId: string;
  currency: string;
  total: string;
  createdAt: Date;
  voidNumber: number | null;
};

const accountColumns = {
  id: goodsReceipts.id,
  number: goodsReceipts.number,
  supplierId: goodsReceipts.supplierId,
  currency: goodsReceipts.currency,
  total: goodsReceipts.total,
  createdAt: goodsReceipts.createdAt,
  voidNumber: voidNumberOf,
};

export async function findGoodsReceiptForAccount(
  executor: Executor,
  organizationId: string,
  goodsReceiptId: string,
): Promise<GoodsReceiptForAccountRow | undefined> {
  const rows = await executor
    .select(accountColumns)
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

// De la más vieja a la más nueva, el orden de la imputación (ADR 0023, punto 9).
export function findSupplierGoodsReceiptsForAccount(
  executor: Executor,
  organizationId: string,
  supplierId: string,
): Promise<GoodsReceiptForAccountRow[]> {
  return executor
    .select(accountColumns)
    .from(goodsReceipts)
    .where(
      and(
        eq(goodsReceipts.organizationId, organizationId),
        eq(goodsReceipts.supplierId, supplierId),
      ),
    )
    .orderBy(asc(goodsReceipts.createdAt), asc(goodsReceipts.number));
}
