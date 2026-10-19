import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import { nextDocumentNumber } from "@/modules/numbering";
import {
  getGoodsReceiptForPayment,
  listSupplierGoodsReceiptsForAccount,
  lockSupplierForPayment,
  type GoodsReceiptForPayment,
} from "@/modules/purchasing";
import { getExchangeSetup } from "@/modules/fx";
import { authorize, type AuthContext } from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  acceptedCurrencies,
  moneyFromDatabase,
  moneyToDatabase,
  type Money,
} from "@/shared/money";
import {
  imputeAccount,
  outstandingOf,
  type AccountInput,
  type CurrencyAccount,
} from "./imputation";
import * as repository from "./repository";
import {
  amountForInput,
  exchangeOffer,
  impactedSession,
  memberNames,
  outgoingShortfall,
  readPayment,
  readReceiptFields,
  returnExceedsLimit,
  ruleFailure,
  sessionRef,
  type ExchangeOffer,
  type InsufficientCash,
  type PaymentMethod,
  type ReceiptField,
  type ReceiptPaymentFailure,
  type SessionRef,
} from "./service";
import * as paymentRepository from "./supplier-payment-repository";
import {
  accountReceiptCurrencies,
  copiedTender,
  fitToOutstanding,
  tenderAudit,
  tenderColumns,
  type TenderInput,
} from "./tender";
import {
  formatSupplierPaymentNumber,
  formatSupplierPaymentVoidNumber,
  supplierPaymentListItems,
  type DocumentRef,
  type SupplierPaymentListItem,
} from "./supplier-payment-views";

// Los pagos a proveedores (ADR 0023, puntos 8 a 12; brief-22.6). Viven en cash: el pago en efectivo
// sale de la sesión de caja, y lo esperado lo calcula cash. Solo un admin los lee y los escribe
// (punto 12). cash es dueño de la regla: abre la transacción, toma primero el bloqueo de cobros y se la
// pasa a purchasing (el proveedor en modo compartido y las recepciones, para leer), a numbering y a
// audit. purchasing no depende de cash y nunca toma el bloqueo de cobros (punto 11; D-5).
//
// El orden de cada escritura (ADR 0022, punto 4; D-7 y D-8): el bloqueo, el proveedor si el pago lo
// toma por su clave foránea, las lecturas que deciden, el contador, el INSERT y la auditoría. Los
// rechazos van antes del contador y no escriben nada, como en los cobros.

const idSchema = z.uuid();

export const SUPPLIER_PAYMENTS_PAGE_SIZE = 25;

export const SUPPLIER_PAYMENT_VOID_REASONS: readonly paymentRepository.SupplierPaymentVoidReason[] =
  ["not_paid", "wrong_method", "wrong_amount", "wrong_target", "other"];

export type SupplierPaymentVoidReason =
  paymentRepository.SupplierPaymentVoidReason;

export { formatSupplierPaymentNumber, formatSupplierPaymentVoidNumber };
export type { SupplierPaymentListItem };

export type SupplierPaymentRef = DocumentRef & { number: number };

function paymentRef(row: { id: string; number: number }): SupplierPaymentRef {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatSupplierPaymentNumber(row.number),
  };
}

function voidRef(row: { id: string; number: number }): SupplierPaymentRef {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatSupplierPaymentVoidNumber(row.number),
  };
}

// El número como lo escribe quien busca: «PP-000012», «pp12», «APP-000003» o solo los dígitos, que
// buscan un pago (D-13).
export function parseSupplierPaymentNumberSearch(
  text: string,
): { kind: "payment" | "void"; value: number } | null {
  const match = /^(app|pp)?-?0*(\d{1,15})$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[2]!);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return {
    kind: match[1]?.toLowerCase() === "app" ? "void" : "payment",
    value,
  };
}

// La cuenta del proveedor (ADR 0023, punto 9; brief-22.6, D-6), con imputeAccount y sin cambiar la
// regla: cada recepción va como una venta, cada pago contra una recepción como un cobro contra una
// venta y cada pago a cuenta como un cobro a cuenta. No hay señas ni devoluciones de proveedores. Una
// sola función la arma para el tope del pago, la vista previa y lo pagado de una recepción, para que
// no puedan contradecirse (H-6). Lee con la transacción que recibe: en el pago, con el bloqueo de
// cobros tomado.
export type SupplierLedger = {
  // Sus recepciones, anuladas incluidas.
  receipts: GoodsReceiptForPayment[];
  // Todos sus pagos, anulados incluidos.
  payments: paymentRepository.SupplierPaymentRow[];
  // La entrada de la regla, sin los pagos anulados.
  input: AccountInput;
  accounts: CurrencyAccount[];
};

