import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  repairPrices,
  repairTypes,
  serviceOrderCancelReason,
  serviceOrderKind,
  serviceOrderLines,
  serviceOrders,
  serviceOrderStatus,
} from "./schema";

// Acceso a las tablas de service (brief-29.6, D-2 y D-4). Toda consulta filtra por organization_id en
// SQL, también las escrituras por id. Las escrituras son las de tests/guards/service-writes.test.ts:
// cada una con su función y su llamador.

type Executor = Db | DbTransaction;

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

// Los tipos de reparación (D-2).

export type RepairTypeRow = {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
  isExample: boolean;
};

const typeColumns = {
  id: repairTypes.id,
  name: repairTypes.name,
  position: repairTypes.position,
  isActive: repairTypes.isActive,
  isExample: repairTypes.isExample,
};

// En su orden, y el id para desempatar. forUpdate bloquea la lista entera: dos movimientos se ordenan.
export async function findRepairTypes(
  organizationId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<RepairTypeRow[]> {
  const query = executor
    .select(typeColumns)
    .from(repairTypes)
    .where(eq(repairTypes.organizationId, organizationId))
    .orderBy(asc(repairTypes.position), asc(repairTypes.id));
  return options.forUpdate ? query.for("update") : query;
}

export async function findRepairType(
  organizationId: string,
  repairTypeId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<RepairTypeRow | undefined> {
  const query = executor
    .select(typeColumns)
    .from(repairTypes)
    .where(
      and(
        eq(repairTypes.organizationId, organizationId),
        eq(repairTypes.id, repairTypeId),
      ),
    )
    .limit(1);
  const rows = options.forUpdate ? await query.for("update") : await query;
  return rows[0];
}

// Un nombre repetido, sin distinguir mayúsculas, lo rechaza el índice único.
function isNameTaken(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "repair_types_organization_name_lower_unique"
  );
}

// Corre en un savepoint: un nombre repetido deshace solo esta escritura.
async function inSavepoint<T>(
  tx: DbTransaction,
  work: (savepoint: DbTransaction) => Promise<T>,
): Promise<T | "name_taken"> {
  try {
    return await tx.transaction(work);
  } catch (error) {
    if (isNameTaken(error)) return "name_taken";
    throw error;
  }
}

export function insertRepairType(
  tx: DbTransaction,
  organizationId: string,
  values: {
    name: string;
    position: number;
    isActive: boolean;
    isExample: boolean;
  },
): Promise<string | "name_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(repairTypes)
      .values({ organizationId, ...values })
      .returning({ id: repairTypes.id });
    return rows[0]!.id;
  });
}

function assertUpdatedOne(rows: unknown[], what: string): void {
  if (rows.length === 0) {
    throw new Error(`${what}: la fila no existe en esta organización`);
  }
}

export function updateRepairType(
  tx: DbTransaction,
  organizationId: string,
  repairTypeId: string,
  values: Partial<{ name: string; position: number; isActive: boolean }>,
): Promise<void | "name_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .update(repairTypes)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(repairTypes.organizationId, organizationId),
          eq(repairTypes.id, repairTypeId),
        ),
      )
      .returning({ id: repairTypes.id });
    assertUpdatedOne(rows, "updateRepairType");
  });
}

// Los precios (D-2).

export type RepairPriceRow = {
  id: string;
  repairTypeId: string;
  modelId: string;
  price: string;
  priceCurrency: string;
  cost: string;
  costCurrency: string;
};

const priceColumns = {
  id: repairPrices.id,
  repairTypeId: repairPrices.repairTypeId,
  modelId: repairPrices.modelId,
  price: repairPrices.price,
  priceCurrency: repairPrices.priceCurrency,
  cost: repairPrices.cost,
  costCurrency: repairPrices.costCurrency,
};

// Los precios de un modelo: la grilla de la pantalla y el presupuesto.
export function findModelRepairPrices(
  organizationId: string,
  modelId: string,
  executor: Executor = getDb(),
): Promise<RepairPriceRow[]> {
  return executor
    .select(priceColumns)
    .from(repairPrices)
    .where(
      and(
        eq(repairPrices.organizationId, organizationId),
        eq(repairPrices.modelId, modelId),
      ),
    );
}

// El precio al cliente de unos modelos, para el agente (brief-29.8.2, D-2): sin el costo, que ni se
// lee.
export type CustomerRepairPriceRow = {
  repairTypeId: string;
  modelId: string;
  price: string;
  priceCurrency: string;
};

