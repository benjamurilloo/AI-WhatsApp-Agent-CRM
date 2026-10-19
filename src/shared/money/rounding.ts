// Cociente entero redondeado con el medio hacia afuera del cero (ADR 0019, punto 4). Vivía privado
// en src/shared/lines/line-total.ts hasta la 29.4, que lo comparte con la conversión de monedas
// (brief-29.4, D-5). La regla se escribe completa, con signo, como en el margen de catalog.
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
