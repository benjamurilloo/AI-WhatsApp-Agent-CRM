import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  purchaseOrderLines,
  purchaseOrders,
  purchaseOrderStatus,
} from "./schema";

// Acceso a purchase_orders y purchase_order_lines (ADR 0023, punto 3; brief-22.3). Toda consulta
// filtra por organization_id en SQL, también las escrituras por id (D-7). Las únicas escrituras son
// insertPurchaseOrder, insertPurchaseOrderLines, cancelPurchaseOrderRow y, desde la 22.4,
// closePurchaseOrderRow, y ninguna borra. El trigger de la 0048 es la segunda defensa.

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
  // Desde la 22.4: la recepción nombra la línea que recibe (brief-22.4, D-1).
  id: string;
  productId: string;
  position: number;
  // numeric(14, 3) y numeric(14, 2), como texto con la escala de la base.
  quantity: string;
  unitCost: string;
  lineTotal: string;
};

const lineColumns = {
  id: purchaseOrderLines.id,
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

// Las escrituras de la cabecera después del alta: la cancelación y, desde la 22.4, el cierre, cada
// una con su fecha. Exigen la transacción que ya bloqueó la fila FOR UPDATE.
export async function cancelPurchaseOrderRow(
  tx: DbTransaction,
  organizationId: string,
  purchaseOrderId: string,
): Promise<void> {
  await setPurchaseOrderStatus(tx, organizationId, purchaseOrderId, {
    status: "cancelled",
    cancelledAt: sql`now()`,
  });
}

// El cierre, automático con la recepción que completa la orden o a mano con faltante (brief-22.4,
// D-9).
export async function closePurchaseOrderRow(
  tx: DbTransaction,
  organizationId: string,
  purchaseOrderId: string,
): Promise<void> {
  await setPurchaseOrderStatus(tx, organizationId, purchaseOrderId, {
    status: "closed",
    closedAt: sql`now()`,
  });
}

async function setPurchaseOrderStatus(
  tx: DbTransaction,
  organizationId: string,
  purchaseOrderId: string,
  change:
    | { status: "cancelled"; cancelledAt: SQL }
    | { status: "closed"; closedAt: SQL },
): Promise<void> {
  const rows = await tx
    .update(purchaseOrders)
    .set({ ...change, updatedAt: sql`now()` })
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
      `${change.status}: la orden no existe en esta organización`,
    );
  }
}

export async function findPurchaseOrderLines(
  organizationId: string,
  purchaseOrderId: string,
  executor: Executor = getDb(),
): Promise<PurchaseOrderLineRow[]> {
  return executor
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
  hasPending: boolean;
};

// De la más reciente a la más vieja, paginada en SQL (D-11). El nombre del proveedor y la cantidad
// de líneas son subconsultas sobre tablas del mismo módulo, con alias explícitos: en un select de
// una sola tabla, Drizzle no califica las columnas (como en orders).
//
// `hasPending` es la lectura que agrega la 24.8.1 (brief-24.8.1, H-2): si a la orden le falta
// recibir algo. Con eso la lista distingue «Cerrada · Completa» de «Cerrada · Con faltante», que
// **no son estados de la base** —el enum sigue con `open`, `closed` y `cancelled`— sino una
// derivación de lo recibido por línea. Es la misma cuenta que hace la ficha con
// `sumReceivedByOrderLine`, incluido el descuento de las recepciones anuladas, pero resuelta como
// **una subconsulta más del mismo `select`**: una sentencia por página y no una por fila, que es lo
// que la 24.6.2-b midió costando 252 consultas al hacerlo de la forma obvia.
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
      hasPending: sql<boolean>`exists (
        select 1 from purchase_order_lines l
        where l.organization_id = "purchase_orders"."organization_id"
          and l.purchase_order_id = "purchase_orders"."id"
          and l.quantity > coalesce((
            select sum(gl.quantity) from goods_receipt_lines gl
            join goods_receipts g
              on g.organization_id = gl.organization_id and g.id = gl.goods_receipt_id
            where gl.organization_id = l.organization_id
              and gl.purchase_order_line_id = l.id
              and not exists (
                select 1 from goods_receipt_voids v
                where v.organization_id = g.organization_id and v.goods_receipt_id = g.id)
          ), 0))`,
    })
    .from(purchaseOrders)
    .where(listConditions(query))
    .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
    .limit(limit)
    .offset(offset);
}

// Las opciones del filtro de proveedor de la lista (brief-24.8.1, D-5), la segunda lectura nueva de
// la subfase, autorizada el 2026-11-06 y declarada en el recuadro de D-5.
//
// Trae **solo los proveedores que tienen al menos una orden**: una opción que no devuelve ninguna
// fila no es un filtro, es una trampa. Es **una sola sentencia**, con el nombre en una subconsulta
// correlacionada como el `supplierName` de la lista, y no un `join`, para no cambiar la forma de
// acceso que este archivo ya usa.
//
// Se pide **uno más que el tope** —como `findReceiptClientIds` de cash— para que el servicio sepa
// si el `<select>` entra sin contar aparte. Deliberadamente **sin `order by`**: con `distinct`,
// PostgreSQL exige que la expresión del orden esté en la lista de selección, y el orden que importa
// es el alfabético en español, que lo pone el servicio con `localeCompare`. Pasado el tope el
// recorte es arbitrario y da igual: ahí el control ya no es un `<select>`.
export function findPurchaseOrderSupplierOptions(
  organizationId: string,
  limit: number,
): Promise<{ id: string; name: string }[]> {
  return getDb()
    .selectDistinct({
      id: purchaseOrders.supplierId,
      name: sql<string>`(
        select s.name from suppliers s
        where s.organization_id = "purchase_orders"."organization_id"
          and s.id = "purchase_orders"."supplier_id")`,
    })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.organizationId, organizationId))
    .limit(limit);
}
