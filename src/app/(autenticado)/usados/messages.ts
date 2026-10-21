import type {
  CreateTradeInPaymentResult,
  TenderField,
  TradeInPaymentField,
  TradeInPaymentVoidReason,
  VoidTradeInCashResult,
  VoidTradeInPaymentResult,
} from "@/modules/cash";
import { formatMoney } from "@/shared/money";
import { ROW_PROBLEM_TEXT } from "@/app/(autenticado)/caja/messages";
import { RATE_TEXT } from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";
import type {
  ChecklistItemWriteResult,
  CreateTradeInResult,
  TradeInDestination,
  TradeInField,
  TradeInVoidReason,
} from "@/modules/tradeins";
import type { AmountRejection } from "@/shared/money";
import { UNIT_STATUS_LABEL } from "../productos/[productId]/unidades/messages";

// Textos de los usados (brief-29.7, D-7): las recepciones, su comprobante, su anulación y el checklist.

export const TRADE_INS_TITLE = "Usados recibidos";
export const NEW_TRADE_IN_TITLE = "Recibir un usado";
export const CHECKLIST_TITLE = "Checklist de un usado";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede recibir usados y configurar el checklist.";
export const TRADE_IN_NOT_FOUND_MESSAGE = "Esta recepción no existe.";
export const NO_TRADE_INS_MESSAGE = "Todavía no se recibió ningún usado.";
export const NO_TRADE_IN_RESULTS_MESSAGE = "No hay recepciones que coincidan.";
export const NO_USED_PRODUCTS_MESSAGE =
  "Para recibir un usado hace falta un producto usado que se lleve por unidad: el equipo entra al stock como una unidad de ese producto. Crealo en Productos, con la condición «Usado», y pasalo a «Por unidad» en su ficha de unidades.";
export const NO_GRADES_MESSAGE =
  "Para recibir un usado hace falta al menos un grado activo. Cargalo en la pantalla Grados.";
export const UNKNOWN_CLIENT_TEXT = "Cliente desconocido";
export const UNKNOWN_PRODUCT_TEXT = "Producto desconocido";
export const TRADE_IN_LEGEND = "Documento no válido como factura.";
export const NO_CHECKLIST_MESSAGE =
  "Todavía no hay puntos en el checklist: el equipo se recibe sin revisarlos. Cargalos en Checklist.";

export const DESTINATION_LABEL: Record<TradeInDestination, string> = {
  sale_credit: "Permuta (a cuenta de una compra)",
  purchase: "Compra del equipo",
};

// En la lista y el comprobante, más corto.
export const DESTINATION_SHORT_LABEL: Record<TradeInDestination, string> = {
  sale_credit: "Permuta",
  purchase: "Compra",
};

export const VOID_REASON_LABEL: Record<TradeInVoidReason, string> = {
  entered_by_mistake: "Error de carga",
  customer_withdrew: "El cliente se arrepintió",
  other: "Otro motivo",
};

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

// El estado de un formulario: el campo con error, o null para el mensaje general.
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: string | null;
      message: string;
      values: Record<string, string>;
      // Los puntos del checklist que estaban marcados.
      passed?: string[];
    };

export type ChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function changeMessage(code: string, requestId: string): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return "Lo que querías cambiar ya no existe.";
    default:
      return unexpectedErrorMessage(requestId);
  }
}

const AMOUNT_MESSAGE: Record<AmountRejection, string> = {
  separator:
    "Esta moneda no tiene decimales: escribí el valor sin punto ni coma.",
  decimals: "Tiene más decimales de los que admite la moneda.",
  too_large: "El valor es demasiado grande.",
  zero: "El valor tiene que ser mayor que cero.",
  invalid: "Escribí un valor, por ejemplo 250000 o 250000,50.",
};

const FIELD_MESSAGE: Record<Exclude<TradeInField, "value">, string> = {
  client: "Elegí un cliente de la lista.",
  product: "Elegí el producto usado al que entra el equipo.",
  serial:
    "Ingresá el IMEI o número de serie: de 1 a 32 letras, números o guiones, sin espacios.",
  batteryHealth: "Ingresá la salud de la batería, de 0 a 100.",
  grade: "Elegí un grado.",
  currency: "Elegí una moneda de la lista.",
  destination: "Elegí si es una permuta o una compra.",
};

// El orden del formulario, para elegir el primer campo inválido.
const FIELD_ORDER: TradeInField[] = [
  "client",
  "product",
  "serial",
  "batteryHealth",
  "grade",
  "value",
  "currency",
  "destination",
];