export function supplierAccountInput(
  receipts: GoodsReceiptForPayment[],
  payments: paymentRepository.SupplierPaymentRow[],
): AccountInput {
  return {
    sales: receipts.map((receipt) => ({
      id: receipt.id,
      number: receipt.number,
      currency: receipt.currency,
      total: moneyFromDatabase(receipt.total),
      issuedAt: receipt.createdAt,
      voided: receipt.voided,
    })),
    receipts: payments
      .filter((payment) => payment.voided === null)
      .map((payment) => {
        const amount = moneyFromDatabase(payment.amount);
        if (payment.target === "goods_receipt") {
          if (payment.goodsReceiptId === null) {
            throw new Error(`el pago ${payment.id} no tiene su recepción`);
          }
          return {
            target: "sale" as const,
            saleId: payment.goodsReceiptId,
            currency: payment.currency,
            amount,
          };
        }
        return {
          target: "account" as const,
          currency: payment.currency,
          amount,
        };
      }),
    refunds: [],
  };
}

export async function supplierLedger(
  tx: DbTransaction,
  organizationId: string,
  supplierId: string,
): Promise<SupplierLedger> {
  // Una tras otra: van por la conexión de la transacción.
  const receipts = await listSupplierGoodsReceiptsForAccount(
    tx,
    organizationId,
    supplierId,
  );
  const payments = await paymentRepository.findSupplierPayments(
    organizationId,
    supplierId,
    tx,
  );
  const input = supplierAccountInput(receipts, payments);
  return { receipts, payments, input, accounts: imputeAccount(input) };
}

// Dónde está una recepción respecto de sus pagos (D-6). Vigente: lo pagado directo, lo imputado desde
// la cuenta y lo que falta. Anulada: no debe nada, y lo pagado contra ella pasó a la cuenta.
export type ReceiptStanding = {
  // Lo pagado contra esta recepción, vigente.
  paid: Money;
  imputed: Money;
  outstanding: Money;
  toAccount: Money;
};

export function receiptStanding(
  ledger: SupplierLedger,
  receipt: GoodsReceiptForPayment,
): ReceiptStanding {
  const paid = ledger.payments
    .filter(
      (payment) =>
        payment.voided === null && payment.goodsReceiptId === receipt.id,
    )
    .reduce((sum, payment) => sum + moneyFromDatabase(payment.amount), 0n);
  if (receipt.voided) {
    return { paid, imputed: 0n, outstanding: 0n, toAccount: paid };
  }
  const row = outstandingOf(ledger.accounts, receipt.id);
  if (!row) {
    throw new Error(
      `la recepción ${receipt.id} no está en la cuenta de su proveedor`,
    );
  }
  return {
    paid,
    imputed: row.imputed,
    outstanding: row.outstanding,
    toAccount: 0n,
  };
}

// El pago (D-7).

export type SupplierPaymentField = ReceiptField | "currency" | "target";

type SupplierPaymentFieldsFailure = Failure<
  "VALIDATION_ERROR",
  {
    fields: SupplierPaymentField[];
    amount?: string;
  }
>;

type ExceedsOutstanding = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "exceeds_outstanding"; currency: string; outstanding: string }
>;

export type CreateSupplierPaymentResult =
  | { ok: true; payment: SupplierPaymentRef }
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR">
  | SupplierPaymentFieldsFailure
  | Failure<"NOT_FOUND", { entity: "goods_receipt" | "supplier" }>
  | ReceiptPaymentFailure
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "goods_receipt_voided" }>
  | ExceedsOutstanding
  | InsufficientCash;

export type SupplierPaymentInput = {
  target: string;
  goodsReceiptId?: string;
  supplierId?: string;
  // Solo en un pago a cuenta: la de una recepción es la suya.
  currency?: string;
  paymentMethodId: string;
  amount: string;
} & TenderInput;

const targetSchema = z.enum(["goods_receipt", "account"]);

