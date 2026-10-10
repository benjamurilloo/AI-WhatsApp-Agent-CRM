import {
  formatMoney,
  moneyFromDatabase,
  moneyToDatabase,
  type Money,
} from "@/shared/money";

// Margen de un producto (ADR 0019, punto 5; brief-18.2, D-2 y D-6). Función pura, en bigint:
// el dinero nunca pasa por number.
//
// - El precio es el final al consumidor y el costo, lo que se paga por una unidad, los dos con el
//   IVA incluido: se comparan sin convertir nada.
// - Margen = precio − costo; su porcentaje, sobre el precio. El recargo es la misma diferencia
//   sobre el costo.
// - Sin precio, sin costo o con monedas distintas no hay margen: no hay tipos de cambio.
//
// Los porcentajes van en décimas de punto (500 = 50,0 %), redondeados con el medio hacia afuera
// del cero, como el ADR 0019, punto 4. El monto no se redondea: precio y costo ya están en los
// decimales de su moneda, y su diferencia también.

export type MarginInput = { amount: string; currency: string } | null;

export type MarginNoneReason = "no_price" | "no_cost" | "currency_mismatch";

export type Margin =
  | {
      ok: true;
      currency: string;
      // Centésimas, negativo si el costo supera el precio.
      amount: Money;
      // Décimas de punto: sobre el precio y sobre el costo.
      marginTenths: bigint;
      markupTenths: bigint;
    }
  | { ok: false; reason: MarginNoneReason };

// Cociente entero redondeado con el medio hacia afuera del cero. El divisor es positivo: precio y
// costo son mayores que cero (CHECK de la base).
export function divideRoundingHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= 0n) throw new Error("Divisor no positivo.");
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const twice = (remainder < 0n ? -remainder : remainder) * 2n;
  if (twice < denominator) return quotient;
  return numerator < 0n ? quotient - 1n : quotient + 1n;
}

export function computeMargin(price: MarginInput, cost: MarginInput): Margin {
  if (!price) return { ok: false, reason: "no_price" };
  if (!cost) return { ok: false, reason: "no_cost" };
  if (price.currency !== cost.currency) {
    return { ok: false, reason: "currency_mismatch" };
  }
  const priceAmount = moneyFromDatabase(price.amount);
  const costAmount = moneyFromDatabase(cost.amount);
  const difference = priceAmount - costAmount;
  return {
    ok: true,
    currency: price.currency,
    amount: difference,
    marginTenths: divideRoundingHalfAwayFromZero(
      difference * 1000n,
      priceAmount,
    ),
    markupTenths: divideRoundingHalfAwayFromZero(
      difference * 1000n,
      costAmount,
    ),
  };
}

// «50,0 %», «−12,5 %», «1.900,0 %». Intl recibe texto, no un number, como formatMoney.
export function formatPercentTenths(tenths: bigint): string {
  const negative = tenths < 0n;
  const absolute = negative ? -tenths : tenths;
  const text = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(`${absolute / 10n}.${absolute % 10n}` as `${number}`);
  return `${negative ? "−" : ""}${text} %`;
}

// El monto del margen con su signo: formatMoney solo recibe montos de la base, que no son
// negativos.
export function formatMarginAmount(amount: Money, currency: string): string {
  const negative = amount < 0n;
  const text = formatMoney(
    moneyToDatabase(negative ? -amount : amount),
    currency,
  );
  return `${negative ? "−" : ""}${text}`;
}
