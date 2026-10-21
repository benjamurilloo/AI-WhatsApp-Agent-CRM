import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  tenderValues,
  type CurrencyAmountRow,
  type ReceiptTender,
  type VoidRef,
} from "./repository";
import {
  tradeInPaymentVoidReason,
  tradeInPaymentVoids,
  tradeInPayments,
} from "./schema";

// Acceso a trade_in_payments y trade_in_payment_voids (ADR 0024, punto 8; brief-29.7.2, D-3), con el
// molde de supplier-payment-repository.ts. Toda consulta filtra por organization_id en SQL, también las
// lecturas por id. Las únicas escrituras son insertTradeInPayment e insertTradeInPaymentVoid, y nada
// cambia ni borra: lo vigila tests/guards/cash-writes.test.ts. Los privilegios de crm_app y los triggers
// de la 0061 son las otras defensas.

type Executor = Db | DbTransaction;

export type TradeInPaymentVoidReason =
  (typeof tradeInPaymentVoidReason.enumValues)[number];

export type TradeInPaymentRow = {
  id: string;
  number: number;
  tradeInId: string;
  paymentMethodId: string;
  sessionId: string | null;
  currency: string;
  // Con la escala de la base ("1234.50").
  amount: string;
  // Lo que salió en otra moneda, si la hubo, como en el pago a un proveedor.
  tenderedCurrency: string | null;
  tenderedAmount: string | null;
  exchangeRate: string | null;
  exchangeRateId: string | null;
  createdBy: string;
  createdAt: Date;
  // Su anulación, si la tiene: las lecturas la muestran y no la cuentan.
  voided: VoidRef | null;
};

const voidColumns = {
  id: tradeInPaymentVoids.id,
  number: tradeInPaymentVoids.number,
  reason: tradeInPaymentVoids.reason,
  sessionId: tradeInPaymentVoids.sessionId,
  createdBy: tradeInPaymentVoids.createdBy,
  createdAt: tradeInPaymentVoids.createdAt,
};

const baseColumns = {
  id: tradeInPayments.id,
  number: tradeInPayments.number,
  tradeInId: tradeInPayments.tradeInId,
  paymentMethodId: tradeInPayments.paymentMethodId,
  sessionId: tradeInPayments.sessionId,
  currency: tradeInPayments.currency,
  amount: tradeInPayments.amount,
  tenderedCurrency: tradeInPayments.tenderedCurrency,
  tenderedAmount: tradeInPayments.tenderedAmount,
  exchangeRate: tradeInPayments.exchangeRate,
  exchangeRateId: tradeInPayments.exchangeRateId,
  createdBy: tradeInPayments.createdBy,
  createdAt: tradeInPayments.createdAt,
};

const columns = { ...baseColumns, voided: voidColumns };

// Un pago tiene a lo sumo una anulación (trade_in_payment_voids_trade_in_payment_unique).
const voidJoin = and(
  eq(tradeInPaymentVoids.organizationId, tradeInPayments.organizationId),
  eq(tradeInPaymentVoids.tradeInPaymentId, tradeInPayments.id),
);

function select(executor: Executor) {
  return executor
    .select(columns)
    .from(tradeInPayments)
    .leftJoin(tradeInPaymentVoids, voidJoin);
}

export type NewTradeInPayment = {
  organizationId: string;
  number: number;
  tradeInId: string;
  paymentMethodId: string;
  sessionId: string | null;
  currency: string;
  amount: string;
  // Lo que salió en otra moneda, o null.
  tender: ReceiptTender | null;
  createdBy: string;
};

export async function insertTradeInPayment(
  tx: DbTransaction,
  payment: NewTradeInPayment,
): Promise<TradeInPaymentRow> {
  const { tender, ...rest } = payment;
  const rows = await tx
    .insert(tradeInPayments)
    .values({ ...rest, ...tenderValues(tender) })
    .returning(baseColumns);
  return { ...rows[0]!, voided: null };
}

export type NewTradeInPaymentVoid = {
  organizationId: string;
  number: number;
  tradeInPaymentId: string;
  currency: string;
  amount: string;
  reason: TradeInPaymentVoidReason;
  // La sesión abierta del pago en efectivo, o ninguna: trade_in_payment_voids_check_copy() rechaza
  // cualquier otra.
  sessionId: string | null;
  // Lo que salió en otra moneda, copiado del pago: también lo compara el trigger.
  tender: ReceiptTender | null;
  createdBy: string;
};

export async function insertTradeInPaymentVoid(
  tx: DbTransaction,
  row: NewTradeInPaymentVoid,
): Promise<{ id: string; number: number }> {
  const { tender, ...rest } = row;
  const rows = await tx
    .insert(tradeInPaymentVoids)
    .values({ ...rest, ...tenderValues(tender) })
    .returning({
      id: tradeInPaymentVoids.id,
      number: tradeInPaymentVoids.number,
    });
  return rows[0]!;
}

