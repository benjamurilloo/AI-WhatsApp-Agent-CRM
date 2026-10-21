import {
  currencyDecimals,
  moneyFromDatabase,
  moneyToDatabase,
  parseMoneyInput,
  type AmountRejection,
  type Money,
} from "@/shared/money";

// Funciones puras de la caja (ADR 0022, punto 8; brief-21.2, D-3 y D-4), sin base: lo esperado por
// moneda y la lectura de un monto que puede ser cero.

export type CashTotals = {
  currency: string;
  initial: Money;
  // Los cobros en efectivo de la sesión, desde la 21.3 (brief-21.3, D-5).
  receipts: Money;
  // Desde la 21.5 (brief-21.5, D-6): los cobros anulados mientras la sesión estaba abierta, las
  // devoluciones en efectivo y las devoluciones anuladas mientras estaba abierta.
  receiptVoids: Money;
  refunds: Money;
  refundVoids: Money;
  // Desde la 22.6 (ADR 0023, punto 8; brief-22.6, D-9): los pagos a proveedores en efectivo de la
  // sesión y los anulados mientras estaba abierta.
  supplierPayments: Money;
  supplierPaymentVoids: Money;
  // Desde la 29.7.2 (ADR 0024, punto 8; brief-29.7.2, D-5): los pagos de usados en efectivo de la
  // sesión y los anulados mientras estaba abierta, con la misma regla que los pagos a proveedores.
  tradeInPayments: Money;
  tradeInPaymentVoids: Money;
  contributions: Money;
  withdrawals: Money;
  // esperado = inicial + cobros en efectivo − cobros anulados en la sesión − devoluciones en
  // efectivo + devoluciones anuladas en la sesión + aportes − retiros − pagos a proveedores en
  // efectivo + pagos a proveedores anulados en la sesión − pagos de usados en efectivo + pagos de
  // usados anulados en la sesión (ADR 0022, puntos 7 y 8; ADR 0023, punto 8; ADR 0024, punto 8).
  expected: Money;
};

export type TotalsInput = {
  opening: { currency: string; amount: string }[];
  // Los cobros en efectivo de la sesión: solo esos tienen sesión (trigger receipts_cash_session).
  receipts: { currency: string; amount: string }[];
  // Lo anulado con la sesión abierta: las anulaciones cuya sesión es esta (D-1). Lo anulado después
  // del cierre no impacta en ninguna.
  receiptVoids: { currency: string; amount: string }[];
  // Las devoluciones en efectivo de la sesión: solo esas tienen sesión (trigger refunds_cash_session).
  refunds: { currency: string; amount: string }[];
  refundVoids: { currency: string; amount: string }[];
  // Los pagos a proveedores en efectivo de la sesión (trigger supplier_payments_cash_session) y las
  // anulaciones de pagos que impactaron en ella (brief-22.6, D-9).
  supplierPayments: { currency: string; amount: string }[];
  supplierPaymentVoids: { currency: string; amount: string }[];
  // Los pagos de usados en efectivo de la sesión (trigger trade_in_payments_cash_session) y las
  // anulaciones que impactaron en ella (brief-29.7.2, D-5).
  tradeInPayments: { currency: string; amount: string }[];
  tradeInPaymentVoids: { currency: string; amount: string }[];
  movements: {
    kind: "contribution" | "withdrawal";
    currency: string;
    amount: string;
  }[];
};

// Por moneda, en orden alfabético. Una moneda nunca se suma con otra. Cada moneda con inicial,
// cobros, devoluciones, pagos a proveedores, pagos de usados o movimientos tiene su fila; sin inicial, el
// inicial es cero.
export function computeCashTotals(input: TotalsInput): CashTotals[] {
  const byCurrency = new Map<string, CashTotals>();
  const totalsOf = (currency: string): CashTotals => {
    let totals = byCurrency.get(currency);
    if (!totals) {
      totals = {
        currency,
        initial: 0n,
        receipts: 0n,
        receiptVoids: 0n,
        refunds: 0n,
        refundVoids: 0n,
        supplierPayments: 0n,
        supplierPaymentVoids: 0n,
        tradeInPayments: 0n,
        tradeInPaymentVoids: 0n,
        contributions: 0n,
        withdrawals: 0n,
        expected: 0n,
      };
      byCurrency.set(currency, totals);
    }
    return totals;
  };
  for (const row of input.opening) {
    totalsOf(row.currency).initial += moneyFromDatabase(row.amount);
  }
  for (const row of input.receipts) {
    totalsOf(row.currency).receipts += moneyFromDatabase(row.amount);
  }
  for (const row of input.receiptVoids) {
    totalsOf(row.currency).receiptVoids += moneyFromDatabase(row.amount);
  }
  for (const row of input.refunds) {
    totalsOf(row.currency).refunds += moneyFromDatabase(row.amount);
  }
  for (const row of input.refundVoids) {
    totalsOf(row.currency).refundVoids += moneyFromDatabase(row.amount);
  }
  for (const row of input.supplierPayments) {
    totalsOf(row.currency).supplierPayments += moneyFromDatabase(row.amount);
  }
  for (const row of input.supplierPaymentVoids) {
    totalsOf(row.currency).supplierPaymentVoids += moneyFromDatabase(
      row.amount,
    );
  }
  for (const row of input.tradeInPayments) {
    totalsOf(row.currency).tradeInPayments += moneyFromDatabase(row.amount);
  }
  for (const row of input.tradeInPaymentVoids) {
    totalsOf(row.currency).tradeInPaymentVoids += moneyFromDatabase(row.amount);
  }
  for (const row of input.movements) {
    const totals = totalsOf(row.currency);
    const amount = moneyFromDatabase(row.amount);
    if (row.kind === "contribution") totals.contributions += amount;
    else totals.withdrawals += amount;
  }
  for (const totals of byCurrency.values()) {
    totals.expected =
      totals.initial +
      totals.receipts -
      totals.receiptVoids -
      totals.refunds +
      totals.refundVoids +
      totals.contributions -
      totals.withdrawals -
      totals.supplierPayments +
      totals.supplierPaymentVoids -
      totals.tradeInPayments +
      totals.tradeInPaymentVoids;
  }
  return [...byCurrency.values()].sort((a, b) =>
    a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0,
  );
}

export type CashAmountRejection = AmountRejection | "currency";

// Un monto de la caja, escrito por una persona. El inicial y lo contado pueden ser cero; un aporte o
// un retiro, no. parseMoneyInput nació para los precios y rechaza el cero, y src/shared/money no
// cambia (brief-21.2, H-2): el cero se reconoce acá, con los decimales que admite la moneda, y
// cualquier otra forma pasa al parser.
export function parseCashAmount(
  value: string,
  currency: string,
  { allowZero }: { allowZero: boolean },
): { ok: true; amount: Money } | { ok: false; reason: CashAmountRejection } {
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) return { ok: false, reason: "currency" };
  const text = value.trim();
  if (allowZero && isZero(text, decimals.decimals)) {
    return { ok: true, amount: 0n };
  }
  return parseMoneyInput(text, decimals.decimals);
}

function isZero(text: string, decimals: number): boolean {
  if (/^0+$/.test(text)) return true;
  if (decimals === 0) return false;
  return new RegExp(`^0+[.,]0{1,${decimals}}$`).test(text);
}

export function cashAmountToDatabase(amount: Money): string {
  return moneyToDatabase(amount);
}
