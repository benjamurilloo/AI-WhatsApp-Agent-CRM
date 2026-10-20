import { z } from "zod";
import { getExchangeSetup } from "@/modules/fx";
import {
  getSupplierNames,
  listGoodsReceiptsForAccounts,
} from "@/modules/purchasing";
import { authorize, type AuthContext } from "@/modules/organizations";
import { listTechnicianChargesForAccounts } from "@/modules/service";
import { failure, type Failure } from "@/shared/errors";
import { moneyFromDatabase, moneyToDatabase, type Money } from "@/shared/money";
import { imputeAccount, type CurrencyAccount } from "./imputation";
import * as repository from "./repository";
import {
  accountReferences,
  referenceView,
  STATEMENT_DOCUMENTS_LIMIT,
  type AccountReferences,
  type ReferenceView,
} from "./service";
import * as paymentRepository from "./supplier-payment-repository";
import {
  summarizeSupplierAccount,
  supplierAccountInput,
  supplierLedger,
  type SupplierCurrencySummary,
  type SupplierLedger,
} from "./supplier-payments";
import {
  formatSupplierPaymentNumber,
  formatSupplierPaymentVoidNumber,
  type DocumentRef,
} from "./supplier-payment-views";

// La cuenta del proveedor (ADR 0023, punto 9; brief-22.7): el estado de cuenta, el resumen de la
// ficha y la lista de proveedores a los que se les debe. Solo lecturas y solo de admin (punto 12).
// Todo sale de supplierAccountInput e imputeAccount, la misma cuenta que limita el pago (D-2), y cada
// lectura va en una sola foto, con withSnapshot (D-6): sin el bloqueo de cobros, un pago confirmado
// entre dos lecturas podría apuntar a una recepción que la primera no vio, e imputeAccount lanzaría.

const idSchema = z.uuid();

export const SUPPLIERS_OWED_PAGE_SIZE = 25;

type SupplierName = { id: string; name: string };

// El nombre del proveedor por purchasing: si no lo trae, no es de la organización.
async function supplierName(
  context: AuthContext,
  supplierId: string,
): Promise<SupplierName | null> {
  const names = await getSupplierNames(context, [supplierId]);
  if (!names.ok) return null;
  const name = names.names.get(supplierId);
  return name === undefined ? null : { id: supplierId, name };
}

function hasSomething(row: SupplierCurrencySummary): boolean {
  return row.owed !== "0.00" || row.inFavor !== "0.00";
}

// El resumen de la ficha del proveedor (D-5): por moneda, lo que se le debe y lo que está a favor del
// negocio, sin las monedas en cero. Desde la 29.4.3, con el total de referencia en la moneda principal,
// con la vigente, sin guardarlo (ADR 0025, punto 7; brief-29.4.3, D-6).
export async function getSupplierAccountSummary(
  context: AuthContext,
  supplierId: string,
): Promise<
  | {
      ok: true;
      currencies: SupplierCurrencySummary[];
      references: AccountReferences;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(supplierId).success) {
    return failure("VALIDATION_ERROR");
  }
  const id = supplierId.toLowerCase();
  if (!(await supplierName(context, id))) return failure("NOT_FOUND");
  const ledger = await repository.withSnapshot((tx) =>
    supplierLedger(tx, context.organizationId, id),
  );
  const currencies = ledger.accounts
    .map(summarizeSupplierAccount)
    .filter(hasSomething);
  return {
    ok: true,
    currencies,
    references: accountReferences(
      await getExchangeSetup(context.organizationId),
      currencies,
    ),
  };
}

// El estado de cuenta (D-4): el resumen y la imputación de hoy por moneda, y los comprobantes del
// proveedor, de los más nuevos a los más viejos, sin saldo corrido.
export type SupplierStatementReceipt = {
  // Desde la 29.6: una recepción o la orden de servicio reparada de un técnico (brief-29.6, D-7).
  kind: "goods_receipt" | "service_order";
  id: string;
  displayNumber: string;
  issuedAt: Date;
  total: string;
  // Lo pagado contra ella, hasta su total (paso 1 de la regla).
  direct: string;
  // Lo que recibió de la cuenta (paso 3).
  imputed: string;
  outstanding: string;
};

