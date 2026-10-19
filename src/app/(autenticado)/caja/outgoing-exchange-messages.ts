import type { ReceiptField, TenderField } from "@/modules/cash";
import {
  RATE_TEXT,
  receiptRejection,
} from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import { NO_RATE_OUTGOING_TEXT } from "./exchange";

// Los rechazos propios de una salida en la otra moneda (brief-29.4.3, D-7): la devolución y el pago a
// un proveedor. Los del medio y el monto son los del cobro; estos cambian «entra» por «sale» y
// nombran el movimiento. null si el rechazo no es de la otra moneda: lo resuelve el texto de siempre.

type Rejection = {
  code: string;
  rule?: string;
  fields?: string[];
  exchangeRate?: string;
};

export function outgoingExchangeRejection(
  result: Rejection,
  movement: { name: string; again: string },
): { message: string; fields: (ReceiptField | TenderField)[] } | null {
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    if (result.rule === "no_exchange_rate") {
      return { message: NO_RATE_OUTGOING_TEXT, fields: ["exchangeRate"] };
    }
    if (result.rule === "exchange_rate_changed") {
      return {
        message: `La cotización cambió mientras cargabas ${movement.name}. Revisá la equivalencia y ${movement.again}.`,
        fields: ["amount"],
      };
    }
    return null;
  }
  if (result.code !== "VALIDATION_ERROR" || !result.fields) return null;
  const fields = result.fields as (ReceiptField | TenderField)[];
  if (
    !fields.includes("tenderedCurrency") &&
    !fields.includes("exchangeRate")
  ) {
    return null;
  }
  const parts: string[] = [];
  if (fields.includes("tenderedCurrency")) {
    parts.push(
      "Moneda que sale: la otra moneda solo sale contra un monto en la moneda principal.",
    );
  }
  if (fields.includes("exchangeRate")) {
    parts.push(
      `Cotización acordada: ${RATE_TEXT[result.exchangeRate ?? "invalid"]}`,
    );
  }
  const others = fields.filter(
    (field) => field !== "tenderedCurrency" && field !== "exchangeRate",
  );
  if (others.length > 0) {
    parts.push(
      receiptRejection({
        ...result,
        fields: others,
      } as Parameters<typeof receiptRejection>[0]).message,
    );
  }
  return { message: parts.join(" "), fields };
}