type ReadInput =
  | {
      ok: true;
      target: "goods_receipt";
      goodsReceiptId: string;
      fields: { methodId: string; amountText: string };
    }
  | {
      ok: true;
      target: "account";
      supplierId: string;
      currency: string;
      fields: { methodId: string; amountText: string };
    };

function readInput(
  input: SupplierPaymentInput,
): ReadInput | Failure<"VALIDATION_ERROR"> | SupplierPaymentFieldsFailure {
  const target = targetSchema.safeParse(input.target);
  if (!target.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["target"] };
  }
  const targetId =
    target.data === "goods_receipt" ? input.goodsReceiptId : input.supplierId;
  if (!targetId || !idSchema.safeParse(targetId).success) {
    return failure("VALIDATION_ERROR");
  }
  const currency = (input.currency ?? "").trim().toUpperCase();
  const currencyOk =
    target.data === "goods_receipt" || acceptedCurrencies().includes(currency);
  const fields = readReceiptFields(input);
  if (!fields.ok || !currencyOk) {
    const issues: SupplierPaymentField[] = fields.ok ? [] : [...fields.fields];
    if (!currencyOk) issues.push("currency");
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: issues,
      ...(!fields.ok && fields.amount ? { amount: fields.amount } : {}),
    };
  }
  const id = targetId.toLowerCase();
  return target.data === "goods_receipt"
    ? { ok: true, target: "goods_receipt", goodsReceiptId: id, fields }
    : { ok: true, target: "account", supplierId: id, currency, fields };
}

