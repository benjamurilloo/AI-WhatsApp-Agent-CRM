import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import {
  getClientsByIds,
  lockClientForOrder,
  lockClientForRefund,
  type Client,
} from "@/modules/crm";
import {
  getExchangeSetup,
  referenceTotal,
  type ExchangeSetup,
} from "@/modules/fx";
import { formatDocumentNumber, nextDocumentNumber } from "@/modules/numbering";
import {
  getOrderForReceipt,
  getOrdersForAccountsByIds,
  listClientOrdersForAccount,
  lockOrderForReceipt,
  type OrderForReceipt,
  type OrderStatus,
} from "@/modules/orders";
import {
  authorize,
  getMainCurrency,
  getMemberSummaries,
  type AuthContext,
} from "@/modules/organizations";
import { failure, type Failure } from "@/shared/errors";
import {
  acceptedCurrencies,
  currencyDecimals,
  MAX_AMOUNT,
  moneyFromDatabase,
  exchangeRateToDatabase,
  moneyToDatabase,
  type Money,
} from "@/shared/money";
import {
  getSaleForReceipt,
  listClientSalesForAccount,
  listSalesForAccounts,
  type SaleForReceipt,
} from "@/modules/sales";
import type { DbTransaction } from "@/shared/db";
import {
  imputeAccount,
  outstandingOf,
  standaloneSale,
  type AccountInput,
  type AccountReceipt,
  type CurrencyAccount,
} from "./imputation";
import * as repository from "./repository";
import * as paymentRepository from "./supplier-payment-repository";
import {
  accountReceiptCurrencies,
  canConvert,
  cashSideOf,
  convertBetween,
  fitToOutstanding,
  readTender,
  tenderColumns,
  tenderedCurrencyOf,
  type ReceiptTenderRead,
  type TenderFailure,
  type TenderInput,
} from "./tender";
import {
  formatSupplierPaymentNumber,
  formatSupplierPaymentVoidNumber,
  supplierPaymentListItems,
  type DocumentRef as PaymentDocumentRef,
  type SupplierPaymentListItem,
} from "./supplier-payment-views";
import {
  computeCashTotals,
  parseCashAmount,
  type CashAmountRejection,
  type CashTotals,
  type TotalsInput,
} from "./totals";

// Casos de uso de los medios de pago y de la caja del efectivo (ADR 0022, puntos 4, 8, 10 y 12;
// brief-21.2), desde la 21.3, del cobro de una venta (brief-21.3) y, desde la 21.4, de la seña
// (brief-21.4), y desde la 21.5, de la anulación de un cobro, la devolución y su anulación
// (brief-21.5). cash es dueño de la regla: abre la transacción, toma primero el bloqueo de cobros de
// la organización y se la pasa a orders (la cabecera del pedido, bloqueada, y los pedidos del
// cliente, para leer), a sales (la venta, para leer), a crm (el cliente en modo compartido), a
// numbering y a audit. Depende de sales y de crm desde la 21.3 y de orders desde la 21.4, sin
// bloquear ninguna venta; ningún módulo depende de cash.
//
// El orden de cada escritura (brief-21.2, D-7; brief-21.3, D-3; brief-21.4, D-4): el bloqueo, el
// pedido si lo hay, el cliente si lo hay, las lecturas que deciden, el contador, los INSERT o el
// UPDATE y la auditoría. Las claves foráneas del autor toman FOR KEY SHARE sobre users al insertar,
// como en todas las tablas con autor (brief-20.4, H-6): no hace falta un bloqueo nuevo.

const idSchema = z.uuid();

// Un total de referencia en la moneda principal, para mostrar (ADR 0025, puntos 6 y 7; brief-29.4,
// D-7 y D-8): con la cotización vigente, su valor y su fecha. No se guarda. Null sin moneda
// principal, sin vigente, o si todo ya está en la principal.
export type ReferenceView = {
  currency: string;
  total: string;
  // La otra moneda de la cotización: 1 USD = ARS 1.565.
  quoteCurrency: string;
  rate: string;
  rateRecordedAt: Date;
  stale: boolean;
  // Las monedas que no son la principal ni la otra: no se convierten.
  unconverted: string[];
};

function referenceView(
  setup: ExchangeSetup | null,
  amounts: { currency: string; amount: Money }[],
): ReferenceView | null {
  const reference = referenceTotal(
    setup,
    amounts.filter((row) => row.amount > 0n),
  );
  if (!reference) return null;
  return {
    currency: reference.currency,
    total: moneyToDatabase(reference.total),
    quoteCurrency: setup!.quoteCurrency,
    rate: exchangeRateToDatabase(reference.rate.rate),
    rateRecordedAt: reference.rate.recordedAt,
    stale: reference.rate.stale,
    unconverted: reference.unconverted,
  };
}

// Escrituras de admin, lecturas de los dos roles (ADR 0022, punto 12).

export type SessionRef = { id: string; number: number; displayNumber: string };

export function formatCashSessionNumber(value: number): string {
  return formatDocumentNumber("cash_session", value);
}

export function sessionRef(row: { id: string; number: number }): SessionRef {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatCashSessionNumber(row.number),
  };
}

// El número como lo escribe quien busca: «C-000045», «c45», «000045» o «45».
export function parseCashSessionNumberSearch(text: string): number | null {
  const match = /^(?:c-?)?0*(\d{1,15})$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]!);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Medios de pago (ADR 0022, punto 10; brief-21.2, D-6).

// Hasta 20 activos: es una lista corta (D-6).
export const MAX_ACTIVE_PAYMENT_METHODS = 20;

// La lista inicial, sin Mercado Pago por decisión del usuario del 2026-10-13 (ADR 0022, punto 10).
export const INITIAL_PAYMENT_METHODS: readonly {
  name: string;
  isCash: boolean;
}[] = [
  { name: "Efectivo", isCash: true },
  { name: "Transferencia", isCash: false },
  { name: "Tarjeta de débito", isCash: false },
  { name: "Tarjeta de crédito", isCash: false },
];

export type PaymentMethod = repository.PaymentMethodRow;

const nameSchema = z.string().trim().min(1).max(40);

type PaymentMethodRule = "duplicate_name" | "limit_reached";

export function ruleFailure<R extends string>(
  rule: R,
): Failure<"BUSINESS_RULE_VIOLATION", { rule: R }> {
  return { ok: false, code: "BUSINESS_RULE_VIOLATION", rule };
}

export async function listPaymentMethods(
  context: AuthContext,
): Promise<
  { ok: true; paymentMethods: PaymentMethod[] } | Failure<"FORBIDDEN">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  return {
    ok: true,
    paymentMethods: await repository.findPaymentMethods(context.organizationId),
  };
}

// «Crear la lista inicial»: solo con la lista vacía, contando también los inactivos, y los cuatro
// en una transacción, como las etiquetas sugeridas (D-6).
export async function createInitialPaymentMethods(
  context: AuthContext,
): Promise<
  | { ok: true; created: number }
  | Failure<"FORBIDDEN">
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "list_not_empty" }>
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const { organizationId, userId } = context;

  return repository.withTransaction(async (tx) => {
    await repository.lockCash(tx, organizationId);
    const existing = await repository.countPaymentMethods(tx, organizationId, {
      activeOnly: false,
    });
    if (existing > 0) return ruleFailure("list_not_empty");
    for (const values of INITIAL_PAYMENT_METHODS) {
      const id = await repository.insertPaymentMethod(
        tx,
        organizationId,
        values,
      );
      // Con la lista vacía y bloqueada, un nombre repetido es un defecto de programación.
      if (id === "name_taken") {
        throw new Error(
          "nombre repetido en la lista inicial de medios de pago",
        );
      }
      await auditPaymentMethodCreate(tx, organizationId, userId, id, values);
    }
    return { ok: true as const, created: INITIAL_PAYMENT_METHODS.length };
  });
}

function auditPaymentMethodCreate(
  tx: DbTransaction,
  organizationId: string,
  userId: string,
  id: string,
  values: { name: string; isCash: boolean },
) {
  return recordAudit(tx, {
    organizationId,
    actorUserId: userId,
    entityType: "payment_method",
    entityId: id,
    action: "create",
    diff: {
      before: null,
      after: { name: values.name, isCash: values.isCash, isActive: true },
    },
  });
}

export type CreatePaymentMethodResult =
  | { ok: true; paymentMethodId: string }
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR", { fields: "name"[] }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: PaymentMethodRule }>;

export async function createPaymentMethod(
  context: AuthContext,
  input: { name: string; isCash: boolean },
): Promise<CreatePaymentMethodResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const name = nameSchema.safeParse(input.name);
  if (!name.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["name"] };
  }
  const values = { name: name.data, isCash: input.isCash === true };
  const { organizationId, userId } = context;

  return repository.withTransaction(
    async (tx): Promise<CreatePaymentMethodResult> => {
      // Bajo el bloqueo de cobros (brief-21.2, H-5): el límite se cuenta sin que otra transacción
      // se cruce, y desde la 21.3 el cobro comprueba el medio con el mismo bloqueo.
      await repository.lockCash(tx, organizationId);
      const active = await repository.countPaymentMethods(tx, organizationId, {
        activeOnly: true,
      });
      if (active >= MAX_ACTIVE_PAYMENT_METHODS) {
        return ruleFailure("limit_reached");
      }
      const id = await repository.insertPaymentMethod(
        tx,
        organizationId,
        values,
      );
      if (id === "name_taken") return ruleFailure("duplicate_name");
      await auditPaymentMethodCreate(tx, organizationId, userId, id, values);
      return { ok: true, paymentMethodId: id };
    },
  );
}

export type RenamePaymentMethodResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: "name"[] }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "duplicate_name" }>;

// Solo el nombre: «es efectivo» no se edita (ADR 0022, punto 10).
export async function renamePaymentMethod(
  context: AuthContext,
  paymentMethodId: string,
  input: { name: string },
): Promise<RenamePaymentMethodResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(paymentMethodId).success) {
    return failure("VALIDATION_ERROR");
  }
  const name = nameSchema.safeParse(input.name);
  if (!name.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["name"] };
  }
  const { organizationId, userId } = context;

  return repository.withTransaction(
    async (tx): Promise<RenamePaymentMethodResult> => {
      await repository.lockCash(tx, organizationId);
      const current = await repository.findPaymentMethod(
        organizationId,
        paymentMethodId.toLowerCase(),
        tx,
      );
      if (!current) return failure("NOT_FOUND");
      if (current.name === name.data) return { ok: true, changed: false };
      const updated = await repository.updatePaymentMethodName(
        tx,
        organizationId,
        current.id,
        name.data,
      );
      if (updated === "name_taken") return ruleFailure("duplicate_name");
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "payment_method",
        entityId: current.id,
        action: "update",
        diff: { before: { name: current.name }, after: { name: name.data } },
      });
      return { ok: true, changed: true };
    },
  );
}

export type PaymentMethodActiveResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "limit_reached" }>;

// Un medio inactivo no se elige para un cobro nuevo, y los cobros viejos lo conservan (punto 10).
async function setPaymentMethodActive(
  context: AuthContext,
  paymentMethodId: string,
  isActive: boolean,
): Promise<PaymentMethodActiveResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(paymentMethodId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId, userId } = context;

  return repository.withTransaction(
    async (tx): Promise<PaymentMethodActiveResult> => {
      await repository.lockCash(tx, organizationId);
      const current = await repository.findPaymentMethod(
        organizationId,
        paymentMethodId.toLowerCase(),
        tx,
      );
      if (!current) return failure("NOT_FOUND");
      if (current.isActive === isActive) return { ok: true, changed: false };
      if (isActive) {
        const active = await repository.countPaymentMethods(
          tx,
          organizationId,
          { activeOnly: true },
        );
        if (active >= MAX_ACTIVE_PAYMENT_METHODS) {
          return ruleFailure("limit_reached");
        }
      }
      await repository.updatePaymentMethodActive(
        tx,
        organizationId,
        current.id,
        isActive,
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "payment_method",
        entityId: current.id,
        action: isActive ? "reactivate" : "deactivate",
        diff: { before: { isActive: current.isActive }, after: { isActive } },
      });
      return { ok: true, changed: true };
    },
  );
}

export function deactivatePaymentMethod(
  context: AuthContext,
  paymentMethodId: string,
): Promise<PaymentMethodActiveResult> {
  return setPaymentMethodActive(context, paymentMethodId, false);
}

export function reactivatePaymentMethod(
  context: AuthContext,
  paymentMethodId: string,
): Promise<PaymentMethodActiveResult> {
  return setPaymentMethodActive(context, paymentMethodId, true);
}

// La caja (ADR 0022, punto 8; brief-21.2, D-3 a D-5).

// Hasta 10 monedas por sesión: una caja chica usa una o dos.
export const MAX_CASH_CURRENCIES = 10;

export const CASH_MOVEMENT_REASONS: Record<
  repository.CashMovementKind,
  readonly repository.CashMovementReason[]
> = {
  contribution: ["change_fund", "owner_contribution", "correction", "other"],
  withdrawal: ["bank_deposit", "owner_withdrawal", "correction", "other"],
};

export type CashMovementKind = repository.CashMovementKind;
export type CashMovementReason = repository.CashMovementReason;

// Un monto por moneda, como llega del formulario.
export type CashAmountInput = { currency: string; amount: string };

export type CashRowIssue = {
  // De 1 en adelante, en el orden del formulario.
  position: number;
  field: "currency" | "amount";
  problem: CashAmountRejection | "required" | "duplicate";
};

// Lee las filas por moneda de la apertura o del cierre: cada moneda aceptada y una sola vez, y el
// monto cero o positivo (D-3 y D-4). Las filas vacías del todo se ignoran: el formulario ofrece
// filas de más.
function parseCurrencyRows(
  rows: CashAmountInput[],
):
  | { ok: true; amounts: { currency: string; amount: Money }[] }
  | { ok: false; issues: CashRowIssue[] } {
  const accepted = new Set(acceptedCurrencies());
  const issues: CashRowIssue[] = [];
  const amounts: { currency: string; amount: Money }[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const position = index + 1;
    const currency = row.currency.trim().toUpperCase();
    const text = row.amount.trim();
    if (currency === "" && text === "") return;
    if (currency === "") {
      issues.push({ position, field: "currency", problem: "required" });
      return;
    }
    if (!accepted.has(currency)) {
      issues.push({ position, field: "currency", problem: "currency" });
      return;
    }
    if (seen.has(currency)) {
      issues.push({ position, field: "currency", problem: "duplicate" });
      return;
    }
    seen.add(currency);
    if (text === "") {
      issues.push({ position, field: "amount", problem: "required" });
      return;
    }
    const parsed = parseCashAmount(text, currency, { allowZero: true });
    if (!parsed.ok) {
      issues.push({ position, field: "amount", problem: parsed.reason });
      return;
    }
    amounts.push({ currency, amount: parsed.amount });
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, amounts };
}

// Los términos de lo esperado de una sesión (D-4; brief-21.3, D-5; brief-21.5, D-6): todos sus
// cobros y sus devoluciones en efectivo, y lo anulado mientras estaba abierta, que es lo que impactó
// en ella (D-1). Una sola función los lee para la caja, la confirmación y el cierre.
async function readTotalsInput(
  organizationId: string,
  sessionId: string,
  executor?: DbTransaction,
) {
  // Una tras otra: dentro de una transacción van todas por su conexión, y pg no admite consultas
  // superpuestas en una misma conexión. Son ocho lecturas chicas por sesión.
  const opening = await repository.findOpeningAmounts(
    organizationId,
    [sessionId],
    executor,
  );
  const receipts = await repository.findSessionReceipts(
    organizationId,
    sessionId,
    executor,
  );
  const receiptVoids = await repository.findSessionReceiptVoids(
    organizationId,
    sessionId,
    executor,
  );
  const refunds = await repository.findSessionRefunds(
    organizationId,
    sessionId,
    executor,
  );
  const refundVoids = await repository.findSessionRefundVoids(
    organizationId,
    sessionId,
    executor,
  );
  // Desde la 22.6 (brief-22.6, D-9): los pagos a proveedores en efectivo y sus anulaciones.
  const supplierPayments = await paymentRepository.findSessionSupplierPayments(
    organizationId,
    sessionId,
    executor,
  );
  const supplierPaymentVoids =
    await paymentRepository.findSessionSupplierPaymentVoids(
      organizationId,
      sessionId,
      executor,
    );
  const movements = await repository.findMovements(
    organizationId,
    sessionId,
    executor,
  );
  return {
    opening,
    receipts,
    receiptVoids,
    refunds,
    refundVoids,
    supplierPayments,
    supplierPaymentVoids,
    movements,
  };
}

// Los totales de una sesión: cada cobro cuenta lo que entró a la caja, que es lo recibido si fue en
// otra moneda (ADR 0025, punto 6; brief-29.4, D-7). computeCashTotals no cambia.
function totalsOf(
  input: Awaited<ReturnType<typeof readTotalsInput>>,
): CashTotals[] {
  return computeCashTotals({
    ...input,
    receipts: input.receipts.map(cashSideOf),
  } satisfies TotalsInput);
}

export async function readTotals(
  tx: DbTransaction,
  organizationId: string,
  sessionId: string,
): Promise<CashTotals[]> {
  return totalsOf(await readTotalsInput(organizationId, sessionId, tx));
}

type CashRowsFailure = Failure<
  "VALIDATION_ERROR",
  {
    reason: "no_rows" | "too_many_rows" | "rows" | "missing";
    issues: CashRowIssue[];
    // Las monedas con inicial, cobros en efectivo o movimientos que el cierre no contó (D-4;
    // brief-21.3, D-5).
    missing: string[];
  }
>;

function rowsFailure(
  reason: CashRowsFailure["reason"],
  issues: CashRowIssue[] = [],
  missing: string[] = [],
): CashRowsFailure {
  return { ok: false, code: "VALIDATION_ERROR", reason, issues, missing };
}