// Una anulación doble que llegó hasta la base: solo esta restricción, por su nombre.
export function isTradeInPaymentAlreadyVoided(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "trade_in_payment_voids_trade_in_payment_unique"
  );
}

export async function findTradeInPayment(
  organizationId: string,
  paymentId: string,
  executor: Executor = getDb(),
): Promise<TradeInPaymentRow | undefined> {
  const rows = await select(executor)
    .where(
      and(
        eq(tradeInPayments.organizationId, organizationId),
        eq(tradeInPayments.id, paymentId),
      ),
    )
    .limit(1);
  return rows[0];
}

// Los pagos de un usado, anulados incluidos (D-3 y D-4): lo pagado suma los vigentes. Con tx, dentro del
// pago o de la anulación del usado, con el bloqueo de cobros tomado.
export function findTradeInPayments(
  organizationId: string,
  tradeInId: string,
  executor: Executor = getDb(),
): Promise<TradeInPaymentRow[]> {
  return select(executor)
    .where(
      and(
        eq(tradeInPayments.organizationId, organizationId),
        eq(tradeInPayments.tradeInId, tradeInId),
      ),
    )
    .orderBy(tradeInPayments.number);
}

// Lo pagado vigente de cada usado con al menos un pago vigente, para el filtro «Falta pagar» (D-6): una
// fila por usado, nunca más que los usados pagados.
export async function findPaidTradeIns(
  organizationId: string,
  executor: Executor,
): Promise<{ tradeInId: string; paid: string }[]> {
  return executor
    .select({
      tradeInId: tradeInPayments.tradeInId,
      paid: sql<string>`sum(${tradeInPayments.amount})::text`,
    })
    .from(tradeInPayments)
    .leftJoin(tradeInPaymentVoids, voidJoin)
    .where(
      and(
        eq(tradeInPayments.organizationId, organizationId),
        isNull(tradeInPaymentVoids.id),
      ),
    )
    .groupBy(tradeInPayments.tradeInId);
}

// Los pagos en efectivo de una sesión: los únicos con sesión. Anulados incluidos: lo esperado los resta
// todos y suma aparte las anulaciones que impactaron en ella.
export function findSessionTradeInPayments(
  organizationId: string,
  sessionId: string,
  executor: Executor = getDb(),
): Promise<TradeInPaymentRow[]> {
  return select(executor)
    .where(
      and(
        eq(tradeInPayments.organizationId, organizationId),
        eq(tradeInPayments.sessionId, sessionId),
      ),
    )
    .orderBy(tradeInPayments.number);
}

// Lo anulado mientras la sesión estaba abierta: las anulaciones que impactaron en ella, con lo que vuelve
// a la caja, que es lo que salió si fue en otra moneda.
export function findSessionTradeInPaymentVoids(
  organizationId: string,
  sessionId: string,
  executor: Executor = getDb(),
): Promise<CurrencyAmountRow[]> {
  return executor
    .select({
      currency: sql<string>`coalesce(${tradeInPaymentVoids.tenderedCurrency}, ${tradeInPaymentVoids.currency})`,
      amount: sql<string>`coalesce(${tradeInPaymentVoids.tenderedAmount}, ${tradeInPaymentVoids.amount})`,
    })
    .from(tradeInPaymentVoids)
    .where(
      and(
        eq(tradeInPaymentVoids.organizationId, organizationId),
        eq(tradeInPaymentVoids.sessionId, sessionId),
      ),
    );
}

// Las anulaciones posteriores al cierre de una sesión de sus pagos en efectivo: solo las lee un admin.
export type LateTradeInPaymentVoidRow = {
  number: number;
  sourceId: string;
  sourceNumber: number;
  currency: string;
  amount: string;
  reason: TradeInPaymentVoidReason;
  createdAt: Date;
};

export function findLateTradeInPaymentVoids(
  organizationId: string,
  sessionId: string,
): Promise<LateTradeInPaymentVoidRow[]> {
  return getDb()
    .select({
      number: tradeInPaymentVoids.number,
      sourceId: tradeInPayments.id,
      sourceNumber: tradeInPayments.number,
      currency: sql<string>`coalesce(${tradeInPaymentVoids.tenderedCurrency}, ${tradeInPaymentVoids.currency})`,
      amount: sql<string>`coalesce(${tradeInPaymentVoids.tenderedAmount}, ${tradeInPaymentVoids.amount})`,
      reason: tradeInPaymentVoids.reason,
      createdAt: tradeInPaymentVoids.createdAt,
    })
    .from(tradeInPaymentVoids)
    .innerJoin(tradeInPayments, voidJoin)
    .where(
      and(
        eq(tradeInPayments.organizationId, organizationId),
        eq(tradeInPayments.sessionId, sessionId),
        sql`${tradeInPaymentVoids.sessionId} is null`,
      ),
    )
    .orderBy(tradeInPaymentVoids.createdAt);
}