// El pago, solo de admin, en READ COMMITTED (D-7):
//
// 1. el bloqueo de cobros de la organización;
// 2. con una recepción, la recepción por purchasing; el proveedor, de la recepción o de la cuenta, en
//    modo compartido: el INSERT lo toma por su clave foránea (ADR 0021, punto 7). Un proveedor
//    desactivado se paga (ADR 0023, punto 2);
// 3. la comprobación, con los bloqueos tomados: la recepción vigente, releída después del proveedor;
//    el medio activo y la sesión abierta si es efectivo; con una recepción, que no supere lo que falta,
//    con la regla de imputación; en efectivo, que lo esperado alcance;
// 4. al final, el contador, el pago y la auditoría.
//
// Una recepción que se anula después de leerla, sin el bloqueo de cobros, queda con su pago, y su
// monto pasa al remanente de la cuenta del proveedor (punto 10): no se pierde ni se cuenta dos veces.
export async function createSupplierPayment(
  context: AuthContext,
  input: SupplierPaymentInput,
): Promise<CreateSupplierPaymentResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const read = readInput(input);
  if (!read.ok) return read;
  const { organizationId, userId } = context;

  return repository.withTransaction(
    async (tx): Promise<CreateSupplierPaymentResult> => {
      await repository.lockCash(tx, organizationId);
      let receipt: GoodsReceiptForPayment | null = null;
      let supplierId: string;
      let currency: string;
      if (read.target === "goods_receipt") {
        const found = await getGoodsReceiptForPayment(
          tx,
          organizationId,
          read.goodsReceiptId,
        );
        if (!found) {
          return { ok: false, code: "NOT_FOUND", entity: "goods_receipt" };
        }
        const status = await lockSupplierForPayment(
          tx,
          organizationId,
          found.supplierId,
        );
        if (status === "not_found") {
          throw new Error(`la recepción ${found.id} no tiene su proveedor`);
        }
        // Releída con el proveedor tomado: pudo anularse mientras se esperaba.
        receipt = await getGoodsReceiptForPayment(tx, organizationId, found.id);
        if (!receipt) {
          throw new Error("la recepción desapareció con el bloqueo tomado");
        }
        if (receipt.voided) return ruleFailure("goods_receipt_voided");
        supplierId = receipt.supplierId;
        currency = receipt.currency;
      } else {
        const status = await lockSupplierForPayment(
          tx,
          organizationId,
          read.supplierId,
        );
        if (status === "not_found") {
          return { ok: false, code: "NOT_FOUND", entity: "supplier" };
        }
        supplierId = read.supplierId;
        currency = read.currency;
        // Con moneda principal, la moneda aplicada a cuenta es la principal, o una en la que el
        // proveedor tenga un saldo pendiente o a favor, como el cobro a cuenta (ADR 0025, punto 5,
        // R-M2; brief-29.4.3, D-4, H-3). Sin moneda principal, cualquiera de las aceptadas, como siempre.
        const setup = await getExchangeSetup(organizationId, tx);
        if (setup) {
          const { accounts } = await supplierLedger(
            tx,
            organizationId,
            supplierId,
          );
          if (!accountReceiptCurrencies(setup, accounts).includes(currency)) {
            return {
              ok: false,
              code: "VALIDATION_ERROR",
              fields: ["currency"],
            };
          }
        }
      }

      // Desde la 29.4.3, lo que sale puede ir en la otra moneda de la organización, contra un destino
      // en la principal, con la vigente o una acordada (ADR 0025, punto 5; brief-29.4.3, D-4).
      const paid = await readPayment(
        tx,
        organizationId,
        read.fields,
        currency,
        input,
      );
      if (!paid.ok) return paid;
      let payment = paid.payment;
      if (receipt !== null) {
        const ledger = await supplierLedger(tx, organizationId, supplierId);
        const standing = receiptStanding(ledger, receipt);
        // El tope con lo aplicado, y la tolerancia de un centavo si salió en otra moneda (R-M4).
        const fit = fitToOutstanding(
          payment.amount,
          standing.outstanding,
          currency,
          payment.tender !== null,
        );
        if (!fit.ok) {
          return {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "exceeds_outstanding",
            currency,
            outstanding: moneyToDatabase(
              standing.outstanding > 0n ? standing.outstanding : 0n,
            ),
          };
        }
        payment = { ...payment, amount: fit.applied };
      }
      // Sale de la caja lo que salió: en la otra moneda, si fue en ella (brief-29.4.3, D-5).
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
        "supplier_payment",
      );
      const row = await paymentRepository.insertSupplierPayment(tx, {
        organizationId,
        number,
        destination:
          receipt !== null
            ? { target: "goods_receipt", goodsReceiptId: receipt.id }
            : { target: "account" },
        // La copia del proveedor de la recepción, o el de la cuenta (punto 8).
        supplierId,
        paymentMethodId: payment.method.id,
        sessionId: payment.session?.id ?? null,
        currency,
        amount: moneyToDatabase(payment.amount),
        tender: tenderColumns(payment.tender),
        createdBy: userId,
      });
      // Claves planas, sin datos del proveedor (D-11).
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "supplier_payment",
        entityId: row.id,
        action: "create",
        diff: {
          before: null,
          after: {
            number: row.number,
            ...(receipt !== null
              ? { goods_receipt_number: receipt.number }
              : { target: "account", supplier_id: supplierId }),
            payment_method: payment.method.name,
            currency: row.currency,
            amount: row.amount,
            // Lo que salió en otra moneda y la cotización usada (brief-29.4.3, D-4).
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

// La anulación (D-8).

type AlreadyVoided = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "already_voided"; void: SupplierPaymentRef }
>;

export type VoidSupplierPaymentResult =
  | { ok: true; payment: SupplierPaymentRef; paymentVoid: SupplierPaymentRef }
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: "reason"[] }>
  | Failure<"VALIDATION_ERROR", { fields: "amount"[]; amount: "limit" }>
  | Failure<"NOT_FOUND", { entity: "supplier_payment" }>
  | AlreadyVoided;

function alreadyVoided(row: { id: string; number: number }): AlreadyVoided {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "already_voided",
    void: voidRef(row),
  };
}

