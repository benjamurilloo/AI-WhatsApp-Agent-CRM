import type { CreateOrderReceiptResult } from "@/modules/cash";
import { formatMoney } from "@/shared/money";
import {
  receiptRejection,
  type ReceiptFormField,
} from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";

// Textos de la seña (brief-21.4, D-6 y D-8). Los del medio, el monto y la caja son los del cobro de
// una venta; acá van los del pedido.

export const DEPOSIT_ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede registrar señas.";
export const DEPOSIT_ORDER_NOT_FOUND_MESSAGE = "Este pedido no existe.";
export const DEPOSIT_COMPLETE_MESSAGE =
  "A este pedido ya no le falta nada: lo señado cubre su total.";

export function orderNotOpenMessage(status: string): string {
  return status === "cancelled"
    ? "Este pedido está cancelado: no se le registran señas."
    : "Este pedido ya se entregó: lo que falta se cobra en su venta.";
}

export function depositUnexpectedErrorMessage(requestId: string): string {
  return `No pudimos registrar la seña. Código: ${requestId}`;
}

export function orderReceiptRejection(
  result: Exclude<CreateOrderReceiptResult, { ok: true }>,
): { message: string; fields: ReceiptFormField[]; openCash: boolean } {
  const plain = (message: string, fields: ReceiptFormField[] = []) => ({
    message,
    fields,
    openCash: false,
  });
  if (result.code === "FORBIDDEN") return plain(DEPOSIT_ADMIN_ONLY_MESSAGE);
  if (result.code === "NOT_FOUND" && result.entity === "order") {
    return plain(DEPOSIT_ORDER_NOT_FOUND_MESSAGE);
  }
  if (result.code === "VALIDATION_ERROR" && !("fields" in result)) {
    return plain(DEPOSIT_ORDER_NOT_FOUND_MESSAGE);
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    if (result.rule === "order_not_open") {
      return plain(orderNotOpenMessage(result.status));
    }
    if (result.rule === "exceeds_outstanding") {
      return plain(
        result.outstanding === "0.00"
          ? DEPOSIT_COMPLETE_MESSAGE
          : `La seña supera lo que le falta al pedido: ${formatMoney(
              result.outstanding,
              result.currency,
            )}.`,
        ["amount"],
      );
    }
  }
  // El medio, el monto y la caja: los mismos rechazos y textos que el cobro de una venta.
  return receiptRejection(result);
}
