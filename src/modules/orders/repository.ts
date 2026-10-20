import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { orderLines, orderLineUnits, orders, orderStatus } from "./schema";

// Acceso a orders y order_lines (ADR 0020; brief-19.2). Toda consulta filtra por organization_id en
// SQL. Las únicas escrituras son insertOrder, insertOrderLines, updateOrderStatus y, desde la 29.5.2,
// insertOrderLineUnits (brief-29.5.2, D-4), y ninguna borra: lo vigila
// tests/guards/order-writes.test.ts (D-4). Los triggers de la 0036 y la 0057 son la segunda defensa.

type Executor = Db | DbTransaction;

export type OrderStatus = (typeof orderStatus.enumValues)[number];

export type OrderRow = {
  id: string;
  number: number;
  clientId: string;
  currency: string;
  // Con la escala de la base ("1234.50").
  total: string;
  status: OrderStatus;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  // Exactamente uno de los dos (brief-19.4, D-4): un usuario, o la credencial del agente.
  createdBy: string | null;
  createdByCredentialId: string | null;
  createdAt: Date;
};

const orderColumns = {
  id: orders.id,
  number: orders.number,
  clientId: orders.clientId,
  currency: orders.currency,
  total: orders.total,
  status: orders.status,
  confirmedAt: orders.confirmedAt,
  deliveredAt: orders.deliveredAt,
  cancelledAt: orders.cancelledAt,
  createdBy: orders.createdBy,
  createdByCredentialId: orders.createdByCredentialId,
  createdAt: orders.createdAt,
};

export type OrderLineRow = {
  id: string;
  productId: string;
  position: number;
  // numeric(14, 3) y numeric(14, 2), como texto con la escala de la base.
  quantity: string;
  unitPrice: string;
  currency: string;
  lineTotal: string;
};

const lineColumns = {
  id: orderLines.id,
  productId: orderLines.productId,
  position: orderLines.position,
  quantity: orderLines.quantity,
  unitPrice: orderLines.unitPrice,
  currency: orderLines.currency,
  lineTotal: orderLines.lineTotal,
};

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

// El autor: un usuario, o la credencial con el evento de ingestión que lo creó (brief-19.4, D-4).
export type OrderCreator =
  | { createdBy: string }
  | { createdByCredentialId: string; ingestionEventId: string };

export type NewOrder = {
  organizationId: string;
  number: number;
  clientId: string;
  currency: string;
  total: string;
} & OrderCreator;

export async function insertOrder(
  tx: DbTransaction,
  order: NewOrder,
): Promise<OrderRow> {
  const rows = await tx.insert(orders).values(order).returning(orderColumns);
  return rows[0]!;
}

// El número del pedido que creó un evento de ingestión, para responder un reenvío (brief-19.4, D-6).
export async function findOrderNumberByIngestionEvent(
  tx: DbTransaction,
  organizationId: string,
  ingestionEventId: string,
): Promise<number | undefined> {
  const rows = await tx
    .select({ number: orders.number })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        eq(orders.ingestionEventId, ingestionEventId),
      ),
    )
    .limit(1);
  return rows[0]?.number;
}

export type NewOrderLine = {
  productId: string;
  position: number;
  quantity: string;
  unitPrice: string;
  currency: string;
  lineTotal: string;
};

export async function insertOrderLines(
  tx: DbTransaction,
  organizationId: string,
  orderId: string,
  lines: NewOrderLine[],
): Promise<{ id: string; position: number }[]> {
  return tx
    .insert(orderLines)
    .values(lines.map((line) => ({ ...line, organizationId, orderId })))
    .returning({ id: orderLines.id, position: orderLines.position });
}

// Las unidades de las líneas de un pedido (brief-29.5.2, D-1 y D-4): se escriben con el alta, con la
// misma transacción, y no cambian.
export type NewOrderLineUnit = {
  orderLineId: string;
  productId: string;
  unitId: string;
  unitPrice: string;
};

export async function insertOrderLineUnits(
  tx: DbTransaction,
  organizationId: string,
  units: NewOrderLineUnit[],
): Promise<void> {
  if (units.length === 0) return;
  await tx
    .insert(orderLineUnits)
    .values(units.map((unit) => ({ ...unit, organizationId })));
}

export type OrderLineUnitRow = {
  orderLineId: string;
  unitId: string;
  unitPrice: string;
};

// Las unidades de unas líneas, en el orden en que se eligieron (el id no lo dice: se ordena por el
// IMEI en quien las muestra). Una línea de otra organización no trae nada.
export function findOrderLineUnits(
  organizationId: string,
  orderLineIds: string[],
  executor: Executor = getDb(),
): Promise<OrderLineUnitRow[]> {
  if (orderLineIds.length === 0) return Promise.resolve([]);
  return executor
    .select({
      orderLineId: orderLineUnits.orderLineId,
      unitId: orderLineUnits.unitId,
      unitPrice: orderLineUnits.unitPrice,
    })
    .from(orderLineUnits)
    .where(
      and(
        eq(orderLineUnits.organizationId, organizationId),
        inArray(orderLineUnits.orderLineId, orderLineIds),
      ),
    );
}