type AlreadyOpen = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "already_open"; session: SessionRef }
>;

function alreadyOpen(row: { id: string; number: number }): AlreadyOpen {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "already_open",
    session: sessionRef(row),
  };
}

export type OpenCashSessionResult =
  | { ok: true; session: SessionRef }
  | Failure<"FORBIDDEN">
  | CashRowsFailure
  | AlreadyOpen;

// La apertura (D-3): con el bloqueo tomado, la última sesión; si sigue abierta, already_open. Si
// no, el contador, la sesión encadenada a la última y su inicial por moneda.
export async function openCashSession(
  context: AuthContext,
  input: { rows: CashAmountInput[] },
): Promise<OpenCashSessionResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const parsed = parseCurrencyRows(input.rows);
  if (!parsed.ok) return rowsFailure("rows", parsed.issues);
  if (parsed.amounts.length === 0) return rowsFailure("no_rows");
  if (parsed.amounts.length > MAX_CASH_CURRENCIES) {
    return rowsFailure("too_many_rows");
  }
  const { organizationId, userId } = context;

  try {
    return await repository.withTransaction(
      async (tx): Promise<OpenCashSessionResult> => {
        await repository.lockCash(tx, organizationId);
        const last = await repository.findLastSession(organizationId, tx);
        if (last && last.closedAt === null) return alreadyOpen(last);

        const number = await nextDocumentNumber(
          tx,
          organizationId,
          "cash_session",
        );
        const session = await repository.insertCashSession(tx, {
          organizationId,
          number,
          previousSessionId: last?.id ?? null,
          openedBy: userId,
        });
        const opening = parsed.amounts.map((row) => ({
          currency: row.currency,
          amount: moneyToDatabase(row.amount),
        }));
        await repository.insertOpeningAmounts(
          tx,
          organizationId,
          session.id,
          opening,
        );
        // Solo montos y monedas: nada de una persona. La auditoría admite valores planos: una clave
        // por moneda.
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "cash_session",
          entityId: session.id,
          action: "create",
          diff: {
            before: null,
            after: {
              number: session.number,
              ...Object.fromEntries(
                opening.map((row) => [`opening_${row.currency}`, row.amount]),
              ),
            },
          },
        });
        return { ok: true, session: sessionRef(session) };
      },
    );
  } catch (error) {
    // El bloqueo serializa las aperturas; si el índice parcial o el único de la anterior igual se
    // disparan, es la misma regla, no un error (D-3).
    if (!repository.isSessionAlreadyOpen(error)) throw error;
    const last = await repository.findLastSession(organizationId);
    if (!last || last.closedAt !== null) throw error;
    return alreadyOpen(last);
  }
}

// La sesión del formulario, leída con el bloqueo tomado: tiene que ser la abierta. Si se cerró
// mientras tanto, already_closed, para que nada caiga en la sesión siguiente sin que nadie lo vea.
// Por eso no existe el no_open_session de D-5 y D-8: el formulario siempre nombra su sesión, y una
// que no está abierta está cerrada o no existe (revisión independiente de la 21.2, R-1).
type SessionStateFailure = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "already_closed"; session: SessionRef }
>;
async function openSessionFor(
  tx: DbTransaction,
  organizationId: string,
  sessionId: string,
): Promise<
  | { ok: true; session: repository.SessionRow }
  | Failure<"NOT_FOUND">
  | SessionStateFailure
> {
  const session = await repository.findSession(organizationId, sessionId, tx);
  if (!session) return failure("NOT_FOUND");
  if (session.closedAt !== null) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "already_closed",
      session: sessionRef(session),
    };
  }
  return { ok: true, session };
}

export type CashMovementField = "kind" | "currency" | "amount" | "reason";

export type RecordCashMovementResult =
  | { ok: true; movementId: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "VALIDATION_ERROR",
      { fields: CashMovementField[]; amount?: CashAmountRejection | "limit" }
    >
  | SessionStateFailure
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "insufficient_cash"; currency: string; expected: string }
    >;

const kindSchema = z.enum(["contribution", "withdrawal"]);

// Un aporte o un retiro en la sesión abierta (D-5). Un retiro nunca deja lo esperado de su moneda
// por debajo de cero, y un aporte nunca lo lleva por encima de lo que cabe en numeric(14, 2).
export async function recordCashMovement(
  context: AuthContext,
  input: {
    sessionId: string;
    kind: string;
    currency: string;
    amount: string;
    reason: string;
  },
): Promise<RecordCashMovementResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(input.sessionId).success) {
    return failure("VALIDATION_ERROR");
  }
  const fields: CashMovementField[] = [];
  const kind = kindSchema.safeParse(input.kind);
  if (!kind.success) fields.push("kind");
  const currency = input.currency.trim().toUpperCase();
  const currencyOk = acceptedCurrencies().includes(currency);
  if (!currencyOk) fields.push("currency");
  let amount: Money | null = null;
  let amountRejection: CashAmountRejection | undefined;
  if (currencyOk) {
    const parsed = parseCashAmount(input.amount, currency, {
      allowZero: false,
    });
    if (parsed.ok) amount = parsed.amount;
    else {
      fields.push("amount");
      amountRejection = parsed.reason;
    }
  } else if (input.amount.trim() === "") {
    fields.push("amount");
  }
  const reasons: readonly string[] = kind.success
    ? CASH_MOVEMENT_REASONS[kind.data]
    : [];
  if (!reasons.includes(input.reason)) fields.push("reason");
  if (fields.length > 0 || !kind.success || amount === null) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields,
      ...(amountRejection ? { amount: amountRejection } : {}),
    };
  }
  const reason = input.reason as CashMovementReason;
  const { organizationId, userId } = context;
  const movementAmount = amount;

  return repository.withTransaction(
    async (tx): Promise<RecordCashMovementResult> => {
      await repository.lockCash(tx, organizationId);
      const open = await openSessionFor(
        tx,
        organizationId,
        input.sessionId.toLowerCase(),
      );
      if (!open.ok) return open;
      const totals = await readTotals(tx, organizationId, open.session.id);
      const expected =
        totals.find((row) => row.currency === currency)?.expected ?? 0n;
      if (kind.data === "withdrawal" && expected - movementAmount < 0n) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "insufficient_cash",
          currency,
          expected: moneyToDatabase(expected),
        };
      }
      if (
        kind.data === "contribution" &&
        expected + movementAmount > MAX_AMOUNT
      ) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          fields: ["amount"],
          amount: "limit",
        };
      }
      const movement = await repository.insertMovement(tx, {
        organizationId,
        sessionId: open.session.id,
        kind: kind.data,
        currency,
        amount: moneyToDatabase(movementAmount),
        reason,
        createdBy: userId,
      });
      // Sin auditoría aparte: el movimiento lleva su autor y su fecha y es de solo inserción, como
      // un movimiento de stock (D-5).
      return { ok: true, movementId: movement.id };
    },
  );
}

// Lo contado contra lo esperado de cada moneda (D-4): falta cada moneda con inicial, cobros en
// efectivo o movimientos que no se contó; una moneda que apareció al contar va con lo esperado en cero.
function planClosing(
  totals: CashTotals[],
  counted: Map<string, Money>,
):
  | { ok: false; missing: string[] }
  | {
      ok: true;
      amounts: { currency: string; counted: Money; expected: Money }[];
    } {
  const missing = totals
    .map((row) => row.currency)
    .filter((currency) => !counted.has(currency));
  if (missing.length > 0) return { ok: false, missing };
  const expectedOf = new Map(totals.map((row) => [row.currency, row.expected]));
  return {
    ok: true,
    amounts: [...counted.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([currency, value]) => ({
        currency,
        counted: value,
        expected: expectedOf.get(currency) ?? 0n,
      })),
  };
}

// Lo esperado de cada moneda, igual a lo confirmado: mismas monedas y mismos montos.
function sameExpected(
  planned: { currency: string; expected: Money }[],
  confirmed: CashAmountInput[],
): boolean {
  if (planned.length !== confirmed.length) return false;
  const confirmedOf = new Map(
    confirmed.map((row) => [
      row.currency.trim().toUpperCase(),
      row.amount.trim(),
    ]),
  );
  return planned.every(
    (row) => confirmedOf.get(row.currency) === moneyToDatabase(row.expected),
  );
}

function readCounted(
  rows: CashAmountInput[],
): { ok: true; counted: Map<string, Money> } | CashRowsFailure {
  const parsed = parseCurrencyRows(rows);
  if (!parsed.ok) return rowsFailure("rows", parsed.issues);
  if (parsed.amounts.length > MAX_CASH_CURRENCIES) {
    return rowsFailure("too_many_rows");
  }
  return {
    ok: true,
    counted: new Map(parsed.amounts.map((row) => [row.currency, row.amount])),
  };
}

export type CashClosingPreviewRow = {
  currency: string;
  expected: string;
  counted: string;
  difference: { sign: "positive" | "negative" | "zero"; amount: string };
};

export type PreviewCashClosingResult =
  | {
      ok: true;
      session: SessionRef;
      rows: CashClosingPreviewRow[];
      // Lo contado de todas las monedas en la principal (brief-29.4, D-7).
      reference: ReferenceView | null;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | CashRowsFailure
  | SessionStateFailure;

// La confirmación del cierre (D-10): la diferencia de cada moneda antes de cerrar. Solo lee, sin el
// bloqueo: el cierre vuelve a calcular todo con el bloqueo tomado, y lo que guarda es eso.
export async function previewCashClosing(
  context: AuthContext,
  input: { sessionId: string; rows: CashAmountInput[] },
): Promise<PreviewCashClosingResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(input.sessionId).success) {
    return failure("VALIDATION_ERROR");
  }
  const read = readCounted(input.rows);
  if (!read.ok) return read;
  const { organizationId } = context;
  const session = await repository.findSession(
    organizationId,
    input.sessionId.toLowerCase(),
  );
  if (!session) return failure("NOT_FOUND");
  if (session.closedAt !== null) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "already_closed",
      session: sessionRef(session),
    };
  }
  const plan = planClosing(
    totalsOf(await readTotalsInput(organizationId, session.id)),
    read.counted,
  );
  if (!plan.ok) return rowsFailure("missing", [], plan.missing);
  const setup = await getExchangeSetup(organizationId);
  return {
    ok: true,
    session: sessionRef(session),
    reference: referenceView(
      setup,
      plan.amounts.map((row) => ({
        currency: row.currency,
        amount: row.counted,
      })),
    ),
    rows: plan.amounts.map((row) => ({
      currency: row.currency,
      expected: moneyToDatabase(row.expected),
      counted: moneyToDatabase(row.counted),
      difference: difference(row.counted, row.expected),
    })),
  };
}

export type CloseCashSessionResult =
  | { ok: true; session: SessionRef }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | CashRowsFailure
  | SessionStateFailure
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "expected_changed" }>;

// El cierre (D-4): con el bloqueo tomado, lo esperado por moneda; lo contado de cada moneda con
// inicial o movimientos, y de cualquier otra que apareció al contar, con lo esperado en cero. Las
// filas por moneda van antes que la cabecera del cierre (D-1).
//
// confirmedExpected es lo esperado que mostró la confirmación (D-10). Si con el bloqueo tomado ya no
// es lo mismo, porque otro admin registró un movimiento en el medio, no cierra: responde
// expected_changed y la pantalla vuelve a mostrar la diferencia (revisión independiente, R-5).
export async function closeCashSession(
  context: AuthContext,
  input: {
    sessionId: string;
    rows: CashAmountInput[];
    confirmedExpected?: CashAmountInput[];
  },
): Promise<CloseCashSessionResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(input.sessionId).success) {
    return failure("VALIDATION_ERROR");
  }
  const read = readCounted(input.rows);
  if (!read.ok) return read;
  const { counted } = read;
  const { organizationId, userId } = context;

  try {
    return await repository.withTransaction(
      async (tx): Promise<CloseCashSessionResult> => {
        await repository.lockCash(tx, organizationId);
        const open = await openSessionFor(
          tx,
          organizationId,
          input.sessionId.toLowerCase(),
        );
        if (!open.ok) return open;
        const plan = planClosing(
          await readTotals(tx, organizationId, open.session.id),
          counted,
        );
        if (!plan.ok) return rowsFailure("missing", [], plan.missing);
        if (
          input.confirmedExpected &&
          !sameExpected(plan.amounts, input.confirmedExpected)
        ) {
          return ruleFailure("expected_changed");
        }
        const amounts = plan.amounts.map((row) => ({
          currency: row.currency,
          counted: moneyToDatabase(row.counted),
          expected: moneyToDatabase(row.expected),
        }));
        await repository.insertClosingAmounts(
          tx,
          organizationId,
          open.session.id,
          amounts,
        );
        await repository.insertClosing(tx, {
          organizationId,
          sessionId: open.session.id,
          closedBy: userId,
        });
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "cash_session",
          entityId: open.session.id,
          action: "close",
          // before no es null: recordAudit lo reserva para create (brief-20.4, R-4).
          diff: {
            before: Object.fromEntries(
              amounts.flatMap((row) => [
                [`counted_${row.currency}`, null],
                [`expected_${row.currency}`, null],
              ]),
            ),
            after: Object.fromEntries(
              amounts.flatMap((row) => [
                [`counted_${row.currency}`, row.counted],
                [`expected_${row.currency}`, row.expected],
              ]),
            ),
          },
        });
        return { ok: true, session: sessionRef(open.session) };
      },
    );
  } catch (error) {
    // Dos cierres que igual chocan son la misma regla: en la cabecera o, antes, en sus filas por
    // moneda, que se escriben primero (revisión independiente, R-7).
    if (!repository.isSessionAlreadyClosed(error)) throw error;
    const session = await repository.findSession(
      organizationId,
      input.sessionId.toLowerCase(),
    );
    if (!session || session.closedAt === null) throw error;
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "already_closed",
      session: sessionRef(session),
    };
  }
}

// Lecturas: admin y viewer (ADR 0022, punto 12). Los nombres de quienes abren, cierran y registran
// se componen por organizations, sin JOIN.

export type CashCurrencyTotals = {
  currency: string;
  // Con la escala de la base ("1234.50"), como los demás montos.
  initial: string;
  // Los cobros en efectivo, desde la 21.3 (brief-21.3, D-5).
  receipts: string;
  // Desde la 21.5 (brief-21.5, D-6): lo anulado con la sesión abierta y las devoluciones en efectivo.
  receiptVoids: string;
  refunds: string;
  refundVoids: string;
  // Desde la 22.6 (brief-22.6, D-9): los dos roles los ven (ADR 0023, punto 12).
  supplierPayments: string;
  supplierPaymentVoids: string;
  contributions: string;
  withdrawals: string;
  expected: string;
  // Solo en una sesión cerrada: lo contado y la diferencia (contado − esperado), que puede ser
  // negativa y por eso va con su signo aparte.
  counted: string | null;
  difference: { sign: "positive" | "negative" | "zero"; amount: string } | null;
};

export type CashMovementView = {
  id: string;
  kind: CashMovementKind;
  reason: CashMovementReason;
  currency: string;
  amount: string;
  createdByName: string | null;
  createdAt: Date;
};

export type CashSessionDetail = SessionRef & {
  openedByName: string | null;
  openedAt: Date;
  closedByName: string | null;
  closedAt: Date | null;
  currencies: CashCurrencyTotals[];
  movements: CashMovementView[];
  // Los cobros en efectivo de la sesión, con su número (brief-21.3, D-5), y desde la 21.5 sus
  // devoluciones en efectivo; los anulados, marcados (brief-21.5, D-6 y D-9).
  receipts: ReceiptListItem[];
  refunds: RefundListItem[];
  // Las anulaciones posteriores al cierre de sus cobros y devoluciones: explican su diferencia, y el
  // arqueo guardado no cambia (ADR 0022, punto 7).
  lateVoids: LateVoidView[];
  // Desde la 22.6 (ADR 0023, punto 12; brief-22.6, D-9): los pagos a proveedores en efectivo de la
  // sesión y las anulaciones posteriores a su cierre, solo para un admin. Para un viewer es null: ve
  // los totales, no el detalle.
  supplierPayments: SessionSupplierPayments | null;
  // Lo esperado de todas las monedas en la principal (brief-29.4, D-7). El arqueo sigue por moneda.
  reference: ReferenceView | null;
};

export type LateSupplierPaymentVoidView = {
  displayNumber: string;
  source: PaymentDocumentRef;
  currency: string;
  amount: string;
  reason: paymentRepository.SupplierPaymentVoidReason;
  createdAt: Date;
};

export type SessionSupplierPayments = {
  items: SupplierPaymentListItem[];
  lateVoids: LateSupplierPaymentVoidView[];
};

export type LateVoidView = {
  kind: "receipt" | "refund";
  // AR-… o AD-…
  displayNumber: string;
  source: DocumentRef;
  currency: string;
  amount: string;
  reason: string;
  createdAt: Date;
};

function difference(counted: Money, expected: Money) {
  const value = counted - expected;
  return {
    sign:
      value > 0n
        ? ("positive" as const)
        : value < 0n
          ? ("negative" as const)
          : ("zero" as const),
    amount: moneyToDatabase(value < 0n ? -value : value),
  };
}

export async function memberNames(
  organizationId: string,
  userIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  return new Map(
    (await getMemberSummaries(organizationId, ids)).map((user) => [
      user.id,
      user.name,
    ]),
  );
}

