import { roundLineTotal } from "@/shared/lines";
import {
  currencyDecimals,
  moneyFromDatabase,
  moneyToDatabase,
  parseMoneyInput,
} from "@/shared/money";
import { parseQuantityInput } from "@/shared/quantity";

// El total estimado de una línea en el formulario de la orden de compra (brief-22.3, D-10), con el
// costo escrito leído con los decimales de la moneda elegida (D-5). Es solo lo que se muestra
// mientras se carga: el total que vale lo calcula purchasing al escribir, con el mismo redondeo.

// Devuelve el total con la escala de la base («3001.00»), o null si todavía no se puede calcular o
// si da cero.
export function estimatePurchaseLineTotal(
  unitCostText: string,
  currency: string,
  quantityText: string,
): string | null {
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) return null;
  const quantity = parseQuantityInput(quantityText);
  const cost = parseMoneyInput(unitCostText, decimals.decimals);
  if (quantity === null || quantity === 0n || !cost.ok) return null;
  const total = roundLineTotal(cost.amount, quantity, decimals.decimals);
  return total === 0n ? null : moneyToDatabase(total);
}

// La suma de los totales, con la escala de la base.
export function sumPurchaseEstimates(totals: string[]): string {
  return moneyToDatabase(
    totals.reduce((sum, value) => sum + moneyFromDatabase(value), 0n),
  );
}
