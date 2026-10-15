import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  cashMovementKind,
  cashMovementReason,
  cashMovements,
  cashSessionClosingAmounts,
  cashSessionClosings,
  cashSessionOpeningAmounts,
  cashSessions,
  paymentMethods,
  receipts,
  receiptTarget,
  receiptVoidReason,
  receiptVoids,
  refundTarget,
  refundVoidReason,
  refundVoids,
  refunds,
} from "./schema";

// Acceso a los medios de pago, a la caja y, desde la 21.3, a los cobros (ADR 0022, puntos 2, 8 y 10;
// brief-21.2; brief-21.3). Toda consulta filtra por organization_id en SQL. Las únicas escrituras son
// las funciones insert* y updatePaymentMethod*, y nada borra: lo vigila
// tests/guards/cash-writes.test.ts. Los privilegios de crm_app y los triggers de la 0042 y la 0043
// son las otras defensas.

type Executor = Db | DbTransaction;

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

// Una lectura de solo lectura con una única instantánea de la base, como la del horario: las
// lecturas de toda la organización de la lista de deudores ven los mismos datos aunque se cobre o se
// venda en el medio (revisión independiente de la 21.6, B-1). Las escrituras siguen en READ
// COMMITTED, detrás del bloqueo de cobros (ADR 0022, punto 4).
export function withSnapshot<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work, {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

// El bloqueo de cobros de la organización (ADR 0022, punto 4; brief-21.2, D-7), el mismo patrón del
// catálogo de etiquetas y del horario. Toda escritura de cash lo toma primero, en READ COMMITTED, y
// lee lo que decide después: así cada sentencia ve lo que confirmó la transacción que lo tenía. Se
// libera con la transacción.
export async function lockCash(
  tx: DbTransaction,
  organizationId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`cash:${organizationId}`}, 0))`,
  );
}

// drizzle-orm envuelve el error de pg; el código y la constraint quedan en la causa. La regla se lee
// por el nombre de la restricción (brief-20.4, H-5).
function uniqueViolation(error: unknown): string | null {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return source?.code === "23505" ? (source.constraint ?? null) : null;
}

// Dos sesiones abiertas: una segunda primera choca con el índice parcial, y una segunda siguiente
// de la misma sesión, con cash_sessions_previous_unique (brief-21.2, D-3). El número no es esta
// regla.
export function isSessionAlreadyOpen(error: unknown): boolean {
  const constraint = uniqueViolation(error);
  return (
    constraint === "cash_sessions_first_unique" ||
    constraint === "cash_sessions_previous_unique"
  );
}

// Una sesión cerrada dos veces (brief-21.2, D-4). Las filas por moneda se escriben antes que la
// cabecera, así que el segundo cierre choca primero en su clave primaria (revisión independiente
// de la 21.2, R-7).
export function isSessionAlreadyClosed(error: unknown): boolean {
  const constraint = uniqueViolation(error);
  return (
    constraint === "cash_session_closings_session_unique" ||
    constraint === "cash_session_closing_amounts_pkey"
  );
}

// Medios de pago (ADR 0022, punto 10; brief-21.2, D-6).

export type PaymentMethodRow = {
  id: string;
  name: string;
  isCash: boolean;
  isActive: boolean;
  createdAt: Date;
};

const paymentMethodColumns = {
  id: paymentMethods.id,
  name: paymentMethods.name,
  isCash: paymentMethods.isCash,
  isActive: paymentMethods.isActive,
  createdAt: paymentMethods.createdAt,
};

// Por nombre, sin distinguir mayúsculas, como las etiquetas: la lista inicial se crea en una sola
// transacción y sus cuatro medios comparten la hora de alta.
export async function findPaymentMethods(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<PaymentMethodRow[]> {
  return executor
    .select(paymentMethodColumns)
    .from(paymentMethods)
    .where(eq(paymentMethods.organizationId, organizationId))
    .orderBy(sql`lower(${paymentMethods.name})`, asc(paymentMethods.id));
}

export async function findPaymentMethod(
  organizationId: string,
  paymentMethodId: string,
  executor: Executor = getDb(),
): Promise<PaymentMethodRow | undefined> {
  const rows = await executor
    .select(paymentMethodColumns)
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.organizationId, organizationId),
        eq(paymentMethods.id, paymentMethodId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function countPaymentMethods(
  tx: DbTransaction,
  organizationId: string,
  { activeOnly }: { activeOnly: boolean },
): Promise<number> {
  const rows = await tx
    .select({ total: count() })
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.organizationId, organizationId),
        activeOnly ? eq(paymentMethods.isActive, true) : undefined,
      ),
    );
  return rows[0]!.total;
}

function isNameTaken(error: unknown): boolean {
  return (
    uniqueViolation(error) === "payment_methods_organization_name_lower_unique"
  );
}

// Un nombre repetido se informa sin abortar la transacción de afuera: el INSERT o el UPDATE van en
// un savepoint, como en las etiquetas.
async function inNameSavepoint<T>(
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

export async function insertPaymentMethod(
  tx: DbTransaction,
  organizationId: string,
  values: { name: string; isCash: boolean },
): Promise<string | "name_taken"> {
  return inNameSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(paymentMethods)
      .values({ organizationId, ...values })
      .returning({ id: paymentMethods.id });
    return rows[0]!.id;
  });
}

// Solo el nombre: «es efectivo» no se edita, y el trigger de la 0042 lo rechaza (D-6).
export async function updatePaymentMethodName(
  tx: DbTransaction,
  organizationId: string,
  paymentMethodId: string,
  name: string,
): Promise<void | "name_taken"> {
  return inNameSavepoint(tx, async (savepoint) => {
    await savepoint
      .update(paymentMethods)
      .set({ name })
      .where(
        and(
          eq(paymentMethods.organizationId, organizationId),
          eq(paymentMethods.id, paymentMethodId),
        ),
      );
  });
}

export async function updatePaymentMethodActive(
  tx: DbTransaction,
  organizationId: string,
  paymentMethodId: string,
  isActive: boolean,
): Promise<void> {
  await tx
    .update(paymentMethods)
    .set({ isActive })
    .where(
      and(
        eq(paymentMethods.organizationId, organizationId),
        eq(paymentMethods.id, paymentMethodId),
      ),
    );
}

// Sesiones (ADR 0022, punto 8; brief-21.2, D-1).

export type SessionRow = {
  id: string;
  number: number;
  previousSessionId: string | null;
  openedBy: string;
  openedAt: Date;
  // Del cierre, si lo tiene: abierta o cerrada se deriva de que exista.
  closedBy: string | null;
  closedAt: Date | null;
};

const sessionColumns = {
  id: cashSessions.id,
  number: cashSessions.number,
  previousSessionId: cashSessions.previousSessionId,
  openedBy: cashSessions.openedBy,
  openedAt: cashSessions.openedAt,
  closedBy: cashSessionClosings.closedBy,
  closedAt: cashSessionClosings.closedAt,
};

function sessionsWithClosing(executor: Executor) {
  return executor
    .select(sessionColumns)
    .from(cashSessions)
    .leftJoin(
      cashSessionClosings,
      and(
        eq(cashSessionClosings.organizationId, cashSessions.organizationId),
        eq(cashSessionClosings.sessionId, cashSessions.id),
      ),
    );
}

// La última sesión de la organización: la que ninguna otra tiene como anterior. Las sesiones forman
// una sola cadena, así que es una sola. Con tx, dentro de una escritura, con el bloqueo tomado.
export async function findLastSession(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<SessionRow | undefined> {
  const rows = await sessionsWithClosing(executor)
    .where(
      and(
        eq(cashSessions.organizationId, organizationId),
        sql`not exists (
          select 1 from cash_sessions n
          where n.organization_id = ${cashSessions.organizationId}
            and n.previous_session_id = ${cashSessions.id})`,
      ),
    )
    .limit(1);
  return rows[0];
}

export async function findSession(
  organizationId: string,
  sessionId: string,
  executor: Executor = getDb(),
): Promise<SessionRow | undefined> {
  const rows = await sessionsWithClosing(executor)
    .where(
      and(
        eq(cashSessions.organizationId, organizationId),
        eq(cashSessions.id, sessionId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function countSessions(
  organizationId: string,
  number: number | null,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.organizationId, organizationId),
        number !== null ? eq(cashSessions.number, number) : undefined,
      ),
    );
  return rows[0]!.total;
}

// De la más nueva a la más vieja: el número sube con cada apertura.
export async function findSessions(
  organizationId: string,
  number: number | null,
  limit: number,
  offset: number,
): Promise<SessionRow[]> {
  return sessionsWithClosing(getDb())
    .where(
      and(
        eq(cashSessions.organizationId, organizationId),
        number !== null ? eq(cashSessions.number, number) : undefined,
      ),
    )
    .orderBy(desc(cashSessions.number))
    .limit(limit)
    .offset(offset);
}

export type NewSession = {
  organizationId: string;
  number: number;
  previousSessionId: string | null;
  openedBy: string;
};

export async function insertCashSession(
  tx: DbTransaction,
  session: NewSession,
): Promise<{ id: string; number: number }> {
  const rows = await tx
    .insert(cashSessions)
    .values(session)
    .returning({ id: cashSessions.id, number: cashSessions.number });
  return rows[0]!;
}

// Montos por moneda, con la escala de la base ("1234.50").
export type CurrencyAmountRow = { currency: string; amount: string };

export async function insertOpeningAmounts(
  tx: DbTransaction,
  organizationId: string,
  sessionId: string,
  amounts: CurrencyAmountRow[],
): Promise<void> {
  await tx
    .insert(cashSessionOpeningAmounts)
    .values(amounts.map((row) => ({ ...row, organizationId, sessionId })));
}

export async function findOpeningAmounts(
  organizationId: string,
  sessionIds: string[],
  executor: Executor = getDb(),
): Promise<(CurrencyAmountRow & { sessionId: string })[]> {
  if (sessionIds.length === 0) return [];
  return executor
    .select({
      sessionId: cashSessionOpeningAmounts.sessionId,
      currency: cashSessionOpeningAmounts.currency,
      amount: cashSessionOpeningAmounts.amount,
    })
    .from(cashSessionOpeningAmounts)
    .where(
      and(
        eq(cashSessionOpeningAmounts.organizationId, organizationId),
        inArray(cashSessionOpeningAmounts.sessionId, sessionIds),
      ),
    )
    .orderBy(asc(cashSessionOpeningAmounts.currency));
}

export type ClosingAmountRow = {
  sessionId: string;
  currency: string;
  counted: string;
  expected: string;
};

// Las filas por moneda van antes que la cabecera del cierre: desde que la cabecera existe, el
// trigger de la sesión cerrada rechaza cualquier fila nueva (brief-21.2, D-1).
export async function insertClosingAmounts(
  tx: DbTransaction,
  organizationId: string,
  sessionId: string,
  amounts: Omit<ClosingAmountRow, "sessionId">[],
): Promise<void> {
  await tx
    .insert(cashSessionClosingAmounts)
    .values(amounts.map((row) => ({ ...row, organizationId, sessionId })));
}

export async function insertClosing(
  tx: DbTransaction,
  closing: { organizationId: string; sessionId: string; closedBy: string },
): Promise<{ closedAt: Date }> {
  const rows = await tx
    .insert(cashSessionClosings)
    .values(closing)
    .returning({ closedAt: cashSessionClosings.closedAt });
  return rows[0]!;
}

export async function findClosingAmounts(
  organizationId: string,
  sessionIds: string[],
): Promise<ClosingAmountRow[]> {
  if (sessionIds.length === 0) return [];
  return getDb()
    .select({
      sessionId: cashSessionClosingAmounts.sessionId,
      currency: cashSessionClosingAmounts.currency,
      counted: cashSessionClosingAmounts.counted,
      expected: cashSessionClosingAmounts.expected,
    })
    .from(cashSessionClosingAmounts)
    .where(
      and(
        eq(cashSessionClosingAmounts.organizationId, organizationId),
        inArray(cashSessionClosingAmounts.sessionId, sessionIds),
      ),
    )
    .orderBy(asc(cashSessionClosingAmounts.currency));
}

// Movimientos manuales (ADR 0022, punto 8; brief-21.2, D-2 y D-5).

export type CashMovementKind = (typeof cashMovementKind.enumValues)[number];
export type CashMovementReason = (typeof cashMovementReason.enumValues)[number];

export type MovementRow = {
  id: string;
  kind: CashMovementKind;
  currency: string;
  amount: string;
  reason: CashMovementReason;
  createdBy: string;
  createdAt: Date;
};

const movementColumns = {
  id: cashMovements.id,
  kind: cashMovements.kind,
  currency: cashMovements.currency,
  amount: cashMovements.amount,
  reason: cashMovements.reason,
  createdBy: cashMovements.createdBy,
  createdAt: cashMovements.createdAt,
};

export type NewMovement = {
  organizationId: string;
  sessionId: string;
  kind: CashMovementKind;
  currency: string;
  amount: string;
  reason: CashMovementReason;
  createdBy: string;
};

export async function insertMovement(
  tx: DbTransaction,
  movement: NewMovement,
): Promise<MovementRow> {
  const rows = await tx
    .insert(cashMovements)
    .values(movement)
    .returning(movementColumns);
  return rows[0]!;
}

export async function findMovements(
  organizationId: string,
  sessionId: string,
  executor: Executor = getDb(),
): Promise<MovementRow[]> {
  return executor
    .select(movementColumns)
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.organizationId, organizationId),
        eq(cashMovements.sessionId, sessionId),
      ),
    )
    .orderBy(asc(cashMovements.createdAt), asc(cashMovements.id));
}

// Cobros (ADR 0022, puntos 2 y 3; brief-21.3, D-1 a D-3 y D-8) y, desde la 21.4, las señas
// (brief-21.4, D-1 y D-4).

export type ReceiptTarget = (typeof receiptTarget.enumValues)[number];

export type ReceiptRow = {
  id: string;
  number: number;
  target: ReceiptTarget;
  saleId: string | null;
  orderId: string | null;
  clientId: string | null;
  paymentMethodId: string;
  sessionId: string | null;
  currency: string;
  // Con la escala de la base ("1234.50").
  amount: string;
  createdBy: string;
  createdAt: Date;
  // Su anulación, si la tiene (brief-21.5, D-8): las lecturas la muestran y no la cuentan.
  voided: VoidRef | null;
};

export type ReceiptVoidReason = (typeof receiptVoidReason.enumValues)[number];

export type VoidRef = {
  id: string;
  number: number;
  reason: string;
  // La sesión en la que impactó: la del cobro si estaba abierta (D-1).
  sessionId: string | null;
  createdBy: string;
  createdAt: Date;
};

const receiptVoidColumns = {
  id: receiptVoids.id,
  number: receiptVoids.number,
  reason: receiptVoids.reason,
  sessionId: receiptVoids.sessionId,
  createdBy: receiptVoids.createdBy,
  createdAt: receiptVoids.createdAt,
};

const receiptBaseColumns = {
  id: receipts.id,
  number: receipts.number,
  target: receipts.target,
  saleId: receipts.saleId,
  orderId: receipts.orderId,
  clientId: receipts.clientId,
  paymentMethodId: receipts.paymentMethodId,
  sessionId: receipts.sessionId,
  currency: receipts.currency,
  amount: receipts.amount,
  createdBy: receipts.createdBy,
  createdAt: receipts.createdAt,
};

const receiptColumns = { ...receiptBaseColumns, voided: receiptVoidColumns };

// Cada lectura de cobros trae su anulación: un cobro tiene a lo sumo una (receipt_voids_receipt_unique).
const receiptVoidJoin = and(
  eq(receiptVoids.organizationId, receipts.organizationId),
  eq(receiptVoids.receiptId, receipts.id),
);

// El destino y su clave: receipts_target_check rechaza cualquier otra combinación. El cobro a cuenta
// no lleva más clave que el cliente (brief-21.6, D-1).
export type NewReceipt = {
  organizationId: string;
  number: number;
  destination:
    | { target: "sale"; saleId: string }
    | { target: "order"; orderId: string }
    | { target: "account" };
  clientId: string | null;
  paymentMethodId: string;
  sessionId: string | null;
  currency: string;
  amount: string;
  createdBy: string;
};

export async function insertReceipt(
  tx: DbTransaction,
  receipt: NewReceipt,
): Promise<ReceiptRow> {
  const { destination, ...rest } = receipt;
  const rows = await tx
    .insert(receipts)
    .values({
      ...rest,
      target: destination.target,
      saleId: destination.target === "sale" ? destination.saleId : null,
      orderId: destination.target === "order" ? destination.orderId : null,
    })
    .returning(receiptBaseColumns);
  return { ...rows[0]!, voided: null };
}

// Por orden de alta: el número sube con cada cobro.
const receiptOrder = [asc(receipts.number)];

// Los cobros de un cliente, para la imputación (ADR 0022, punto 9). Con tx, dentro del cobro, con el
// bloqueo de cobros tomado.
export function findClientReceipts(
  organizationId: string,
  clientId: string,
  executor: Executor = getDb(),
): Promise<ReceiptRow[]> {
  return executor
    .select(receiptColumns)
    .from(receipts)
    .leftJoin(receiptVoids, receiptVoidJoin)
    .where(
      and(
        eq(receipts.organizationId, organizationId),
        eq(receipts.clientId, clientId),
      ),
    )
    .orderBy(...receiptOrder);
}

// Los cobros vigentes de todos los clientes de la organización, para la lista de deudores
// (brief-21.6, D-6): una consulta, agrupada en memoria por cliente, con solo lo que mira la regla.
// Traer las filas enteras con su anulación costaba más del doble con 21.000 cobros (AC-7). El cobro
// de una venta sin cliente no es de ninguna cuenta.
export type AccountsReceiptRow = Pick<
  ReceiptRow,
  "id" | "target" | "saleId" | "orderId" | "clientId" | "currency" | "amount"
> & { voided: null };

export async function findAccountsReceipts(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<AccountsReceiptRow[]> {
  const rows = await executor
    .select({
      id: receipts.id,
      target: receipts.target,
      saleId: receipts.saleId,
      orderId: receipts.orderId,
      clientId: receipts.clientId,
      currency: receipts.currency,
      amount: receipts.amount,
    })
    .from(receipts)
    .where(
      and(
        eq(receipts.organizationId, organizationId),
        isNotNull(receipts.clientId),
        sql`not exists (select 1 from ${receiptVoids}
          where ${receiptVoids.organizationId} = ${receipts.organizationId}
            and ${receiptVoids.receiptId} = ${receipts.id})`,
      ),
    );
  return rows.map((row) => ({ ...row, voided: null }));
}

export function findSaleReceipts(
  organizationId: string,
  saleId: string,
  executor: Executor = getDb(),
): Promise<ReceiptRow[]> {
  return executor
    .select(receiptColumns)
    .from(receipts)
    .leftJoin(receiptVoids, receiptVoidJoin)
    .where(
      and(
        eq(receipts.organizationId, organizationId),
        eq(receipts.saleId, saleId),
      ),
    )
    .orderBy(...receiptOrder);
}

// Las señas de un pedido (brief-21.4, D-5).
export function findOrderReceipts(
  organizationId: string,
  orderId: string,
  executor: Executor = getDb(),
): Promise<ReceiptRow[]> {
  return executor
    .select(receiptColumns)
    .from(receipts)
    .leftJoin(receiptVoids, receiptVoidJoin)
    .where(
      and(
        eq(receipts.organizationId, organizationId),
        eq(receipts.orderId, orderId),
      ),
    )
    .orderBy(...receiptOrder);
}

// Los cobros en efectivo de una sesión: los únicos con sesión.
export function findSessionReceipts(
  organizationId: string,
  sessionId: string,
  executor: Executor = getDb(),
): Promise<ReceiptRow[]> {
  return executor
    .select(receiptColumns)
    .from(receipts)
    .leftJoin(receiptVoids, receiptVoidJoin)
    .where(
      and(
        eq(receipts.organizationId, organizationId),
        eq(receipts.sessionId, sessionId),
      ),
    )
    .orderBy(...receiptOrder);
}

export async function findReceipt(
  organizationId: string,
  receiptId: string,
  executor: Executor = getDb(),
): Promise<ReceiptRow | undefined> {
  const rows = await executor
    .select(receiptColumns)
    .from(receipts)
    .leftJoin(receiptVoids, receiptVoidJoin)
    .where(
      and(
        eq(receipts.organizationId, organizationId),
        eq(receipts.id, receiptId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function countReceipts(
  organizationId: string,
  number: number | null,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(receipts)
    .where(
      and(
        eq(receipts.organizationId, organizationId),
        number !== null ? eq(receipts.number, number) : undefined,
      ),
    );
  return rows[0]!.total;
}

// Del más nuevo al más viejo (brief-21.3, D-8).
export function findReceipts(
  organizationId: string,
  number: number | null,
  limit: number,
  offset: number,
): Promise<ReceiptRow[]> {
  return getDb()
    .select(receiptColumns)
    .from(receipts)
    .leftJoin(receiptVoids, receiptVoidJoin)
    .where(
      and(
        eq(receipts.organizationId, organizationId),
        number !== null ? eq(receipts.number, number) : undefined,
      ),
    )
    .orderBy(desc(receipts.number))
    .limit(limit)
    .offset(offset);
}

// La anulación de un cobro, la devolución y su anulación (ADR 0022, punto 7; brief-21.5, D-1 a D-3).

export type NewVoid = {
  organizationId: string;
  number: number;
  // El cobro o la devolución que anula.
  sourceId: string;
  currency: string;
  amount: string;
  reason: string;
  // La sesión abierta del original en efectivo, o ninguna: receipt_voids_check_copy() y
  // refund_voids_check_copy() rechazan cualquier otra (D-1).
  sessionId: string | null;
  createdBy: string;
};

export async function insertReceiptVoid(
  tx: DbTransaction,
  row: NewVoid,
): Promise<{ id: string; number: number }> {
  const rows = await tx
    .insert(receiptVoids)
    .values({
      organizationId: row.organizationId,
      number: row.number,
      receiptId: row.sourceId,
      currency: row.currency,
      amount: row.amount,
      reason: row.reason as ReceiptVoidReason,
      sessionId: row.sessionId,
      createdBy: row.createdBy,
    })
    .returning({ id: receiptVoids.id, number: receiptVoids.number });
  return rows[0]!;
}

export type RefundTarget = (typeof refundTarget.enumValues)[number];
export type RefundVoidReason = (typeof refundVoidReason.enumValues)[number];

export type RefundRow = {
  id: string;
  number: number;
  target: RefundTarget;
  clientId: string | null;
  saleId: string | null;
  paymentMethodId: string;
  sessionId: string | null;
  currency: string;
  amount: string;
  createdBy: string;
  createdAt: Date;
  voided: VoidRef | null;
};

const refundBaseColumns = {
  id: refunds.id,
  number: refunds.number,
  target: refunds.target,
  clientId: refunds.clientId,
  saleId: refunds.saleId,
  paymentMethodId: refunds.paymentMethodId,
  sessionId: refunds.sessionId,
  currency: refunds.currency,
  amount: refunds.amount,
  createdBy: refunds.createdBy,
  createdAt: refunds.createdAt,
};

const refundColumns = {
  ...refundBaseColumns,
  voided: {
    id: refundVoids.id,
    number: refundVoids.number,
    reason: refundVoids.reason,
    sessionId: refundVoids.sessionId,
    createdBy: refundVoids.createdBy,
    createdAt: refundVoids.createdAt,
  },
};

const refundVoidJoin = and(
  eq(refundVoids.organizationId, refunds.organizationId),
  eq(refundVoids.refundId, refunds.id),
);

// El destino y su clave: refunds_target_check rechaza cualquier otra combinación (D-2).
export type NewRefund = {
  organizationId: string;
  number: number;
  destination:
    | { target: "account"; clientId: string }
    | { target: "sale"; saleId: string };
  paymentMethodId: string;
  sessionId: string | null;
  currency: string;
  amount: string;
  createdBy: string;
};

export async function insertRefund(
  tx: DbTransaction,
  refund: NewRefund,
): Promise<RefundRow> {
  const { destination, ...rest } = refund;
  const rows = await tx
    .insert(refunds)
    .values({
      ...rest,
      target: destination.target,
      clientId: destination.target === "account" ? destination.clientId : null,
      saleId: destination.target === "sale" ? destination.saleId : null,
    })
    .returning(refundBaseColumns);
  return { ...rows[0]!, voided: null };
}

export async function insertRefundVoid(
  tx: DbTransaction,
  row: NewVoid,
): Promise<{ id: string; number: number }> {
  const rows = await tx
    .insert(refundVoids)
    .values({
      organizationId: row.organizationId,
      number: row.number,
      refundId: row.sourceId,
      currency: row.currency,
      amount: row.amount,
      reason: row.reason as RefundVoidReason,
      sessionId: row.sessionId,
      createdBy: row.createdBy,
    })
    .returning({ id: refundVoids.id, number: refundVoids.number });
  return rows[0]!;
}

function selectRefunds(executor: Executor) {
  return executor
    .select(refundColumns)
    .from(refunds)
    .leftJoin(refundVoids, refundVoidJoin);
}

// Las devoluciones de la cuenta de un cliente, para la imputación (ADR 0022, punto 9).
export function findClientRefunds(
  organizationId: string,
  clientId: string,
  executor: Executor = getDb(),
): Promise<RefundRow[]> {
  return selectRefunds(executor)
    .where(
      and(
        eq(refunds.organizationId, organizationId),
        eq(refunds.clientId, clientId),
      ),
    )
    .orderBy(asc(refunds.number));
}

// Las devoluciones desde la cuenta de todos los clientes, para la lista de deudores (brief-21.6, D-6).
export function findAccountsRefunds(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<RefundRow[]> {
  return selectRefunds(executor)
    .where(
      and(
        eq(refunds.organizationId, organizationId),
        isNotNull(refunds.clientId),
      ),
    )
    .orderBy(asc(refunds.number));
}

// Las devoluciones de una venta sin cliente anulada (punto 6).
export function findSaleRefunds(
  organizationId: string,
  saleId: string,
  executor: Executor = getDb(),
): Promise<RefundRow[]> {
  return selectRefunds(executor)
    .where(
      and(
        eq(refunds.organizationId, organizationId),
        eq(refunds.saleId, saleId),
      ),
    )
    .orderBy(asc(refunds.number));
}

// Las devoluciones en efectivo de una sesión: las únicas con sesión.
export function findSessionRefunds(
  organizationId: string,
  sessionId: string,
  executor: Executor = getDb(),
): Promise<RefundRow[]> {
  return selectRefunds(executor)
    .where(
      and(
        eq(refunds.organizationId, organizationId),
        eq(refunds.sessionId, sessionId),
      ),
    )
    .orderBy(asc(refunds.number));
}

export async function findRefund(
  organizationId: string,
  refundId: string,
  executor: Executor = getDb(),
): Promise<RefundRow | undefined> {
  const rows = await selectRefunds(executor)
    .where(
      and(eq(refunds.organizationId, organizationId), eq(refunds.id, refundId)),
    )
    .limit(1);
  return rows[0];
}

export async function countRefunds(
  organizationId: string,
  number: number | null,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(refunds)
    .where(
      and(
        eq(refunds.organizationId, organizationId),
        number !== null ? eq(refunds.number, number) : undefined,
      ),
    );
  return rows[0]!.total;
}

// Del más nuevo al más viejo, como los cobros.
export function findRefunds(
  organizationId: string,
  number: number | null,
  limit: number,
  offset: number,
): Promise<RefundRow[]> {
  return selectRefunds(getDb())
    .where(
      and(
        eq(refunds.organizationId, organizationId),
        number !== null ? eq(refunds.number, number) : undefined,
      ),
    )
    .orderBy(desc(refunds.number))
    .limit(limit)
    .offset(offset);
}

// Lo anulado mientras la sesión estaba abierta (D-6): las anulaciones que impactaron en ella. Lo
// anulado después del cierre tiene la sesión nula y no aparece acá.
export function findSessionReceiptVoids(
  organizationId: string,
  sessionId: string,
  executor: Executor = getDb(),
): Promise<CurrencyAmountRow[]> {
  return executor
    .select({ currency: receiptVoids.currency, amount: receiptVoids.amount })
    .from(receiptVoids)
    .where(
      and(
        eq(receiptVoids.organizationId, organizationId),
        eq(receiptVoids.sessionId, sessionId),
      ),
    );
}

export function findSessionRefundVoids(
  organizationId: string,
  sessionId: string,
  executor: Executor = getDb(),
): Promise<CurrencyAmountRow[]> {
  return executor
    .select({ currency: refundVoids.currency, amount: refundVoids.amount })
    .from(refundVoids)
    .where(
      and(
        eq(refundVoids.organizationId, organizationId),
        eq(refundVoids.sessionId, sessionId),
      ),
    );
}

// Las anulaciones posteriores al cierre de una sesión (ADR 0022, punto 7; D-6): las de sus cobros y
// sus devoluciones en efectivo que no impactaron en ella. Explican su diferencia; el arqueo guardado
// no cambia.
export type LateVoidRow = {
  kind: "receipt" | "refund";
  number: number;
  sourceId: string;
  sourceNumber: number;
  currency: string;
  amount: string;
  reason: string;
  createdAt: Date;
};

export async function findLateVoids(
  organizationId: string,
  sessionId: string,
): Promise<LateVoidRow[]> {
  const [receiptRows, refundRows] = await Promise.all([
    getDb()
      .select({
        number: receiptVoids.number,
        sourceId: receipts.id,
        sourceNumber: receipts.number,
        currency: receiptVoids.currency,
        amount: receiptVoids.amount,
        reason: receiptVoids.reason,
        createdAt: receiptVoids.createdAt,
      })
      .from(receiptVoids)
      .innerJoin(receipts, receiptVoidJoin)
      .where(
        and(
          eq(receipts.organizationId, organizationId),
          eq(receipts.sessionId, sessionId),
          sql`${receiptVoids.sessionId} is null`,
        ),
      ),
    getDb()
      .select({
        number: refundVoids.number,
        sourceId: refunds.id,
        sourceNumber: refunds.number,
        currency: refundVoids.currency,
        amount: refundVoids.amount,
        reason: refundVoids.reason,
        createdAt: refundVoids.createdAt,
      })
      .from(refundVoids)
      .innerJoin(refunds, refundVoidJoin)
      .where(
        and(
          eq(refunds.organizationId, organizationId),
          eq(refunds.sessionId, sessionId),
          sql`${refundVoids.sessionId} is null`,
        ),
      ),
  ]);
  return [
    ...receiptRows.map((row) => ({ kind: "receipt" as const, ...row })),
    ...refundRows.map((row) => ({ kind: "refund" as const, ...row })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
