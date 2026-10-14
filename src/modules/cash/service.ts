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
  type Client,
} from "@/modules/crm";
import { formatDocumentNumber, nextDocumentNumber } from "@/modules/numbering";
import {
  authorize,
  getMemberSummaries,
  type AuthContext,
} from "@/modules/organizations";
import { failure, type Failure } from "@/shared/errors";
import {
  acceptedCurrencies,
  currencyDecimals,
  MAX_AMOUNT,
  moneyFromDatabase,
  moneyToDatabase,
  type Money,
} from "@/shared/money";
import {
  getSaleForReceipt,
  listClientSalesForAccount,
  type SaleForReceipt,
} from "@/modules/sales";
import type { DbTransaction } from "@/shared/db";
import {
  imputeAccount,
  outstandingOf,
  standaloneSale,
  type AccountReceipt,
} from "./imputation";
import * as repository from "./repository";
import {
  computeCashTotals,
  parseCashAmount,
  type CashAmountRejection,
  type CashTotals,
} from "./totals";

// Casos de uso de los medios de pago y de la caja del efectivo (ADR 0022, puntos 4, 8, 10 y 12;
// brief-21.2) y, desde la 21.3, del cobro de una venta (brief-21.3). cash es dueño de la regla: abre
// la transacción, toma primero el bloqueo de cobros de la organización y se la pasa a sales (la
// venta, para leer), a crm (el cliente en modo compartido), a numbering y a audit. Desde la 21.3
// depende de sales y de crm, sin bloquear ninguna venta; ningún módulo depende de cash.
//
// El orden de cada escritura (brief-21.2, D-7; brief-21.3, D-3): el bloqueo, el cliente si lo hay,
// las lecturas que deciden, el contador, los INSERT o el UPDATE y la auditoría. Las claves foráneas
// del autor toman FOR KEY SHARE sobre users al insertar, como en todas las tablas con autor
// (brief-20.4, H-6): no hace falta un bloqueo nuevo. El pedido del orden del ADR llega con la 21.4.

const idSchema = z.uuid();

// Escrituras de admin, lecturas de los dos roles (ADR 0022, punto 12).

type SessionRef = { id: string; number: number; displayNumber: string };

export function formatCashSessionNumber(value: number): string {
  return formatDocumentNumber("cash_session", value);
}