async function sessionDetail(
  context: AuthContext,
  session: repository.SessionRow,
): Promise<CashSessionDetail> {
  const { organizationId } = context;
  const isAdmin = context.role === "admin";
  const [input, closing, lateVoids, lateSupplierPaymentVoids, setup] =
    await Promise.all([
      readTotalsInput(organizationId, session.id),
      session.closedAt === null
        ? Promise.resolve([])
        : repository.findClosingAmounts(organizationId, [session.id]),
      session.closedAt === null
        ? Promise.resolve([])
        : repository.findLateVoids(organizationId, session.id),
      session.closedAt === null || !isAdmin
        ? Promise.resolve([])
        : paymentRepository.findLateSupplierPaymentVoids(
            organizationId,
            session.id,
          ),
      getExchangeSetup(organizationId),
    ]);
  const { receipts, refunds, movements } = input;
  const totals = totalsOf(input);
  const closingOf = new Map(closing.map((row) => [row.currency, row]));
  // Una moneda que apareció al contar no tiene inicial ni movimientos: su fila sale del cierre.
  for (const row of closing) {
    if (!totals.some((totals) => totals.currency === row.currency)) {
      totals.push({
        currency: row.currency,
        initial: 0n,
        receipts: 0n,
        receiptVoids: 0n,
        refunds: 0n,
        refundVoids: 0n,
        supplierPayments: 0n,
        supplierPaymentVoids: 0n,
        contributions: 0n,
        withdrawals: 0n,
        expected: 0n,
      });
    }
  }
  totals.sort((a, b) =>
    a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0,
  );
  const names = await memberNames(organizationId, [
    session.openedBy,
    session.closedBy,
    ...movements.map((row) => row.createdBy),
  ]);
  return {
    ...sessionRef(session),
    // Sobre el mismo esperado que muestra cada moneda: el del cierre en una sesión cerrada.
    reference: referenceView(
      setup,
      totals.map((row) => {
        const closed = closingOf.get(row.currency);
        return {
          currency: row.currency,
          amount: closed ? moneyFromDatabase(closed.expected) : row.expected,
        };
      }),
    ),
    openedByName: names.get(session.openedBy) ?? null,
    openedAt: session.openedAt,
    closedByName:
      session.closedBy === null ? null : (names.get(session.closedBy) ?? null),
    closedAt: session.closedAt,
    currencies: totals.map((row) => {
      const closed = closingOf.get(row.currency);
      // Lo esperado de una sesión cerrada es el que guardó el cierre: es historia, y el arqueo
      // guardado no cambia (ADR 0022, punto 7).
      const expected = closed
        ? moneyFromDatabase(closed.expected)
        : row.expected;
      return {
        currency: row.currency,
        initial: moneyToDatabase(row.initial),
        receipts: moneyToDatabase(row.receipts),
        receiptVoids: moneyToDatabase(row.receiptVoids),
        refunds: moneyToDatabase(row.refunds),
        refundVoids: moneyToDatabase(row.refundVoids),
        supplierPayments: moneyToDatabase(row.supplierPayments),
        supplierPaymentVoids: moneyToDatabase(row.supplierPaymentVoids),
        contributions: moneyToDatabase(row.contributions),
        withdrawals: moneyToDatabase(row.withdrawals),
        expected: moneyToDatabase(expected),
        counted: closed ? closed.counted : null,
        difference: closed
          ? difference(moneyFromDatabase(closed.counted), expected)
          : null,
      };
    }),
    movements: movements.map((row) => ({
      id: row.id,
      kind: row.kind,
      reason: row.reason,
      currency: row.currency,
      amount: row.amount,
      createdByName: names.get(row.createdBy) ?? null,
      createdAt: row.createdAt,
    })),
    receipts: await receiptListItems(organizationId, receipts),
    refunds: await refundListItems(organizationId, refunds),
    lateVoids: lateVoids.map((row) => ({
      kind: row.kind,
      displayNumber: formatDocumentNumber(
        row.kind === "receipt" ? "receipt_void" : "refund_void",
        row.number,
      ),
      source: {
        id: row.sourceId,
        displayNumber: formatDocumentNumber(row.kind, row.sourceNumber),
      },
      currency: row.currency,
      amount: row.amount,
      reason: row.reason,
      createdAt: row.createdAt,
    })),
    // El servicio omite el detalle para un viewer, no solo la página (D-9).
    supplierPayments: isAdmin
      ? {
          items: await supplierPaymentListItems(
            organizationId,
            input.supplierPayments,
          ),
          lateVoids: lateSupplierPaymentVoids.map((row) => ({
            displayNumber: formatSupplierPaymentVoidNumber(row.number),
            source: {
              id: row.sourceId,
              displayNumber: formatSupplierPaymentNumber(row.sourceNumber),
            },
            currency: row.currency,
            amount: row.amount,
            reason: row.reason,
            createdAt: row.createdAt,
          })),
        }
      : null,
  };
}

export type CashState = {
  ok: true;
  // La sesión abierta, con lo esperado por moneda, o null si la caja está cerrada.
  open: CashSessionDetail | null;
  // La última sesión cerrada, para enlazarla con la caja cerrada.
  last: SessionRef | null;
};

export async function getCashState(
  context: AuthContext,
): Promise<CashState | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const last = await repository.findLastSession(context.organizationId);
  if (!last) return { ok: true, open: null, last: null };
  if (last.closedAt !== null) {
    return { ok: true, open: null, last: sessionRef(last) };
  }
  return {
    ok: true,
    open: await sessionDetail(context, last),
    last: null,
  };
}

// Lo que propone el formulario de apertura (D-3): lo contado en el último cierre, por moneda. Sin
// cierre anterior, nada: el ADR 0019 no le da a la organización una moneda por defecto.
// Un monto de la base como se escribe en el formulario: con los decimales de la moneda, para que
// la apertura acepte lo que ella misma propone (revisión independiente, R-2). En una moneda sin
// decimales, «7400.00» sería un separador rechazado.
export function amountForInput(value: string, currency: string): string {
  const decimals = currencyDecimals(currency);
  if (decimals.ok && decimals.decimals === 0) return value.split(".")[0]!;
  return value;
}

export async function getOpeningProposal(
  context: AuthContext,
): Promise<
  | { ok: true; open: SessionRef | null; proposal: CashAmountInput[] }
  | Failure<"FORBIDDEN">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const last = await repository.findLastSession(context.organizationId);
  // Sin cierre anterior, la moneda principal si la hay, sin monto (brief-29.4, D-9).
  if (!last) {
    const mainCurrency = await getMainCurrency(context.organizationId);
    return {
      ok: true,
      open: null,
      proposal: mainCurrency ? [{ currency: mainCurrency, amount: "" }] : [],
    };
  }
  if (last.closedAt === null) {
    return { ok: true, open: sessionRef(last), proposal: [] };
  }
  const closing = await repository.findClosingAmounts(context.organizationId, [
    last.id,
  ]);
  return {
    ok: true,
    open: null,
    proposal: closing.map((row) => ({
      currency: row.currency,
      amount: amountForInput(row.counted, row.currency),
    })),
  };
}

export async function getCashSession(
  context: AuthContext,
  sessionId: string,
): Promise<
  | { ok: true; session: CashSessionDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(sessionId).success)
    return failure("VALIDATION_ERROR");
  const session = await repository.findSession(
    context.organizationId,
    sessionId.toLowerCase(),
  );
  if (!session) return failure("NOT_FOUND");
  return {
    ok: true,
    session: await sessionDetail(context, session),
  };
}

export const CASH_SESSIONS_PAGE_SIZE = 25;

export type CashSessionSummary = SessionRef & {
  openedByName: string | null;
  openedAt: Date;
  closedByName: string | null;
  closedAt: Date | null;
  // La diferencia de cada moneda del cierre; vacía en la sesión abierta.
  differences: {
    currency: string;
    sign: "positive" | "negative" | "zero";
    amount: string;
  }[];
};

export type CashSessionPage = {
  ok: true;
  sessions: CashSessionSummary[];
  total: number;
  page: number;
  pageCount: number;
};

export async function listCashSessions(
  context: AuthContext,
  filters: { number: string; page: number },
): Promise<CashSessionPage | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const text = filters.number.trim();
  const number = text === "" ? null : parseCashSessionNumberSearch(text);
  // Un número que no puede existir no trae sesiones: la lista queda vacía.
  if (text !== "" && number === null) {
    return { ok: true, sessions: [], total: 0, page: 1, pageCount: 1 };
  }
  const total = await repository.countSessions(context.organizationId, number);
  const pageCount = Math.max(1, Math.ceil(total / CASH_SESSIONS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await repository.findSessions(
          context.organizationId,
          number,
          CASH_SESSIONS_PAGE_SIZE,
          (page - 1) * CASH_SESSIONS_PAGE_SIZE,
        );
  const closing = await repository.findClosingAmounts(
    context.organizationId,
    rows.filter((row) => row.closedAt !== null).map((row) => row.id),
  );
  const names = await memberNames(
    context.organizationId,
    rows.flatMap((row) => [row.openedBy, row.closedBy]),
  );
  return {
    ok: true,
    sessions: rows.map((row) => ({
      ...sessionRef(row),
      openedByName: names.get(row.openedBy) ?? null,
      openedAt: row.openedAt,
      closedByName:
        row.closedBy === null ? null : (names.get(row.closedBy) ?? null),
      closedAt: row.closedAt,
      differences: closing
        .filter((amounts) => amounts.sessionId === row.id)
        .map((amounts) => ({
          currency: amounts.currency,
          ...difference(
            moneyFromDatabase(amounts.counted),
            moneyFromDatabase(amounts.expected),
          ),
        })),
    })),
    total,
    page,
    pageCount,
  };
}

// La historia de una sesión: la apertura y el cierre (D-9), para los dos roles (brief-21.2, AC-6).
// No lleva datos de una persona: montos, monedas y el autor.

export type CashSessionAuditEntry = NamedAuditLogEntry;

export async function listCashSessionAudit(
  context: AuthContext,
  sessionId: string,
  page: number,
): Promise<
  | {
      ok: true;
      entries: CashSessionAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(sessionId).success)
    return failure("VALIDATION_ERROR");
  const session = await repository.findSession(
    context.organizationId,
    sessionId.toLowerCase(),
  );
  if (!session) return failure("NOT_FOUND");
  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["cash_session"],
    entityId: session.id,
    page,
  });
  const names = await memberNames(
    context.organizationId,
    auditUserIds(found.entries),
  );
  return {
    ok: true,
    entries: nameAuditActors(found.entries, names),
    total: found.total,
    page: found.page,
    pageCount: found.pageCount,
  };
}

// El cobro de una venta (ADR 0022, puntos 2 a 4, 6 y 9; brief-21.3, D-2 a D-10) y, desde la 21.4,
// la seña: el cobro contra un pedido (punto 5; brief-21.4, D-4 a D-10).

export type ReceiptRef = { id: string; number: number; displayNumber: string };

export function formatReceiptNumber(value: number): string {
  return formatDocumentNumber("receipt", value);
}

function receiptRef(row: { id: string; number: number }): ReceiptRef {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatReceiptNumber(row.number),
  };
}

// El número como lo escribe quien busca: «R-000123», «r123», «000123» o «123» (ADR 0022, punto 11).
export function parseReceiptNumberSearch(text: string): number | null {
  const match = /^(?:r-?)?0*(\d{1,15})$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]!);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Una seña lleva el estado de su pedido y la venta vigente de su cadena. Con eso imputeAccount decide
// si queda retenida, si cuenta para la venta o si pasa al remanente (brief-21.4, H-1).
function toAccountReceipt(
  row: LedgerReceipt,
  ordersById: Map<string, OrderForReceipt>,
  currentSaleOf: Map<string, SaleForReceipt>,
): AccountReceipt {
  const amount = moneyFromDatabase(row.amount);
  if (row.target === "sale" && row.saleId !== null) {
    return {
      target: "sale",
      saleId: row.saleId,
      currency: row.currency,
      amount,
    };
  }
  // El cobro a cuenta no elige una venta: va al remanente (punto 9; brief-21.6, H-1).
  if (row.target === "account") {
    return { target: "account", currency: row.currency, amount };
  }
  if (row.target === "order" && row.orderId !== null) {
    const order = ordersById.get(row.orderId);
    if (!order) {
      throw new Error(
        `la seña ${row.id} es de un pedido que no es de su cliente`,
      );
    }
    return {
      target: "order",
      orderId: order.id,
      currency: row.currency,
      amount,
      currentSaleId: currentSaleOf.get(order.id)?.id ?? null,
      cancelled: order.status === "cancelled",
    };
  }
  throw new Error(`cobro ${row.id} sin la clave de su destino`);
}

// Lo vigente de unos cobros o unas devoluciones: lo anulado se muestra y no cuenta (brief-21.5, D-8).
function current<T extends { voided: repository.VoidRef | null }>(
  rows: T[],
): T[] {
  return rows.filter((row) => row.voided === null);
}

// La suma de lo vigente.
const sumAmounts = (
  rows: { amount: string; voided: repository.VoidRef | null }[],
): Money =>
  current(rows).reduce((sum, row) => sum + moneyFromDatabase(row.amount), 0n);

// La cuenta de un cliente (brief-21.4, D-5): sus ventas por sales, sus pedidos por orders y sus
// cobros, con la regla de imputación. La venta vigente de un pedido es la no anulada con ese pedido
// (D-3; ADR 0021, punto 3). Una sola función la arma para el cobro, la seña y las lecturas, para que
// no puedan contradecirse. Lee con la transacción que recibe: en un cobro, con el bloqueo de cobros
// tomado.
//
// Desde la 21.5 (brief-21.5, D-8), sin los cobros anulados y con las devoluciones vigentes de la
// cuenta. Los cobros y las devoluciones vuelven todos, anulados incluidos, para mostrarlos.
type ClientLedger<R extends LedgerReceipt = repository.ReceiptRow> = {
  // Sus ventas, anuladas incluidas (brief-21.6, D-4).
  sales: SaleForReceipt[];
  // Todos, anulados incluidos.
  receipts: R[];
  refunds: repository.RefundRow[];
  ordersById: Map<string, OrderForReceipt>;
  // La venta vigente de cada pedido que la tiene.
  currentSaleOf: Map<string, SaleForReceipt>;
  // La entrada de la regla, sin lo anulado.
  input: AccountInput;
};

type ClientAccount = ClientLedger & { accounts: CurrencyAccount[] };

async function clientLedger(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
  options: { withoutReceiptId?: string } = {},
): Promise<ClientLedger> {
  // Una tras otra: las cuatro van por la conexión de la transacción.
  const sales = await listClientSalesForAccount(tx, organizationId, clientId);
  const orders = await listClientOrdersForAccount(tx, organizationId, clientId);
  const receipts = await repository.findClientReceipts(
    organizationId,
    clientId,
    tx,
  );
  const refunds = await repository.findClientRefunds(
    organizationId,
    clientId,
    tx,
  );
  return ledgerFrom(
    sales,
    new Map(orders.map((order) => [order.id, order])),
    receipts,
    refunds,
    options,
  );
}

// La cuenta de un cliente a partir de lo leído: la arma clientLedger con las lecturas de un cliente
// y la lista de deudores con las de toda la organización, agrupadas (brief-21.6, D-6). Una sola
// función, para que no puedan contradecirse.
//
// Es genérica en los cobros: la lista de deudores le pasa solo los vigentes, con lo que mira la regla
// (repository.findAccountsReceipts), y la cuenta de un cliente, las filas enteras.
type LedgerReceipt = Pick<
  repository.ReceiptRow,
  "id" | "target" | "saleId" | "orderId" | "currency" | "amount" | "voided"
>;

function ledgerFrom<R extends LedgerReceipt>(
  sales: SaleForReceipt[],
  ordersById: Map<string, OrderForReceipt>,
  receipts: R[],
  refunds: repository.RefundRow[],
  options: { withoutReceiptId?: string } = {},
): ClientLedger<R> {
  const currentSaleOf = new Map<string, SaleForReceipt>();
  for (const sale of sales) {
    if (sale.orderId === null || sale.voided) continue;
    if (currentSaleOf.has(sale.orderId)) {
      throw new Error(`el pedido ${sale.orderId} tiene dos ventas vigentes`);
    }
    currentSaleOf.set(sale.orderId, sale);
  }
  const input: AccountInput = {
    sales: sales.map((row) => ({
      id: row.id,
      number: row.number,
      currency: row.currency,
      total: moneyFromDatabase(row.total),
      issuedAt: row.createdAt,
      voided: row.voided,
    })),
    // Sin los anulados (D-8), y sin el que se está por anular, para la comprobación de D-5.
    receipts: current(receipts)
      .filter((row) => row.id !== options.withoutReceiptId)
      .map((row) => toAccountReceipt(row, ordersById, currentSaleOf)),
    refunds: current(refunds).map((row) => ({
      currency: row.currency,
      amount: moneyFromDatabase(row.amount),
    })),
  };
  return { sales, receipts, refunds, ordersById, currentSaleOf, input };
}

async function clientAccount(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
): Promise<ClientAccount> {
  const ledger = await clientLedger(tx, organizationId, clientId);
  return { ...ledger, accounts: imputeAccount(ledger.input) };
}

// El remanente de una moneda antes de las devoluciones (ADR 0022, punto 9, paso 2), con la misma
// regla y sin reescribirla: sin devoluciones, imputeAccount reparte el remanente entero entre lo
// imputado a las ventas (paso 3) y lo que sobra a favor (paso 4). Nunca lanza por las devoluciones,
// porque no se las pasa.
function remainderBeforeRefunds(input: AccountInput, currency: string): Money {
  const account = imputeAccount({ ...input, refunds: [] }).find(
    (row) => row.currency === currency,
  );
  if (!account) return 0n;
  return account.sales.reduce(
    (sum, sale) => sum + sale.imputed,
    account.inFavor,
  );
}

// Lo devuelto de una moneda, vigente.
function refundedIn(input: AccountInput, currency: string): Money {
  return input.refunds
    .filter((row) => row.currency === currency)
    .reduce((sum, row) => sum + row.amount, 0n);
}

