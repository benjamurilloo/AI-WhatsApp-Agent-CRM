import type { VoidTradeInCashResult } from "@/modules/cash";
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