function sessionRef(row: { id: string; number: number }): SessionRef {
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

function ruleFailure<R extends string>(
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

async function readTotals(
  tx: DbTransaction,
  organizationId: string,
  sessionId: string,
): Promise<CashTotals[]> {
  const [opening, receipts, movements] = await Promise.all([
    repository.findOpeningAmounts(organizationId, [sessionId], tx),
    repository.findSessionReceipts(organizationId, sessionId, tx),
    repository.findMovements(organizationId, sessionId, tx),
  ]);
  return computeCashTotals({ opening, receipts, movements });
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
  | { ok: true; session: SessionRef; rows: CashClosingPreviewRow[] }
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
  const [opening, receipts, movements] = await Promise.all([
    repository.findOpeningAmounts(organizationId, [session.id]),
    repository.findSessionReceipts(organizationId, session.id),
    repository.findMovements(organizationId, session.id),
  ]);
  const plan = planClosing(
    computeCashTotals({ opening, receipts, movements }),
    read.counted,
  );
  if (!plan.ok) return rowsFailure("missing", [], plan.missing);
  return {
    ok: true,
    session: sessionRef(session),
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
  // Los cobros en efectivo de la sesión, con su número (brief-21.3, D-5).
  receipts: ReceiptListItem[];
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

async function memberNames(
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
  organizationId: string,
  session: repository.SessionRow,
): Promise<CashSessionDetail> {
  const [opening, receipts, movements, closing] = await Promise.all([
    repository.findOpeningAmounts(organizationId, [session.id]),
    repository.findSessionReceipts(organizationId, session.id),
    repository.findMovements(organizationId, session.id),
    session.closedAt === null
      ? Promise.resolve([])
      : repository.findClosingAmounts(organizationId, [session.id]),
  ]);
  const totals = computeCashTotals({ opening, receipts, movements });
  const closingOf = new Map(closing.map((row) => [row.currency, row]));
  // Una moneda que apareció al contar no tiene inicial ni movimientos: su fila sale del cierre.
  for (const row of closing) {
    if (!totals.some((totals) => totals.currency === row.currency)) {
      totals.push({
        currency: row.currency,
        initial: 0n,
        receipts: 0n,
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
    open: await sessionDetail(context.organizationId, last),
    last: null,
  };
}

// Lo que propone el formulario de apertura (D-3): lo contado en el último cierre, por moneda. Sin
// cierre anterior, nada: el ADR 0019 no le da a la organización una moneda por defecto.
// Un monto de la base como se escribe en el formulario: con los decimales de la moneda, para que
// la apertura acepte lo que ella misma propone (revisión independiente, R-2). En una moneda sin
// decimales, «7400.00» sería un separador rechazado.
function amountForInput(value: string, currency: string): string {
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
  if (!last) return { ok: true, open: null, proposal: [] };
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
    session: await sessionDetail(context.organizationId, session),
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

// El cobro de una venta (ADR 0022, puntos 2 a 4, 6 y 9; brief-21.3, D-2 a D-10).

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

function toAccountReceipt(row: repository.ReceiptRow): AccountReceipt {
  if (row.target !== "sale" || row.saleId === null) {
    throw new Error(`cobro ${row.id} sin la venta de su destino`);
  }
  return {
    target: "sale",
    saleId: row.saleId,
    currency: row.currency,
    amount: moneyFromDatabase(row.amount),
  };
}

const sumAmounts = (rows: repository.ReceiptRow[]): Money =>
  rows.reduce((sum, row) => sum + moneyFromDatabase(row.amount), 0n);

// Dónde está una venta respecto de sus cobros, con la regla de imputación (D-2). Con cliente, lo que
// falta sale de la cuenta entera del cliente; sin cliente, de su total menos sus cobros (punto 3).
// Una venta anulada no debe nada: lo cobrado pasa a la cuenta del cliente o queda a devolver
// (punto 6). Lee con la transacción que recibe: en el cobro, con el bloqueo de cobros tomado.
type SaleStanding = {
  receipts: repository.ReceiptRow[];
  // Lo cobrado contra esta venta.
  collected: Money;
  // Lo que recibió del remanente de la cuenta del cliente (paso 3 del punto 9).
  imputed: Money;
  outstanding: Money;
  // De una venta anulada: con cliente, lo que pasó a su cuenta; sin cliente, lo que queda a devolver.
  toAccount: Money;
  toRefund: Money;
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
  const collected = sumAmounts(receipts);
  if (sale.clientId === null) {
    const standing = standaloneSale({
      total: moneyFromDatabase(sale.total),
      collected,
      voided: sale.voided,
    });
    return {
      receipts,
      collected,
      imputed: 0n,
      outstanding: standing.outstanding,
      toAccount: 0n,
      toRefund: standing.toRefund,
    };
  }
  if (sale.voided) {
    return {
      receipts,
      collected,
      imputed: 0n,
      outstanding: 0n,
      toAccount: collected,
      toRefund: 0n,
    };
  }
  // Una tras otra: las dos van por la conexión de la transacción.
  const sales = await listClientSalesForAccount(
    tx,
    organizationId,
    sale.clientId,
  );
  const clientReceipts = await repository.findClientReceipts(
    organizationId,
    sale.clientId,
    tx,
  );
  const accounts = imputeAccount({
    sales: sales.map((row) => ({
      id: row.id,
      number: row.number,
      currency: row.currency,
      total: moneyFromDatabase(row.total),
      issuedAt: row.createdAt,
      voided: row.voided,
    })),
    receipts: clientReceipts.map(toAccountReceipt),
    // Las devoluciones llegan con la 21.5 (H-6).
    refunds: [],
  });
  const row = outstandingOf(accounts, sale.id);
  if (!row) {
    throw new Error(`la venta ${sale.id} no está en la cuenta de su cliente`);
  }
  return {
    receipts,
    collected,
    imputed: row.imputed,
    outstanding: row.outstanding,
    toAccount: 0n,
    toRefund: 0n,
  };
}

export type ReceiptField = "paymentMethod" | "amount";

export type CreateSaleReceiptResult =
  | { ok: true; receipt: ReceiptRef }
  | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
  | Failure<"NOT_FOUND", { entity: "sale" | "payment_method" }>
  | Failure<
      "VALIDATION_ERROR",
      {
        fields: ReceiptField[];
        amount?: CashAmountRejection | "required" | "limit";
      }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "sale_voided" }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "payment_method_inactive" }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "no_open_session" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "exceeds_outstanding"; currency: string; outstanding: string }
    >;

// El cobro (D-3), solo de admin, en READ COMMITTED:
//
// 1. el bloqueo de cobros de la organización;
// 2. la venta, por sales; si tiene cliente, su ficha en modo compartido por crm, y la venta otra vez,
//    porque pudo anularse mientras se esperaba al cliente;
// 3. la comprobación: la venta vigente, el monto en su moneda, el medio activo, la sesión abierta si
//    es efectivo y que el monto no supere lo que falta, con la regla de imputación;
// 4. al final, el contador, el cobro y la auditoría.
//
// La sesión no viaja en el formulario: el cobro es plata que entra ahora y va a la sesión abierta
// cuando se registra (D-3). Una venta anulada después de leerla, ya con el contador, queda con su
// cobro, y su monto pasa a la cuenta o a devolver (ADR 0022, punto 4; D-10).
export async function createSaleReceipt(
  context: AuthContext,
  input: { saleId: string; paymentMethodId: string; amount: string },
): Promise<CreateSaleReceiptResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(input.saleId).success) {
    return failure("VALIDATION_ERROR");
  }
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

      const parsed = parseCashAmount(amountText, sale.currency, {
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
      const method = await repository.findPaymentMethod(
        organizationId,
        methodId,
        tx,
      );
      if (!method) {
        return { ok: false, code: "NOT_FOUND", entity: "payment_method" };
      }
      if (!method.isActive) return ruleFailure("payment_method_inactive");
      let sessionId: string | null = null;
      let sessionNumber: number | null = null;
      if (method.isCash) {
        const last = await repository.findLastSession(organizationId, tx);
        if (!last || last.closedAt !== null) {
          return ruleFailure("no_open_session");
        }
        sessionId = last.id;
        sessionNumber = last.number;
      }
      const standing = await saleStanding(tx, organizationId, sale);
      if (parsed.amount > standing.outstanding) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "exceeds_outstanding",
          currency: sale.currency,
          outstanding: moneyToDatabase(standing.outstanding),
        };
      }
      // Como el aporte: lo esperado de la sesión tiene que seguir cabiendo en numeric(14, 2), o la
      // sesión no se podría cerrar.
      if (sessionId !== null) {
        const totals = await readTotals(tx, organizationId, sessionId);
        const expected =
          totals.find((row) => row.currency === sale.currency)?.expected ?? 0n;
        if (expected + parsed.amount > MAX_AMOUNT) {
          return {
            ok: false,
            code: "VALIDATION_ERROR",
            fields: ["amount"],
            amount: "limit",
          };
        }
      }

      const number = await nextDocumentNumber(tx, organizationId, "receipt");
      const receipt = await repository.insertReceipt(tx, {
        organizationId,
        number,
        target: "sale",
        saleId: sale.id,
        // La copia del cliente y de la moneda de la venta (punto 2).
        clientId: sale.clientId,
        paymentMethodId: method.id,
        sessionId,
        currency: sale.currency,
        amount: moneyToDatabase(parsed.amount),
        createdBy: userId,
      });
      // Claves planas, sin datos de una persona (D-7).
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "receipt",
        entityId: receipt.id,
        action: "create",
        diff: {
          before: null,
          after: {
            number: receipt.number,
            sale_number: sale.number,
            payment_method: method.name,
            currency: receipt.currency,
            amount: receipt.amount,
            ...(sessionNumber === null
              ? {}
              : { session_number: sessionNumber }),
          },
        },
      });
      return { ok: true, receipt: receiptRef(receipt) };
    },
  );
}

