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
  // Desde la 24.8.2 (H-6), los dos comprobantes con saldo se cuentan por separado: las recepciones
  // de compra por un lado y los trabajos reparados de los técnicos por el otro. Antes era un solo
  // número con los dos mezclados, porque `AccountSale` no lleva de qué tipo es. Se separan como lo
  // hace el estado de cuenta: con un conjunto armado **afuera** de `imputeAccount`, que no cambia.
  receiptsWithBalance: number;
  chargesWithBalance: number;
};

export type SuppliersOwedPage = {
  rows: SupplierOwedRow[];
  total: number;
  page: number;
  pageSize: number;
  // Las monedas con algún proveedor al que se le debe, para el filtro.
  currencies: string[];
  // Lo que se debe por moneda, sobre la lista filtrada **entera** y no sobre la página (H-7), como
  // el total de referencia. No cuesta ninguna consulta: la lista ya se lee y se pagina en memoria.
  totals: { currency: string; owed: string }[];
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
    // Los identificadores de los trabajos del técnico, para contarlos aparte de las recepciones
    // (H-6). `supplierAccountInput` los mapea con `charge.id` como `id`, así que son los mismos
    // `saleId` que devuelve la imputación.
    const chargeIds = new Set(
      (chargesOf.get(supplierId) ?? []).map((charge) => charge.id),
    );
    for (const account of imputeAccount(input)) {
      const summary = summarizeSupplierAccount(account);
      if (summary.receiptsWithBalance === 0) continue;
      const chargesWithBalance = account.sales.filter(
        (row) => row.outstanding > 0n && chargeIds.has(row.saleId),
      ).length;
      owed.push({
        supplierId,
        currency: summary.currency,
        owed: summary.owed,
        owedAmount: moneyFromDatabase(summary.owed),
        oldestOutstandingAt: summary.oldestOutstandingAt!,
        // El resumen cuenta los dos juntos: las recepciones son las que quedan.
        receiptsWithBalance: summary.receiptsWithBalance - chargesWithBalance,
        chargesWithBalance,
      });
    }
  }
  return owed;
}

// La vista previa de la aplicación de un pago a cuenta (brief-24.8.2, D-4 y lámina 12): a qué
// comprobantes iría y cuánto quedaría a favor del negocio. **No cambia ninguna regla**: corre la
// misma `imputeAccount` sobre la misma entrada que arma `supplierLedger`, con un pago a cuenta más,
// y resta. Lo que se ve, entonces, no puede contradecir a lo que pasa al confirmar, salvo porque la
// cuenta puede moverse entre una pantalla y la otra —por eso la pantalla dice que se revalida—.
//
// Sin JavaScript, previsualiza **lo propuesto** y no lo que se está escribiendo.
export type SupplierAccountPreviewRow = {
  kind: "goods_receipt" | "charge";
  id: string;
  displayNumber: string;
  // Lo que falta hoy, antes de este pago.
  outstanding: string;
  // Lo que este pago le aplicaría.
  applied: string;
};

export type SupplierAccountPreview = {
  currency: string;
  amount: string;
  rows: SupplierAccountPreviewRow[];
  // Lo que quedaría a favor del negocio **por este pago**, no el total a favor de la cuenta.
  inFavor: string;
  // Las otras monedas con saldo, que este pago no toca: una moneda nunca cancela otra (ADR 0019).
  others: SupplierCurrencySummary[];
};

const AMOUNT = /^[0-9]+.[0-9]{2}$/;

export async function previewSupplierAccountPayment(
  context: AuthContext,
  supplierId: string,
  payment: { currency: string; amount: string },
): Promise<
  | { ok: true; preview: SupplierAccountPreview }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(supplierId).success) {
    return failure("VALIDATION_ERROR");
  }
  const currency = payment.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || !AMOUNT.test(payment.amount)) {
    return failure("VALIDATION_ERROR");
  }
  const amount = moneyFromDatabase(payment.amount);
  if (amount <= 0n) return failure("VALIDATION_ERROR");
  const id = supplierId.toLowerCase();
  if (!(await supplierName(context, id))) return failure("NOT_FOUND");
  const ledger = await repository.withSnapshot((tx) =>
    supplierLedger(tx, context.organizationId, id),
  );
  const before = ledger.accounts.find((row) => row.currency === currency);
  const after = imputeAccount({
    ...ledger.input,
    receipts: [
      ...ledger.input.receipts,
      { target: "account", currency, amount },
    ],
  }).find((row) => row.currency === currency);
  if (!after) {
    // Solo si la moneda no quedó en la cuenta ni con el pago puesto, que no puede pasar.
    return failure("VALIDATION_ERROR");
  }
  const outstandingBefore = new Map(
    (before?.sales ?? []).map((sale) => [sale.saleId, sale.outstanding]),
  );
  const documents = new Map<
    string,
    { kind: "goods_receipt" | "charge"; displayNumber: string }
  >([
    ...ledger.receipts.map(
      (receipt) =>
        [
          receipt.id,
          {
            kind: "goods_receipt" as const,
            displayNumber: receipt.displayNumber,
          },
        ] as const,
    ),
    ...ledger.charges.map(
      (charge) =>
        [
          charge.id,
          { kind: "charge" as const, displayNumber: charge.displayNumber },
        ] as const,
    ),
  ]);
  const rows: SupplierAccountPreviewRow[] = [];
  for (const sale of after.sales) {
    const was = outstandingBefore.get(sale.saleId) ?? 0n;
    const applied = was - sale.outstanding;
    if (applied <= 0n) continue;
    const document = documents.get(sale.saleId);
    rows.push({
      kind: document?.kind ?? "goods_receipt",
      id: sale.saleId,
      displayNumber: document?.displayNumber ?? "",
      outstanding: moneyToDatabase(was),
      applied: moneyToDatabase(applied),
    });
  }
  return {
    ok: true,
    preview: {
      currency,
      amount: payment.amount,
      rows,
      inFavor: moneyToDatabase(after.inFavor - (before?.inFavor ?? 0n)),
      others: ledger.accounts
        .filter((row) => row.currency !== currency)
        .map(summarizeSupplierAccount)
        .filter((row) => row.owed !== "0.00"),
    },
  };
}

// Lo que se debe por moneda, en el orden de los códigos (H-7). Suma `Money`, nunca cadenas, y no
// mezcla dos monedas: una fila por cada una.
function owedTotals(rows: Owed[]): { currency: string; owed: string }[] {
  const byCurrency = new Map<string, Money>();
  for (const row of rows) {
    byCurrency.set(
      row.currency,
      (byCurrency.get(row.currency) ?? 0n) + row.owedAmount,
    );
  }
  return [...byCurrency]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currency, amount]) => ({
      currency,
      owed: moneyToDatabase(amount),
    }));
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
        chargesWithBalance: row.chargesWithBalance,
      })),
      total: filtered.length,
      page: query.page,
      pageSize: SUPPLIERS_OWED_PAGE_SIZE,
      currencies,
      totals: owedTotals(filtered),
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
