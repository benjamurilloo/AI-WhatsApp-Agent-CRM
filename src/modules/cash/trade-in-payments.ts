import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import { getExchangeSetup } from "@/modules/fx";
import { nextDocumentNumber } from "@/modules/numbering";
import type { AuthContext } from "@/modules/organizations";
import {
  getTradeInForPayment,
  getTradeInsForPayment,
  listTradeIns,
  requireTradeIns,
  type TradeInDestination,
  type TradeInListFilters,
  type TradeInPage,
} from "@/modules/tradeins";
import { failure, type Failure } from "@/shared/errors";
import { moneyFromDatabase, moneyToDatabase, type Money } from "@/shared/money";
import * as repository from "./repository";
import {
  amountForInput,
  exchangeOffer,
  impactedSession,
  memberNames,
  outgoingShortfall,
  readPayment,
  readReceiptFields,
  receiptListItems,
  returnExceedsLimit,
  ruleFailure,
  selectableMethods,
  sessionRef,
  type ExchangeOffer,
  type InsufficientCash,
  type PaymentMethod,
  type ReceiptField,
  type ReceiptListItem,
  type ReceiptPaymentFailure,
  type SessionRef,
} from "./service";
import {
  copiedTender,
  fitToOutstanding,
  tenderAudit,
  tenderColumns,
  type TenderInput,
} from "./tender";
import * as tradeInPaymentRepository from "./trade-in-payment-repository";
import {
  formatTradeInPaymentNumber,
  formatTradeInPaymentVoidNumber,
  tradeInPaymentListItems,
  type DocumentRef,
  type TradeInPaymentListItem,
  type TradeInPaymentVoidReason,
} from "./trade-in-payment-views";

// La compra de usados (ADR 0024, punto 8; brief-29.7.2, D-3 a D-6): el pago de un usado recibido con
// destino purchase, PPU, y su anulación, APPU, con el molde del pago a un proveedor (supplier-payments.ts).
// Viven en cash: el pago en efectivo sale de la sesión de caja. Solo un admin los lee y los escribe, y
// solo con la capacidad trade_ins (ADR 0022, punto 12). cash abre la transacción, toma primero el bloqueo
// de cobros y lee el usado por tradeins, sin bloquearlo: crm_app no tiene UPDATE en trade_ins, y todo lo
// que cambia lo pagado o anula el usado toma el mismo bloqueo (H-8).
//
// También las lecturas del usado que son de cash: sus cobros con «Permuta» o sus pagos, con lo disponible
// o lo que falta pagar (D-6), y el filtro «Falta pagar» de la lista de usados.

const idSchema = z.uuid();

export const TRADE_IN_PAYMENT_VOID_REASONS: readonly tradeInPaymentRepository.TradeInPaymentVoidReason[] =
  ["not_paid", "wrong_method", "wrong_amount", "wrong_target", "other"];

export type { TradeInPaymentListItem, TradeInPaymentVoidReason };
export {
  formatTradeInPaymentNumber,
  formatTradeInPaymentVoidNumber,
  tradeInPaymentListItems,
};

export type TradeInPaymentRef = DocumentRef & { number: number };

function paymentRef(row: { id: string; number: number }): TradeInPaymentRef {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatTradeInPaymentNumber(row.number),
  };
}

function voidRef(row: { id: string; number: number }): TradeInPaymentRef {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatTradeInPaymentVoidNumber(row.number),
  };
}

// Lo pagado de un usado: la suma de sus pagos vigentes. Con tx y el bloqueo de cobros tomado, en el pago.
function paidOf(rows: tradeInPaymentRepository.TradeInPaymentRow[]): Money {
  return rows
    .filter((row) => row.voided === null)
    .reduce((sum, row) => sum + moneyFromDatabase(row.amount), 0n);
}

// El pago (D-3).

export type TradeInPaymentField = ReceiptField;

type ExceedsOutstanding = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "exceeds_outstanding"; currency: string; outstanding: string }
>;

