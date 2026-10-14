import type { Money } from "@/shared/money";

// La regla de imputación de la cuenta corriente (ADR 0022, punto 9; brief-21.3, D-2): una función
// pura, sin base, escrita entera. Lo que falta cobrar de una venta y el saldo del cliente salen de
// ella, y no pueden contradecirse. Recibe todos los términos del punto 9: en la 21.3 la alimentan
// las ventas del cliente y sus cobros contra ventas, y los cobros contra pedidos, a cuenta y las
// devoluciones llegan vacíos hasta la 21.4 a la 21.6 (H-6).
//
// Recibe solo lo vigente: los cobros y las devoluciones anulados (21.5) no se pasan. Las ventas van
// todas, anuladas incluidas, porque lo cobrado contra una venta anulada pasa al remanente (punto 6).
//
// Cada moneda se calcula aparte: una moneda nunca se suma con otra (ADR 0019, punto 3).

export type AccountSale = {
  id: string;
  number: number;
  currency: string;
  total: Money;
  // La fecha de emisión: el remanente se reparte de la más vieja a la más nueva, y a igual fecha,
  // por número.
  issuedAt: Date;
  voided: boolean;
};

export type AccountReceipt =
  | { target: "sale"; saleId: string; currency: string; amount: Money }
  // La seña (punto 5): cuenta para la venta vigente de la cadena del pedido; sin ella, si el pedido
  // está cancelado pasa al remanente, y si no, queda retenida.
  | {
      target: "order";
      orderId: string;
      currency: string;
      amount: Money;
      currentSaleId: string | null;
      cancelled: boolean;
    }
  // El cobro a cuenta (punto 9): no elige una venta.
  | { target: "account"; currency: string; amount: Money };

export type AccountRefund = { currency: string; amount: Money };

export type AccountInput = {
  sales: AccountSale[];
  receipts: AccountReceipt[];
  refunds: AccountRefund[];
};

export type SaleImputation = {
  saleId: string;
  number: number;
  issuedAt: Date;
  total: Money;
  // Sus cobros directos y los de su pedido, hasta su total (paso 1).
  direct: Money;
  // Lo que recibió del remanente (paso 3).
  imputed: Money;
  outstanding: Money;
};

export type CurrencyAccount = {
  currency: string;
  // Al debe: las ventas vigentes.
  debit: Money;
  // Al haber: los cobros que cuentan, menos las devoluciones. Sin las señas retenidas.
  credit: Money;
  // debit − credit: positivo es deuda; negativo, saldo a favor.
  balance: Money;
  // Las señas de pedidos sin venta vigente que no están cancelados (punto 5): no cuentan.
  retained: Money;
  // Lo que sobra del remanente (paso 4).
  inFavor: Money;
  // Las ventas vigentes, de la más vieja a la más nueva.
  sales: SaleImputation[];
};

function byIssue(a: AccountSale, b: AccountSale): number {
  const time = a.issuedAt.getTime() - b.issuedAt.getTime();
  if (time !== 0) return time;
  return a.number - b.number;
}

function min(a: Money, b: Money): Money {
  return a < b ? a : b;
}

// Una entrada que contradice las reglas del módulo (un cobro de otra moneda que su venta, o contra
// una venta que no está) es un defecto, no un estado posible: se lanza.
class InconsistentAccount extends Error {}