// Dónde está una venta respecto de sus cobros, con la regla de imputación (D-2). Con cliente, lo que
// falta sale de la cuenta entera del cliente; sin cliente, de su total menos sus cobros (punto 3).
// Una venta anulada no debe nada: lo cobrado pasa a la cuenta del cliente o queda a devolver
// (punto 6), y la seña de su pedido vuelve a quedar retenida (punto 5). Lee con la transacción que
// recibe: en el cobro, con el bloqueo de cobros tomado.
type SaleStanding = {
  receipts: repository.ReceiptRow[];
  // Las señas de su pedido, si es su venta vigente (brief-21.4, D-5).
  deposits: repository.ReceiptRow[];
  // Lo cobrado contra esta venta, con las señas de su pedido.
  collected: Money;
  // Lo que recibió del remanente de la cuenta del cliente (paso 3 del punto 9).
  imputed: Money;
  outstanding: Money;
  // De una venta anulada: con cliente, lo que pasó a su cuenta; sin cliente, lo que queda a devolver.
  toAccount: Money;
  toRefund: Money;
  // Las devoluciones de una venta sin cliente anulada, anuladas incluidas (brief-21.5, D-9).
  refunds: repository.RefundRow[];
};

async function saleStanding(
  tx: DbTransaction,
  organizationId: string,
  sale: SaleForReceipt,
): Promise<SaleStanding> {
  const receipts = await repository.findSaleReceipts(
    organizationId,
    sale.id,
    tx,
  );
  // Sin los cobros anulados (brief-21.5, D-8).
  const direct = sumAmounts(receipts);
  if (sale.clientId === null) {
    const refunds = await repository.findSaleRefunds(
      organizationId,
      sale.id,
      tx,
    );
    const standing = standaloneSale({
      total: moneyFromDatabase(sale.total),
      collected: direct,
      refunded: sumAmounts(refunds),
      voided: sale.voided,
    });
    return {
      receipts,
      deposits: [],
      collected: direct,
      imputed: 0n,
      outstanding: standing.outstanding,
      toAccount: 0n,
      toRefund: standing.toRefund,
      refunds,
    };
  }
  if (sale.voided) {
    return {
      receipts,
      deposits: [],
      collected: direct,
      imputed: 0n,
      outstanding: 0n,
      toAccount: direct,
      toRefund: 0n,
      refunds: [],
    };
  }
  const account = await clientAccount(tx, organizationId, sale.clientId);
  const row = outstandingOf(account.accounts, sale.id);
  if (!row) {
    throw new Error(`la venta ${sale.id} no está en la cuenta de su cliente`);
  }
  // Una venta vigente con pedido es la vigente de ese pedido: sus señas cuentan para ella.
  const deposits =
    sale.orderId === null
      ? []
      : account.receipts.filter((receipt) => receipt.orderId === sale.orderId);
  return {
    receipts,
    deposits,
    collected: direct + sumAmounts(deposits),
    imputed: row.imputed,
    outstanding: row.outstanding,
    toAccount: 0n,
    toRefund: 0n,
    refunds: [],
  };
}

// Lo que está a favor de una cuenta en una moneda (punto 9, paso 4): lo único que se devuelve desde
// la cuenta (brief-21.5, H-2).
function inFavorOf(accounts: CurrencyAccount[], currency: string): Money {
  return accounts.find((row) => row.currency === currency)?.inFavor ?? 0n;
}

// Dónde está un pedido respecto de sus señas (brief-21.4, D-5 y H-5). Lo que le falta es su total
// menos sus señas: el remanente se reparte entre ventas, no entre pedidos (punto 9). La situación de
// las señas sale de la misma cuenta que usa la imputación: retenidas mientras el pedido no tiene
// venta vigente y no está cancelado, aplicadas a su venta vigente, o en la cuenta del cliente si se
// canceló (punto 5).
type OrderSituation = "none" | "retained" | "applied" | "to_account";

type OrderStanding = {
  // Anuladas incluidas, para mostrarlas; lo señado y la situación, sin ellas (brief-21.5, D-8).
  deposits: repository.ReceiptRow[];
  deposited: Money;
  outstanding: Money;
  situation: OrderSituation;
  currentSale: SaleForReceipt | null;
  // Lo que está a favor de la cuenta del cliente en la moneda del pedido (brief-21.5, D-9).
  clientInFavor: Money;
};

async function orderStanding(
  tx: DbTransaction,
  organizationId: string,
  order: OrderForReceipt,
): Promise<OrderStanding> {
  const account = await clientAccount(tx, organizationId, order.clientId);
  const deposits = account.receipts.filter(
    (receipt) => receipt.orderId === order.id,
  );
  const deposited = sumAmounts(deposits);
  const outstanding = moneyFromDatabase(order.total) - deposited;
  const currentSale = account.currentSaleOf.get(order.id) ?? null;
  return {
    deposits,
    deposited,
    outstanding: outstanding > 0n ? outstanding : 0n,
    clientInFavor: inFavorOf(account.accounts, order.currency),
    situation:
      current(deposits).length === 0
        ? "none"
        : order.status === "cancelled"
          ? "to_account"
          : currentSale !== null
            ? "applied"
            : "retained",
    currentSale,
  };
}

// Lo que comparten el cobro de una venta y la seña (brief-21.4, D-4): los campos, el medio, el
// monto en la moneda del destino, la sesión si es efectivo, el tope de lo esperado y la auditoría.
// Cada caso de uso escribe su fila: la guarda cash-writes fija los dos llamadores de insertReceipt.

export type ReceiptField = "paymentMethod" | "amount";

export type ReceiptFieldsFailure = Failure<
  "VALIDATION_ERROR",
  {
    fields: ReceiptField[];
    amount?: CashAmountRejection | "required" | "limit";
  }
>;

// Las fallas de leer un pago: las de siempre, que comparten la devolución y el pago a un proveedor, y
// desde la 29.4 las de recibir en otra moneda, solo en los cobros (brief-29.4, D-6).
export type PaymentFailure =
  | ReceiptFieldsFailure
  | Failure<"NOT_FOUND", { entity: "payment_method" }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "payment_method_inactive" }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "no_open_session" }>;

export type ReceiptPaymentFailure = PaymentFailure | TenderFailure;

type ExceedsOutstanding = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "exceeds_outstanding"; currency: string; outstanding: string }
>;

export function readReceiptFields(input: {
  paymentMethodId: string;
  amount: string;
}): { ok: true; methodId: string; amountText: string } | ReceiptFieldsFailure {
  const fields: ReceiptField[] = [];
  const methodId = input.paymentMethodId.trim().toLowerCase();
  if (!idSchema.safeParse(methodId).success) fields.push("paymentMethod");
  const amountText = input.amount.trim();
  if (amountText === "") fields.push("amount");
  if (fields.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields,
      ...(amountText === "" ? { amount: "required" as const } : {}),
    };
  }
  return { ok: true, methodId, amountText };
}

export type ReceiptPayment = {
  // Lo aplicado, en la moneda del destino.
  amount: Money;
  method: PaymentMethod;
  session: { id: string; number: number } | null;
  // Lo recibido en la otra moneda, si la hubo (brief-29.4, D-6).
  tender: ReceiptTenderRead | null;
};

// La sesión no viaja en el formulario: el cobro es plata que entra ahora y va a la sesión abierta
// cuando se registra (brief-21.3, D-3). Desde la 29.4, el monto puede venir en la otra moneda de la
// organización: se lee con sus decimales y lo aplicado se calcula con la cotización vigente, leída en
// esta transacción, o con una acordada (brief-29.4, D-6, H-3).
export async function readPayment(
  tx: DbTransaction,
  organizationId: string,
  fields: { methodId: string; amountText: string },
  currency: string,
): Promise<{ ok: true; payment: ReceiptPayment } | PaymentFailure>;
export async function readPayment(
  tx: DbTransaction,
  organizationId: string,
  fields: { methodId: string; amountText: string },
  currency: string,
  tenderInput: TenderInput,
): Promise<{ ok: true; payment: ReceiptPayment } | ReceiptPaymentFailure>;
export async function readPayment(
  tx: DbTransaction,
  organizationId: string,
  fields: { methodId: string; amountText: string },
  currency: string,
  tenderInput?: TenderInput,
): Promise<{ ok: true; payment: ReceiptPayment } | ReceiptPaymentFailure> {
  let amount: Money;
  let tender: ReceiptTenderRead | null = null;
  if (tenderedCurrencyOf(tenderInput, currency) === currency) {
    const parsed = parseCashAmount(fields.amountText, currency, {
      allowZero: false,
    });
    if (!parsed.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["amount"],
        amount: parsed.reason,
      };
    }
    amount = parsed.amount;
  } else {
    const setup = await getExchangeSetup(organizationId, tx);
    const read = readTender(setup, tenderInput, fields.amountText, currency);
    if (!read.ok) return read;
    if (!("applied" in read)) throw new Error("otra moneda sin conversión");
    amount = read.applied;
    tender = read.tender;
  }
  const method = await repository.findPaymentMethod(
    organizationId,
    fields.methodId,
    tx,
  );
  if (!method) {
    return { ok: false, code: "NOT_FOUND", entity: "payment_method" };
  }
  if (!method.isActive) return ruleFailure("payment_method_inactive");
  let session: ReceiptPayment["session"] = null;
  if (method.isCash) {
    const last = await repository.findLastSession(organizationId, tx);
    if (!last || last.closedAt !== null) {
      return ruleFailure("no_open_session");
    }
    session = { id: last.id, number: last.number };
  }
  return { ok: true, payment: { amount, method, session, tender } };
}

// El tope de lo que falta con lo aplicado, y la tolerancia de un centavo de un cobro en otra moneda
// (ADR 0025, punto 5, R-M4): si la cumple, el cobro aplica exactamente lo que falta.
function fitPayment(
  payment: ReceiptPayment,
  outstanding: Money,
  currency: string,
): { ok: true; payment: ReceiptPayment } | ExceedsOutstanding {
  const fit = fitToOutstanding(
    payment.amount,
    outstanding,
    currency,
    payment.tender !== null,
  );
  if (!fit.ok) {
    return exceedsOutstanding(currency, outstanding > 0n ? outstanding : 0n);
  }
  return { ok: true, payment: { ...payment, amount: fit.applied } };
}

function exceedsOutstanding(
  currency: string,
  outstanding: Money,
): ExceedsOutstanding {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "exceeds_outstanding",
    currency,
    outstanding: moneyToDatabase(outstanding),
  };
}

// Como el aporte: lo esperado de la sesión tiene que seguir cabiendo en numeric(14, 2), o la sesión
// no se podría cerrar (revisión de la 21.3, R-3).
export async function exceedsCashLimit(
  tx: DbTransaction,
  organizationId: string,
  payment: ReceiptPayment,
  currency: string,
): Promise<ReceiptFieldsFailure | null> {
  if (payment.session === null) return null;
  // Lo que entra a la caja: lo recibido, si fue en otra moneda (brief-29.4, D-7, H-2).
  const cashCurrency = payment.tender?.currency ?? currency;
  const cashAmount = payment.tender?.amount ?? payment.amount;
  const totals = await readTotals(tx, organizationId, payment.session.id);
  const expected =
    totals.find((row) => row.currency === cashCurrency)?.expected ?? 0n;
  if (expected + cashAmount <= MAX_AMOUNT) return null;
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: ["amount"],
    amount: "limit",
  };
}

// Claves planas, sin datos de una persona (brief-21.3, D-7; brief-21.4, D-7): el destino va por su
// número, sale_number o order_number.
async function auditReceipt(
  tx: DbTransaction,
  context: { organizationId: string; userId: string },
  receipt: repository.ReceiptRow,
  payment: ReceiptPayment,
  destination:
    { sale_number: number } | { order_number: number } | { target: "account" },
) {
  await recordAudit(tx, {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    entityType: "receipt",
    entityId: receipt.id,
    action: "create",
    diff: {
      before: null,
      after: {
        number: receipt.number,
        ...destination,
        payment_method: payment.method.name,
        currency: receipt.currency,
        amount: receipt.amount,
        // Lo recibido en otra moneda y la cotización usada (brief-29.4, D-6).
        ...(receipt.tenderedCurrency === null
          ? {}
          : {
              tendered_currency: receipt.tenderedCurrency,
              tendered_amount: receipt.tenderedAmount,
              exchange_rate: receipt.exchangeRate,
            }),
        ...(payment.session === null
          ? {}
          : { session_number: payment.session.number }),
      },
    },
  });
}

export type CreateSaleReceiptResult =
  | { ok: true; receipt: ReceiptRef }
  | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
  | Failure<"NOT_FOUND", { entity: "sale" }>
  | ReceiptPaymentFailure
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "sale_voided" }>
  | ExceedsOutstanding;

// El cobro (D-3), solo de admin, en READ COMMITTED:
//
// 1. el bloqueo de cobros de la organización;
// 2. la venta, por sales; si tiene cliente, su ficha en modo compartido por crm, y la venta otra vez,
//    porque pudo anularse mientras se esperaba al cliente;
// 3. la comprobación: la venta vigente, el monto en su moneda, el medio activo, la sesión abierta si
//    es efectivo y que el monto no supere lo que falta, con la regla de imputación, que desde la 21.4
//    descuenta la seña de su pedido;
// 4. al final, el contador, el cobro y la auditoría.
//
// Una venta anulada después de leerla, ya con el contador, queda con su cobro, y su monto pasa a la
// cuenta o a devolver (ADR 0022, punto 4; D-10). La venta no se bloquea: tampoco su pedido.
export async function createSaleReceipt(
  context: AuthContext,
  input: {
    saleId: string;
    paymentMethodId: string;
    amount: string;
  } & TenderInput,
): Promise<CreateSaleReceiptResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(input.saleId).success) {
    return failure("VALIDATION_ERROR");
  }
  const fields = readReceiptFields(input);
  if (!fields.ok) return fields;
  const { organizationId, userId } = context;

  return repository.withTransaction(
    async (tx): Promise<CreateSaleReceiptResult> => {
      await repository.lockCash(tx, organizationId);
      let sale = await getSaleForReceipt(tx, organizationId, input.saleId);
      if (!sale) return { ok: false, code: "NOT_FOUND", entity: "sale" };
      if (sale.clientId !== null) {
        // ADR 0022, punto 4, paso 3: sin esto, el INSERT esperaría la ficha por su clave foránea
        // detrás de una edición del cliente, con el bloqueo de cobros tomado (H-1). Lo que devuelve
        // no se mira: la venta de un cliente desactivado se cobra igual, porque la venta sigue
        // vigente y le falta plata (revisión de la 21.3, R-6).
        await lockClientForOrder(tx, organizationId, sale.clientId);
        sale = await getSaleForReceipt(tx, organizationId, sale.id);
        if (!sale)
          throw new Error("la venta desapareció con el bloqueo tomado");
      }
      if (sale.voided) return ruleFailure("sale_voided");

      const read = await readPayment(
        tx,
        organizationId,
        fields,
        sale.currency,
        input,
      );
      if (!read.ok) return read;
      const standing = await saleStanding(tx, organizationId, sale);
      const fitted = fitPayment(
        read.payment,
        standing.outstanding,
        sale.currency,
      );
      if (!fitted.ok) return fitted;
      const { payment } = fitted;
      const limit = await exceedsCashLimit(
        tx,
        organizationId,
        payment,
        sale.currency,
      );
      if (limit) return limit;

      const number = await nextDocumentNumber(tx, organizationId, "receipt");
      const receipt = await repository.insertReceipt(tx, {
        organizationId,
        number,
        destination: { target: "sale", saleId: sale.id },
        // La copia del cliente y de la moneda de la venta (punto 2).
        clientId: sale.clientId,
        paymentMethodId: payment.method.id,
        sessionId: payment.session?.id ?? null,
        currency: sale.currency,
        amount: moneyToDatabase(payment.amount),
        tender: tenderColumns(payment.tender),
        createdBy: userId,
      });
      await auditReceipt(tx, { organizationId, userId }, receipt, payment, {
        sale_number: sale.number,
      });
      return { ok: true, receipt: receiptRef(receipt) };
    },
  );
}

// Un pedido admite señas mientras no se entregó ni se canceló (ADR 0022, punto 5).
const OPEN_ORDER_STATUSES: readonly OrderStatus[] = ["pending", "confirmed"];

export type CreateOrderReceiptResult =
  | { ok: true; receipt: ReceiptRef }
  | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
  | Failure<"NOT_FOUND", { entity: "order" }>
  | ReceiptPaymentFailure
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "order_not_open"; status: OrderStatus }
    >
  | ExceedsOutstanding;

