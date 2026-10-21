import type {
  CreateSupplierPaymentResult,
  SupplierPaymentField,
  SupplierPaymentVoidReason,
  TenderField,
  VoidSupplierPaymentResult,
} from "@/modules/cash";
import { formatMoney } from "@/shared/money";
import { ROW_PROBLEM_TEXT } from "@/app/(autenticado)/caja/messages";
import { NO_RATE_OUTGOING_TEXT } from "@/app/(autenticado)/caja/exchange";
import { RATE_TEXT } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";

// Textos de los pagos a proveedores (brief-22.6, D-10 y D-13), derivados de la taxonomía de errores,
// como los del cobro. Los del monto son los de la caja.

export const PAYMENT_ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede ver y registrar pagos a proveedores.";
export const PAYMENT_NOT_FOUND_MESSAGE = "Este pago no existe.";
export const PAYMENT_VOID_NOT_FOUND_MESSAGE = "Este pago no está anulado.";
export const PAYMENT_RECEIPT_NOT_FOUND_MESSAGE = "Esta recepción no existe.";
export const PAYMENT_SUPPLIER_NOT_FOUND_MESSAGE = "Este proveedor no existe.";
export const PAYMENT_RECEIPT_VOIDED_MESSAGE =
  "Esta recepción está anulada: no se le registran pagos. Lo pagado contra ella pasó a la cuenta del proveedor.";
export const PAYMENT_RECEIPT_PAID_MESSAGE =
  "Esta recepción ya está pagada: no le falta nada.";
export const NO_ACTIVE_METHODS_MESSAGE =
  "No hay medios de pago activos. Un administrador los crea o los reactiva en la caja.";
export const NO_PAYMENTS_MESSAGE = "Todavía no hay pagos a proveedores.";
export const NO_PAYMENT_RESULTS_MESSAGE =
  "Ningún pago coincide con estos filtros.";
export const VOIDED_BADGE_TEXT = "Anulado";
export const ACCOUNT_TARGET_TEXT = "A cuenta";
export const IN_FAVOR_NOTE =
  "Un pago a cuenta no tiene tope: lo que exceda lo que se le debe queda a favor del negocio y se imputa a las recepciones que vengan, de la más vieja a la más nueva.";

const AMOUNT_TEXT: Record<string, string> = {
  ...ROW_PROBLEM_TEXT,
  limit: "El monto es demasiado grande.",
  conversion:
    "con esta cotización no da un monto que se pueda aplicar. Revisalo o revisá la cotización.",
};

export const PAYMENT_VOID_REASON_LABEL: Record<
  SupplierPaymentVoidReason,
  string
> = {
  not_paid: "El pago no se hizo",
  wrong_method: "Medio de pago equivocado",
  wrong_amount: "Monto equivocado",
  wrong_target: "Recepción o proveedor equivocados",
  other: "Otro",
};

// Desde la 29.4.3, también la moneda que sale y la cotización acordada (brief-29.4.3, D-7).
export type PaymentFormField = SupplierPaymentField | TenderField;

export type PaymentFormValues = {
  paymentMethodId: string;
  amount: string;
  currency: string;
  tenderedCurrency: string;
  exchangeRate: string;
};

