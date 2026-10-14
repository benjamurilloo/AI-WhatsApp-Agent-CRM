import type { CreateSaleReceiptResult, ReceiptField } from "@/modules/cash";
import { formatMoney } from "@/shared/money";
import { ROW_PROBLEM_TEXT } from "@/app/(autenticado)/caja/messages";

// Textos del cobro de una venta (brief-21.3, D-6 y D-8). Los del monto son los de la caja.

export const RECEIPT_ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede registrar cobros.";
export const RECEIPT_SALE_NOT_FOUND_MESSAGE = "Esta venta no existe.";
export const RECEIPT_SALE_VOIDED_MESSAGE =
  "Esta venta está anulada: no se le registran cobros.";
export const RECEIPT_COLLECTED_MESSAGE =
  "Esta venta ya está cobrada: no le falta nada.";
export const NO_ACTIVE_METHODS_MESSAGE =
  "No hay medios de pago activos. Un administrador los crea o los reactiva en la caja.";

const AMOUNT_TEXT: Record<string, string> = {
  ...ROW_PROBLEM_TEXT,
  limit:
    "Con este cobro, lo esperado de la caja pasaría el máximo que se puede guardar.",
};

export type ReceiptFormValues = { paymentMethodId: string; amount: string };

export type ReceiptFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: ReceiptFormValues;
      message: string;
      fields: ReceiptField[];
      // El rechazo de un cobro en efectivo con la caja cerrada enlaza a «Abrir caja».
      openCash: boolean;
    };

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos registrar el cobro. Código: ${requestId}`;
}

export function receiptRejection(
  result: Exclude<CreateSaleReceiptResult, { ok: true }>,
): { message: string; fields: ReceiptField[]; openCash: boolean } {
  const plain = (message: string, fields: ReceiptField[] = []) => ({
    message,
    fields,
    openCash: false,
  });
  switch (result.code) {
    case "FORBIDDEN":
      return plain(RECEIPT_ADMIN_ONLY_MESSAGE);
    case "NOT_FOUND":
      return "entity" in result && result.entity === "payment_method"
        ? plain("Ese medio de pago ya no existe. Elegí otro de la lista.", [
            "paymentMethod",
          ])
        : plain(RECEIPT_SALE_NOT_FOUND_MESSAGE);
    case "VALIDATION_ERROR": {
      if (!("fields" in result)) return plain(RECEIPT_SALE_NOT_FOUND_MESSAGE);
      const parts: string[] = [];
      if (result.fields.includes("paymentMethod")) {
        parts.push("Medio de pago: elegí uno de la lista.");
      }
      if (result.fields.includes("amount")) {
        parts.push(`Monto: ${AMOUNT_TEXT[result.amount ?? "required"]}`);
      }
      return plain(parts.join(" ") || "Revisá los datos.", result.fields);
    }
    case "BUSINESS_RULE_VIOLATION":
      switch (result.rule) {
        case "sale_voided":
          return plain(RECEIPT_SALE_VOIDED_MESSAGE);
        case "payment_method_inactive":
          return plain(
            "Ese medio de pago está desactivado. Elegí otro de la lista.",
            ["paymentMethod"],
          );
        case "no_open_session":
          return {
            message:
              "La caja está cerrada: un cobro en efectivo necesita una sesión abierta.",
            fields: ["paymentMethod"],
            openCash: true,
          };
        case "exceeds_outstanding":
          return plain(
            result.outstanding === "0.00"
              ? "A esta venta ya no le falta nada por cobrar."
              : `El cobro supera lo que falta: ${formatMoney(
                  result.outstanding,
                  result.currency,
                )}.`,
            ["amount"],
          );
      }
  }
}