// La seña (brief-21.4, D-4), solo de admin, en READ COMMITTED, con el orden del ADR 0022, punto 4:
//
// 1. el bloqueo de cobros de la organización;
// 2. la cabecera del pedido FOR UPDATE, por orders: una seña y una transición del mismo pedido se
//    serializan en esa fila, así que una seña nunca cae en un pedido que se canceló o se entregó
//    mientras tanto (H-6);
// 3. su cliente en modo compartido, por crm. Todo pedido tiene cliente;
// 4. la comprobación: el pedido pending o confirmed, el medio, el monto en la moneda del pedido, la
//    sesión abierta si es efectivo, y que no supere lo que le falta: su total menos sus señas (H-5);
// 5. al final, el contador, la seña y la auditoría.
//
// La seña copia la moneda y el cliente del pedido (punto 2). Es un R como cualquier cobro.
export async function createOrderReceipt(
  context: AuthContext,
  input: {
    orderId: string;
    paymentMethodId: string;
    amount: string;
  } & TenderInput,
): Promise<CreateOrderReceiptResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(input.orderId).success) {
    return failure("VALIDATION_ERROR");
  }
  const fields = readReceiptFields(input);
  if (!fields.ok) return fields;
  const { organizationId, userId } = context;

  return repository.withTransaction(
    async (tx): Promise<CreateOrderReceiptResult> => {
      await repository.lockCash(tx, organizationId);
      const order = await lockOrderForReceipt(
        tx,
        organizationId,
        input.orderId,
      );
      if (!order) return { ok: false, code: "NOT_FOUND", entity: "order" };
      // Como en el cobro: el INSERT no espera la ficha por su clave foránea con los bloqueos tomados.
      // Lo que devuelve no se mira: el pedido de un cliente desactivado sigue abierto.
      await lockClientForOrder(tx, organizationId, order.clientId);
      if (!OPEN_ORDER_STATUSES.includes(order.status)) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "order_not_open",
          status: order.status,
        };
      }

      const read = await readPayment(
        tx,
        organizationId,
        fields,
        order.currency,
        input,
      );
      if (!read.ok) return read;
      const deposits = await repository.findOrderReceipts(
        organizationId,
        order.id,
        tx,
      );
      const outstanding = moneyFromDatabase(order.total) - sumAmounts(deposits);
      const fitted = fitPayment(read.payment, outstanding, order.currency);
      if (!fitted.ok) return fitted;
      const { payment } = fitted;
      const limit = await exceedsCashLimit(
        tx,
        organizationId,
        payment,
        order.currency,
      );
      if (limit) return limit;

      const number = await nextDocumentNumber(tx, organizationId, "receipt");
      const receipt = await repository.insertReceipt(tx, {
        organizationId,
        number,
        destination: { target: "order", orderId: order.id },
        // La copia del cliente y de la moneda del pedido (punto 2).
        clientId: order.clientId,
        paymentMethodId: payment.method.id,
        sessionId: payment.session?.id ?? null,
        currency: order.currency,
        amount: moneyToDatabase(payment.amount),
        tender: tenderColumns(payment.tender),
        createdBy: userId,
      });
      await auditReceipt(tx, { organizationId, userId }, receipt, payment, {
        order_number: order.number,
      });
      return { ok: true, receipt: receiptRef(receipt) };
    },
  );
}

// La anulación de un cobro, la devolución y su anulación (ADR 0022, punto 7; brief-21.5, D-4 a D-13).
// Cada una con su comprobante y su serie: AR, D y AD. El efecto lo da el tipo del comprobante, y
// ningún monto es negativo.

export const RECEIPT_VOID_REASONS: readonly repository.ReceiptVoidReason[] = [
  "not_received",
  "wrong_method",
  "wrong_amount",
  "wrong_target",
  "other",
];

export const REFUND_VOID_REASONS: readonly repository.RefundVoidReason[] = [
  "not_paid",
  "wrong_method",
  "wrong_amount",
  "wrong_client",
  "other",
];

export type ReceiptVoidReason = repository.ReceiptVoidReason;
export type RefundVoidReason = repository.RefundVoidReason;

export type DocumentNumberRef = {
  id: string;
  number: number;
  displayNumber: string;
};

function documentRef(
  kind: "receipt_void" | "refund" | "refund_void",
  row: { id: string; number: number },
): DocumentNumberRef {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatDocumentNumber(kind, row.number),
  };
}

export type AlreadyVoided = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "already_voided"; void: DocumentNumberRef }
>;

export type InsufficientCash = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "insufficient_cash"; currency: string; expected: string }
>;

type RefundsExceedReceipts = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "refunds_exceed_receipts"; currency: string; refunded: string }
>;

export type VoidFieldsFailure = Failure<
  "VALIDATION_ERROR",
  { fields: "reason"[]; amount?: "limit" }
>;

// La sesión en la que impacta una anulación (D-1): la del original en efectivo si sigue abierta, o
// ninguna. Con la sesión cerrada, el arqueo guardado no cambia y la sesión abierta no se toca, porque
// esa plata no entró ni salió de la caja de hoy (ADR 0022, punto 7). Se lee con el bloqueo de cobros
// tomado: un cierre no se cruza. receipt_voids_check_copy() y refund_voids_check_copy() lo defienden.
export async function impactedSession(
  tx: DbTransaction,
  organizationId: string,
  sessionId: string | null,
): Promise<repository.SessionRow | null> {
  if (sessionId === null) return null;
  const session = await repository.findSession(organizationId, sessionId, tx);
  if (!session || session.closedAt !== null) return null;
  return session;
}

export async function expectedIn(
  tx: DbTransaction,
  organizationId: string,
  sessionId: string,
  currency: string,
): Promise<Money> {
  const totals = await readTotals(tx, organizationId, sessionId);
  return totals.find((row) => row.currency === currency)?.expected ?? 0n;
}

export function insufficientCash(
  currency: string,
  expected: Money,
): InsufficientCash {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "insufficient_cash",
    currency,
    expected: moneyToDatabase(expected),
  };
}

// «Nunca queda devuelto más de lo cobrado» (ADR 0022, punto 7; brief-21.5, D-5), con el bloqueo de
// cobros tomado. Es la lectura del remanente, no la del haber (H-3):
// - con cliente, la cuenta sin ese cobro no deja el remanente de su moneda por debajo de lo devuelto;
//   el remanente sale de imputeAccount, sin reescribir la regla;
// - sin cliente, los cobros vigentes de la venta sin ese cobro no quedan por debajo de lo devuelto.
async function refundsExceedReceipts(
  tx: DbTransaction,
  organizationId: string,
  receipt: repository.ReceiptRow,
): Promise<RefundsExceedReceipts | null> {
  let received: Money;
  let refunded: Money;
  if (receipt.clientId !== null) {
    const ledger = await clientLedger(tx, organizationId, receipt.clientId, {
      withoutReceiptId: receipt.id,
    });
    refunded = refundedIn(ledger.input, receipt.currency);
    received = remainderBeforeRefunds(ledger.input, receipt.currency);
  } else {
    if (receipt.saleId === null) {
      throw new Error(`el cobro ${receipt.id} no tiene cliente ni venta`);
    }
    const receipts = await repository.findSaleReceipts(
      organizationId,
      receipt.saleId,
      tx,
    );
    const refunds = await repository.findSaleRefunds(
      organizationId,
      receipt.saleId,
      tx,
    );
    refunded = sumAmounts(refunds);
    received = sumAmounts(receipts.filter((row) => row.id !== receipt.id));
  }
  if (received >= refunded) return null;
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "refunds_exceed_receipts",
    currency: receipt.currency,
    refunded: moneyToDatabase(refunded),
  };
}

export type VoidReceiptResult =
  | { ok: true; receipt: ReceiptRef; receiptVoid: DocumentNumberRef }
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR">
  | VoidFieldsFailure
  | Failure<"NOT_FOUND", { entity: "receipt" }>
  | AlreadyVoided
  | RefundsExceedReceipts
  | InsufficientCash;

// La anulación de un cobro (D-4), solo de admin, en READ COMMITTED:
//
// 1. el bloqueo de cobros de la organización;
// 2. el cobro y su anulación, si la tiene, leídos con el bloqueo tomado;
// 3. la comprobación: no anulado; que no deje devuelto más de lo cobrado (D-5); y si fue en efectivo
//    con su sesión abierta, que lo esperado de su moneda no quede por debajo de cero (punto 8);
// 4. al final, el contador, la anulación y la auditoría.
//
// No bloquea el pedido, la venta ni el cliente: la anulación no referencia a ninguno, y lo que se
// cruza sin el bloqueo de cobros (anular una venta, cancelar un pedido, emitir una venta) no achica
// el remanente (H-4): emitir una venta solo le imputa lo que hay.
export async function voidReceipt(
  context: AuthContext,
  input: { receiptId: string; reason: string },
): Promise<VoidReceiptResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(input.receiptId).success) {
    return failure("VALIDATION_ERROR");
  }
  if (!(RECEIPT_VOID_REASONS as readonly string[]).includes(input.reason)) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["reason"] };
  }
  const { organizationId, userId } = context;

  return repository.withTransaction(async (tx): Promise<VoidReceiptResult> => {
    await repository.lockCash(tx, organizationId);
    const receipt = await repository.findReceipt(
      organizationId,
      input.receiptId.toLowerCase(),
      tx,
    );
    if (!receipt) return { ok: false, code: "NOT_FOUND", entity: "receipt" };
    if (receipt.voided) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_voided",
        void: documentRef("receipt_void", receipt.voided),
      };
    }
    const exceeds = await refundsExceedReceipts(tx, organizationId, receipt);
    if (exceeds) return exceeds;
    const session = await impactedSession(
      tx,
      organizationId,
      receipt.sessionId,
    );
    // Sale de la caja lo que entró: lo recibido, si fue en otra moneda (brief-29.4, D-7).
    const cash = cashSideOf(receipt);
    const amount = moneyFromDatabase(cash.amount);
    if (session) {
      const expected = await expectedIn(
        tx,
        organizationId,
        session.id,
        cash.currency,
      );
      if (expected - amount < 0n) {
        return insufficientCash(cash.currency, expected);
      }
    }

    const number = await nextDocumentNumber(tx, organizationId, "receipt_void");
    const row = await repository.insertReceiptVoid(tx, {
      organizationId,
      number,
      sourceId: receipt.id,
      // La copia del cobro (D-1), con lo recibido (brief-29.4, D-6).
      currency: receipt.currency,
      amount: receipt.amount,
      tender:
        receipt.tenderedCurrency === null
          ? null
          : {
              currency: receipt.tenderedCurrency,
              amount: receipt.tenderedAmount!,
              exchangeRate: receipt.exchangeRate!,
              exchangeRateId: receipt.exchangeRateId,
            },
      reason: input.reason,
      sessionId: session?.id ?? null,
      createdBy: userId,
    });
    // Sobre el cobro, como la anulación de la venta (D-13): el número de la anulación, el motivo y,
    // si impactó en la caja, la sesión. Sin datos de la persona.
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "receipt",
      entityId: receipt.id,
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
          reason: input.reason,
          ...(session ? { session_number: session.number } : {}),
        },
      },
    });
    return {
      ok: true,
      receipt: receiptRef(receipt),
      receiptVoid: documentRef("receipt_void", row),
    };
  });
}

export type RefundField = ReceiptField | "currency" | "target";

type RefundFieldsFailure = Failure<
  "VALIDATION_ERROR",
  {
    fields: RefundField[];
    amount?: CashAmountRejection | "required" | "limit";
  }
>;

type ExceedsRefundable = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "exceeds_refundable"; currency: string; available: string }
>;

export type CreateRefundResult =
  | { ok: true; refund: DocumentNumberRef }
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR">
  | RefundFieldsFailure
  | Failure<"NOT_FOUND", { entity: "client" | "sale" }>
  | PaymentFailure
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "sale_not_refundable" }>
  | ExceedsRefundable
  | InsufficientCash;

const refundTargetSchema = z.enum(["account", "sale"]);

// La devolución (D-7), solo de admin, en READ COMMITTED, con el orden del ADR 0022, punto 4:
//
// 1. el bloqueo de cobros de la organización;
// 2. con la cuenta, el cliente en modo exclusivo por crm, para que una venta emitida en paralelo,
//    que lo toma en modo compartido y achica lo que está a favor, espere o sea esperada (D-11
//    precisado tras la revisión independiente); con la venta, la venta por sales, sin bloquearla;
// 3. la comprobación: una venta sin cliente y anulada; el medio activo y la sesión abierta si es
//    efectivo; que no supere lo disponible (con la cuenta, lo que está a favor, H-2; con la venta, lo
//    que queda a devolver); y en efectivo, que lo esperado alcance (punto 8);
// 4. al final, el contador, la devolución y la auditoría.
//
// Lo demás que se cruza sin el bloqueo de cobros (anular una venta, cancelar un pedido) solo agranda
// lo disponible (H-4): lo devuelto sigue cabiendo.
export async function createRefund(
  context: AuthContext,
  input: {
    target: string;
    clientId?: string;
    saleId?: string;
    currency?: string;
    paymentMethodId: string;
    amount: string;
  },
): Promise<CreateRefundResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const target = refundTargetSchema.safeParse(input.target);
  if (!target.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["target"] };
  }
  const targetId = target.data === "account" ? input.clientId : input.saleId;
  if (!targetId || !idSchema.safeParse(targetId).success) {
    return failure("VALIDATION_ERROR");
  }
  const currencyText = (input.currency ?? "").trim().toUpperCase();
  const currencyOk =
    target.data === "sale" || acceptedCurrencies().includes(currencyText);
  const fields = readReceiptFields(input);
  if (!fields.ok || !currencyOk) {
    const issues: RefundField[] = fields.ok ? [] : [...fields.fields];
    if (!currencyOk) issues.push("currency");
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: issues,
      ...(!fields.ok && fields.amount ? { amount: fields.amount } : {}),
    };
  }
  const { organizationId, userId } = context;
  const id = targetId.toLowerCase();

  return repository.withTransaction(async (tx): Promise<CreateRefundResult> => {
    await repository.lockCash(tx, organizationId);
    let currency: string;
    let available: Money;
    let destination: repository.NewRefund["destination"];
    let saleNumber: number | null = null;
    if (target.data === "account") {
      const client = await lockClientForRefund(tx, organizationId, id);
      if (client === "not_found") {
        return { ok: false, code: "NOT_FOUND", entity: "client" };
      }
      currency = currencyText;
      destination = { target: "account", clientId: id };
      const account = await clientAccount(tx, organizationId, id);
      available = inFavorOf(account.accounts, currency);
    } else {
      const sale = await getSaleForReceipt(tx, organizationId, id);
      if (!sale) return { ok: false, code: "NOT_FOUND", entity: "sale" };
      // Con cliente, lo cobrado pasó a su cuenta y se devuelve desde ahí; vigente, no hay nada a
      // devolver (punto 6).
      if (sale.clientId !== null || !sale.voided) {
        return ruleFailure("sale_not_refundable");
      }
      currency = sale.currency;
      destination = { target: "sale", saleId: sale.id };
      saleNumber = sale.number;
      available = (await saleStanding(tx, organizationId, sale)).toRefund;
    }

    const read = await readPayment(tx, organizationId, fields, currency);
    if (!read.ok) return read;
    const { payment } = read;
    if (payment.amount > available) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exceeds_refundable",
        currency,
        available: moneyToDatabase(available),
      };
    }
    if (payment.session !== null) {
      const expected = await expectedIn(
        tx,
        organizationId,
        payment.session.id,
        currency,
      );
      if (expected - payment.amount < 0n) {
        return insufficientCash(currency, expected);
      }
    }

    const number = await nextDocumentNumber(tx, organizationId, "refund");
    const refund = await repository.insertRefund(tx, {
      organizationId,
      number,
      destination,
      paymentMethodId: payment.method.id,
      sessionId: payment.session?.id ?? null,
      currency,
      amount: moneyToDatabase(payment.amount),
      createdBy: userId,
    });
    // Claves planas, sin datos de la persona (D-13): el destino va por su tipo y, si es una venta,
    // por su número.
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "refund",
      entityId: refund.id,
      action: "create",
      diff: {
        before: null,
        after: {
          number: refund.number,
          target: destination.target,
          ...(saleNumber === null ? {} : { sale_number: saleNumber }),
          payment_method: payment.method.name,
          currency: refund.currency,
          amount: refund.amount,
          ...(payment.session === null
            ? {}
            : { session_number: payment.session.number }),
        },
      },
    });
    return { ok: true, refund: documentRef("refund", refund) };
  });
}

export type VoidRefundResult =
  | { ok: true; refund: DocumentNumberRef; refundVoid: DocumentNumberRef }
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR">
  | VoidFieldsFailure
  | Failure<"NOT_FOUND", { entity: "refund" }>
  | AlreadyVoided;

// La anulación de una devolución (D-7), como la de un cobro y sin la comprobación de lo devuelto:
// anularla solo agranda lo que está a favor o a devolver. Con su sesión abierta, la devolución en
// efectivo deja de restar en lo esperado, que tiene que seguir cabiendo en numeric(14, 2), como un
// aporte.
export async function voidRefund(
  context: AuthContext,
  input: { refundId: string; reason: string },
): Promise<VoidRefundResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(input.refundId).success) {
    return failure("VALIDATION_ERROR");
  }
  if (!(REFUND_VOID_REASONS as readonly string[]).includes(input.reason)) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["reason"] };
  }
  const { organizationId, userId } = context;

  return repository.withTransaction(async (tx): Promise<VoidRefundResult> => {
    await repository.lockCash(tx, organizationId);
    const refund = await repository.findRefund(
      organizationId,
      input.refundId.toLowerCase(),
      tx,
    );
    if (!refund) return { ok: false, code: "NOT_FOUND", entity: "refund" };
    if (refund.voided) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "already_voided",
        void: documentRef("refund_void", refund.voided),
      };
    }
    const session = await impactedSession(tx, organizationId, refund.sessionId);
    if (session) {
      const expected = await expectedIn(
        tx,
        organizationId,
        session.id,
        refund.currency,
      );
      if (expected + moneyFromDatabase(refund.amount) > MAX_AMOUNT) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          fields: [],
          amount: "limit",
        };
      }
    }

    const number = await nextDocumentNumber(tx, organizationId, "refund_void");
    const row = await repository.insertRefundVoid(tx, {
      organizationId,
      number,
      sourceId: refund.id,
      currency: refund.currency,
      amount: refund.amount,
      reason: input.reason,
      sessionId: session?.id ?? null,
      createdBy: userId,
    });
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "refund",
      entityId: refund.id,
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
          reason: input.reason,
          ...(session ? { session_number: session.number } : {}),
        },
      },
    });
    return {
      ok: true,
      refund: documentRef("refund", refund),
      refundVoid: documentRef("refund_void", row),
    };
  });
}

// Lecturas de los cobros: admin y viewer (ADR 0022, punto 12). La venta se lee por sales, el pedido
// por orders, el cliente por crm, ya resuelto para el rol, y el medio y la sesión acá.

type DocumentRef = { id: string; displayNumber: string };