// El pedido confirmado o entregado de cada unidad, para la ficha de unidades (brief-29.5.2, D-5): una
// unidad reservada o vendida por entrega está en exactamente uno (invariante 3).
export function findActiveOrdersOfUnits(
  organizationId: string,
  unitIds: string[],
): Promise<{ unitId: string; orderId: string; number: number }[]> {
  if (unitIds.length === 0) return Promise.resolve([]);
  return getDb()
    .select({
      unitId: orderLineUnits.unitId,
      orderId: orders.id,
      number: orders.number,
    })
    .from(orderLineUnits)
    .innerJoin(
      orderLines,
      and(
        eq(orderLines.organizationId, orderLineUnits.organizationId),
        eq(orderLines.id, orderLineUnits.orderLineId),
      ),
    )
    .innerJoin(
      orders,
      and(
        eq(orders.organizationId, orderLines.organizationId),
        eq(orders.id, orderLines.orderId),
      ),
    )
    .where(
      and(
        eq(orderLineUnits.organizationId, organizationId),
        inArray(orderLineUnits.unitId, unitIds),
        inArray(orders.status, ["confirmed", "delivered"]),
      ),
    );
}

// forUpdate: una transición bloquea la cabecera antes de leer su estado (ADR 0020, punto 6).
export async function findOrder(
  organizationId: string,
  orderId: string,
  executor: Executor = getDb(),
  { forUpdate = false } = {},
): Promise<OrderRow | undefined> {
  const query = executor
    .select(orderColumns)
    .from(orders)
    .where(
      and(eq(orders.organizationId, organizationId), eq(orders.id, orderId)),
    )
    .limit(1);
  const rows = forUpdate ? await query.for("update") : await query;
  return rows[0];
}

// La fecha que pone cada estado de destino (ADR 0020, punto 4). La 19.2 solo cancelaba; la 19.3
// suma confirmed y delivered.
const STATUS_STAMPS = {
  confirmed: { confirmedAt: sql`now()` },
  delivered: { deliveredAt: sql`now()` },
  cancelled: { cancelledAt: sql`now()` },
} as const;

export type TargetStatus = keyof typeof STATUS_STAMPS;

// La única escritura de la cabecera después del alta: el estado y la fecha de ese estado. Exige
// la transacción que ya bloqueó la fila.
export async function updateOrderStatus(
  tx: DbTransaction,
  organizationId: string,
  orderId: string,
  status: TargetStatus,
): Promise<void> {
  await tx
    .update(orders)
    .set({ status, ...STATUS_STAMPS[status], updatedAt: sql`now()` })
    .where(
      and(eq(orders.organizationId, organizationId), eq(orders.id, orderId)),
    );
}

// Con tx, dentro de la transacción de una transición (brief-19.3).
export async function findOrderLines(
  organizationId: string,
  orderId: string,
  tx?: DbTransaction,
): Promise<OrderLineRow[]> {
  return (tx ?? getDb())
    .select(lineColumns)
    .from(orderLines)
    .where(
      and(
        eq(orderLines.organizationId, organizationId),
        eq(orderLines.orderId, orderId),
      ),
    )
    .orderBy(asc(orderLines.position));
}

// Los pedidos de un cliente, de todos los estados, para la cuenta que arma cash (brief-21.4, D-2).
// Con la transacción de cash y sin bloquear.
export function findClientOrders(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
): Promise<OrderRow[]> {
  return tx
    .select(orderColumns)
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        eq(orders.clientId, clientId),
      ),
    )
    .orderBy(asc(orders.createdAt), asc(orders.number));
}

// Los pedidos de unos ids, para la lista de deudores de cash (brief-21.6, D-6): solo los que tienen
// señas. Con la transacción de cash y sin bloquear.
export function findOrdersByIds(
  tx: DbTransaction,
  organizationId: string,
  ids: string[],
): Promise<OrderRow[]> {
  return tx
    .select(orderColumns)
    .from(orders)
    .where(
      and(eq(orders.organizationId, organizationId), inArray(orders.id, ids)),
    )
    .orderBy(asc(orders.createdAt), asc(orders.number));
}

export type OrderListQuery = {
  organizationId: string;
  statuses: OrderStatus[] | null;
  clientId: string | null;
  number: number | null;
};

function listConditions(query: OrderListQuery): SQL | undefined {
  return and(
    eq(orders.organizationId, query.organizationId),
    query.statuses ? inArray(orders.status, query.statuses) : undefined,
    query.clientId ? eq(orders.clientId, query.clientId) : undefined,
    query.number !== null ? eq(orders.number, query.number) : undefined,
  );
}

export async function countOrders(query: OrderListQuery): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(orders)
    .where(listConditions(query));
  return rows[0]!.total;
}

export type OrderListRow = OrderRow & { lineCount: number };

// De la más reciente a la más vieja, paginada en SQL (brief-19.2, D-10). La cantidad de líneas es
// una subconsulta sobre la tabla del mismo módulo.
export function findOrders(
  query: OrderListQuery,
  limit: number,
  offset: number,
): Promise<OrderListRow[]> {
  return getDb()
    .select({
      ...orderColumns,
      // Con alias explícitos: en un select de una sola tabla, Drizzle no califica las columnas, y
      // organization_id quedaría ambiguo dentro de la subconsulta (como en crm).
      lineCount: sql<number>`(
        select count(*)::int from order_lines l
        where l.organization_id = "orders"."organization_id"
          and l.order_id = "orders"."id")`,
    })
    .from(orders)
    .where(listConditions(query))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit)
    .offset(offset);
}