// La anulación de un pago, solo de admin, en READ COMMITTED, como la de una devolución (D-8):
//
// 1. el bloqueo de cobros de la organización;
// 2. el pago y su anulación, si la tiene, leídos con el bloqueo tomado;
// 3. la sesión en la que impacta: la del pago si sigue abierta, o ninguna. Con sesión, lo esperado
//    más el monto tiene que caber en numeric(14, 2), como un aporte;
// 4. al final, el contador, la anulación y la auditoría.
//
// Sin comprobación de la cuenta (H-7): un proveedor no tiene devoluciones, y anular un pago solo
// agranda lo que falta pagar. No bloquea al proveedor: la anulación no lo referencia.
export async function voidSupplierPayment(
  context: AuthContext,
  input: { paymentId: string; reason: string },
): Promise<VoidSupplierPaymentResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(input.paymentId).success) {
    return failure("VALIDATION_ERROR");
  }
  const reason = SUPPLIER_PAYMENT_VOID_REASONS.find(
    (value) => value === input.reason,
  );
  if (!reason) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["reason"] };
  }
  const { organizationId, userId } = context;
  const paymentId = input.paymentId.toLowerCase();

  try {
    return await repository.withTransaction(
      async (tx): Promise<VoidSupplierPaymentResult> => {
        await repository.lockCash(tx, organizationId);
        const payment = await paymentRepository.findSupplierPayment(
          organizationId,
          paymentId,
          tx,
        );
        if (!payment) {
          return { ok: false, code: "NOT_FOUND", entity: "supplier_payment" };
        }
        if (payment.voided) return alreadyVoided(payment.voided);
        const session = await impactedSession(
          tx,
          organizationId,
          payment.sessionId,
        );
        // Vuelve a la caja lo que salió, en su moneda (brief-29.4.3, D-4).
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
          "supplier_payment_void",
        );
        const row = await paymentRepository.insertSupplierPaymentVoid(tx, {
          organizationId,
          number,
          supplierPaymentId: payment.id,
          // La copia del pago (D-3), con lo que salió (brief-29.4.3, D-2).
          currency: payment.currency,
          amount: payment.amount,
          tender: copiedTender(payment),
          reason,
          sessionId: session?.id ?? null,
          createdBy: userId,
        });
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "supplier_payment",
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
    // La última defensa (D-8): una anulación doble que llegó hasta la base.
    if (!paymentRepository.isSupplierPaymentAlreadyVoided(error)) throw error;
    const payment = await paymentRepository.findSupplierPayment(
      organizationId,
      paymentId,
    );
    if (!payment?.voided) throw error;
    return alreadyVoided(payment.voided);
  }
}

// Las lecturas, solo de admin (punto 12).

export type SupplierPaymentDetail = SupplierPaymentListItem & {
  createdByName: string | null;
  // La sesión de un pago en efectivo.
  session: (SessionRef & { open: boolean }) | null;
  // De su anulación: el autor y la sesión en la que impactó.
  voidedByName: string | null;
  voidSession: SessionRef | null;
};