export type ReceiptListItem = ReceiptRef & {
  createdAt: Date;
  // El destino: la venta de un cobro o el pedido de una seña (brief-21.4, D-8).
  sale: DocumentRef | null;
  order: DocumentRef | null;
  // El cliente de un cobro a cuenta (brief-21.6, D-9).
  account: { clientId: string } | null;
  paymentMethodName: string;
  isCash: boolean;
  // Lo aplicado, en la moneda del destino.
  currency: string;
  amount: string;
  // Lo recibido en otra moneda, si la hubo (brief-29.4, D-6): lo que contó la caja, la cotización
  // usada y si fue acordada para este cobro.
  tender: {
    currency: string;
    amount: string;
    exchangeRate: string;
    negotiated: boolean;
  } | null;
  // Su anulación (brief-21.5, D-9): se muestra y no cuenta.
  voided: VoidView | null;
};

export type VoidView = DocumentNumberRef & {
  reason: string;
  createdAt: Date;
};

function voidView(
  kind: "receipt_void" | "refund_void",
  row: repository.VoidRef | null,
): VoidView | null {
  if (row === null) return null;
  return {
    ...documentRef(kind, row),
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

export async function methodsById(organizationId: string) {
  return new Map(
    (await repository.findPaymentMethods(organizationId)).map((method) => [
      method.id,
      method,
    ]),
  );
}

// Las ventas y los pedidos de unos cobros, por sales y por orders: una lectura por documento, con la
// transacción que piden sus lecturas (brief-21.3, D-4). Una página tiene a lo sumo
// CASH_RECEIPTS_PAGE_SIZE cobros.
async function destinationsOf(
  organizationId: string,
  rows: repository.ReceiptRow[],
): Promise<{
  sales: Map<string, DocumentRef>;
  orders: Map<string, DocumentRef>;
}> {
  const unique = (ids: (string | null)[]) => [
    ...new Set(ids.filter((id): id is string => id !== null)),
  ];
  const saleIds = unique(rows.map((row) => row.saleId));
  const orderIds = unique(rows.map((row) => row.orderId));
  const sales = new Map<string, DocumentRef>();
  const orders = new Map<string, DocumentRef>();
  if (saleIds.length === 0 && orderIds.length === 0) return { sales, orders };
  await repository.withTransaction(async (tx) => {
    for (const id of saleIds) {
      const sale = await getSaleForReceipt(tx, organizationId, id);
      if (sale) sales.set(id, { id, displayNumber: sale.displayNumber });
    }
    for (const id of orderIds) {
      const order = await getOrderForReceipt(tx, organizationId, id);
      if (order) orders.set(id, { id, displayNumber: order.displayNumber });
    }
  });
  return { sales, orders };
}

async function receiptListItems(
  organizationId: string,
  rows: repository.ReceiptRow[],
): Promise<ReceiptListItem[]> {
  if (rows.length === 0) return [];
  const [methods, destinations] = await Promise.all([
    methodsById(organizationId),
    destinationsOf(organizationId, rows),
  ]);
  return rows.map((row) => {
    const method = methods.get(row.paymentMethodId);
    return {
      ...receiptRef(row),
      createdAt: row.createdAt,
      sale:
        row.saleId === null
          ? null
          : (destinations.sales.get(row.saleId) ?? null),
      order:
        row.orderId === null
          ? null
          : (destinations.orders.get(row.orderId) ?? null),
      account:
        row.target === "account" && row.clientId !== null
          ? { clientId: row.clientId }
          : null,
      paymentMethodName: method?.name ?? "",
      isCash: method?.isCash ?? false,
      currency: row.currency,
      amount: row.amount,
      tender:
        row.tenderedCurrency === null
          ? null
          : {
              currency: row.tenderedCurrency,
              amount: row.tenderedAmount!,
              exchangeRate: row.exchangeRate!,
              negotiated: row.exchangeRateId === null,
            },
      voided: voidView("receipt_void", row.voided),
    };
  });
}

export type SaleReceipts = {
  currency: string;
  total: string;
  // Lo cobrado contra esta venta, con la seña de su pedido, y, con cliente, lo imputado desde su
  // cuenta.
  collected: string;
  // La seña de su pedido, incluida en lo cobrado (brief-21.4, D-5).
  deposited: string;
  order: DocumentRef | null;
  imputed: string;
  outstanding: string;
  // Lo que se muestra en lugar de lo que falta (D-8).
  status: "pending" | "collected" | "voided";
  hasClient: boolean;
  // De una venta anulada: con cliente, lo que pasó a su cuenta; sin cliente, lo que queda a devolver.
  toAccount: string;
  toRefund: string;
  // Sus cobros y las señas de su pedido, por número; los anulados, marcados (brief-21.5, D-9).
  receipts: ReceiptListItem[];
  // De una venta sin cliente anulada: lo devuelto y sus devoluciones (brief-21.5, D-9).
  refunded: string;
  refunds: RefundListItem[];
  // De una venta anulada con cliente: lo que está a favor de su cuenta en la moneda de la venta, para
  // ofrecer la devolución desde la cuenta.
  clientId: string | null;
  clientInFavor: string;
  // Con cliente, lo que debe su cuenta en la moneda de la venta (brief-21.6, D-7): solo se muestra, no
  // bloquea nada (ADR 0022, punto 9, sin límite de crédito).
  clientOwed: string;
};

async function readSaleStanding(organizationId: string, saleId: string) {
  return repository.withTransaction(async (tx) => {
    const sale = await getSaleForReceipt(tx, organizationId, saleId);
    if (!sale) return null;
    const standing = await saleStanding(tx, organizationId, sale);
    const order =
      standing.deposits.length > 0 && sale.orderId !== null
        ? await getOrderForReceipt(tx, organizationId, sale.orderId)
        : null;
    const accounts =
      sale.clientId !== null
        ? (await clientAccount(tx, organizationId, sale.clientId)).accounts
        : [];
    const inCurrency = accounts.find((row) => row.currency === sale.currency);
    return {
      sale,
      standing,
      order,
      clientInFavor: inFavorOf(accounts, sale.currency),
      clientOwed: inCurrency
        ? inCurrency.sales.reduce((sum, row) => sum + row.outstanding, 0n)
        : 0n,
    };
  });
}

// Lo cobrado de una venta, para su detalle (D-8): lo compone la página, nunca sales.
export async function getSaleReceipts(
  context: AuthContext,
  saleId: string,
): Promise<
  | { ok: true; sale: SaleReceipts }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(saleId).success) return failure("VALIDATION_ERROR");
  const found = await readSaleStanding(context.organizationId, saleId);
  if (!found) return failure("NOT_FOUND");
  const { sale, standing, order, clientInFavor, clientOwed } = found;
  return {
    ok: true,
    sale: {
      clientId: sale.clientId,
      clientInFavor: moneyToDatabase(clientInFavor),
      clientOwed: moneyToDatabase(clientOwed),
      refunded: moneyToDatabase(sumAmounts(standing.refunds)),
      refunds: await refundListItems(context.organizationId, standing.refunds),
      currency: sale.currency,
      total: sale.total,
      collected: moneyToDatabase(standing.collected),
      deposited: moneyToDatabase(sumAmounts(standing.deposits)),
      order: order
        ? { id: order.id, displayNumber: order.displayNumber }
        : null,
      imputed: moneyToDatabase(standing.imputed),
      outstanding: moneyToDatabase(standing.outstanding),
      status: sale.voided
        ? "voided"
        : standing.outstanding === 0n
          ? "collected"
          : "pending",
      hasClient: sale.clientId !== null,
      toAccount: moneyToDatabase(standing.toAccount),
      toRefund: moneyToDatabase(standing.toRefund),
      receipts: await receiptListItems(
        context.organizationId,
        [...standing.receipts, ...standing.deposits].sort(
          (a, b) => a.number - b.number,
        ),
      ),
    },
  };
}

// Recibir en la otra moneda de la organización (brief-29.4, D-6): cuál es, la cotización vigente y lo
// que falta convertido con ella, como se escribe en el campo. Null sin moneda principal o si el
// destino está en una moneda que no se convierte.
export type ExchangeOffer = {
  currency: string;
  // La principal: de ella a la otra se multiplica, y de la otra a ella se divide.
  mainCurrency: string;
  rate: {
    id: string;
    value: string;
    recordedAt: Date;
    stale: boolean;
  } | null;
  outstanding: string | null;
  outstandingInput: string | null;
};

function exchangeOffer(
  setup: ExchangeSetup | null,
  targetCurrency: string,
  outstanding: Money,
): ExchangeOffer | null {
  if (!setup) return null;
  const other =
    targetCurrency === setup.mainCurrency
      ? setup.quoteCurrency
      : setup.mainCurrency;
  if (!canConvert(setup, other, targetCurrency)) return null;
  const current = setup.current;
  // Lo que falta en la otra moneda: con cotización >= 1, convertirlo y volver da lo mismo, así que lo
  // propuesto nunca cae en la tolerancia del redondeo (ADR 0025, punto 5).
  const converted =
    current && outstanding > 0n
      ? convertBetween(setup, outstanding, targetCurrency, other, current.rate)
      : null;
  const amount = converted?.ok ? moneyToDatabase(converted.amount) : null;
  return {
    currency: other,
    mainCurrency: setup.mainCurrency,
    rate: current
      ? {
          id: current.id,
          value: exchangeRateToDatabase(current.rate),
          recordedAt: current.recordedAt,
          stale: current.stale,
        }
      : null,
    outstanding: amount,
    outstandingInput: amount === null ? null : amountForInput(amount, other),
  };
}

export type SaleReceiptForm = {
  ok: true;
  sale: { id: string; displayNumber: string; currency: string };
  outstanding: string;
  // Lo que falta como se escribe en el campo, para que el cobro acepte lo que propone: sin decimales
  // en una moneda que no los tiene, como la apertura (revisión independiente de la 21.2, R-2).
  outstandingInput: string;
  voided: boolean;
  paymentMethods: PaymentMethod[];
  openSession: SessionRef | null;
  exchange: ExchangeOffer | null;
};

// Lo que necesita el formulario del cobro (D-8): la venta, lo que falta, los medios activos y si hay
// una sesión abierta. Lo que decide lo vuelve a leer el cobro con el bloqueo tomado.
export async function getSaleReceiptForm(
  context: AuthContext,
  saleId: string,
): Promise<
  SaleReceiptForm | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(saleId).success) return failure("VALIDATION_ERROR");
  const { organizationId } = context;
  const found = await readSaleStanding(organizationId, saleId);
  if (!found) return failure("NOT_FOUND");
  const [methods, last, setup] = await Promise.all([
    repository.findPaymentMethods(organizationId),
    repository.findLastSession(organizationId),
    getExchangeSetup(organizationId),
  ]);
  return {
    ok: true,
    exchange: exchangeOffer(
      setup,
      found.sale.currency,
      found.standing.outstanding,
    ),
    sale: {
      id: found.sale.id,
      displayNumber: found.sale.displayNumber,
      currency: found.sale.currency,
    },
    outstanding: moneyToDatabase(found.standing.outstanding),
    outstandingInput: amountForInput(
      moneyToDatabase(found.standing.outstanding),
      found.sale.currency,
    ),
    voided: found.sale.voided,
    paymentMethods: methods.filter((method) => method.isActive),
    openSession: last && last.closedAt === null ? sessionRef(last) : null,
  };
}

export type OrderReceipts = {
  currency: string;
  total: string;
  deposited: string;
  // Lo que le falta: su total menos sus señas (brief-21.4, H-5).
  outstanding: string;
  // Qué pasó con lo señado (D-5): ninguna seña, retenida, aplicada a su venta vigente o en la cuenta
  // del cliente.
  situation: OrderSituation;
  sale: DocumentRef | null;
  // Admite señas: pending o confirmed, y le falta algo.
  open: boolean;
  receipts: ReceiptListItem[];
  // Lo que está a favor de la cuenta del cliente en la moneda del pedido (brief-21.5, D-9).
  clientId: string;
  clientInFavor: string;
};

async function readOrderStanding(organizationId: string, orderId: string) {
  return repository.withTransaction(async (tx) => {
    const order = await getOrderForReceipt(tx, organizationId, orderId);
    if (!order) return null;
    return { order, standing: await orderStanding(tx, organizationId, order) };
  });
}

// Lo señado de un pedido, para su detalle (brief-21.4, D-5 y D-8): lo compone la página, nunca
// orders.
export async function getOrderReceipts(
  context: AuthContext,
  orderId: string,
): Promise<
  | { ok: true; order: OrderReceipts }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(orderId).success) return failure("VALIDATION_ERROR");
  const found = await readOrderStanding(context.organizationId, orderId);
  if (!found) return failure("NOT_FOUND");
  const { order, standing } = found;
  return {
    ok: true,
    order: {
      currency: order.currency,
      total: order.total,
      deposited: moneyToDatabase(standing.deposited),
      outstanding: moneyToDatabase(standing.outstanding),
      situation: standing.situation,
      sale:
        standing.situation === "applied" && standing.currentSale
          ? {
              id: standing.currentSale.id,
              displayNumber: standing.currentSale.displayNumber,
            }
          : null,
      open:
        OPEN_ORDER_STATUSES.includes(order.status) && standing.outstanding > 0n,
      clientId: order.clientId,
      clientInFavor: moneyToDatabase(standing.clientInFavor),
      receipts: await receiptListItems(
        context.organizationId,
        standing.deposits,
      ),
    },
  };
}

export type OrderReceiptForm = {
  ok: true;
  order: {
    id: string;
    displayNumber: string;
    currency: string;
    status: OrderStatus;
  };
  outstanding: string;
  // Como en el cobro: lo que falta como se escribe en el campo.
  outstandingInput: string;
  paymentMethods: PaymentMethod[];
  openSession: SessionRef | null;
  exchange: ExchangeOffer | null;
};

// Lo que necesita el formulario de la seña (brief-21.4, D-8). Lo que decide lo vuelve a leer la seña
// con los bloqueos tomados.
export async function getOrderReceiptForm(
  context: AuthContext,
  orderId: string,
): Promise<
  OrderReceiptForm | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(orderId).success) return failure("VALIDATION_ERROR");
  const { organizationId } = context;
  const found = await readOrderStanding(organizationId, orderId);
  if (!found) return failure("NOT_FOUND");
  const [methods, last, setup] = await Promise.all([
    repository.findPaymentMethods(organizationId),
    repository.findLastSession(organizationId),
    getExchangeSetup(organizationId),
  ]);
  const outstanding = moneyToDatabase(found.standing.outstanding);
  return {
    ok: true,
    exchange: exchangeOffer(
      setup,
      found.order.currency,
      found.standing.outstanding,
    ),
    order: {
      id: found.order.id,
      displayNumber: found.order.displayNumber,
      currency: found.order.currency,
      status: found.order.status,
    },
    outstanding,
    outstandingInput: amountForInput(outstanding, found.order.currency),
    paymentMethods: methods.filter((method) => method.isActive),
    openSession: last && last.closedAt === null ? sessionRef(last) : null,
  };
}

export type ReceiptDetail = ReceiptListItem & {
  // El cliente como lo entrega crm para el rol; null en una venta sin cliente («Consumidor final»).
  client: Client | null;
  clientId: string | null;
  session: SessionRef | null;
  // Si su sesión sigue abierta: anularlo sale de lo esperado de esa sesión (brief-21.5, D-9).
  sessionOpen: boolean;
  createdByName: string | null;
  voidedByName: string | null;
};

