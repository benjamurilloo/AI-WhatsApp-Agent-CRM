import type {
  CreateRefundResult,
  ReceiptVoidReason,
  RefundField,
  RefundVoidReason,
  VoidReceiptResult,
  VoidRefundResult,
} from "@/modules/cash";
import { formatMoney } from "@/shared/money";
import { receiptRejection } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";

// Textos de la anulación de un cobro, la devolución y su anulación (brief-21.5, D-3, D-9 y D-13).
// Los del medio, el monto y la caja son los del cobro de una venta.

export const RECEIPT_VOID_REASON_LABEL: Record<ReceiptVoidReason, string> = {
  not_received: "La plata no entró",
  wrong_method: "Otro medio de pago",
  wrong_amount: "Otro monto",
  wrong_target: "Otro destino",
  other: "Otro motivo",
};

export const REFUND_VOID_REASON_LABEL: Record<RefundVoidReason, string> = {
  not_paid: "La plata no salió",
  wrong_method: "Otro medio de pago",
  wrong_amount: "Otro monto",
  wrong_client: "Otro cliente o venta",
  other: "Otro motivo",
};

// Un motivo que la lista ya no tiene se muestra tal cual: es historia.
export function voidReasonText(
  labels: Record<string, string>,
  reason: string,
): string {
  return Object.hasOwn(labels, reason) ? labels[reason]! : reason;
}

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const RECEIPT_VOID_ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede anular cobros.";
export const REFUND_ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede registrar o anular devoluciones.";
export const RECEIPT_NOT_FOUND_MESSAGE = "Este recibo no existe.";
export const REFUND_NOT_FOUND_MESSAGE = "Esta devolución no existe.";
export const CLIENT_NOT_FOUND_MESSAGE = "Este cliente no existe.";
export const SALE_NOT_FOUND_MESSAGE = "Esta venta no existe.";
export const NOTHING_IN_FAVOR_MESSAGE =
  "Este cliente no tiene saldo a favor para devolver.";
export const SALE_NOT_REFUNDABLE_MESSAGE =
  "Solo se devuelve desde una venta sin cliente y anulada. Con cliente, lo cobrado pasó a su cuenta y se devuelve desde ahí.";
export const NOTHING_TO_REFUND_MESSAGE =
  "De esta venta no queda nada a devolver.";
export const NO_REFUNDS_MESSAGE = "Todavía no hay devoluciones.";
export const NO_REFUND_RESULTS_MESSAGE =
  "Ninguna devolución coincide con ese número.";
export const CONSUMER_TEXT = "Consumidor final";
export const UNKNOWN_CLIENT_TEXT = "Cliente no disponible";
// ADR 0022, punto 11, como en la venta y el recibo.
export const NOT_AN_INVOICE_LEGEND = "Documento no válido como factura";

export const REFUND_NOTICE = "Devolución registrada.";
export const RECEIPT_VOID_NOTICE = "Cobro anulado.";
export const REFUND_VOID_NOTICE = "Devolución anulada.";

export function unexpectedVoidMessage(requestId: string): string {
  return `No pudimos registrar la anulación. Código: ${requestId}`;
}

export function unexpectedRefundMessage(requestId: string): string {
  return `No pudimos registrar la devolución. Código: ${requestId}`;
}

export type VoidFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      message: string;
      // Si ya estaba anulado, la anulación que existe.
      existing: { displayNumber: string } | null;
    };

function insufficientCash(currency: string, expected: string): string {
  return `En la caja hay ${formatMoney(expected, currency)} esperados: no alcanza para esta salida de efectivo.`;
}

