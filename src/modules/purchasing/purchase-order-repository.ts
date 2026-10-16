import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  purchaseOrderLines,
  purchaseOrders,
  purchaseOrderStatus,
} from "./schema";

// Acceso a purchase_orders y purchase_order_lines (ADR 0023, punto 3; brief-22.3). Toda consulta
// filtra por organization_id en SQL, también las escrituras por id (D-7). Las únicas escrituras son
// insertPurchaseOrder, insertPurchaseOrderLines y cancelPurchaseOrderRow, y ninguna borra. El
// trigger de la 0048 es la segunda defensa.

type Executor = Db | DbTransaction;

export type PurchaseOrderStatus =
  (typeof purchaseOrderStatus.enumValues)[number];

export type PurchaseOrderRow = {
  id: string;
  number: number;
  supplierId: string;
  currency: string;
  // Con la escala de la base ("1234.50").
  total: string;
  status: PurchaseOrderStatus;
  closedAt: Date | null;
  cancelledAt: Date | null;
  createdBy: string;
  createdAt: Date;
};

const orderColumns = {
  id: purchaseOrders.id,
  number: purchaseOrders.number,
  supplierId: purchaseOrders.supplierId,
  currency: purchaseOrders.currency,
  total: purchaseOrders.total,
  status: purchaseOrders.status,
  closedAt: purchaseOrders.closedAt,
  cancelledAt: purchaseOrders.cancelledAt,
  createdBy: purchaseOrders.createdBy,
  createdAt: purchaseOrders.createdAt,
};

export type PurchaseOrderLineRow = {
  productId: string;
  position: number;
  // numeric(14, 3) y numeric(14, 2), como texto con la escala de la base.
  quantity: string;
  unitCost: string;
  lineTotal: string;
};

const lineColumns = {
  productId: purchaseOrderLines.productId,
  position: purchaseOrderLines.position,
  quantity: purchaseOrderLines.quantity,
  unitCost: purchaseOrderLines.unitCost,
  lineTotal: purchaseOrderLines.lineTotal,
};

export type NewPurchaseOrder = {
  organizationId: string;
  number: number;
  supplierId: string;
  currency: string;
  total: string;
  createdBy: string;
};

export async function insertPurchaseOrder(
  tx: DbTransaction,
  order: NewPurchaseOrder,
): Promise<PurchaseOrderRow> {
  const rows = await tx
    .insert(purchaseOrders)
    .values(order)
    .returning(orderColumns);
  return rows[0]!;
}

export type NewPurchaseOrderLine = {
  productId: string;
  position: number;
  quantity: string;
  unitCost: string;
  lineTotal: string;
};

export async function insertPurchaseOrderLines(
  tx: DbTransaction,
  organizationId: string,
  purchaseOrderId: string,
  lines: NewPurchaseOrderLine[],
): Promise<void> {
  await tx
    .insert(purchaseOrderLines)
    .values(
      lines.map((line) => ({ ...line, organizationId, purchaseOrderId })),
    );
}

// forUpdate: la cancelación bloquea la cabecera antes de leer su estado (ADR 0023, punto 10; D-7).
export async function findPurchaseOrder(
  organizationId: string,
  purchaseOrderId: string,
  executor: Executor = getDb(),
  { forUpdate = false } = {},
): Promise<PurchaseOrderRow | undefined> {
  const query = executor
    .select(orderColumns)
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.organizationId, organizationId),
        eq(purchaseOrders.id, purchaseOrderId),
      ),
    )
    .limit(1);
  const rows = forUpdate ? await query.for("update") : await query;
  return rows[0];
}

// La única escritura de la cabecera después del alta, en la 22.3: la cancelación, con su fecha.
// Exige la transacción que ya bloqueó la fila. El cierre llega con la 22.4 (D-3).
export async function cancelPurchaseOrderRow(
  tx: DbTransaction,
  organizationId: string,
  purchaseOrderId: string,
): Promise<void> {
  const rows = await tx
    .update(purchaseOrders)
    .set({
      status: "cancelled",
      cancelledAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(purchaseOrders.organizationId, organizationId),
        eq(purchaseOrders.id, purchaseOrderId),
      ),
    )
    .returning({ id: purchaseOrders.id });
  // El llamador ya leyó la fila con FOR UPDATE en esta transacción: cero filas es un defecto.
  if (rows.length === 0) {
    throw new Error(
      "cancelPurchaseOrderRow: la orden no existe en esta organización",
    );
  }
}

export async function findPurchaseOrderLines(
  organizationId: string,
  purchaseOrderId: string,
): Promise<PurchaseOrderLineRow[]> {
  return getDb()
    .select(lineColumns)
    .from(purchaseOrderLines)
    .where(
      and(
        eq(purchaseOrderLines.organizationId, organizationId),
        eq(purchaseOrderLines.purchaseOrderId, purchaseOrderId),
      ),
    )
    .orderBy(asc(purchaseOrderLines.position));
}

export type PurchaseOrderListQuery = {
  organizationId: string;
  status: PurchaseOrderStatus | null;
  supplierId: string | null;
  number: number | null;
};

function listConditions(query: PurchaseOrderListQuery): SQL | undefined {
  return and(
    eq(purchaseOrders.organizationId, query.organizationId),
    query.status ? eq(purchaseOrders.status, query.status) : undefined,
    query.supplierId
      ? eq(purchaseOrders.supplierId, query.supplierId)
      : undefined,
    query.number !== null ? eq(purchaseOrders.number, query.number) : undefined,
  );
}

export async function countPurchaseOrders(
  query: PurchaseOrderListQuery,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(purchaseOrders)
    .where(listConditions(query));
  return rows[0]!.total;
}

export type PurchaseOrderListRow = PurchaseOrderRow & {
  supplierName: string;
  lineCount: number;
};

// De la más reciente a la más vieja, paginada en SQL (D-11). El nombre del proveedor y la cantidad
// de líneas son subconsultas sobre tablas del mismo módulo, con alias explícitos: en un select de
// una sola tabla, Drizzle no califica las columnas (como en orders).
export function findPurchaseOrders(
  query: PurchaseOrderListQuery,
  limit: number,
  offset: number,
): Promise<PurchaseOrderListRow[]> {
  return getDb()
    .select({
      ...orderColumns,
      supplierName: sql<string>`(
        select s.name from suppliers s
        where s.organization_id = "purchase_orders"."organization_id"
          and s.id = "purchase_orders"."supplier_id")`,
      lineCount: sql<number>`(
        select count(*)::int from purchase_order_lines l
        where l.organization_id = "purchase_orders"."organization_id"
          and l.purchase_order_id = "purchase_orders"."id")`,
    })
    .from(purchaseOrders)
    .where(listConditions(query))
    .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
    .limit(limit)
    .offset(offset);
}