export function findCustomerRepairPrices(
  organizationId: string,
  modelIds: string[],
): Promise<CustomerRepairPriceRow[]> {
  if (modelIds.length === 0) return Promise.resolve([]);
  return getDb()
    .select({
      repairTypeId: repairPrices.repairTypeId,
      modelId: repairPrices.modelId,
      price: repairPrices.price,
      priceCurrency: repairPrices.priceCurrency,
    })
    .from(repairPrices)
    .where(
      and(
        eq(repairPrices.organizationId, organizationId),
        inArray(repairPrices.modelId, modelIds),
      ),
    );
}

// Cuántos precios tiene cargados cada modelo, para la lista de modelos de la pantalla.
export async function countPricesByModel(
  organizationId: string,
): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ modelId: repairPrices.modelId, total: count() })
    .from(repairPrices)
    .where(eq(repairPrices.organizationId, organizationId))
    .groupBy(repairPrices.modelId);
  return new Map(rows.map((row) => [row.modelId, row.total]));
}

// La fila de un tipo y un modelo FOR UPDATE: dos ediciones del mismo precio se ordenan, y el «antes» de
// la auditoría es lo que dejó la anterior. Si no existe, el INSERT de la otra choca con el único.
export async function findRepairPrice(
  tx: DbTransaction,
  organizationId: string,
  repairTypeId: string,
  modelId: string,
): Promise<RepairPriceRow | undefined> {
  const rows = await tx
    .select(priceColumns)
    .from(repairPrices)
    .where(
      and(
        eq(repairPrices.organizationId, organizationId),
        eq(repairPrices.repairTypeId, repairTypeId),
        eq(repairPrices.modelId, modelId),
      ),
    )
    .limit(1)
    .for("update");
  return rows[0];
}

export type RepairPriceValues = {
  price: string;
  priceCurrency: string;
  cost: string;
  costCurrency: string;
};

function isPriceTaken(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "repair_prices_organization_type_model_unique"
  );
}

// El primer precio de un tipo para un modelo. Si otro lo creó a la vez, el único lo rechaza y quien
// llama vuelve a intentar como edición.
export async function insertRepairPrice(
  tx: DbTransaction,
  organizationId: string,
  keys: { repairTypeId: string; modelId: string },
  values: RepairPriceValues,
): Promise<string | "taken"> {
  try {
    return await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(repairPrices)
        .values({ organizationId, ...keys, ...values })
        .returning({ id: repairPrices.id });
      return rows[0]!.id;
    });
  } catch (error) {
    if (isPriceTaken(error)) return "taken";
    throw error;
  }
}

export async function updateRepairPrice(
  tx: DbTransaction,
  organizationId: string,
  priceId: string,
  values: Partial<RepairPriceValues>,
): Promise<void> {
  const rows = await tx
    .update(repairPrices)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(repairPrices.organizationId, organizationId),
        eq(repairPrices.id, priceId),
      ),
    )
    .returning({ id: repairPrices.id });
  assertUpdatedOne(rows, "updateRepairPrice");
}

// Las órdenes de servicio (D-4).

export type ServiceOrderKind = (typeof serviceOrderKind.enumValues)[number];
export type ServiceOrderStatus = (typeof serviceOrderStatus.enumValues)[number];
export type ServiceOrderCancelReason =
  (typeof serviceOrderCancelReason.enumValues)[number];
export const SERVICE_ORDER_STATUSES = serviceOrderStatus.enumValues;
export const SERVICE_ORDER_CANCEL_REASONS = serviceOrderCancelReason.enumValues;

export type ServiceOrderRow = {
  id: string;
  number: number;
  // Desde la 29.6.2 (brief-29.6.2, D-3): una orden tiene cliente o unidad, según su tipo.
  kind: ServiceOrderKind;
  clientId: string | null;
  unitId: string | null;
  // El equipo original de un reclamo (brief-29.9.2, U-1): uno de los dos, o ninguno en otro tipo.
  claimUnitId: string | null;
  claimServiceOrderId: string | null;
  modelId: string;
  deviceSerial: string | null;
  reportedIssue: string | null;
  technicianId: string | null;
  status: ServiceOrderStatus;
  customerCurrency: string | null;
  customerTotal: string | null;
  technicianCurrency: string | null;
  technicianTotal: string | null;
  sentAt: Date | null;
  quotedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  repairedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: ServiceOrderCancelReason | null;
  saleId: string | null;
  createdBy: string;
  createdAt: Date;
};