export type CreateTradeInPaymentResult =
  | { ok: true; payment: TradeInPaymentRef }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "VALIDATION_ERROR",
      { fields: TradeInPaymentField[]; amount?: string }
    >
  | Failure<"NOT_FOUND", { entity: "trade_in" }>
  | ReceiptPaymentFailure
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "trade_in_voided" | "trade_in_not_purchase" }
    >
  | ExceedsOutstanding
  | InsufficientCash;

// El pago de un usado, solo de admin y con la capacidad, en READ COMMITTED (D-3):
//
// 1. el bloqueo de cobros de la organización;
// 2. el usado, por tradeins, sin bloquearlo: vigente y con destino purchase. El cliente no se toma: el
//    pago no lo referencia;
// 3. el medio activo y no de sistema, la sesión abierta si es efectivo, y lo que sale en la otra moneda
//    con la regla del ADR 0025, punto 5 (readPayment); que no supere lo que falta pagar, con la
//    tolerancia de un centavo si salió convertido; y en efectivo, que lo esperado alcance;
// 4. al final, el contador, el pago y la auditoría.
export async function createTradeInPayment(
  context: AuthContext,
  input: {
    tradeInId: string;
    paymentMethodId: string;
    amount: string;
  } & TenderInput,
): Promise<CreateTradeInPaymentResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(input.tradeInId).success) {
    return failure("VALIDATION_ERROR");
  }
  const fields = readReceiptFields(input);
  if (!fields.ok) return fields;
  const { organizationId, userId } = context;
  const tradeInId = input.tradeInId.toLowerCase();

  return repository.withTransaction(
    async (tx): Promise<CreateTradeInPaymentResult> => {
      await repository.lockCash(tx, organizationId);
      const tradeIn = await getTradeInForPayment(tx, organizationId, tradeInId);
      if (!tradeIn) return { ok: false, code: "NOT_FOUND", entity: "trade_in" };
      if (tradeIn.voided) return ruleFailure("trade_in_voided");
      if (tradeIn.destination !== "purchase") {
        return ruleFailure("trade_in_not_purchase");
      }
      const currency = tradeIn.currency;
      const read = await readPayment(
        tx,
        organizationId,
        fields,
        currency,
        input,
      );
      if (!read.ok) return read;
      const paid = paidOf(
        await tradeInPaymentRepository.findTradeInPayments(
          organizationId,
          tradeIn.id,
          tx,
        ),
      );
      const outstanding = moneyFromDatabase(tradeIn.value) - paid;
      const fit = fitToOutstanding(
        read.payment.amount,
        outstanding,
        currency,
        read.payment.tender !== null,
      );
      if (!fit.ok) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "exceeds_outstanding",
          currency,
          outstanding: moneyToDatabase(outstanding > 0n ? outstanding : 0n),
        };
      }
      const payment = { ...read.payment, amount: fit.applied };
      // Sale de la caja lo que salió: en la otra moneda, si fue en ella.
      const short = await outgoingShortfall(
        tx,
        organizationId,
        payment,
        currency,
      );
      if (short) return short;

      const number = await nextDocumentNumber(
        tx,
        organizationId,
        "trade_in_payment",
      );
      const row = await tradeInPaymentRepository.insertTradeInPayment(tx, {
        organizationId,
        number,
        tradeInId: tradeIn.id,
        paymentMethodId: payment.method.id,
        sessionId: payment.session?.id ?? null,
        currency,
        amount: moneyToDatabase(payment.amount),
        tender: tenderColumns(payment.tender),
        createdBy: userId,
      });
      // Claves planas, sin datos del cliente: el usado, por su número.
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "trade_in_payment",
        entityId: row.id,
        action: "create",
        diff: {
          before: null,
          after: {
            number: row.number,
            trade_in_number: tradeIn.number,
            payment_method: payment.method.name,
            currency: row.currency,
            amount: row.amount,
            ...tenderAudit(row),
            ...(payment.session === null
              ? {}
              : { session_number: payment.session.number }),
          },
        },
      });
      return { ok: true, payment: paymentRef(row) };
    },
  );
}