export type SupplierStatementCurrency = SupplierCurrencySummary & {
  // Las recepciones vigentes.
  debit: string;
  // Los pagos vigentes.
  credit: string;
  // debit − credit, sin signo: src/shared/money no guarda montos negativos. El lado dice si se le
  // debe al proveedor o si está a favor del negocio.
  balance: { side: "owed" | "favor" | "zero"; amount: string };
  receipts: SupplierStatementReceipt[];
};

export type SupplierStatementDocument = {
  kind:
    | "goods_receipt"
    | "goods_receipt_void"
    | "payment"
    | "payment_void"
    // Desde la 29.6: la orden reparada, con su fecha de reparación (brief-29.6, D-7).
    | "service_order";
  // El documento que se abre: la recepción para una recepción y su anulación, el pago para un pago y
  // su anulación.
  id: string;
  displayNumber: string;
  createdAt: Date;
  currency: string;
  amount: string;
  // De un pago: su destino.
  destination:
    | { target: "goods_receipt"; ref: DocumentRef | null }
    | { target: "account" }
    | null;
  // Una recepción o un pago anulados.
  voided: boolean;
};

export type SupplierStatement = {
  supplier: SupplierName;
  generatedAt: Date;
  currencies: SupplierStatementCurrency[];
  // El total de referencia de lo que se le debe y lo que está a favor (brief-29.4.3, D-6).
  references: AccountReferences;
  documents: SupplierStatementDocument[];
  // Si hay más comprobantes que STATEMENT_DOCUMENTS_LIMIT: se muestran los más nuevos.
  truncated: boolean;
};