export function createTradeInRejection(
  result: Exclude<CreateTradeInResult, { ok: true }>,
  requestId: string,
): { field: string | null; message: string } {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    const field = FIELD_ORDER.find((name) => result.fields.includes(name))!;
    return {
      field,
      message:
        field === "value"
          ? AMOUNT_MESSAGE[result.amount ?? "invalid"]
          : FIELD_MESSAGE[field],
    };
  }
  if (result.code === "NOT_FOUND" && "target" in result) {
    return result.target === "client"
      ? { field: "client", message: "Ese cliente no existe." }
      : { field: "product", message: "Ese producto no existe." };
  }
  if (result.code === "CONFLICT") {
    return {
      field: "serial",
      message:
        "Ese IMEI ya es de una unidad que está en el local. Revisalo, o buscá la unidad en el producto.",
    };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    switch (result.rule) {
      case "mandatory_check_failed":
        return {
          field: null,
          message: `El equipo no se puede recibir: no pasó ${result.items.map((item) => `«${item}»`).join(", ")}, que es obligatorio.`,
        };
      case "inactive_client":
        return {
          field: "client",
          message: "Ese cliente está inactivo. Reactivalo desde su ficha.",
        };
      case "inactive_product":
        return {
          field: "product",
          message: "Ese producto está inactivo. Reactivalo desde su ficha.",
        };
      case "not_used_unit_product":
        return {
          field: "product",
          message:
            "El equipo entra a un producto usado que se lleva por unidad.",
        };
      case "inactive_grade":
        return {
          field: "grade",
          message: "Ese grado está inactivo. Elegí otro.",
        };
    }
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

export function voidTradeInMessage(
  result: Exclude<VoidTradeInCashResult, { ok: true }>,
  requestId: string,
): string {
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    switch (result.rule) {
      case "already_voided":
        return `Esta recepción ya está anulada por ${result.voidDisplayNumber}.`;
      case "unit_not_in_shop":
        return `No se puede anular: la unidad está ${UNIT_STATUS_LABEL[result.status].toLowerCase()}. Se anula solo mientras está en revisión o disponible.`;
      // Desde la 29.7.2 (brief-29.7.2, D-4).
      case "trade_in_used_in_receipt":
        return `No se puede anular: el cobro ${result.displayNumber} lo usa como permuta. Anulá primero ese cobro.`;
      case "trade_in_paid":
        return `No se puede anular: el pago ${result.displayNumber} lo paga. Anulá primero ese pago.`;
      default:
        return "No se puede anular: el stock del producto no lo permite.";
    }
  }
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    return "Elegí un motivo de la lista.";
  }
  return changeMessage(result.code, requestId);
}

