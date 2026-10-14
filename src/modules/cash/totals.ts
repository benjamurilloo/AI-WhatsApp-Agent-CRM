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
  contributions: Money;
  withdrawals: Money;
  // esperado = inicial + cobros en efectivo − devoluciones en efectivo + aportes − retiros. En la
  // 21.2 no hay cobros ni devoluciones: la 21.3 y la 21.5 suman sus términos acá.
  expected: Money;
};

export type TotalsInput = {
  opening: { currency: string; amount: string }[];
  movements: {
    kind: "contribution" | "withdrawal";
    currency: string;
    amount: string;
  }[];
};

// Por moneda, en orden alfabético. Una moneda nunca se suma con otra. Cada moneda con inicial o con
// movimientos tiene su fila; sin inicial, el inicial es cero.
export function computeCashTotals(input: TotalsInput): CashTotals[] {
  const byCurrency = new Map<string, CashTotals>();
  const totalsOf = (currency: string): CashTotals => {
    let totals = byCurrency.get(currency);
    if (!totals) {
      totals = {
        currency,
        initial: 0n,
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
  for (const row of input.movements) {
    const totals = totalsOf(row.currency);
    const amount = moneyFromDatabase(row.amount);
    if (row.kind === "contribution") totals.contributions += amount;
    else totals.withdrawals += amount;
  }
  for (const totals of byCurrency.values()) {
    totals.expected =
      totals.initial + totals.contributions - totals.withdrawals;
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
