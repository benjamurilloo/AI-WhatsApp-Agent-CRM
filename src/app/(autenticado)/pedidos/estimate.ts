import {
  currencyDecimals,
  moneyFromDatabase,
  moneyToDatabase,
} from "@/shared/money";
import { parseQuantityInput } from "@/shared/quantity";

// El subtotal estimado de una línea en el formulario del alta (brief-19.2, D-7). Es solo lo que se
// muestra mientras se carga: el total que vale lo calcula orders al crear el pedido, con el precio
// leído en la transacción. La regla es la misma (ADR 0019, punto 4: precio por cantidad, redondeado
// a los decimales de la moneda con el medio hacia afuera del cero), copiada porque el formulario
// corre en el navegador y orders no se puede importar ahí; el test fija los mismos casos que
// src/modules/orders/line-total.test.ts.

// Devuelve el subtotal con la escala de la base («3703.50»), o null si todavía no se puede calcular
// o si da cero.
export function estimateLineTotal(
  unitPrice: string,
  currency: string,
  quantityText: string,
): string | null {
  const decimals = currencyDecimals(currency);
  const quantity = parseQuantityInput(quantityText);
  if (!decimals.ok || quantity === null || quantity === 0n) return null;
  const price = moneyFromDatabase(unitPrice);
  const step = 10n ** BigInt(2 - decimals.decimals);
  const divisor = 1000n * step;
  const product = price * quantity;
  const quotient = product / divisor;
  const rounded =
    (product % divisor) * 2n >= divisor ? quotient + 1n : quotient;
  const total = rounded * step;
  return total === 0n ? null : moneyToDatabase(total);
}

// La suma de los subtotales de una moneda, con la escala de la base.
export function sumEstimates(totals: string[]): string {
  return moneyToDatabase(
    totals.reduce((sum, value) => sum + moneyFromDatabase(value), 0n),
  );
}