export function imputeAccount(input: AccountInput): CurrencyAccount[] {
  const salesById = new Map(input.sales.map((sale) => [sale.id, sale]));
  const currencies = new Set<string>();
  for (const sale of input.sales)
    if (!sale.voided) currencies.add(sale.currency);
  for (const receipt of input.receipts) currencies.add(receipt.currency);
  for (const refund of input.refunds) currencies.add(refund.currency);

  return [...currencies]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((currency) => {
      const current = input.sales
        .filter((sale) => sale.currency === currency && !sale.voided)
        .sort(byIssue);
      const directOf = new Map<string, Money>(current.map((s) => [s.id, 0n]));
      let sources: Money = 0n;
      let retained: Money = 0n;
      // Todo lo que cuenta al haber, antes de las devoluciones.
      let counted: Money = 0n;

      const toSale = (saleId: string, amount: Money) => {
        const sale = salesById.get(saleId);
        if (!sale || sale.currency !== currency) {
          throw new InconsistentAccount(
            `cobro en ${currency} contra la venta ${saleId}, que no está o es de otra moneda`,
          );
        }
        if (sale.voided) sources += amount;
        else directOf.set(saleId, directOf.get(saleId)! + amount);
      };

      for (const receipt of input.receipts) {
        if (receipt.currency !== currency) continue;
        if (
          receipt.target !== "order" ||
          receipt.currentSaleId !== null ||
          receipt.cancelled
        ) {
          counted += receipt.amount;
        }
        if (receipt.target === "sale") toSale(receipt.saleId, receipt.amount);
        else if (receipt.target === "order") {
          if (receipt.currentSaleId !== null) {
            const sale = salesById.get(receipt.currentSaleId);
            if (!sale || sale.voided) {
              throw new InconsistentAccount(
                `la venta vigente ${receipt.currentSaleId} del pedido ${receipt.orderId} no está vigente`,
              );
            }
            toSale(receipt.currentSaleId, receipt.amount);
          } else if (receipt.cancelled) sources += receipt.amount;
          else retained += receipt.amount;
        } else sources += receipt.amount;
      }
      const refunds = input.refunds
        .filter((refund) => refund.currency === currency)
        .reduce((sum, refund) => sum + refund.amount, 0n);

      // Paso 1: cada venta vigente recibe sus cobros directos hasta su total. Lo que los excede
      // pasa al remanente: nunca se pierde.
      const sales: SaleImputation[] = current.map((sale) => {
        const direct = directOf.get(sale.id)!;
        const applied = min(direct, sale.total);
        sources += direct - applied;
        return {
          saleId: sale.id,
          number: sale.number,
          issuedAt: sale.issuedAt,
          total: sale.total,
          direct: applied,
          imputed: 0n,
          outstanding: sale.total - applied,
        };
      });

      // Paso 2: el remanente, menos las devoluciones. Nunca es negativo (punto 9): lo aseguran la
      // devolución y la anulación del cobro de la 21.5.
      let remaining = sources - refunds;
      if (remaining < 0n) {
        throw new InconsistentAccount(
          `las devoluciones en ${currency} superan lo que estaba a favor`,
        );
      }

      // Paso 3: de la más vieja a la más nueva.
      for (const sale of sales) {
        const imputed = min(remaining, sale.outstanding);
        sale.imputed = imputed;
        sale.outstanding -= imputed;
        remaining -= imputed;
      }

      const debit = current.reduce((sum, sale) => sum + sale.total, 0n);
      const credit = counted - refunds;
      return {
        currency,
        debit,
        credit,
        balance: debit - credit,
        retained,
        // Paso 4.
        inFavor: remaining,
        sales,
      };
    });
}

// Lo que falta cobrar de una venta vigente con cliente, según la regla. Una venta que no está en la
// cuenta no tiene nada que cobrar.
export function outstandingOf(
  accounts: CurrencyAccount[],
  saleId: string,
): SaleImputation | null {
  for (const account of accounts) {
    const sale = account.sales.find((row) => row.saleId === saleId);
    if (sale) return sale;
  }
  return null;
}

// La venta sin cliente no tiene cuenta y no pasa por la regla (ADR 0022, punto 3): lo que falta es
// su total menos sus cobros. Si está anulada, lo cobrado queda a devolver (punto 6), y solo una
// devolución de la 21.5 lo salda.
export function standaloneSale(input: {
  total: Money;
  collected: Money;
  voided: boolean;
}): { collected: Money; outstanding: Money; toRefund: Money } {
  if (input.voided) {
    return {
      collected: input.collected,
      outstanding: 0n,
      toRefund: input.collected,
    };
  }
  const outstanding = input.total - input.collected;
  return {
    collected: input.collected,
    outstanding: outstanding > 0n ? outstanding : 0n,
    toRefund: 0n,
  };
}