// El número de la recepción de cada pago sale de las recepciones del ledger, que ya están todas, y
// nunca de una lectura por recepción (H-5).
function statementDocuments(
  ledger: SupplierLedger,
): SupplierStatementDocument[] {
  const receiptsById = new Map(
    ledger.receipts.map((receipt) => [receipt.id, receipt]),
  );
  const documents: SupplierStatementDocument[] = [];
  for (const receipt of ledger.receipts) {
    documents.push({
      kind: "goods_receipt",
      id: receipt.id,
      displayNumber: receipt.displayNumber,
      createdAt: receipt.createdAt,
      currency: receipt.currency,
      amount: receipt.total,
      destination: null,
      voided: receipt.voided,
    });
    if (receipt.voidDisplayNumber !== null && receipt.voidedAt !== null) {
      documents.push({
        kind: "goods_receipt_void",
        id: receipt.id,
        displayNumber: receipt.voidDisplayNumber,
        createdAt: receipt.voidedAt,
        currency: receipt.currency,
        amount: receipt.total,
        destination: null,
        voided: false,
      });
    }
  }
  for (const charge of ledger.charges) {
    documents.push({
      kind: "service_order",
      id: charge.id,
      displayNumber: charge.displayNumber,
      createdAt: charge.repairedAt,
      currency: charge.currency,
      amount: charge.total,
      destination: null,
      voided: false,
    });
  }
  for (const payment of ledger.payments) {
    const receipt =
      payment.goodsReceiptId === null
        ? undefined
        : receiptsById.get(payment.goodsReceiptId);
    documents.push({
      kind: "payment",
      id: payment.id,
      displayNumber: formatSupplierPaymentNumber(payment.number),
      createdAt: payment.createdAt,
      currency: payment.currency,
      amount: payment.amount,
      destination:
        payment.target === "account"
          ? { target: "account" }
          : {
              target: "goods_receipt",
              ref: receipt
                ? { id: receipt.id, displayNumber: receipt.displayNumber }
                : null,
            },
      voided: payment.voided !== null,
    });
    if (payment.voided) {
      documents.push({
        kind: "payment_void",
        id: payment.id,
        displayNumber: formatSupplierPaymentVoidNumber(payment.voided.number),
        createdAt: payment.voided.createdAt,
        currency: payment.currency,
        amount: payment.amount,
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

// Lo que va al debe, por id: las recepciones y las órdenes reparadas.
type DebitDocument = {
  kind: SupplierStatementReceipt["kind"];
  displayNumber: string;
};

function debitDocuments(ledger: SupplierLedger): Map<string, DebitDocument> {
  return new Map<string, DebitDocument>([
    ...ledger.receipts.map(
      (receipt) =>
        [
          receipt.id,
          { kind: "goods_receipt", displayNumber: receipt.displayNumber },
        ] as const,
    ),
    ...ledger.charges.map(
      (charge) =>
        [
          charge.id,
          { kind: "service_order", displayNumber: charge.displayNumber },
        ] as const,
    ),
  ]);
}

function statementCurrency(
  account: CurrencyAccount,
  receipts: Map<string, DebitDocument>,
): SupplierStatementCurrency {
  return {
    ...summarizeSupplierAccount(account),
    debit: moneyToDatabase(account.debit),
    credit: moneyToDatabase(account.credit),
    balance: {
      side:
        account.balance > 0n ? "owed" : account.balance < 0n ? "favor" : "zero",
      amount: moneyToDatabase(
        account.balance < 0n ? -account.balance : account.balance,
      ),
    },
    receipts: account.sales.map((row) => ({
      kind: receipts.get(row.saleId)?.kind ?? "goods_receipt",
      id: row.saleId,
      displayNumber: receipts.get(row.saleId)?.displayNumber ?? "",
      issuedAt: row.issuedAt,
      total: moneyToDatabase(row.total),
      direct: moneyToDatabase(row.direct),
      imputed: moneyToDatabase(row.imputed),
      outstanding: moneyToDatabase(row.outstanding),
    })),
  };
}

export async function getSupplierStatement(
  context: AuthContext,
  supplierId: string,
): Promise<
  | { ok: true; statement: SupplierStatement }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(supplierId).success) {
    return failure("VALIDATION_ERROR");
  }
  const id = supplierId.toLowerCase();
  const supplier = await supplierName(context, id);
  if (!supplier) return failure("NOT_FOUND");
  const ledger = await repository.withSnapshot((tx) =>
    supplierLedger(tx, context.organizationId, id),
  );
  const receipts = debitDocuments(ledger);
  const documents = statementDocuments(ledger);
  const currencies = ledger.accounts.map((row) =>
    statementCurrency(row, receipts),
  );
  return {
    ok: true,
    statement: {
      supplier,
      generatedAt: new Date(),
      currencies,
      references: accountReferences(
        await getExchangeSetup(context.organizationId),
        currencies,
      ),
      documents: documents.slice(0, STATEMENT_DOCUMENTS_LIMIT),
      truncated: documents.length > STATEMENT_DOCUMENTS_LIMIT,
    },
  };
}

// La lista de proveedores a los que se les debe (D-7): una fila por proveedor y moneda con algo por
// pagar. Lee las recepciones de toda la organización por purchasing y los pagos vigentes, en una sola
// foto y sin JOIN entre módulos, agrupa por proveedor y pasa cada cuenta por la misma regla.
export type SupplierOwedRow = {
  supplierId: string;
  name: string | null;
  currency: string;
  owed: string;
  oldestOutstandingAt: Date;
  receiptsWithBalance: number;
};

export type SuppliersOwedPage = {
  rows: SupplierOwedRow[];
  total: number;
  page: number;
  pageSize: number;
  // Las monedas con algún proveedor al que se le debe, para el filtro.
  currencies: string[];
  // El total de referencia de la lista filtrada entera, no de la página (brief-29.4.3, D-6), como el
  // de los deudores.
  reference: ReferenceView | null;
};

type Owed = Omit<SupplierOwedRow, "name"> & { owedAmount: Money };

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

async function readOwed(organizationId: string): Promise<Owed[]> {
  const { receipts, payments, charges } = await repository.withSnapshot(
    async (tx) => {
      // Una tras otra, en la misma foto: van por la conexión de la transacción.
      const receipts = await listGoodsReceiptsForAccounts(tx, organizationId);
      const payments = await paymentRepository.findAccountsSupplierPayments(
        organizationId,
        tx,
      );
      // Desde la 29.6, las órdenes reparadas de los técnicos (brief-29.6, D-7).
      const charges = await listTechnicianChargesForAccounts(
        tx,
        organizationId,
      );
      return { receipts, payments, charges };
    },
  );
  const paymentsOf = groupBy(payments, (row) => row.supplierId);
  const receiptsOf = groupBy(receipts, (row) => row.supplierId);
  const chargesOf = groupBy(charges, (row) => row.supplierId);
  const owed: Owed[] = [];
  // Sin recepciones ni órdenes reparadas no hay deuda: solo los proveedores con alguna.
  for (const supplierId of new Set([
    ...receiptsOf.keys(),
    ...chargesOf.keys(),
  ])) {
    const input = supplierAccountInput(
      receiptsOf.get(supplierId) ?? [],
      paymentsOf.get(supplierId) ?? [],
      chargesOf.get(supplierId) ?? [],
    );
    for (const account of imputeAccount(input)) {
      const summary = summarizeSupplierAccount(account);
      if (summary.receiptsWithBalance === 0) continue;
      owed.push({
        supplierId,
        currency: summary.currency,
        owed: summary.owed,
        owedAmount: moneyFromDatabase(summary.owed),
        oldestOutstandingAt: summary.oldestOutstandingAt!,
        receiptsWithBalance: summary.receiptsWithBalance,
      });
    }
  }
  return owed;
}

function byOwed(a: Owed, b: Owed): number {
  if (a.currency !== b.currency) return a.currency < b.currency ? -1 : 1;
  if (a.owedAmount !== b.owedAmount) {
    return a.owedAmount > b.owedAmount ? -1 : 1;
  }
  return a.supplierId < b.supplierId ? -1 : a.supplierId > b.supplierId ? 1 : 0;
}

export async function listSuppliersOwed(
  context: AuthContext,
  query: { currency: string | null; page: number },
): Promise<
  | { ok: true; suppliers: SuppliersOwedPage }
  | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (
    (query.currency !== null && !/^[A-Z]{3}$/.test(query.currency)) ||
    !Number.isSafeInteger(query.page) ||
    query.page < 1
  ) {
    return failure("VALIDATION_ERROR");
  }
  const owed = await readOwed(context.organizationId);
  const currencies = [...new Set(owed.map((row) => row.currency))].sort();
  // Por moneda, y dentro de cada una, de lo que se le debe más a lo que se le debe menos.
  const filtered = owed
    .filter((row) => query.currency === null || row.currency === query.currency)
    .sort(byOwed);
  const start = (query.page - 1) * SUPPLIERS_OWED_PAGE_SIZE;
  const page = filtered.slice(start, start + SUPPLIERS_OWED_PAGE_SIZE);
  const names =
    page.length === 0
      ? new Map<string, string>()
      : await getSupplierNames(
          context,
          page.map((row) => row.supplierId),
        ).then((result) => (result.ok ? result.names : new Map()));
  return {
    ok: true,
    suppliers: {
      rows: page.map((row) => ({
        supplierId: row.supplierId,
        name: names.get(row.supplierId) ?? null,
        currency: row.currency,
        owed: row.owed,
        oldestOutstandingAt: row.oldestOutstandingAt,
        receiptsWithBalance: row.receiptsWithBalance,
      })),
      total: filtered.length,
      page: query.page,
      pageSize: SUPPLIERS_OWED_PAGE_SIZE,
      currencies,
      reference: referenceView(
        await getExchangeSetup(context.organizationId),
        filtered.map((row) => ({
          currency: row.currency,
          amount: row.owedAmount,
        })),
      ),
    },
  };
}