// La anulación (D-3).

type AlreadyVoided = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "already_voided"; void: TradeInPaymentRef }
>;

export type VoidTradeInPaymentResult =
  | {
      ok: true;
      payment: TradeInPaymentRef;
      paymentVoid: TradeInPaymentRef;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: "reason"[] }>
  | Failure<"VALIDATION_ERROR", { fields: "amount"[]; amount: "limit" }>
  | Failure<"NOT_FOUND", { entity: "trade_in_payment" }>
  | AlreadyVoided;

function alreadyVoided(row: { id: string; number: number }): AlreadyVoided {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "already_voided",
    void: voidRef(row),
  };
}

// La anulación de un pago, solo de admin, en READ COMMITTED, como la de un pago a un proveedor:
//
// 1. el bloqueo de cobros de la organización;
// 2. el pago y su anulación, si la tiene, leídos con el bloqueo tomado;
// 3. la sesión en la que impacta: la del pago si sigue abierta, o ninguna. Con sesión, lo esperado más
//    lo que vuelve tiene que caber en numeric(14, 2);
// 4. al final, el contador, la anulación y la auditoría.
//
// Anular un pago solo agranda lo que falta pagar del usado: no hay otra comprobación.
export async function voidTradeInPayment(
  context: AuthContext,
  input: { paymentId: string; reason: string },
): Promise<VoidTradeInPaymentResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(input.paymentId).success) {
    return failure("VALIDATION_ERROR");
  }
  const reason = TRADE_IN_PAYMENT_VOID_REASONS.find(
    (value) => value === input.reason,
  );
  if (!reason) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["reason"] };
  }
  const { organizationId, userId } = context;
  const paymentId = input.paymentId.toLowerCase();

  try {
    return await repository.withTransaction(
      async (tx): Promise<VoidTradeInPaymentResult> => {
        await repository.lockCash(tx, organizationId);
        const payment = await tradeInPaymentRepository.findTradeInPayment(
          organizationId,
          paymentId,
          tx,
        );
        if (!payment) {
          return { ok: false, code: "NOT_FOUND", entity: "trade_in_payment" };
        }
        if (payment.voided) return alreadyVoided(payment.voided);
        const session = await impactedSession(
          tx,
          organizationId,
          payment.sessionId,
        );
        if (
          session &&
          (await returnExceedsLimit(tx, organizationId, session.id, payment))
        ) {
          return {
            ok: false,
            code: "VALIDATION_ERROR",
            fields: ["amount"],
            amount: "limit",
          };
        }

        const number = await nextDocumentNumber(
          tx,
          organizationId,
          "trade_in_payment_void",
        );
        const row = await tradeInPaymentRepository.insertTradeInPaymentVoid(
          tx,
          {
            organizationId,
            number,
            tradeInPaymentId: payment.id,
            // La copia del pago, con lo que salió.
            currency: payment.currency,
            amount: payment.amount,
            tender: copiedTender(payment),
            reason,
            sessionId: session?.id ?? null,
            createdBy: userId,
          },
        );
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "trade_in_payment",
          entityId: payment.id,
          action: "void",
          diff: {
            // before lleva los mismos campos que after (recordAudit).
            before: {
              void_number: null,
              reason: null,
              ...(session ? { session_number: null } : {}),
            },
            after: {
              void_number: row.number,
              reason,
              ...(session ? { session_number: session.number } : {}),
            },
          },
        });
        return {
          ok: true,
          payment: paymentRef(payment),
          paymentVoid: voidRef(row),
        };
      },
    );
  } catch (error) {
    // La última defensa: una anulación doble que llegó hasta la base.
    if (!tradeInPaymentRepository.isTradeInPaymentAlreadyVoided(error)) {
      throw error;
    }
    const payment = await tradeInPaymentRepository.findTradeInPayment(
      organizationId,
      paymentId,
    );
    if (!payment?.voided) throw error;
    return alreadyVoided(payment.voided);
  }
}

