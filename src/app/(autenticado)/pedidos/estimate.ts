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

// El subtotal estimado de una línea por unidad (brief-29.5.2, D-2 y D-5): cada IMEI vale su precio
// propio, si es de una unidad de la lista y lo tiene, o el del producto, redondeado como una línea de
// cantidad 1, como lo hace el servicio. known dice si todos los IMEI son de unidades de la lista: solo
// entonces el monto viaja como esperado. Null si no hay IMEI, si algún precio está en otra moneda o si
// da cero.
export function estimateUnitsTotal(
  productPrice: { amount: string; currency: string },
  units: ReadonlyMap<string, { amount: string; currency: string } | null>,
  serials: string[],
): { total: string; known: boolean } | null {
  const decimals = currencyDecimals(productPrice.currency);
  if (!decimals.ok || serials.length === 0) return null;
  let total = 0n;
  let known = true;
  for (const serial of serials) {
    const key = serial.toLowerCase();
    if (!units.has(key)) known = false;
    const price = units.get(key) ?? productPrice;
    if (price.currency !== productPrice.currency) return null;
    total += roundLineTotal(
      moneyFromDatabase(price.amount),
      1000n,
      decimals.decimals,
    );
  }
  return total === 0n ? null : { total: moneyToDatabase(total), known };
}

// La suma de los subtotales de una moneda, con la escala de la base.
export function sumEstimates(totals: string[]): string {
  return moneyToDatabase(
    totals.reduce((sum, value) => sum + moneyFromDatabase(value), 0n),
  );
}
