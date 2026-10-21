import { formatDocumentNumber } from "@/modules/numbering";
import { getTradeInsForPayment } from "@/modules/tradeins";
import * as repository from "./repository";
import { tenderView, type TenderView } from "./tender";
import type * as tradeInPaymentRepository from "./trade-in-payment-repository";

// Cómo se muestran los pagos de usados (brief-29.7.2, D-5 y D-6), compartido por sus pantallas y por el
// detalle de la sesión de caja, que solo los muestra a un admin, como supplier-payment-views.ts.

export type DocumentRef = { id: string; displayNumber: string };

export type TradeInPaymentVoidReason =
  tradeInPaymentRepository.TradeInPaymentVoidReason;

export function formatTradeInPaymentNumber(value: number): string {
  return formatDocumentNumber("trade_in_payment", value);
}

export function formatTradeInPaymentVoidNumber(value: number): string {
  return formatDocumentNumber("trade_in_payment_void", value);
}

export type TradeInPaymentListItem = DocumentRef & {
  number: number;
  createdAt: Date;
  tradeIn: DocumentRef | null;
  paymentMethodName: string;
  isCash: boolean;
  currency: string;
  amount: string;
  // Lo que salió en otra moneda, o null.
  tender: TenderView | null;
  // Su anulación: se muestra y no cuenta.
  voided:
    | (DocumentRef & {
        number: number;
        reason: TradeInPaymentVoidReason;
        sessionId: string | null;
        createdAt: Date;
      })
    | null;
};

// Los números de los usados, de una lectura con una transacción: una página tiene a lo sumo una página de
// pagos.
export async function tradeInPaymentListItems(
  organizationId: string,
  rows: tradeInPaymentRepository.TradeInPaymentRow[],
): Promise<TradeInPaymentListItem[]> {
  if (rows.length === 0) return [];
  const [methods, tradeIns] = await Promise.all([
    repository.findPaymentMethods(organizationId),
    repository.withTransaction((tx) =>
      getTradeInsForPayment(
        tx,
        organizationId,
        rows.map((row) => row.tradeInId),
      ),
    ),
  ]);
  const methodOf = new Map(methods.map((method) => [method.id, method]));
  const tradeInOf = new Map(tradeIns.map((tradeIn) => [tradeIn.id, tradeIn]));
  return rows.map((row) => {
    const method = methodOf.get(row.paymentMethodId);
    const tradeIn = tradeInOf.get(row.tradeInId);
    return {
      id: row.id,
      number: row.number,
      displayNumber: formatTradeInPaymentNumber(row.number),
      createdAt: row.createdAt,
      tradeIn: tradeIn
        ? { id: tradeIn.id, displayNumber: tradeIn.displayNumber }
        : null,
      paymentMethodName: method?.name ?? "",
      isCash: method?.isCash ?? false,
      currency: row.currency,
      amount: row.amount,
      tender: tenderView(row),
      voided: row.voided
        ? {
            id: row.voided.id,
            number: row.voided.number,
            displayNumber: formatTradeInPaymentVoidNumber(row.voided.number),
            reason: row.voided.reason as TradeInPaymentVoidReason,
            sessionId: row.voided.sessionId,
            createdAt: row.voided.createdAt,
          }
        : null,
    };
  });
}