// Las lecturas, solo de admin y con la capacidad (D-6 y D-8).

export type TradeInPaymentDetail = TradeInPaymentListItem & {
  // El cliente del usado, para el comprobante: su nombre lo lee la página de su ficha (U-5 de la 29.7).
  clientId: string | null;
  createdByName: string | null;
  session: (SessionRef & { open: boolean }) | null;
  voidedByName: string | null;
  voidSession: SessionRef | null;
};

export async function getTradeInPayment(
  context: AuthContext,
  paymentId: string,
): Promise<
  | { ok: true; payment: TradeInPaymentDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(paymentId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const row = await tradeInPaymentRepository.findTradeInPayment(
    organizationId,
    paymentId.toLowerCase(),
  );
  if (!row) return failure("NOT_FOUND");
  const sessionIds = [row.sessionId, row.voided?.sessionId ?? null];
  const [items, names, sessions, tradeIn] = await Promise.all([
    tradeInPaymentListItems(organizationId, [row]),
    memberNames(organizationId, [row.createdBy, row.voided?.createdBy ?? null]),
    Promise.all(
      sessionIds.map((id) =>
        id === null
          ? Promise.resolve(undefined)
          : repository.findSession(organizationId, id),
      ),
    ),
    repository.withTransaction((tx) =>
      getTradeInForPayment(tx, organizationId, row.tradeInId),
    ),
  ]);
  const [session, voidSession] = sessions;
  return {
    ok: true,
    payment: {
      ...items[0]!,
      clientId: tradeIn?.clientId ?? null,
      createdByName: names.get(row.createdBy) ?? null,
      session: session
        ? { ...sessionRef(session), open: session.closedAt === null }
        : null,
      voidedByName: row.voided
        ? (names.get(row.voided.createdBy) ?? null)
        : null,
      voidSession: voidSession ? sessionRef(voidSession) : null,
    },
  };
}

// Lo que el usado hizo con su valor, para su detalle (D-6): con la permuta, los cobros que lo usan y lo
// disponible; con la compra, los pagos y lo que falta. Solo un admin: lleva el valor.
export type TradeInMoney =
  | {
      destination: "sale_credit";
      currency: string;
      value: string;
      used: string;
      available: string;
      receipts: ReceiptListItem[];
    }
  | {
      destination: "purchase";
      currency: string;
      value: string;
      paid: string;
      outstanding: string;
      payments: TradeInPaymentListItem[];
    };

export async function getTradeInMoney(
  context: AuthContext,
  tradeInId: string,
): Promise<
  | { ok: true; money: TradeInMoney }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(tradeInId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  // Una sola foto: el usado, sus cobros y sus pagos.
  const found = await repository.withSnapshot(async (tx) => {
    const tradeIn = await getTradeInForPayment(
      tx,
      organizationId,
      tradeInId.toLowerCase(),
    );
    if (!tradeIn) return null;
    return {
      tradeIn,
      receipts: await repository.findTradeInReceipts(
        organizationId,
        tradeIn.id,
        tx,
      ),
      payments: await tradeInPaymentRepository.findTradeInPayments(
        organizationId,
        tradeIn.id,
        tx,
      ),
    };
  });
  if (!found) return failure("NOT_FOUND");
  const { tradeIn, receipts, payments } = found;
  const value = moneyFromDatabase(tradeIn.value);
  if (tradeIn.destination === "sale_credit") {
    const used = receipts
      .filter((row) => row.voided === null)
      .reduce((sum, row) => sum + moneyFromDatabase(row.amount), 0n);
    return {
      ok: true,
      money: {
        destination: "sale_credit",
        currency: tradeIn.currency,
        value: tradeIn.value,
        used: moneyToDatabase(used),
        available: moneyToDatabase(value - used),
        receipts: await receiptListItems(organizationId, receipts),
      },
    };
  }
  const paid = paidOf(payments);
  return {
    ok: true,
    money: {
      destination: "purchase",
      currency: tradeIn.currency,
      value: tradeIn.value,
      paid: moneyToDatabase(paid),
      outstanding: moneyToDatabase(value - paid),
      payments: await tradeInPaymentListItems(organizationId, payments),
    },
  };
}

// El formulario del pago (D-6): el usado, lo que falta, los medios elegibles, la sesión abierta y pagar
// en la otra moneda.
export type TradeInPaymentForm = {
  tradeIn: DocumentRef & {
    clientId: string;
    currency: string;
    value: string;
    destination: TradeInDestination;
    voided: boolean;
  };
  paid: string;
  outstanding: string;
  outstandingInput: string;
  paymentMethods: PaymentMethod[];
  openSession: SessionRef | null;
  exchange: ExchangeOffer | null;
};

export async function getTradeInPaymentForm(
  context: AuthContext,
  tradeInId: string,
): Promise<
  | { ok: true; form: TradeInPaymentForm }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(tradeInId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const found = await repository.withSnapshot(async (tx) => {
    const tradeIn = await getTradeInForPayment(
      tx,
      organizationId,
      tradeInId.toLowerCase(),
    );
    if (!tradeIn) return null;
    const payments = await tradeInPaymentRepository.findTradeInPayments(
      organizationId,
      tradeIn.id,
      tx,
    );
    return { tradeIn, paid: paidOf(payments) };
  });
  if (!found) return failure("NOT_FOUND");
  const { tradeIn, paid } = found;
  const outstanding = moneyFromDatabase(tradeIn.value) - paid;
  const [methods, last, setup] = await Promise.all([
    repository.findPaymentMethods(organizationId),
    repository.findLastSession(organizationId),
    getExchangeSetup(organizationId),
  ]);
  return {
    ok: true,
    form: {
      tradeIn: {
        id: tradeIn.id,
        displayNumber: tradeIn.displayNumber,
        clientId: tradeIn.clientId,
        currency: tradeIn.currency,
        value: tradeIn.value,
        destination: tradeIn.destination,
        voided: tradeIn.voided,
      },
      paid: moneyToDatabase(paid),
      outstanding: moneyToDatabase(outstanding),
      outstandingInput: amountForInput(
        moneyToDatabase(outstanding),
        tradeIn.currency,
      ),
      paymentMethods: selectableMethods(methods),
      openSession: last && last.closedAt === null ? sessionRef(last) : null,
      exchange: exchangeOffer(setup, tradeIn.currency, outstanding),
    },
  };
}

// El filtro «Falta pagar» de la lista de usados (D-6): los usados purchase vigentes que no están pagados
// del todo. tradeins no lee las tablas de cash: cash calcula los pagados del todo y se los pasa como los
// que no entran. La consulta trae una fila por usado con pagos vigentes, nunca más que esos.
export async function listTradeInsToPay(
  context: AuthContext,
  filters: Pick<TradeInListFilters, "search" | "page">,
): Promise<TradeInPage | Failure<"FORBIDDEN" | "NOT_FOUND">> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const { organizationId } = context;
  const fullyPaid = await repository.withSnapshot(async (tx) => {
    const paid = await tradeInPaymentRepository.findPaidTradeIns(
      organizationId,
      tx,
    );
    const paidOfId = new Map(
      paid.map((row) => [row.tradeInId, moneyFromDatabase(row.paid)]),
    );
    const tradeIns = await getTradeInsForPayment(
      tx,
      organizationId,
      paid.map((row) => row.tradeInId),
    );
    return tradeIns
      .filter(
        (tradeIn) =>
          (paidOfId.get(tradeIn.id) ?? 0n) >= moneyFromDatabase(tradeIn.value),
      )
      .map((tradeIn) => tradeIn.id);
  });
  return listTradeIns(
    context,
    {
      status: "current",
      destination: "purchase",
      search: filters.search,
      page: filters.page,
    },
    { excludeIds: fullyPaid },
  );
}