export async function getSupplierPayment(
  context: AuthContext,
  paymentId: string,
): Promise<
  | { ok: true; payment: SupplierPaymentDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(paymentId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const row = await paymentRepository.findSupplierPayment(
    organizationId,
    paymentId.toLowerCase(),
  );
  if (!row) return failure("NOT_FOUND");
  const sessionIds = [row.sessionId, row.voided?.sessionId ?? null];
  const [items, names, sessions] = await Promise.all([
    supplierPaymentListItems(organizationId, [row]),
    memberNames(organizationId, [row.createdBy, row.voided?.createdBy ?? null]),
    Promise.all(
      sessionIds.map((id) =>
        id === null
          ? Promise.resolve(undefined)
          : repository.findSession(organizationId, id),
      ),
    ),
  ]);
  const [session, voidSession] = sessions;
  return {
    ok: true,
    payment: {
      ...items[0]!,
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

export type SupplierPaymentStatusFilter = "all" | "current" | "voided";

export type SupplierPaymentPage = {
  items: SupplierPaymentListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listSupplierPayments(
  context: AuthContext,
  query: {
    status: SupplierPaymentStatusFilter;
    supplierId: string | null;
    search: string;
    page: number;
  },
): Promise<{ ok: true; payments: SupplierPaymentPage } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const { organizationId } = context;
  const search = query.search.trim();
  const number =
    search === "" ? null : parseSupplierPaymentNumberSearch(search);
  const page =
    Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1;
  const supplierId =
    query.supplierId !== null && idSchema.safeParse(query.supplierId).success
      ? query.supplierId.toLowerCase()
      : null;
  // Un texto que no es un número no encuentra nada.
  if (search !== "" && number === null) {
    return {
      ok: true,
      payments: {
        items: [],
        total: 0,
        page,
        pageSize: SUPPLIER_PAYMENTS_PAGE_SIZE,
      },
    };
  }
  const listQuery: paymentRepository.SupplierPaymentListQuery = {
    organizationId,
    status: query.status,
    supplierId,
    number,
  };
  const [total, rows] = await Promise.all([
    paymentRepository.countSupplierPayments(listQuery),
    paymentRepository.findSupplierPaymentsPage(
      listQuery,
      SUPPLIER_PAYMENTS_PAGE_SIZE,
      (page - 1) * SUPPLIER_PAYMENTS_PAGE_SIZE,
    ),
  ]);
  return {
    ok: true,
    payments: {
      items: await supplierPaymentListItems(organizationId, rows),
      total,
      page,
      pageSize: SUPPLIER_PAYMENTS_PAGE_SIZE,
    },
  };
}

// Lo pagado de una recepción, para su detalle (D-13): lo compone la página, nunca purchasing.
export type GoodsReceiptPayments = {
  currency: string;
  total: string;
  voided: boolean;
  paid: string;
  imputed: string;
  outstanding: string;
  // De una anulada: lo pagado contra ella, que pasó a la cuenta del proveedor.
  toAccount: string;
  // Todos sus pagos, anulados incluidos.
  payments: SupplierPaymentListItem[];
};

export async function getGoodsReceiptPayments(
  context: AuthContext,
  goodsReceiptId: string,
): Promise<
  | { ok: true; standing: GoodsReceiptPayments }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(goodsReceiptId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  // Una sola foto (brief-22.7, D-6): sin el bloqueo de cobros, un pago confirmado entre dos lecturas
  // podría apuntar a una recepción que la primera no vio.
  const result = await repository.withSnapshot(async (tx) => {
    const receipt = await getGoodsReceiptForPayment(
      tx,
      organizationId,
      goodsReceiptId,
    );
    if (!receipt) return null;
    const ledger = await supplierLedger(tx, organizationId, receipt.supplierId);
    return { receipt, ledger };
  });
  if (!result) return failure("NOT_FOUND");
  const { receipt, ledger } = result;
  const standing = receiptStanding(ledger, receipt);
  const rows = ledger.payments.filter(
    (payment) => payment.goodsReceiptId === receipt.id,
  );
  return {
    ok: true,
    standing: {
      currency: receipt.currency,
      total: receipt.total,
      voided: receipt.voided,
      paid: moneyToDatabase(standing.paid),
      imputed: moneyToDatabase(standing.imputed),
      outstanding: moneyToDatabase(standing.outstanding),
      toAccount: moneyToDatabase(standing.toAccount),
      payments: await supplierPaymentListItems(organizationId, rows),
    },
  };
}

// Lo que necesitan los dos formularios del pago (D-13): los medios activos y la sesión abierta.
type FormBase = {
  paymentMethods: PaymentMethod[];
  openSession: SessionRef | null;
};

async function formBase(organizationId: string): Promise<FormBase> {
  const [methods, last] = await Promise.all([
    repository.findPaymentMethods(organizationId),
    repository.findLastSession(organizationId),
  ]);
  return {
    paymentMethods: methods.filter((method) => method.isActive),
    openSession: last && last.closedAt === null ? sessionRef(last) : null,
  };
}

export type GoodsReceiptPaymentForm = FormBase & {
  receipt: {
    id: string;
    displayNumber: string;
    supplierId: string;
    currency: string;
    total: string;
    voided: boolean;
  };
  paid: string;
  imputed: string;
  outstanding: string;
  // Lo que falta, como se escribe en el campo: con los decimales de la moneda.
  outstandingInput: string;
  // Pagar en la otra moneda una recepción en la principal (brief-29.4.3, D-7).
  exchange: ExchangeOffer | null;
};

export async function getGoodsReceiptPaymentForm(
  context: AuthContext,
  goodsReceiptId: string,
): Promise<
  | { ok: true; form: GoodsReceiptPaymentForm }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(goodsReceiptId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  // Una sola foto (brief-22.7, D-6): sin el bloqueo de cobros, un pago confirmado entre dos lecturas
  // podría apuntar a una recepción que la primera no vio.
  const result = await repository.withSnapshot(async (tx) => {
    const receipt = await getGoodsReceiptForPayment(
      tx,
      organizationId,
      goodsReceiptId,
    );
    if (!receipt) return null;
    const ledger = await supplierLedger(tx, organizationId, receipt.supplierId);
    return { receipt, standing: receiptStanding(ledger, receipt) };
  });
  if (!result) return failure("NOT_FOUND");
  const { receipt, standing } = result;
  return {
    ok: true,
    form: {
      ...(await formBase(organizationId)),
      receipt: {
        id: receipt.id,
        displayNumber: receipt.displayNumber,
        supplierId: receipt.supplierId,
        currency: receipt.currency,
        total: receipt.total,
        voided: receipt.voided,
      },
      paid: moneyToDatabase(standing.paid),
      imputed: moneyToDatabase(standing.imputed),
      outstanding: moneyToDatabase(standing.outstanding),
      outstandingInput: amountForInput(
        moneyToDatabase(standing.outstanding),
        receipt.currency,
      ),
      exchange: exchangeOffer(
        await getExchangeSetup(organizationId),
        receipt.currency,
        standing.outstanding,
      ),
    },
  };
}

// Lo que se le debe a un proveedor y lo que está a favor, por moneda, de la misma cuenta (D-13).
export type SupplierCurrencySummary = {
  currency: string;
  owed: string;
  inFavor: string;
  receiptsWithBalance: number;
  oldestOutstandingAt: Date | null;
};

export function summarizeSupplierAccount(
  account: CurrencyAccount,
): SupplierCurrencySummary {
  const withBalance = account.sales.filter((row) => row.outstanding > 0n);
  return {
    currency: account.currency,
    owed: moneyToDatabase(
      withBalance.reduce((sum, row) => sum + row.outstanding, 0n),
    ),
    inFavor: moneyToDatabase(account.inFavor),
    receiptsWithBalance: withBalance.length,
    oldestOutstandingAt: withBalance[0]?.issuedAt ?? null,
  };
}

export type SupplierAccountPaymentForm = FormBase & {
  supplierId: string;
  currencies: SupplierCurrencySummary[];
  // La moneda de la recepción con saldo más vieja, con lo que se debe en ella; si no se le debe nada,
  // ninguna.
  proposed: { currency: string; amount: string; amountInput: string } | null;
  // Con moneda principal, las monedas en las que se puede aplicar un pago a cuenta: la principal y
  // las que tienen saldo (brief-29.4.3, D-4). null sin moneda principal: todas las aceptadas.
  appliedCurrencies: string[] | null;
  mainCurrency: string | null;
  // Pagar en la otra moneda, aplicado en la principal, con lo que se debe en ella (D-7).
  exchange: ExchangeOffer | null;
};

// El formulario del pago a cuenta. Un proveedor que no es de la organización no tiene recepciones ni
// pagos acá: la página lo busca por purchasing y responde «no encontrado».
export async function getSupplierAccountPaymentForm(
  context: AuthContext,
  supplierId: string,
): Promise<
  | { ok: true; form: SupplierAccountPaymentForm }
  | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(supplierId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const id = supplierId.toLowerCase();
  // Una sola foto (brief-22.7, D-6).
  const ledger = await repository.withSnapshot((tx) =>
    supplierLedger(tx, organizationId, id),
  );
  const setup = await getExchangeSetup(organizationId);
  const owedMain = setup
    ? (ledger.accounts
        .find((row) => row.currency === setup.mainCurrency)
        ?.sales.reduce((sum, row) => sum + row.outstanding, 0n) ?? 0n)
    : 0n;
  const currencies = ledger.accounts
    .map(summarizeSupplierAccount)
    .filter((row) => row.owed !== "0.00" || row.inFavor !== "0.00");
  const oldest = currencies
    .filter((row) => row.oldestOutstandingAt !== null)
    .sort(
      (a, b) =>
        a.oldestOutstandingAt!.getTime() - b.oldestOutstandingAt!.getTime(),
    )[0];
  return {
    ok: true,
    form: {
      ...(await formBase(organizationId)),
      supplierId: id,
      currencies,
      proposed: oldest
        ? {
            currency: oldest.currency,
            amount: oldest.owed,
            amountInput: amountForInput(oldest.owed, oldest.currency),
          }
        : null,
      appliedCurrencies: setup
        ? accountReceiptCurrencies(setup, ledger.accounts)
        : null,
      mainCurrency: setup?.mainCurrency ?? null,
      exchange: setup
        ? exchangeOffer(setup, setup.mainCurrency, owedMain)
        : null,
    },
  };
}
