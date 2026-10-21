import type {
  CreateSaleReceiptResult,
  ReceiptField,
  TenderField,
} from "@/modules/cash";
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
  conversion:
    "con esta cotización no da un monto que se pueda aplicar. Revisalo o revisá la cotización.",
};

// La cotización acordada de un cobro en otra moneda (brief-29.4, D-6).
export const RATE_TEXT: Record<string, string> = {
  invalid: "escribila con coma decimal, por ejemplo 1.565,50.",
  decimals: "tiene más de seis decimales.",
  too_large: "es demasiado grande.",
  below_one: "tiene que ser 1 o más.",
};

export const NO_EXCHANGE_RATE_MESSAGE =
  "No hay una cotización cargada: sin ella no se cobra en la otra moneda. Cargala en Caja → Cotización.";
export const EXCHANGE_RATE_CHANGED_MESSAGE =
  "La cotización cambió mientras cargabas el cobro. Revisá la equivalencia y volvé a registrarlo.";

// Desde la 29.4, también la moneda que entra y la cotización acordada; desde la 29.7.2, el usado de la
// permuta, que solo tiene el cobro de una venta (brief-29.7.2, D-6). La seña y el cobro a cuenta usan
// estos mismos textos, sin el usado.
export type ReceiptFormField = ReceiptField | TenderField | "tradeIn";

export type ReceiptFormValues = {
  paymentMethodId: string;
  amount: string;
  tenderedCurrency: string;
  exchangeRate: string;
  tradeInId?: string;
};

// Los rechazos de la permuta (brief-29.7.2, D-2).
export const TRADE_IN_RECEIPT_TEXT = {
  methodWithoutTradeIn:
    "«Permuta» solo descuenta un usado elegido en el cobro de una venta. Elegí otro medio.",
  tradeInWithoutMethod: "Un usado se descuenta solo con «Permuta».",
  notFound: "Ese usado no existe. Elegí otro de la lista.",
  voided: "Ese usado está anulado: ya no descuenta ninguna venta.",
  notSaleCredit:
    "Ese usado se recibió como compra: se le paga al cliente, no descuenta una venta.",
  otherClient:
    "Ese usado es de otro cliente: la permuta solo descuenta una venta de quien lo trajo.",
  currencyMismatch:
    "La permuta va en la moneda del usado, sin conversión, y esta venta está en otra moneda.",
} as const;

export type ReceiptFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: ReceiptFormValues;
      message: string;
      fields: ReceiptFormField[];
      // El rechazo de un cobro en efectivo con la caja cerrada enlaza a «Abrir caja».
      openCash: boolean;
    };

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos registrar el cobro. Código: ${requestId}`;
}

export function receiptRejection(
  result: Exclude<CreateSaleReceiptResult, { ok: true }>,
): { message: string; fields: ReceiptFormField[]; openCash: boolean } {
  const plain = (message: string, fields: ReceiptFormField[] = []) => ({
    message,
    fields,
    openCash: false,
  });
  switch (result.code) {
    case "FORBIDDEN":
      return plain(RECEIPT_ADMIN_ONLY_MESSAGE);
    case "NOT_FOUND":
      if ("entity" in result && result.entity === "trade_in") {
        return plain(TRADE_IN_RECEIPT_TEXT.notFound, ["tradeIn"]);
      }
      return "entity" in result && result.entity === "payment_method"
        ? plain("Ese medio de pago ya no existe. Elegí otro de la lista.", [
            "paymentMethod",
          ])
        : plain(RECEIPT_SALE_NOT_FOUND_MESSAGE);
    case "VALIDATION_ERROR": {
      if (!("fields" in result)) return plain(RECEIPT_SALE_NOT_FOUND_MESSAGE);
      const fields: ReceiptFormField[] = result.fields;
      const parts: string[] = [];
      if (fields.includes("paymentMethod")) {
        parts.push("Medio de pago: elegí uno de la lista.");
      }
      if (fields.includes("tenderedCurrency")) {
        parts.push(
          "Moneda que entra: la otra moneda solo entra contra un monto en la moneda principal.",
        );
      }
      if (fields.includes("exchangeRate")) {
        const reason =
          "exchangeRate" in result ? result.exchangeRate : undefined;
        parts.push(`Cotización acordada: ${RATE_TEXT[reason ?? "invalid"]}`);
      }
      if (fields.includes("amount")) {
        const reason = "amount" in result ? result.amount : undefined;
        parts.push(`Monto: ${AMOUNT_TEXT[reason ?? "required"]}`);
      }
      return plain(parts.join(" ") || "Revisá los datos.", fields);
    }
    case "BUSINESS_RULE_VIOLATION":
      switch (result.rule) {
        case "sale_voided":
          return plain(RECEIPT_SALE_VOIDED_MESSAGE);
        case "no_exchange_rate":
          return plain(NO_EXCHANGE_RATE_MESSAGE, ["exchangeRate"]);
        case "exchange_rate_changed":
          return plain(EXCHANGE_RATE_CHANGED_MESSAGE, ["amount"]);
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
        case "trade_in_method_requires_trade_in":
          return plain(TRADE_IN_RECEIPT_TEXT.methodWithoutTradeIn, [
            "paymentMethod",
            "tradeIn",
          ]);
        case "trade_in_requires_trade_in_method":
          return plain(TRADE_IN_RECEIPT_TEXT.tradeInWithoutMethod, [
            "paymentMethod",
          ]);
        case "trade_in_voided":
          return plain(TRADE_IN_RECEIPT_TEXT.voided, ["tradeIn"]);
        case "trade_in_not_sale_credit":
          return plain(TRADE_IN_RECEIPT_TEXT.notSaleCredit, ["tradeIn"]);
        case "trade_in_other_client":
          return plain(TRADE_IN_RECEIPT_TEXT.otherClient, ["tradeIn"]);
        case "trade_in_currency_mismatch":
          return plain(TRADE_IN_RECEIPT_TEXT.currencyMismatch, ["tradeIn"]);
        case "exceeds_trade_in_available":
          return plain(
            result.available === "0.00"
              ? "De ese usado ya no queda nada por descontar."
              : `La permuta supera lo que queda del usado: ${formatMoney(
                  result.available,
                  result.currency,
                )}.`,
            ["amount"],
          );
      }
  }
}