export async function getReceipt(
  context: AuthContext,
  receiptId: string,
): Promise<
  | { ok: true; receipt: ReceiptDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(receiptId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const row = await repository.findReceipt(
    organizationId,
    receiptId.toLowerCase(),
  );
  if (!row) return failure("NOT_FOUND");
  const [items, clients, session, names] = await Promise.all([
    receiptListItems(organizationId, [row]),
    getClientsByIds(context, row.clientId === null ? [] : [row.clientId]),
    row.sessionId === null
      ? undefined
      : repository.findSession(organizationId, row.sessionId),
    memberNames(organizationId, [row.createdBy, row.voided?.createdBy ?? null]),
  ]);
  return {
    ok: true,
    receipt: {
      ...items[0]!,
      client: clients.ok ? (clients.clients[0] ?? null) : null,
      clientId: row.clientId,
      session: session ? sessionRef(session) : null,
      sessionOpen: session ? session.closedAt === null : false,
      createdByName: names.get(row.createdBy) ?? null,
      voidedByName: row.voided
        ? (names.get(row.voided.createdBy) ?? null)
        : null,
    },
  };
}

export const CASH_RECEIPTS_PAGE_SIZE = 25;

export type ReceiptSummary = ReceiptListItem & {
  // Null en una venta sin cliente («Consumidor final»).
  client: { id: string; displayName: string | null } | null;
};

export type ReceiptPage = {
  ok: true;
  receipts: ReceiptSummary[];
  total: number;
  page: number;
  pageCount: number;
};

// La lista de cobros, del más nuevo al más viejo, con la búsqueda por número (D-8).
export async function listReceipts(
  context: AuthContext,
  filters: { number: string; page: number },
): Promise<ReceiptPage | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const text = filters.number.trim();
  const number = text === "" ? null : parseReceiptNumberSearch(text);
  // Un número que no puede existir no trae cobros: la lista queda vacía.
  if (text !== "" && number === null) {
    return { ok: true, receipts: [], total: 0, page: 1, pageCount: 1 };
  }
  const { organizationId } = context;
  const total = await repository.countReceipts(organizationId, number);
  const pageCount = Math.max(1, Math.ceil(total / CASH_RECEIPTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await repository.findReceipts(
          organizationId,
          number,
          CASH_RECEIPTS_PAGE_SIZE,
          (page - 1) * CASH_RECEIPTS_PAGE_SIZE,
        );
  const clientIds = [
    ...new Set(
      rows.map((row) => row.clientId).filter((id): id is string => id !== null),
    ),
  ];
  const [items, clients] = await Promise.all([
    receiptListItems(organizationId, rows),
    getClientsByIds(context, clientIds),
  ]);
  const clientsById = new Map(
    clients.ok ? clients.clients.map((client) => [client.id, client]) : [],
  );
  return {
    ok: true,
    receipts: items.map((item, index) => {
      const clientId = rows[index]!.clientId;
      return {
        ...item,
        client:
          clientId === null
            ? null
            : {
                id: clientId,
                displayName: clientsById.get(clientId)?.displayName ?? null,
              },
      };
    }),
    total,
    page,
    pageCount,
  };
}

// Lecturas de las devoluciones: admin y viewer (ADR 0022, punto 12; brief-21.5, D-9). La venta se lee
// por sales y el cliente por crm, ya resuelto para el rol.

export function formatRefundNumber(value: number): string {
  return formatDocumentNumber("refund", value);
}

// El número como lo escribe quien busca: «D-000007», «d7», «000007» o «7».
export function parseRefundNumberSearch(text: string): number | null {
  const match = /^(?:d-?)?0*(\d{1,15})$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]!);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export type RefundListItem = DocumentNumberRef & {
  createdAt: Date;
  // El destino: la cuenta del cliente o la venta sin cliente.
  target: repository.RefundTarget;
  sale: DocumentRef | null;
  clientId: string | null;
  paymentMethodName: string;
  isCash: boolean;
  currency: string;
  amount: string;
  voided: VoidView | null;
};

async function refundListItems(
  organizationId: string,
  rows: repository.RefundRow[],
): Promise<RefundListItem[]> {
  if (rows.length === 0) return [];
  const saleIds = [
    ...new Set(
      rows.map((row) => row.saleId).filter((id): id is string => id !== null),
    ),
  ];
  const sales = new Map<string, DocumentRef>();
  if (saleIds.length > 0) {
    await repository.withTransaction(async (tx) => {
      for (const id of saleIds) {
        const sale = await getSaleForReceipt(tx, organizationId, id);
        if (sale) sales.set(id, { id, displayNumber: sale.displayNumber });
      }
    });
  }
  const methods = await methodsById(organizationId);
  return rows.map((row) => {
    const method = methods.get(row.paymentMethodId);
    return {
      ...documentRef("refund", row),
      createdAt: row.createdAt,
      target: row.target,
      sale: row.saleId === null ? null : (sales.get(row.saleId) ?? null),
      clientId: row.clientId,
      paymentMethodName: method?.name ?? "",
      isCash: method?.isCash ?? false,
      currency: row.currency,
      amount: row.amount,
      voided: voidView("refund_void", row.voided),
    };
  });
}

export type RefundDetail = RefundListItem & {
  // El cliente de la cuenta como lo entrega crm para el rol; null en una venta sin cliente
  // («Consumidor final»).
  client: Client | null;
  session: SessionRef | null;
  sessionOpen: boolean;
  createdByName: string | null;
  voidedByName: string | null;
};

export async function getRefund(
  context: AuthContext,
  refundId: string,
): Promise<
  | { ok: true; refund: RefundDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(refundId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const row = await repository.findRefund(
    organizationId,
    refundId.toLowerCase(),
  );
  if (!row) return failure("NOT_FOUND");
  const [items, clients, session, names] = await Promise.all([
    refundListItems(organizationId, [row]),
    getClientsByIds(context, row.clientId === null ? [] : [row.clientId]),
    row.sessionId === null
      ? undefined
      : repository.findSession(organizationId, row.sessionId),
    memberNames(organizationId, [row.createdBy, row.voided?.createdBy ?? null]),
  ]);
  return {
    ok: true,
    refund: {
      ...items[0]!,
      client: clients.ok ? (clients.clients[0] ?? null) : null,
      session: session ? sessionRef(session) : null,
      sessionOpen: session ? session.closedAt === null : false,
      createdByName: names.get(row.createdBy) ?? null,
      voidedByName: row.voided
        ? (names.get(row.voided.createdBy) ?? null)
        : null,
    },
  };
}

export const CASH_REFUNDS_PAGE_SIZE = 25;

export type RefundSummary = RefundListItem & {
  client: { id: string; displayName: string | null } | null;
};

export type RefundPage = {
  ok: true;
  refunds: RefundSummary[];
  total: number;
  page: number;
  pageCount: number;
};

// La lista de devoluciones, de la más nueva a la más vieja, con la búsqueda por número, como la de
// los cobros (D-9).
export async function listRefunds(
  context: AuthContext,
  filters: { number: string; page: number },
): Promise<RefundPage | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const text = filters.number.trim();
  const number = text === "" ? null : parseRefundNumberSearch(text);
  if (text !== "" && number === null) {
    return { ok: true, refunds: [], total: 0, page: 1, pageCount: 1 };
  }
  const { organizationId } = context;
  const total = await repository.countRefunds(organizationId, number);
  const pageCount = Math.max(1, Math.ceil(total / CASH_REFUNDS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await repository.findRefunds(
          organizationId,
          number,
          CASH_REFUNDS_PAGE_SIZE,
          (page - 1) * CASH_REFUNDS_PAGE_SIZE,
        );
  const clientIds = [
    ...new Set(
      rows.map((row) => row.clientId).filter((id): id is string => id !== null),
    ),
  ];
  const [items, clients] = await Promise.all([
    refundListItems(organizationId, rows),
    getClientsByIds(context, clientIds),
  ]);
  const clientsById = new Map(
    clients.ok ? clients.clients.map((client) => [client.id, client]) : [],
  );
  return {
    ok: true,
    refunds: items.map((item) => ({
      ...item,
      client:
        item.clientId === null
          ? null
          : {
              id: item.clientId,
              displayName: clientsById.get(item.clientId)?.displayName ?? null,
            },
    })),
    total,
    page,
    pageCount,
  };
}

export type RefundableAmount = {
  currency: string;
  amount: string;
  // Como se escribe en el campo, para que la devolución acepte lo que propone.
  amountInput: string;
};

export type ClientRefundForm = {
  ok: true;
  client: { id: string; displayName: string | null };
  // Lo que está a favor por moneda (H-2), sin el estado de cuenta, que es de la 21.6 (H-10).
  inFavor: RefundableAmount[];
  paymentMethods: PaymentMethod[];
  openSession: SessionRef | null;
};

function refundable(currency: string, amount: Money): RefundableAmount {
  const text = moneyToDatabase(amount);
  return {
    currency,
    amount: text,
    amountInput: amountForInput(text, currency),
  };
}

// Lo que necesita la devolución desde la cuenta (D-9). Lo que decide lo vuelve a leer la devolución
// con el bloqueo tomado.
export async function getClientRefundForm(
  context: AuthContext,
  clientId: string,
): Promise<
  ClientRefundForm | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(clientId).success) {
    return failure("VALIDATION_ERROR");
  }
  const id = clientId.toLowerCase();
  const { organizationId } = context;
  const clients = await getClientsByIds(context, [id]);
  const client = clients.ok ? clients.clients[0] : undefined;
  if (!client) return failure("NOT_FOUND");
  const account = await repository.withTransaction((tx) =>
    clientAccount(tx, organizationId, id),
  );
  const [methods, last] = await Promise.all([
    repository.findPaymentMethods(organizationId),
    repository.findLastSession(organizationId),
  ]);
  return {
    ok: true,
    client: { id: client.id, displayName: client.displayName },
    inFavor: account.accounts
      .filter((row) => row.inFavor > 0n)
      .map((row) => refundable(row.currency, row.inFavor)),
    paymentMethods: methods.filter((method) => method.isActive),
    openSession: last && last.closedAt === null ? sessionRef(last) : null,
  };
}

export type SaleRefundForm = {
  ok: true;
  sale: { id: string; displayNumber: string; currency: string };
  // Una venta sin cliente y anulada; si no, no se devuelve desde ella.
  refundable: boolean;
  toRefund: RefundableAmount;
  paymentMethods: PaymentMethod[];
  openSession: SessionRef | null;
};

// Lo que necesita la devolución de una venta sin cliente anulada (D-9).
export async function getSaleRefundForm(
  context: AuthContext,
  saleId: string,
): Promise<
  SaleRefundForm | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(saleId).success) return failure("VALIDATION_ERROR");
  const { organizationId } = context;
  const found = await readSaleStanding(organizationId, saleId);
  if (!found) return failure("NOT_FOUND");
  const [methods, last] = await Promise.all([
    repository.findPaymentMethods(organizationId),
    repository.findLastSession(organizationId),
  ]);
  return {
    ok: true,
    sale: {
      id: found.sale.id,
      displayNumber: found.sale.displayNumber,
      currency: found.sale.currency,
    },
    refundable: found.sale.clientId === null && found.sale.voided,
    toRefund: refundable(found.sale.currency, found.standing.toRefund),
    paymentMethods: methods.filter((method) => method.isActive),
    openSession: last && last.closedAt === null ? sessionRef(last) : null,
  };
}

// La cuenta corriente (ADR 0022, punto 9; brief-21.6): el cobro a cuenta, su vista previa, el estado
// de cuenta, el resumen para la ficha y la venta, y la lista de deudores. Todo sale de imputeAccount,
// alimentada por ledgerFrom: ninguna lectura reparte el remanente por su cuenta.

// Lo que debe y lo que tiene a favor un cliente en una moneda. Lo que debe es la suma de lo que falta
// de sus ventas, y es cero si tiene algo a favor (paso 4: solo sobra si todas están cubiertas).
export type AccountCurrencySummary = {
  currency: string;
  owed: string;
  inFavor: string;
  // Las señas de pedidos sin venta vigente que no están cancelados: no cuentan (punto 5).
  retained: string;
  salesWithBalance: number;
  // La emisión de la venta con saldo más vieja.
  oldestOutstandingAt: Date | null;
};

function summarize(account: CurrencyAccount): AccountCurrencySummary {
  const withBalance = account.sales.filter((sale) => sale.outstanding > 0n);
  return {
    currency: account.currency,
    owed: moneyToDatabase(
      withBalance.reduce((sum, sale) => sum + sale.outstanding, 0n),
    ),
    inFavor: moneyToDatabase(account.inFavor),
    retained: moneyToDatabase(account.retained),
    salesWithBalance: withBalance.length,
    oldestOutstandingAt: withBalance[0]?.issuedAt ?? null,
  };
}

// Una moneda sin nada que mostrar (todo cobrado, nada a favor ni retenido) no se lista.
function hasSomething(summary: AccountCurrencySummary): boolean {
  return (
    summary.owed !== "0.00" ||
    summary.inFavor !== "0.00" ||
    summary.retained !== "0.00"
  );
}

type ClientName = { id: string; displayName: string | null };

async function clientName(
  context: AuthContext,
  clientId: string,
): Promise<ClientName | null> {
  const clients = await getClientsByIds(context, [clientId]);
  const client = clients.ok ? clients.clients[0] : undefined;
  return client ? { id: client.id, displayName: client.displayName } : null;
}

// El resumen de la cuenta, para la ficha del cliente y el detalle de la venta (D-7): lo compone la
// página, nunca crm ni sales.
// Lo que debe y lo que tiene a favor, sumados en la moneda principal (brief-29.4, D-8): para mostrar,
// sin guardar. La deuda sigue en la moneda de cada venta.
export type AccountReferences = {
  owed: ReferenceView | null;
  inFavor: ReferenceView | null;
};

function accountReferences(
  setup: ExchangeSetup | null,
  currencies: { currency: string; owed: string; inFavor: string }[],
): AccountReferences {
  return {
    owed: referenceView(
      setup,
      currencies.map((row) => ({
        currency: row.currency,
        amount: moneyFromDatabase(row.owed),
      })),
    ),
    inFavor: referenceView(
      setup,
      currencies.map((row) => ({
        currency: row.currency,
        amount: moneyFromDatabase(row.inFavor),
      })),
    ),
  };
}

export async function getClientAccountSummary(
  context: AuthContext,
  clientId: string,
): Promise<
  | {
      ok: true;
      currencies: AccountCurrencySummary[];
      references: AccountReferences;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(clientId).success) return failure("VALIDATION_ERROR");
  const id = clientId.toLowerCase();
  if (!(await clientName(context, id))) return failure("NOT_FOUND");
  const [account, setup] = await Promise.all([
    repository.withTransaction((tx) =>
      clientAccount(tx, context.organizationId, id),
    ),
    getExchangeSetup(context.organizationId),
  ]);
  const currencies = account.accounts.map(summarize).filter(hasSomething);
  return {
    ok: true,
    currencies,
    references: accountReferences(setup, currencies),
  };
}

// El estado de cuenta (D-4): el resumen y la imputación de hoy por moneda, y los comprobantes del
// cliente, de la más nueva a la más vieja, sin saldo corrido.
export type StatementSale = {
  id: string;
  displayNumber: string;
  issuedAt: Date;
  total: string;
  // Sus cobros directos y las señas de su pedido, hasta su total (paso 1).
  direct: string;
  // Lo que recibió del remanente (paso 3).
  imputed: string;
  outstanding: string;
};

export type StatementCurrency = AccountCurrencySummary & {
  debit: string;
  credit: string;
  // debit − credit, sin signo: src/shared/money no guarda montos negativos (ADR 0022, punto 7). El
  // lado dice si es deuda o saldo a favor.
  balance: { side: "debt" | "favor" | "zero"; amount: string };
  sales: StatementSale[];
};

export type StatementDocument = {
  kind:
    | "sale"
    | "sale_void"
    | "receipt"
    | "receipt_void"
    | "refund"
    | "refund_void";
  // El documento que se abre: la venta para una venta y su anulación, el recibo para un cobro y su
  // anulación, la devolución para una devolución y su anulación.
  id: string;
  displayNumber: string;
  createdAt: Date;
  currency: string;
  amount: string;
  // De un cobro: su destino (D-4).
  destination:
    | { target: "sale" | "order"; ref: DocumentRef | null }
    | { target: "account" }
    | null;
  // Una venta, un cobro o una devolución anulados.
  voided: boolean;
};

export type ClientStatement = {
  client: ClientName;
  generatedAt: Date;
  currencies: StatementCurrency[];
  // En la moneda principal (brief-29.4, D-8).
  references: AccountReferences;
  documents: StatementDocument[];
  // Si hay más comprobantes que STATEMENT_DOCUMENTS_LIMIT: se muestran los más nuevos.
  truncated: boolean;
};

export const STATEMENT_DOCUMENTS_LIMIT = 500;

function statementDocuments(ledger: ClientLedger): StatementDocument[] {
  const salesById = new Map(ledger.sales.map((sale) => [sale.id, sale]));
  const documents: StatementDocument[] = [];
  for (const sale of ledger.sales) {
    documents.push({
      kind: "sale",
      id: sale.id,
      displayNumber: sale.displayNumber,
      createdAt: sale.createdAt,
      currency: sale.currency,
      amount: sale.total,
      destination: null,
      voided: sale.voided,
    });
    if (sale.voidRef) {
      documents.push({
        kind: "sale_void",
        id: sale.id,
        displayNumber: sale.voidRef.displayNumber,
        createdAt: sale.voidRef.createdAt,
        currency: sale.currency,
        amount: sale.total,
        destination: null,
        voided: false,
      });
    }
  }
  for (const receipt of ledger.receipts) {
    const sale = receipt.saleId ? salesById.get(receipt.saleId) : undefined;
    const order = receipt.orderId
      ? ledger.ordersById.get(receipt.orderId)
      : undefined;
    documents.push({
      kind: "receipt",
      id: receipt.id,
      displayNumber: formatReceiptNumber(receipt.number),
      createdAt: receipt.createdAt,
      currency: receipt.currency,
      amount: receipt.amount,
      destination:
        receipt.target === "account"
          ? { target: "account" }
          : {
              target: receipt.target,
              ref:
                receipt.target === "sale"
                  ? sale
                    ? { id: sale.id, displayNumber: sale.displayNumber }
                    : null
                  : order
                    ? { id: order.id, displayNumber: order.displayNumber }
                    : null,
            },
      voided: receipt.voided !== null,
    });
    if (receipt.voided) {
      documents.push({
        kind: "receipt_void",
        id: receipt.id,
        displayNumber: formatDocumentNumber(
          "receipt_void",
          receipt.voided.number,
        ),
        createdAt: receipt.voided.createdAt,
        currency: receipt.currency,
        amount: receipt.amount,
        destination: null,
        voided: false,
      });
    }
  }
  for (const refund of ledger.refunds) {
    documents.push({
      kind: "refund",
      id: refund.id,
      displayNumber: formatRefundNumber(refund.number),
      createdAt: refund.createdAt,
      currency: refund.currency,
      amount: refund.amount,
      destination: null,
      voided: refund.voided !== null,
    });
    if (refund.voided) {
      documents.push({
        kind: "refund_void",
        id: refund.id,
        displayNumber: formatDocumentNumber(
          "refund_void",
          refund.voided.number,
        ),
        createdAt: refund.voided.createdAt,
        currency: refund.currency,
        amount: refund.amount,
        destination: null,
        voided: false,
      });
    }
  }
  return documents.sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() ||
      b.displayNumber.localeCompare(a.displayNumber),
  );
}

function statementCurrency(
  account: CurrencyAccount,
  sales: Map<string, SaleForReceipt>,
): StatementCurrency {
  return {
    ...summarize(account),
    debit: moneyToDatabase(account.debit),
    credit: moneyToDatabase(account.credit),
    balance: {
      side:
        account.balance > 0n ? "debt" : account.balance < 0n ? "favor" : "zero",
      amount: moneyToDatabase(
        account.balance < 0n ? -account.balance : account.balance,
      ),
    },
    sales: account.sales.map((row) => ({
      id: row.saleId,
      displayNumber: sales.get(row.saleId)?.displayNumber ?? "",
      issuedAt: row.issuedAt,
      total: moneyToDatabase(row.total),
      direct: moneyToDatabase(row.direct),
      imputed: moneyToDatabase(row.imputed),
      outstanding: moneyToDatabase(row.outstanding),
    })),
  };
}

