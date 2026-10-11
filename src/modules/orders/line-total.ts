import { MAX_AMOUNT, type Money } from "@/shared/money";
import type { Quantity } from "@/shared/quantity";

// El total de una línea de pedido (ADR 0019, punto 4; ADR 0020, punto 3; brief-19.2, AC-4): el
// precio unitario por la cantidad, redondeado a los decimales de la moneda con el medio hacia
// afuera del cero. Todo en bigint: el precio en centésimos y la cantidad en milésimas, así que el
// producto está en cienmilésimos y se divide una sola vez, con un solo redondeo.

// Cociente entero redondeado con el medio hacia afuera del cero. Los dos operandos son positivos
// acá, pero la regla se escribe completa, como en el margen de catalog.
function divideRoundingHalfAwayFromZero(
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

export type LineTotalResult =
  | { ok: true; total: Money }
  | { ok: false; reason: "zero_total" | "amount_too_large" };

// unitPrice en centésimos, quantity en milésimas y decimals los de la moneda (0, 1 o 2).
export function computeLineTotal(
  unitPrice: Money,
  quantity: Quantity,
  decimals: number,
): LineTotalResult {
  if (unitPrice <= 0n || quantity <= 0n) {
    throw new Error("Precio y cantidad son mayores que cero.");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 2) {
    throw new Error("Decimales de moneda fuera de rango.");
  }
  // Centésimos por cada unidad de la moneda que se puede expresar: 1 con dos decimales, 100 sin.
  const step = 10n ** BigInt(2 - decimals);
  const total =
    divideRoundingHalfAwayFromZero(unitPrice * quantity, 1000n * step) * step;
  if (total === 0n) return { ok: false, reason: "zero_total" };
  if (total > MAX_AMOUNT) return { ok: false, reason: "amount_too_large" };
  return { ok: true, total };
}

// La suma de los totales de las líneas, o null si no cabe en numeric(14, 2).
export function sumOrderTotal(lineTotals: Money[]): Money | null {
  const total = lineTotals.reduce((sum, value) => sum + value, 0n);
  return total > MAX_AMOUNT ? null : total;
}