// Lecturas de los cobros: admin y viewer (ADR 0022, punto 12). La venta se lee por sales, el cliente
// por crm, ya resuelto para el rol, y el medio y la sesión acá.

export type ReceiptListItem = ReceiptRef & {
  createdAt: Date;
  sale: { id: string; displayNumber: string } | null;
  paymentMethodName: string;
  isCash: boolean;
  currency: string;
  amount: string;
};

async function methodsById(organizationId: string) {
  return new Map(
    (await repository.findPaymentMethods(organizationId)).map((method) => [
      method.id,
      method,
    ]),
  );
}

// Las ventas de unos cobros, por sales: una lectura por venta, con la transacción que piden sus
// lecturas (D-4). Una página tiene a lo sumo CASH_RECEIPTS_PAGE_SIZE cobros.
async function salesById(
  organizationId: string,
  saleIds: (string | null)[],
): Promise<Map<string, SaleForReceipt>> {
  const ids = [...new Set(saleIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  return repository.withTransaction(async (tx) => {
    const found = new Map<string, SaleForReceipt>();
    for (const id of ids) {
      const sale = await getSaleForReceipt(tx, organizationId, id);
      if (sale) found.set(id, sale);
    }
    return found;
  });
}

async function receiptListItems(
  organizationId: string,
  rows: repository.ReceiptRow[],
): Promise<ReceiptListItem[]> {
  if (rows.length === 0) return [];
  const [methods, sales] = await Promise.all([
    methodsById(organizationId),
    salesById(
      organizationId,
      rows.map((row) => row.saleId),
    ),
  ]);
  return rows.map((row) => {
    const method = methods.get(row.paymentMethodId);
    const sale = row.saleId === null ? undefined : sales.get(row.saleId);
    return {
      ...receiptRef(row),
      createdAt: row.createdAt,
      sale: sale ? { id: sale.id, displayNumber: sale.displayNumber } : null,
      paymentMethodName: method?.name ?? "",
      isCash: method?.isCash ?? false,
      currency: row.currency,
      amount: row.amount,
    };
  });
}

export type SaleReceipts = {
  currency: string;
  total: string;
  // Lo cobrado contra esta venta y, con cliente, lo imputado desde su cuenta.
  collected: string;
  imputed: string;
  outstanding: string;
  // Lo que se muestra en lugar de lo que falta (D-8).
  status: "pending" | "collected" | "voided";
  hasClient: boolean;
  // De una venta anulada: con cliente, lo que pasó a su cuenta; sin cliente, lo que queda a devolver.
  toAccount: string;
  toRefund: string;
  receipts: ReceiptListItem[];
};

async function readSaleStanding(organizationId: string, saleId: string) {
  return repository.withTransaction(async (tx) => {
    const sale = await getSaleForReceipt(tx, organizationId, saleId);
    if (!sale) return null;
    return { sale, standing: await saleStanding(tx, organizationId, sale) };
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
  const { sale, standing } = found;
  return {
    ok: true,
    sale: {
      currency: sale.currency,
      total: sale.total,
      collected: moneyToDatabase(standing.collected),
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
        standing.receipts,
      ),
    },
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

export type ReceiptDetail = ReceiptListItem & {
  // El cliente como lo entrega crm para el rol; null en una venta sin cliente («Consumidor final»).
  client: Client | null;
  clientId: string | null;
  session: SessionRef | null;
  createdByName: string | null;
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
    memberNames(organizationId, [row.createdBy]),
  ]);
  return {
    ok: true,
    receipt: {
      ...items[0]!,
      client: clients.ok ? (clients.clients[0] ?? null) : null,
      clientId: row.clientId,
      session: session ? sessionRef(session) : null,
      createdByName: names.get(row.createdBy) ?? null,
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