export function checklistItemRejection(
  result: Exclude<ChecklistItemWriteResult, { ok: true }>,
  requestId: string,
): { field: string | null; message: string } {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    return {
      field: "name",
      message: "Ingresá un nombre de hasta 80 caracteres.",
    };
  }
  if (result.code === "CONFLICT") {
    return {
      field: "name",
      message: "Ya existe un punto con ese nombre.",
    };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return {
      field: null,
      message:
        "El checklist ya tiene 40 puntos. Desactivá uno que no uses para sumar otro.",
    };
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

const NOTICES: Record<string, string> = {
  "usado-recibido":
    "Usado recibido. El equipo entró a las unidades del producto, en revisión.",
  "usado-anulado": "Recepción anulada. La unidad quedó dada de baja.",
  // Desde la 29.7.2 (brief-29.7.2, D-6).
  "pago-registrado": "Pago registrado.",
  "pago-anulado": "Pago anulado.",
  "punto-creado": "Punto agregado al checklist.",
  "punto-guardado": "Punto guardado.",
  "punto-desactivado":
    "Punto desactivado: no se pide en las recepciones nuevas.",
  "punto-reactivado": "Punto reactivado.",
  "punto-movido": "Orden del checklist guardado.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}

// El pago de un usado comprado y su anulación (brief-29.7.2, D-3 y D-6).

export const PAYMENT_TITLE = "Pagar un usado";
export const PAYMENT_ADMIN_ONLY_MESSAGE =
  "Solo un administrador paga usados y ve sus pagos.";
export const PAYMENT_NOT_FOUND_MESSAGE = "Este pago no existe.";
export const PAYMENT_TRADE_IN_VOIDED_MESSAGE =
  "Esta recepción está anulada: no se le registran pagos.";
export const PAYMENT_NOT_PURCHASE_MESSAGE =
  "Este usado se recibió como permuta: no se le paga al cliente, se descuenta de una venta suya con «Permuta».";
export const PAYMENT_PAID_MESSAGE =
  "Este usado ya está pagado: no le falta nada.";
export const PAYMENT_NO_METHODS_MESSAGE =
  "No hay medios de pago activos. Un administrador los crea o los reactiva en la caja.";

export const PAYMENT_VOID_REASON_LABEL: Record<
  TradeInPaymentVoidReason,
  string
> = {
  not_paid: "El pago no se hizo",
  wrong_method: "Medio de pago equivocado",
  wrong_amount: "Monto equivocado",
  wrong_target: "Usado equivocado",
  other: "Otro",
};

// Desde la 29.4.3, como en el pago a un proveedor: la moneda que sale y la cotización acordada.
export type PaymentFormField = TradeInPaymentField | TenderField;

export type PaymentFormValues = {
  paymentMethodId: string;
  amount: string;
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

const PAYMENT_AMOUNT_TEXT: Record<string, string> = {
  ...ROW_PROBLEM_TEXT,
  limit:
    "Con este pago, lo esperado de la caja pasaría el máximo que se puede guardar.",
  conversion:
    "con esta cotización no da un monto que se pueda aplicar. Revisalo o revisá la cotización.",
};

export function paymentUnexpectedErrorMessage(requestId: string): string {
  return `No pudimos registrar el pago. Código: ${requestId}`;
}

export function tradeInPaymentRejection(
  result: Exclude<CreateTradeInPaymentResult, { ok: true }>,
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
      return "entity" in result && result.entity === "payment_method"
        ? plain("Ese medio de pago ya no existe. Elegí otro de la lista.", [
            "paymentMethod",
          ])
        : plain(TRADE_IN_NOT_FOUND_MESSAGE);
    case "VALIDATION_ERROR": {
      if (!("fields" in result)) return plain(TRADE_IN_NOT_FOUND_MESSAGE);
      const fields: PaymentFormField[] = result.fields;
      const parts: string[] = [];
      if (fields.includes("paymentMethod")) {
        parts.push("Medio de pago: elegí uno de la lista.");
      }
      if (fields.includes("tenderedCurrency")) {
        parts.push(
          "Moneda que sale: la otra moneda solo sale contra un usado en la moneda principal.",
        );
      }
      if (fields.includes("exchangeRate")) {
        const reason =
          "exchangeRate" in result ? result.exchangeRate : undefined;
        parts.push(`Cotización acordada: ${RATE_TEXT[reason ?? "invalid"]}`);
      }
      if (fields.includes("amount")) {
        const reason = "amount" in result ? result.amount : undefined;
        parts.push(`Monto: ${PAYMENT_AMOUNT_TEXT[reason ?? "required"]}`);
      }
      return plain(parts.join(" ") || "Revisá los datos.", fields);
    }
    case "BUSINESS_RULE_VIOLATION":
      switch (result.rule) {
        case "trade_in_voided":
          return plain(PAYMENT_TRADE_IN_VOIDED_MESSAGE);
        case "trade_in_not_purchase":
          return plain(PAYMENT_NOT_PURCHASE_MESSAGE);
        case "trade_in_method_requires_trade_in":
          return plain(
            "«Permuta» descuenta un usado de una venta: no le paga al cliente. Elegí otro medio.",
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
        case "insufficient_cash":
          return plain(
            `En la caja no alcanza el efectivo: hay ${formatMoney(result.expected, result.currency)}.`,
            ["amount"],
          );
        case "exceeds_outstanding":
          return plain(
            result.outstanding === "0.00"
              ? PAYMENT_PAID_MESSAGE
              : `El pago supera lo que falta: ${formatMoney(result.outstanding, result.currency)}.`,
            ["amount"],
          );
        case "no_exchange_rate":
          return plain(
            "No hay una cotización cargada: sin ella no se paga en la otra moneda. Cargala en Caja → Cotización.",
            ["exchangeRate"],
          );
        case "exchange_rate_changed":
          return plain(
            "La cotización cambió mientras cargabas el pago. Revisá la equivalencia y volvé a registrarlo.",
            ["amount"],
          );
        default:
          return plain("No se pudo registrar el pago. Revisá los datos.");
      }
  }
}

export function voidTradeInPaymentMessage(
  result: Exclude<VoidTradeInPaymentResult, { ok: true }>,
  requestId: string,
): string {
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return `Este pago ya está anulado por ${result.void.displayNumber}.`;
  }
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    return (result.fields as string[]).includes("reason")
      ? "Elegí un motivo de la lista."
      : "Con esta anulación, lo esperado de la caja pasaría el máximo que se puede guardar.";
  }
  if (result.code === "FORBIDDEN") return PAYMENT_ADMIN_ONLY_MESSAGE;
  if (result.code === "NOT_FOUND") return PAYMENT_NOT_FOUND_MESSAGE;
  return changeMessage(result.code, requestId);
}
