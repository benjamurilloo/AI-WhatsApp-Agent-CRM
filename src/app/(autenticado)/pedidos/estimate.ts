import { roundLineTotal } from "@/shared/lines";
import {
  currencyDecimals,
  moneyFromDatabase,
  moneyToDatabase,
} from "@/shared/money";
import { parseQuantityInput } from "@/shared/quantity";

// El subtotal estimado de una línea en el formulario del alta (brief-19.2, D-7) y, desde la 20.3,
// en el de la venta sin pedido. Es solo lo que se muestra mientras se carga: el total que vale lo
// calcula el servicio al escribir, con el precio leído en la transacción. Desde la 20.3 usa el
// redondeo de src/shared/lines, el mismo del servicio, en lugar de una copia (brief-20.3, D-1).

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
  const total = roundLineTotal(
    moneyFromDatabase(unitPrice),
    quantity,
    decimals.decimals,
  );
  return total === 0n ? null : moneyToDatabase(total);
}

// La suma de los subtotales de una moneda, con la escala de la base.
export function sumEstimates(totals: string[]): string {
  return moneyToDatabase(
    totals.reduce((sum, value) => sum + moneyFromDatabase(value), 0n),
  );
}