const orderColumns = {
  id: serviceOrders.id,
  number: serviceOrders.number,
  kind: serviceOrders.kind,
  clientId: serviceOrders.clientId,
  claimUnitId: serviceOrders.claimUnitId,
  claimServiceOrderId: serviceOrders.claimServiceOrderId,
  unitId: serviceOrders.unitId,
  modelId: serviceOrders.modelId,
  deviceSerial: serviceOrders.deviceSerial,
  reportedIssue: serviceOrders.reportedIssue,
  technicianId: serviceOrders.technicianId,
  status: serviceOrders.status,
  customerCurrency: serviceOrders.customerCurrency,
  customerTotal: serviceOrders.customerTotal,
  technicianCurrency: serviceOrders.technicianCurrency,
  technicianTotal: serviceOrders.technicianTotal,
  sentAt: serviceOrders.sentAt,
  quotedAt: serviceOrders.quotedAt,
  approvedAt: serviceOrders.approvedAt,
  rejectedAt: serviceOrders.rejectedAt,
  repairedAt: serviceOrders.repairedAt,
  deliveredAt: serviceOrders.deliveredAt,
  cancelledAt: serviceOrders.cancelledAt,
  cancelReason: serviceOrders.cancelReason,
  saleId: serviceOrders.saleId,
  createdBy: serviceOrders.createdBy,
  createdAt: serviceOrders.createdAt,
};

export async function insertServiceOrder(
  tx: DbTransaction,
  values: {
    organizationId: string;
    number: number;
    clientId: string;
    modelId: string;
    deviceSerial: string | null;
    reportedIssue: string;
    createdBy: string;
  },
): Promise<ServiceOrderRow> {
  const rows = await tx
    .insert(serviceOrders)
    .values({ ...values, kind: "customer_device" })
    .returning(orderColumns);
  return rows[0]!;
}

// La orden de una unidad propia (brief-29.6.2, D-3) nace mandada al técnico: la unidad ya está en el
// local, y no hay recepción.
export async function insertOwnUnitServiceOrder(
  tx: DbTransaction,
  values: {
    organizationId: string;
    number: number;
    unitId: string;
    modelId: string;
    reportedIssue: string;
    technicianId: string;
    sentAt: Date;
    createdBy: string;
  },
): Promise<ServiceOrderRow> {
  const rows = await tx
    .insert(serviceOrders)
    .values({ ...values, kind: "own_unit", status: "sent" })
    .returning(orderColumns);
  return rows[0]!;
}

// El reclamo de garantía (brief-29.9.2, D-1) nace recibido, como la orden de un cliente, y nombra el
// equipo original. Un reclamo ya abierto del mismo equipo choca con el índice único parcial: "open". Corre
// en un savepoint, para que ese choque deshaga solo esta escritura.
const CLAIM_OPEN_INDEXES = new Set([
  "service_orders_claim_unit_open_unique",
  "service_orders_claim_order_open_unique",
]);

function isClaimOpen(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" && CLAIM_OPEN_INDEXES.has(source.constraint ?? "")
  );
}

export async function insertWarrantyClaim(
  tx: DbTransaction,
  values: {
    organizationId: string;
    number: number;
    clientId: string;
    claimUnitId: string | null;
    claimServiceOrderId: string | null;
    modelId: string;
    deviceSerial: string | null;
    reportedIssue: string;
    createdBy: string;
  },
): Promise<ServiceOrderRow | "open"> {
  try {
    return await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(serviceOrders)
        .values({ ...values, kind: "warranty_claim" })
        .returning(orderColumns);
      return rows[0]!;
    });
  } catch (error) {
    if (isClaimOpen(error)) return "open";
    throw error;
  }
}

// Los reclamos de unos equipos originales (D-5), de los más recientes a los más viejos.
export function findClaimsOf(
  organizationId: string,
  target: { unitIds: string[] } | { serviceOrderIds: string[] },
): Promise<ServiceOrderRow[]> {
  const ids = "unitIds" in target ? target.unitIds : target.serviceOrderIds;
  if (ids.length === 0) return Promise.resolve([]);
  return getDb()
    .select(orderColumns)
    .from(serviceOrders)
    .where(
      and(
        eq(serviceOrders.organizationId, organizationId),
        "unitIds" in target
          ? inArray(serviceOrders.claimUnitId, ids)
          : inArray(serviceOrders.claimServiceOrderId, ids),
      ),
    )
    .orderBy(desc(serviceOrders.createdAt), desc(serviceOrders.id));
}