export type PaymentFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: PaymentFormValues;
      message: string;
      fields: PaymentFormField[];
      // El rechazo de un pago en efectivo con la caja cerrada enlaza a «Abrir caja».
      openCash: boolean;
    };

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos registrar el pago. Código: ${requestId}`;
}

export function paymentRejection(
  result: Exclude<CreateSupplierPaymentResult, { ok: true }>,
): { message: string; fields: PaymentFormField[]; openCash: boolean } {
  const plain = (message: string, fields: PaymentFormField[] = []) => ({
    message,
    fields,
    openCash: false,
  });
  switch (result.code) {
    case "FORBIDDEN":
      return plain(PAYMENT_ADMIN_ONLY_MESSAGE);
    case "NOT_FOUND":
      if ("entity" in result) {
        if (result.entity === "payment_method") {
          return plain(
            "Ese medio de pago ya no existe. Elegí otro de la lista.",
            ["paymentMethod"],
          );
        }
        if (result.entity === "supplier") {
          return plain(PAYMENT_SUPPLIER_NOT_FOUND_MESSAGE);
        }
      }
      return plain(PAYMENT_RECEIPT_NOT_FOUND_MESSAGE);
    case "VALIDATION_ERROR": {
      if (!("fields" in result))
        return plain(PAYMENT_RECEIPT_NOT_FOUND_MESSAGE);
      const fields: PaymentFormField[] = result.fields;
      const parts: string[] = [];
      if (fields.includes("paymentMethod")) {
        parts.push("Medio de pago: elegí uno de la lista.");
      }
      if (fields.includes("currency")) {
        // Con moneda principal, a cuenta se aplica en ella o en una moneda con saldo (brief-29.4.3,
        // D-4; revisión R1-1).
        parts.push(
          "Moneda: elegí una de la lista. Con una moneda principal, a cuenta se paga en ella o en una moneda en la que se le deba al proveedor.",
        );
      }
      if (fields.includes("tenderedCurrency")) {
        parts.push(
          "Moneda que sale: la otra moneda solo sale contra un monto en la moneda principal.",
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
        case "goods_receipt_voided":
          return plain(PAYMENT_RECEIPT_VOIDED_MESSAGE);
        case "no_exchange_rate":
          return plain(NO_RATE_OUTGOING_TEXT, ["exchangeRate"]);
        case "exchange_rate_changed":
          return plain(
            "La cotización cambió mientras cargabas el pago. Revisá la equivalencia y volvé a registrarlo.",
            ["amount"],
          );
        case "trade_in_method_requires_trade_in":
          return plain(
            "«Permuta» solo descuenta un usado de una venta. Elegí otro medio.",
            ["paymentMethod"],
          );
        case "payment_method_inactive":
          return plain(
            "Ese medio de pago está desactivado. Elegí otro de la lista.",
            ["paymentMethod"],
          );
        case "no_open_session":
          return {
            message:
              "La caja está cerrada: un pago en efectivo necesita una sesión abierta.",
            fields: ["paymentMethod"],
            openCash: true,
          };
        case "exceeds_outstanding":
          return plain(
            result.outstanding === "0.00"
              ? "A esta recepción ya no le falta nada por pagar."
              : `El pago supera lo que falta: ${formatMoney(
                  result.outstanding,
                  result.currency,
                )}.`,
            ["amount"],
          );
        case "insufficient_cash":
          return plain(
            `No hay tanto efectivo en la caja: lo esperado en ${result.currency} es ${formatMoney(
              result.expected,
              result.currency,
            )}.`,
            ["amount"],
          );
      }
  }
}

export type VoidPaymentState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      message: string;
      // La anulación que ya tiene el pago, para enlazarla.
      existing: { displayNumber: string } | null;
    };

export function voidUnexpectedErrorMessage(requestId: string): string {
  return `No pudimos anular el pago. Código: ${requestId}`;
}

export function voidPaymentRejection(
  result: Exclude<VoidSupplierPaymentResult, { ok: true }>,
): { message: string; existing: { displayNumber: string } | null } {
  switch (result.code) {
    case "FORBIDDEN":
      return {
        message: "Solo un administrador puede anular un pago.",
        existing: null,
      };
    case "NOT_FOUND":
      return { message: PAYMENT_NOT_FOUND_MESSAGE, existing: null };
    case "VALIDATION_ERROR":
      return "fields" in result && result.fields[0] === "amount"
        ? {
            message:
              "Con esta anulación, lo esperado de la caja pasaría el máximo que se puede guardar.",
            existing: null,
          }
        : { message: "Elegí el motivo de la anulación.", existing: null };
    case "BUSINESS_RULE_VIOLATION":
      return {
        message: `Este pago ya está anulado, por ${result.void.displayNumber}.`,
        existing: { displayNumber: result.void.displayNumber },
      };
  }
}

// Avisos tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  creado: "Pago registrado.",
  anulado: "Pago anulado: lo que se le debe al proveedor volvió a crecer.",
};

export function paymentNoticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}

// Lo que pasa con la caja al anular, dicho antes de confirmar (D-13; ADR 0023, punto 8).
export function voidCashNote(
  session: { displayNumber: string; open: boolean } | null,
): string {
  if (session === null) {
    return "El pago no fue en efectivo: la caja no cambia.";
  }
  return session.open
    ? `La plata vuelve a lo esperado de la sesión abierta ${session.displayNumber}.`
    : `La sesión ${session.displayNumber} ya cerró: la caja no cambia. Si el pago no se hizo, el sobrante ya apareció en ese cierre.`;
}