export function receiptVoidRejection(
  result: Exclude<VoidReceiptResult, { ok: true }>,
): { message: string; existing: { displayNumber: string } | null } {
  const plain = (message: string) => ({ message, existing: null });
  switch (result.code) {
    case "FORBIDDEN":
      return plain(RECEIPT_VOID_ADMIN_ONLY_MESSAGE);
    case "NOT_FOUND":
      return plain(RECEIPT_NOT_FOUND_MESSAGE);
    case "VALIDATION_ERROR":
      return plain(
        "fields" in result && result.fields.includes("reason")
          ? "Elegí un motivo de la lista."
          : RECEIPT_NOT_FOUND_MESSAGE,
      );
    case "BUSINESS_RULE_VIOLATION":
      switch (result.rule) {
        case "already_voided":
          return {
            message: `Este cobro ya está anulado por ${result.void.displayNumber}.`,
            existing: { displayNumber: result.void.displayNumber },
          };
        case "refunds_exceed_receipts":
          return plain(
            `No se puede anular: ya se devolvieron ${formatMoney(
              result.refunded,
              result.currency,
            )}, y sin este cobro quedaría devuelto más de lo cobrado. Si la devolución fue un error, anulala primero.`,
          );
        case "insufficient_cash":
          return plain(insufficientCash(result.currency, result.expected));
      }
  }
}

export function refundVoidRejection(
  result: Exclude<VoidRefundResult, { ok: true }>,
): { message: string; existing: { displayNumber: string } | null } {
  const plain = (message: string) => ({ message, existing: null });
  switch (result.code) {
    case "FORBIDDEN":
      return plain(REFUND_ADMIN_ONLY_MESSAGE);
    case "NOT_FOUND":
      return plain(REFUND_NOT_FOUND_MESSAGE);
    case "VALIDATION_ERROR":
      if ("amount" in result && result.amount === "limit") {
        return plain(
          "Con esta anulación, lo esperado de la caja pasaría el máximo que se puede guardar.",
        );
      }
      return plain(
        "fields" in result && result.fields.includes("reason")
          ? "Elegí un motivo de la lista."
          : REFUND_NOT_FOUND_MESSAGE,
      );
    case "BUSINESS_RULE_VIOLATION":
      return {
        message: `Esta devolución ya está anulada por ${result.void.displayNumber}.`,
        existing: { displayNumber: result.void.displayNumber },
      };
  }
}

export type RefundFormValues = {
  currency: string;
  paymentMethodId: string;
  amount: string;
};

export type RefundFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: RefundFormValues;
      message: string;
      fields: RefundField[];
      openCash: boolean;
    };

export function refundRejection(
  result: Exclude<CreateRefundResult, { ok: true }>,
): { message: string; fields: RefundField[]; openCash: boolean } {
  const plain = (message: string, fields: RefundField[] = []) => ({
    message,
    fields,
    openCash: false,
  });
  if (result.code === "FORBIDDEN") return plain(REFUND_ADMIN_ONLY_MESSAGE);
  if (result.code === "NOT_FOUND" && "entity" in result) {
    if (result.entity === "client") return plain(CLIENT_NOT_FOUND_MESSAGE);
    if (result.entity === "sale") return plain(SALE_NOT_FOUND_MESSAGE);
  }
  if (result.code === "VALIDATION_ERROR") {
    if (!("fields" in result)) return plain(CLIENT_NOT_FOUND_MESSAGE);
    const fields = result.fields as RefundField[];
    if (fields.includes("target")) return plain(CLIENT_NOT_FOUND_MESSAGE);
    if (fields.includes("currency")) {
      const others = fields.filter((field) => field !== "currency");
      const rest =
        others.length === 0
          ? ""
          : ` ${
              receiptRejection({
                ...result,
                fields: others,
              } as Parameters<typeof receiptRejection>[0]).message
            }`;
      return plain(`Moneda: elegí una de la lista.${rest}`, fields);
    }
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    switch (result.rule) {
      case "sale_not_refundable":
        return plain(SALE_NOT_REFUNDABLE_MESSAGE);
      case "exceeds_refundable":
        return plain(
          result.available === "0.00"
            ? "No queda nada para devolver en esta moneda."
            : `La devolución supera lo disponible: ${formatMoney(
                result.available,
                result.currency,
              )}.`,
          ["amount"],
        );
      case "insufficient_cash":
        return plain(insufficientCash(result.currency, result.expected), [
          "amount",
        ]);
      case "no_open_session":
        return {
          message:
            "La caja está cerrada: una devolución en efectivo sale de una sesión abierta.",
          fields: ["paymentMethod"],
          openCash: true,
        };
    }
  }
  // El medio y el monto: los mismos rechazos y textos que el cobro de una venta.
  const shared = receiptRejection(
    result as Parameters<typeof receiptRejection>[0],
  );
  return { ...shared, fields: shared.fields };
}