export async function getClientStatement(
  context: AuthContext,
  clientId: string,
): Promise<
  | { ok: true; statement: ClientStatement }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(clientId).success) return failure("VALIDATION_ERROR");
  const id = clientId.toLowerCase();
  const client = await clientName(context, id);
  if (!client) return failure("NOT_FOUND");
  const account = await repository.withTransaction((tx) =>
    clientAccount(tx, context.organizationId, id),
  );
  const sales = new Map(account.sales.map((sale) => [sale.id, sale]));
  const documents = statementDocuments(account);
  const currencies = account.accounts.map((row) =>
    statementCurrency(row, sales),
  );
  return {
    ok: true,
    statement: {
      client,
      generatedAt: new Date(),
      references: accountReferences(
        await getExchangeSetup(context.organizationId),
        currencies,
      ),
      currencies,
      documents: documents.slice(0, STATEMENT_DOCUMENTS_LIMIT),
      truncated: documents.length > STATEMENT_DOCUMENTS_LIMIT,
    },
  };
}

// El cobro a cuenta (ADR 0022, puntos 2, 3 y 9; brief-21.6, D-2 y D-3).

export type AccountReceiptField = ReceiptField | "currency";

type AccountReceiptFieldsFailure = Failure<
  "VALIDATION_ERROR",
  {
    fields: AccountReceiptField[];
    amount?: CashAmountRejection | "required" | "limit";
  }
>;

// currency es la moneda aplicada; desde la 29.4, lo recibido puede venir en la otra moneda de la
// organización (brief-29.4, D-6).
export type AccountReceiptInput = {
  clientId: string;
  currency: string;
  paymentMethodId: string;
  amount: string;
} & TenderInput;

type AccountReceiptCheckFailure =
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR">
  | AccountReceiptFieldsFailure
  | Failure<"NOT_FOUND", { entity: "client" }>
  | ReceiptPaymentFailure;

export type CreateAccountReceiptResult =
  { ok: true; receipt: ReceiptRef } | AccountReceiptCheckFailure;

// A qué ventas va un monto nuevo del remanente, y cuánto queda a favor, según la regla: la cuenta sin
// el cobro y con él, y la diferencia de lo que falta de cada venta (D-5).
export type AccountReceiptPreview = {
  currency: string;
  amount: string;
  applications: { saleId: string; displayNumber: string; amount: string }[];
  toFavor: string;
  // Lo que entra, si es en la otra moneda (brief-29.4, D-6).
  tender: { currency: string; amount: string; exchangeRate: string } | null;
};

function previewOf(
  ledger: ClientLedger,
  currency: string,
  amount: Money,
): AccountReceiptPreview {
  const find = (accounts: CurrencyAccount[]) =>
    accounts.find((row) => row.currency === currency);
  const before = find(imputeAccount(ledger.input));
  const after = find(
    imputeAccount({
      ...ledger.input,
      receipts: [
        ...ledger.input.receipts,
        { target: "account", currency, amount },
      ],
    }),
  )!;
  const sales = new Map(ledger.sales.map((sale) => [sale.id, sale]));
  const outstandingBefore = new Map(
    (before?.sales ?? []).map((row) => [row.saleId, row.outstanding]),
  );
  return {
    currency,
    amount: moneyToDatabase(amount),
    applications: after.sales
      .map((row) => ({
        saleId: row.saleId,
        displayNumber: sales.get(row.saleId)?.displayNumber ?? "",
        applied: (outstandingBefore.get(row.saleId) ?? 0n) - row.outstanding,
      }))
      .filter((row) => row.applied > 0n)
      .map(({ applied, ...row }) => ({
        ...row,
        amount: moneyToDatabase(applied),
      })),
    toFavor: moneyToDatabase(after.inFavor - (before?.inFavor ?? 0n)),
    tender: null,
  };
}

type AccountReceiptRead = {
  ok: true;
  clientId: string;
  currency: string;
  fields: { methodId: string; amountText: string };
  tender: TenderInput;
};

function readAccountReceiptInput(
  input: AccountReceiptInput,
):
  | AccountReceiptRead
  | Failure<"VALIDATION_ERROR">
  | AccountReceiptFieldsFailure {
  if (!idSchema.safeParse(input.clientId).success) {
    return failure("VALIDATION_ERROR");
  }
  const currency = input.currency.trim().toUpperCase();
  const currencyOk = acceptedCurrencies().includes(currency);
  const fields = readReceiptFields(input);
  if (!fields.ok || !currencyOk) {
    const issues: AccountReceiptField[] = fields.ok ? [] : [...fields.fields];
    if (!currencyOk) issues.push("currency");
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: issues,
      ...(!fields.ok && fields.amount ? { amount: fields.amount } : {}),
    };
  }
  return {
    ok: true,
    clientId: input.clientId.toLowerCase(),
    currency,
    fields,
    tender: {
      tenderedCurrency: input.tenderedCurrency,
      exchangeRate: input.exchangeRate,
      exchangeRateId: input.exchangeRateId,
    },
  };
}

// La comprobación, compartida por el cobro y su vista previa: el cliente, el medio activo, el monto
// en la moneda elegida, la sesión abierta si es efectivo y el tope de lo esperado. Sin tope contra lo
// que debe: lo que excede queda a favor (D-2). En el cobro corre con los bloqueos tomados.
async function checkAccountReceipt(
  tx: DbTransaction,
  organizationId: string,
  read: AccountReceiptRead,
  clientStatus: "active" | "inactive" | "not_found",
): Promise<
  | { ok: true; payment: ReceiptPayment }
  | Failure<"NOT_FOUND", { entity: "client" }>
  | AccountReceiptFieldsFailure
  | ReceiptPaymentFailure
> {
  // Un cliente desactivado se cobra: su deuda no se cancela al desactivarlo (D-3).
  if (clientStatus === "not_found") {
    return { ok: false, code: "NOT_FOUND", entity: "client" };
  }
  // Con moneda principal, la moneda aplicada es la principal, o una con saldo del cliente (brief-29.4,
  // D-6, H-4). Sin moneda principal, cualquiera de las aceptadas, como siempre.
  const setup = await getExchangeSetup(organizationId, tx);
  if (setup) {
    const { accounts } = await clientAccount(tx, organizationId, read.clientId);
    if (!accountReceiptCurrencies(setup, accounts).includes(read.currency)) {
      return { ok: false, code: "VALIDATION_ERROR", fields: ["currency"] };
    }
  }
  const paid = await readPayment(
    tx,
    organizationId,
    read.fields,
    read.currency,
    read.tender,
  );
  if (!paid.ok) return paid;
  const limit = await exceedsCashLimit(
    tx,
    organizationId,
    paid.payment,
    read.currency,
  );
  if (limit) return limit;
  return paid;
}

// La vista previa del cobro a cuenta (D-5): la misma comprobación, sin bloqueos y sin escribir. El
// cobro vuelve a leer todo con el bloqueo tomado.
export async function previewAccountReceipt(
  context: AuthContext,
  input: AccountReceiptInput,
): Promise<
  { ok: true; preview: AccountReceiptPreview } | AccountReceiptCheckFailure
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const read = readAccountReceiptInput(input);
  if (!read.ok) return read;
  const { organizationId } = context;
  const client = await clientName(context, read.clientId);
  return repository.withTransaction(
    async (
      tx,
    ): Promise<
      { ok: true; preview: AccountReceiptPreview } | AccountReceiptCheckFailure
    > => {
      const checked = await checkAccountReceipt(
        tx,
        organizationId,
        read,
        client ? "active" : "not_found",
      );
      if (!checked.ok) return checked;
      const ledger = await clientLedger(tx, organizationId, read.clientId);
      const tender = tenderColumns(checked.payment.tender);
      return {
        ok: true,
        preview: {
          ...previewOf(ledger, read.currency, checked.payment.amount),
          tender: tender
            ? {
                currency: tender.currency,
                amount: tender.amount,
                exchangeRate: tender.exchangeRate,
              }
            : null,
        },
      };
    },
  );
}

// El cobro a cuenta (D-2), solo de admin, en READ COMMITTED, con el orden del ADR 0022, punto 4:
//
// 1. el bloqueo de cobros de la organización;
// 2. el cliente en modo compartido por crm: el INSERT toma su ficha por la clave foránea. Basta el
//    modo compartido: el cobro a cuenta no tiene tope que otra escritura achique (H-4), y la
//    devolución desde la cuenta, que toma la ficha en modo exclusivo, ya espera el bloqueo de cobros;
// 3. la comprobación de checkAccountReceipt;
// 4. al final, el contador, el cobro sin venta ni pedido y la auditoría.
//
// No elige una venta: se imputa con la regla en cada lectura (punto 9; H-5).
export async function createAccountReceipt(
  context: AuthContext,
  input: AccountReceiptInput,
): Promise<CreateAccountReceiptResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const read = readAccountReceiptInput(input);
  if (!read.ok) return read;
  const { organizationId, userId } = context;

  return repository.withTransaction(
    async (tx): Promise<CreateAccountReceiptResult> => {
      await repository.lockCash(tx, organizationId);
      const client = await lockClientForOrder(
        tx,
        organizationId,
        read.clientId,
      );
      const checked = await checkAccountReceipt(
        tx,
        organizationId,
        read,
        client,
      );
      if (!checked.ok) return checked;
      const { payment } = checked;

      const number = await nextDocumentNumber(tx, organizationId, "receipt");
      const receipt = await repository.insertReceipt(tx, {
        organizationId,
        number,
        destination: { target: "account" },
        clientId: read.clientId,
        paymentMethodId: payment.method.id,
        sessionId: payment.session?.id ?? null,
        currency: read.currency,
        amount: moneyToDatabase(payment.amount),
        tender: tenderColumns(payment.tender),
        createdBy: userId,
      });
      await auditReceipt(tx, { organizationId, userId }, receipt, payment, {
        target: "account",
      });
      return { ok: true, receipt: receiptRef(receipt) };
    },
  );
}

// Lo que necesita el formulario del cobro a cuenta (D-5): lo que debe por moneda, con sus ventas con
// saldo, la moneda y el monto propuestos, los medios activos y si hay una sesión abierta.
export type AccountReceiptForm = {
  ok: true;
  client: ClientName;
  currencies: StatementCurrency[];
  // La de la venta con saldo más vieja, por lo que debe en ella; si no debe nada, la de su venta más
  // reciente, sin monto; si no tiene ventas, ninguna (D-3).
  proposed: RefundableAmount | null;
  paymentMethods: PaymentMethod[];
  openSession: SessionRef | null;
  // Con moneda principal (brief-29.4, D-6): las monedas en que se puede aplicar, la otra moneda en que
  // se puede recibir y la cotización vigente. Null sin moneda principal: el formulario de siempre.
  exchange: {
    appliedCurrencies: string[];
    mainCurrency: string;
    quoteCurrency: string;
    rate: ExchangeOffer["rate"];
  } | null;
};

export async function getAccountReceiptForm(
  context: AuthContext,
  clientId: string,
): Promise<
  AccountReceiptForm | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(clientId).success) return failure("VALIDATION_ERROR");
  const id = clientId.toLowerCase();
  const client = await clientName(context, id);
  if (!client) return failure("NOT_FOUND");
  const { organizationId } = context;
  const account = await repository.withTransaction((tx) =>
    clientAccount(tx, organizationId, id),
  );
  const [methods, last, setup] = await Promise.all([
    repository.findPaymentMethods(organizationId),
    repository.findLastSession(organizationId),
    getExchangeSetup(organizationId),
  ]);
  const sales = new Map(account.sales.map((sale) => [sale.id, sale]));
  const currencies = account.accounts.map((row) =>
    statementCurrency(row, sales),
  );
  const current = setup?.current ?? null;
  const oldest = currencies
    .filter((row) => row.oldestOutstandingAt !== null)
    .sort(
      (a, b) =>
        a.oldestOutstandingAt!.getTime() - b.oldestOutstandingAt!.getTime(),
    )[0];
  const latest = account.sales.at(-1);
  return {
    ok: true,
    client,
    currencies,
    // Sin deuda, con moneda principal se propone la principal (brief-29.4, D-9).
    proposed: oldest
      ? refundable(oldest.currency, moneyFromDatabase(oldest.owed))
      : setup
        ? { currency: setup.mainCurrency, amount: "0.00", amountInput: "" }
        : latest
          ? { currency: latest.currency, amount: "0.00", amountInput: "" }
          : null,
    paymentMethods: methods.filter((method) => method.isActive),
    openSession: last && last.closedAt === null ? sessionRef(last) : null,
    exchange: setup
      ? {
          appliedCurrencies: accountReceiptCurrencies(setup, account.accounts),
          mainCurrency: setup.mainCurrency,
          quoteCurrency: setup.quoteCurrency,
          rate: current
            ? {
                id: current.id,
                value: exchangeRateToDatabase(current.rate),
                recordedAt: current.recordedAt,
                stale: current.stale,
              }
            : null,
        }
      : null,
  };
}

// La lista de deudores (D-6): una fila por cliente y moneda con saldo deudor. Se lee en cuatro
// consultas por organización, sin JOIN entre módulos (Overview): las ventas con cliente por sales,
// los pedidos con señas por orders, y los cobros con cliente y las devoluciones desde la cuenta. Se
// agrupa por cliente y cada cuenta pasa por imputeAccount. Los nombres, solo los de la página que se
// muestra. Medida en la 21.6 antes de aceptarla (AC-7).
export type DebtorRow = {
  clientId: string;
  displayName: string | null;
  currency: string;
  owed: string;
  oldestOutstandingAt: Date;
  salesWithBalance: number;
};

export type DebtorPage = {
  rows: DebtorRow[];
  total: number;
  page: number;
  pageSize: number;
  // Las monedas con algún deudor, para el filtro.
  currencies: string[];
  // Lo que deben todos los de la lista, filtrada, en la moneda principal (brief-29.4, D-8).
  reference: ReferenceView | null;
};

export const DEBTORS_PAGE_SIZE = 25;

function groupBy<T>(
  rows: T[],
  key: (row: T) => string | null,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    if (id === null) continue;
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

type Debt = Omit<DebtorRow, "displayName"> & { owedAmount: Money };

async function readDebts(organizationId: string): Promise<Debt[]> {
  const { sales, receipts, refunds, orders } = await repository.withSnapshot(
    async (tx) => {
      // Una tras otra, en la misma instantánea: van por la conexión de la transacción.
      const sales = await listSalesForAccounts(tx, organizationId);
      const receipts = await repository.findAccountsReceipts(
        organizationId,
        tx,
      );
      const refunds = await repository.findAccountsRefunds(organizationId, tx);
      const orderIds = [
        ...new Set(
          receipts
            .map((row) => row.orderId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const orders =
        orderIds.length === 0
          ? []
          : await getOrdersForAccountsByIds(tx, organizationId, orderIds);
      return { sales, receipts, refunds, orders };
    },
  );
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const receiptsOf = groupBy(receipts, (row) => row.clientId);
  const refundsOf = groupBy(refunds, (row) => row.clientId);
  const debts: Debt[] = [];
  // Sin ventas no hay deuda: solo los clientes con alguna.
  for (const [clientId, clientSales] of groupBy(sales, (row) => row.clientId)) {
    const ledger = ledgerFrom(
      clientSales,
      ordersById,
      receiptsOf.get(clientId) ?? [],
      refundsOf.get(clientId) ?? [],
    );
    for (const account of imputeAccount(ledger.input)) {
      const summary = summarize(account);
      if (summary.salesWithBalance === 0) continue;
      debts.push({
        clientId,
        currency: summary.currency,
        owed: summary.owed,
        owedAmount: moneyFromDatabase(summary.owed),
        oldestOutstandingAt: summary.oldestOutstandingAt!,
        salesWithBalance: summary.salesWithBalance,
      });
    }
  }
  return debts;
}

function byDebt(a: Debt, b: Debt): number {
  if (a.currency !== b.currency) return a.currency < b.currency ? -1 : 1;
  if (a.owedAmount !== b.owedAmount)
    return a.owedAmount > b.owedAmount ? -1 : 1;
  return a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0;
}

export async function listDebtors(
  context: AuthContext,
  query: { currency: string | null; page: number },
): Promise<
  { ok: true; debtors: DebtorPage } | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (
    (query.currency !== null && !/^[A-Z]{3}$/.test(query.currency)) ||
    !Number.isSafeInteger(query.page) ||
    query.page < 1
  ) {
    return failure("VALIDATION_ERROR");
  }
  const debts = await readDebts(context.organizationId);
  const currencies = [...new Set(debts.map((row) => row.currency))].sort();
  // Por moneda, y dentro de cada una, de la deuda mayor a la menor.
  const filtered = debts
    .filter((row) => query.currency === null || row.currency === query.currency)
    .sort(byDebt);
  const start = (query.page - 1) * DEBTORS_PAGE_SIZE;
  const page = filtered.slice(start, start + DEBTORS_PAGE_SIZE);
  const reference = referenceView(
    await getExchangeSetup(context.organizationId),
    filtered.map((row) => ({ currency: row.currency, amount: row.owedAmount })),
  );
  const names = new Map<string, string | null>();
  if (page.length > 0) {
    const clients = await getClientsByIds(
      context,
      page.map((row) => row.clientId),
    );
    if (clients.ok) {
      for (const client of clients.clients) {
        names.set(client.id, client.displayName);
      }
    }
  }
  return {
    ok: true,
    debtors: {
      rows: page.map((row) => ({
        clientId: row.clientId,
        displayName: names.get(row.clientId) ?? null,
        currency: row.currency,
        owed: row.owed,
        oldestOutstandingAt: row.oldestOutstandingAt,
        salesWithBalance: row.salesWithBalance,
      })),
      total: filtered.length,
      page: query.page,
      pageSize: DEBTORS_PAGE_SIZE,
      currencies,
      reference,
    },
  };
}