// Cada transición bloquea la cabecera FOR UPDATE y decide con lo leído (D-9): de dos transiciones de la
// misma orden, la segunda espera y ve el estado que dejó la primera.
export async function findServiceOrder(
  organizationId: string,
  serviceOrderId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<ServiceOrderRow | undefined> {
  const query = executor
    .select(orderColumns)
    .from(serviceOrders)
    .where(
      and(
        eq(serviceOrders.organizationId, organizationId),
        eq(serviceOrders.id, serviceOrderId),
      ),
    )
    .limit(1);
  const rows = options.forUpdate ? await query.for("update") : await query;
  return rows[0];
}

// Lo que fija una transición: el estado y sus columnas. El trigger (0059; desde la 29.9.2, 0064) rechaza todo lo demás.
export type ServiceOrderTransition = { status: ServiceOrderStatus } & Partial<{
  technicianId: string;
  customerCurrency: string;
  customerTotal: string;
  technicianCurrency: string;
  technicianTotal: string;
  sentAt: Date;
  quotedAt: Date;
  approvedAt: Date;
  rejectedAt: Date;
  repairedAt: Date;
  deliveredAt: Date;
  cancelledAt: Date;
  cancelReason: ServiceOrderCancelReason;
  saleId: string;
}>;

export async function updateServiceOrder(
  tx: DbTransaction,
  organizationId: string,
  serviceOrderId: string,
  transition: ServiceOrderTransition,
): Promise<void> {
  const rows = await tx
    .update(serviceOrders)
    .set({ ...transition, updatedAt: new Date() })
    .where(
      and(
        eq(serviceOrders.organizationId, organizationId),
        eq(serviceOrders.id, serviceOrderId),
      ),
    )
    .returning({ id: serviceOrders.id });
  assertUpdatedOne(rows, "updateServiceOrder");
}

export type ServiceOrderLineRow = {
  repairTypeId: string;
  position: number;
  // Null en una unidad propia, que no tiene precio al cliente (brief-29.6.2, D-3).
  price: string | null;
  cost: string;
};

export async function insertServiceOrderLines(
  tx: DbTransaction,
  organizationId: string,
  serviceOrderId: string,
  lines: ServiceOrderLineRow[],
): Promise<void> {
  await tx
    .insert(serviceOrderLines)
    .values(lines.map((line) => ({ organizationId, serviceOrderId, ...line })));
}

export function findServiceOrderLines(
  organizationId: string,
  serviceOrderId: string,
): Promise<ServiceOrderLineRow[]> {
  return getDb()
    .select({
      repairTypeId: serviceOrderLines.repairTypeId,
      position: serviceOrderLines.position,
      price: serviceOrderLines.price,
      cost: serviceOrderLines.cost,
    })
    .from(serviceOrderLines)
    .where(
      and(
        eq(serviceOrderLines.organizationId, organizationId),
        eq(serviceOrderLines.serviceOrderId, serviceOrderId),
      ),
    )
    .orderBy(asc(serviceOrderLines.position));
}

// La lista (D-10): por estado, por número y por cliente; desde la 29.6.2, por tipo y por unidad.
export type ServiceOrderListQuery = {
  organizationId: string;
  // Null: todos los estados.
  statuses: ServiceOrderStatus[] | null;
  number: number | null;
  clientId: string | null;
  // Null: los dos tipos.
  kind?: ServiceOrderKind | null;
  unitId?: string | null;
  // El IMEI del equipo de un cliente, sin distinguir mayúsculas (brief-29.9, U-3).
  deviceSerial?: string | null;
  // Las que siguen abiertas, con los estados abiertos de cada tipo: una orden propia reparada ya
  // terminó, y una de cliente reparada espera la entrega (brief-29.6.2, D-7).
  open?: Record<ServiceOrderKind, ServiceOrderStatus[]> | null;
};

function listConditions(query: ServiceOrderListQuery): SQL {
  const conditions: SQL[] = [
    eq(serviceOrders.organizationId, query.organizationId),
  ];
  if (query.statuses !== null) {
    conditions.push(inArray(serviceOrders.status, query.statuses));
  }
  if (query.number !== null) {
    conditions.push(eq(serviceOrders.number, query.number));
  }
  if (query.clientId !== null) {
    conditions.push(eq(serviceOrders.clientId, query.clientId));
  }
  if (query.kind != null) {
    conditions.push(eq(serviceOrders.kind, query.kind));
  }
  if (query.unitId != null) {
    conditions.push(eq(serviceOrders.unitId, query.unitId));
  }
  if (query.deviceSerial != null) {
    conditions.push(
      sql`lower(${serviceOrders.deviceSerial}) = ${query.deviceSerial.toLowerCase()}`,
    );
  }
  if (query.open != null) {
    conditions.push(
      or(
        ...Object.entries(query.open).map(([kind, statuses]) =>
          and(
            eq(serviceOrders.kind, kind as ServiceOrderKind),
            inArray(serviceOrders.status, statuses),
          ),
        ),
      )!,
    );
  }
  return and(...conditions)!;
}

export async function countServiceOrders(
  query: ServiceOrderListQuery,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(serviceOrders)
    .where(listConditions(query));
  return rows[0]?.total ?? 0;
}

// Cuántas órdenes de la lista tiene cada cliente, para la lista de clientes (brief-24.4.2, D-1 y D-3):
// con unos ids, los de una página; con null, todos los de la organización. Una orden sin cliente (de
// una unidad propia) no cuenta.
export async function countServiceOrdersByClient(
  query: ServiceOrderListQuery,
  clientIds: string[] | null,
): Promise<{ clientId: string; total: number }[]> {
  const rows = await getDb()
    .select({ clientId: serviceOrders.clientId, total: count() })
    .from(serviceOrders)
    .where(
      and(
        listConditions(query),
        clientIds === null
          ? isNotNull(serviceOrders.clientId)
          : inArray(serviceOrders.clientId, clientIds),
      ),
    )
    .groupBy(serviceOrders.clientId);
  return rows.flatMap((row) =>
    row.clientId === null ? [] : [{ clientId: row.clientId, total: row.total }],
  );
}

export function findServiceOrders(
  query: ServiceOrderListQuery,
  limit: number,
  offset: number,
): Promise<ServiceOrderRow[]> {
  return getDb()
    .select(orderColumns)
    .from(serviceOrders)
    .where(listConditions(query))
    .orderBy(desc(serviceOrders.createdAt), desc(serviceOrders.id))
    .limit(limit)
    .offset(offset);
}

// Las órdenes de un cliente para el agente (brief-29.8.2, U-3 y D-4): las del equipo de un cliente,
// abiertas o cerradas (entregadas o canceladas) desde `closedSince`, de la más reciente a la más vieja.
// Solo las columnas que el contrato usa: ni el IMEI, ni lo que reporta, ni el técnico, ni el costo. El
// filtro por tipo es una segunda defensa: una orden propia no tiene cliente, y el de client_id ya la deja
// fuera. Una orden cancelada como entered_by_mistake nunca aparece: pudo ser de otro cliente (revisión
// independiente de la 29.8.2, O-2; decisión del usuario del 2026-10-23).
export type AgentServiceOrderRow = {
  id: string;
  number: number;
  modelId: string;
  status: ServiceOrderStatus;
  customerCurrency: string | null;
  customerTotal: string | null;
  sentAt: Date | null;
  quotedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  repairedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
};

export function findClientServiceOrdersForAgent(
  organizationId: string,
  clientId: string,
  closedSince: Date,
  limit: number,
): Promise<AgentServiceOrderRow[]> {
  return getDb()
    .select({
      id: serviceOrders.id,
      number: serviceOrders.number,
      modelId: serviceOrders.modelId,
      status: serviceOrders.status,
      customerCurrency: serviceOrders.customerCurrency,
      customerTotal: serviceOrders.customerTotal,
      sentAt: serviceOrders.sentAt,
      quotedAt: serviceOrders.quotedAt,
      approvedAt: serviceOrders.approvedAt,
      rejectedAt: serviceOrders.rejectedAt,
      repairedAt: serviceOrders.repairedAt,
      deliveredAt: serviceOrders.deliveredAt,
      cancelledAt: serviceOrders.cancelledAt,
      createdAt: serviceOrders.createdAt,
    })
    .from(serviceOrders)
    .where(
      and(
        eq(serviceOrders.organizationId, organizationId),
        eq(serviceOrders.kind, "customer_device"),
        eq(serviceOrders.clientId, clientId),
        sql`${serviceOrders.cancelReason} is distinct from 'entered_by_mistake'`,
        or(
          notInArray(serviceOrders.status, ["delivered", "cancelled"]),
          gte(serviceOrders.deliveredAt, closedSince),
          gte(serviceOrders.cancelledAt, closedSince),
        ),
      ),
    )
    .orderBy(desc(serviceOrders.createdAt), desc(serviceOrders.id))
    .limit(limit);
}

// Las líneas de unas órdenes con su precio al cliente, para el presupuesto que ve el agente
// (brief-29.8.2, D-4): sin el costo del técnico.
export type CustomerOrderLineRow = {
  serviceOrderId: string;
  repairTypeId: string;
  position: number;
  price: string | null;
};

export function findCustomerOrderLines(
  organizationId: string,
  serviceOrderIds: string[],
): Promise<CustomerOrderLineRow[]> {
  if (serviceOrderIds.length === 0) return Promise.resolve([]);
  return getDb()
    .select({
      serviceOrderId: serviceOrderLines.serviceOrderId,
      repairTypeId: serviceOrderLines.repairTypeId,
      position: serviceOrderLines.position,
      price: serviceOrderLines.price,
    })
    .from(serviceOrderLines)
    .where(
      and(
        eq(serviceOrderLines.organizationId, organizationId),
        inArray(serviceOrderLines.serviceOrderId, serviceOrderIds),
      ),
    )
    .orderBy(asc(serviceOrderLines.position));
}

// Las órdenes de unas unidades propias (brief-29.6.2, D-7), de la más reciente a la más vieja.
export function findServiceOrdersOfUnits(
  organizationId: string,
  unitIds: string[],
): Promise<ServiceOrderRow[]> {
  return getDb()
    .select(orderColumns)
    .from(serviceOrders)
    .where(
      and(
        eq(serviceOrders.organizationId, organizationId),
        inArray(serviceOrders.unitId, unitIds),
      ),
    )
    .orderBy(desc(serviceOrders.createdAt), desc(serviceOrders.id));
}

// Lo que se le debe a los técnicos (D-7): las órdenes reparadas o entregadas que se repararon, de los
// tres tipos (brief-29.6.2, D-4; brief-29.9.2, D-4) y con costo, con su técnico, su costo total y la fecha de reparación. Lee con la transacción de cash: en el pago, detrás
// del bloqueo de cobros; en las lecturas de la cuenta, en una sola foto.
export type TechnicianChargeRow = {
  id: string;
  number: number;
  technicianId: string;
  technicianCurrency: string;
  technicianTotal: string;
  repairedAt: Date;
};

export async function findTechnicianCharges(
  tx: DbTransaction,
  organizationId: string,
  technicianIds: string[] | null,
): Promise<TechnicianChargeRow[]> {
  if (technicianIds !== null && technicianIds.length === 0) return [];
  const rows = await tx
    .select({
      id: serviceOrders.id,
      number: serviceOrders.number,
      technicianId: serviceOrders.technicianId,
      technicianCurrency: serviceOrders.technicianCurrency,
      technicianTotal: serviceOrders.technicianTotal,
      repairedAt: serviceOrders.repairedAt,
    })
    .from(serviceOrders)
    .where(
      and(
        eq(serviceOrders.organizationId, organizationId),
        sql`${serviceOrders.repairedAt} is not null`,
        // Un reclamo reparado sin cargo no le debe nada al técnico (brief-29.9.2, D-4).
        sql`${serviceOrders.technicianTotal} is not null`,
        technicianIds === null
          ? undefined
          : inArray(serviceOrders.technicianId, technicianIds),
      ),
    )
    .orderBy(asc(serviceOrders.repairedAt), asc(serviceOrders.number));
  // repaired_at supone sent_at y el técnico (CHECK de la 0059), y el filtro, su total: el del
  // presupuesto en la orden de un cliente, y el que se fija al repararla en la de una unidad propia o en
  // un reclamo con cargo.
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    technicianId: row.technicianId!,
    technicianCurrency: row.technicianCurrency!,
    technicianTotal: row.technicianTotal!,
    repairedAt: row.repairedAt!,
  }));
}
