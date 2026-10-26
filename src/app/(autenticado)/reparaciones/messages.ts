import type {
  CreateServiceOrderResult,
  CreateWarrantyClaimResult,
  DeliverServiceOrderResult,
  MarkOwnUnitRepairedResult,
  MarkWarrantyClaimRepairedResult,
  WarrantyClaimRule,
  QuoteLineIssue,
  QuoteRuleIssue,
  QuoteServiceOrderResult,
  RepairPriceField,
  RepairTypeWriteResult,
  SendServiceOrderResult,
  ServiceOrderCancelReason,
  ServiceOrderField,
  ServiceOrderKind,
  ServiceOrderStatus,
  SetRepairPriceResult,
  TransitionResult,
} from "@/modules/service";
import type { AmountRejection } from "@/shared/money";
import { WARRANTY_SETTINGS_NOTICE } from "../_warranty/settings-state";

// Textos de las reparaciones (brief-29.6, D-10): las órdenes de servicio, su presupuesto, su entrega y
// la lista de reparaciones por modelo; desde la 29.6.2, la orden de una unidad propia (brief-29.6.2,
// D-7).

export const SERVICE_ORDERS_TITLE = "Órdenes de servicio";
export const REPAIR_LIST_TITLE = "Lista de reparaciones";
export const NEW_SERVICE_ORDER_TITLE = "Nueva orden de servicio";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede cargar y operar las órdenes de servicio.";
export const SERVICE_ORDER_NOT_FOUND_MESSAGE =
  "Esta orden de servicio no existe.";
export const NO_OPEN_SERVICE_ORDERS_MESSAGE =
  "No hay órdenes de servicio en curso.";
export const NO_SERVICE_ORDER_RESULTS_MESSAGE =
  "No hay órdenes de servicio que coincidan.";
export const NO_REPAIR_TYPES_MESSAGE = "Todavía no hay tipos de reparación.";
export const NO_MODELS_MESSAGE =
  "Todavía no hay modelos: los precios de una reparación son por modelo. Cargá los modelos en la pantalla Modelos.";
export const UNKNOWN_CLIENT_TEXT = "Cliente desconocido";
export const UNKNOWN_MODEL_TEXT = "Modelo desconocido";
export const UNKNOWN_TYPE_TEXT = "Tipo desconocido";
export const RECEPTION_LEGEND =
  "Comprobante de recepción del equipo. No es una factura.";
export const ERASED_TEXT = "Dato vaciado a pedido del cliente.";
export const OWN_UNIT_TEXT = "Unidad propia";
export const UNKNOWN_UNIT_TEXT = "Unidad desconocida";

export const KIND_LABEL: Record<ServiceOrderKind, string> = {
  customer_device: "Equipo de un cliente",
  own_unit: "Unidad propia",
  warranty_claim: "Reclamo de garantía",
};

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

export const STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  received: "Recibida",
  sent: "En el técnico",
  quoted: "Presupuestada",
  approved: "Aprobada",
  rejected: "Rechazada",
  repaired: "Reparada",
  delivered: "Entregada",
  cancelled: "Cancelada",
};

export const CANCEL_REASON_LABEL: Record<ServiceOrderCancelReason, string> = {
  customer_withdrew: "El cliente la retiró",
  not_repairable: "No tiene arreglo",
  entered_by_mistake: "Cargada por error",
  other: "Otro motivo",
  not_covered: "No lo cubre la garantía",
};

// Los motivos que ofrece cada tipo: «no lo cubre la garantía» es solo de un reclamo (brief-29.9.2,
// U-3).
export function cancelReasonsFor(
  kind: ServiceOrderKind,
): ServiceOrderCancelReason[] {
  return (Object.keys(CANCEL_REASON_LABEL) as ServiceOrderCancelReason[])
    .filter((reason) => kind === "warranty_claim" || reason !== "not_covered")
    .sort((a, b) =>
      kind === "warranty_claim"
        ? Number(b === "not_covered") - Number(a === "not_covered")
        : 0,
    );
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

// La lista de reparaciones.

export function repairTypeRejection(
  result: Exclude<RepairTypeWriteResult, { ok: true }>,
  requestId: string,
): { field: string | null; message: string } {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    return {
      field: "name",
      message: "Ingresá un nombre de hasta 60 caracteres.",
    };
  }
  if (result.code === "CONFLICT") {
    return {
      field: "name",
      message: "Ya existe un tipo de reparación con ese nombre.",
    };
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

const AMOUNT_MESSAGE: Record<AmountRejection, string> = {
  separator:
    "Esta moneda no tiene decimales: escribí el monto sin punto ni coma.",
  decimals: "Tiene más decimales de los que admite la moneda.",
  too_large: "El monto es demasiado grande.",
  zero: "El monto tiene que ser mayor que cero.",
  invalid: "Escribí un monto, por ejemplo 80 o 80,50.",
};

export function amountMessage(reason: AmountRejection | undefined): string {
  return reason ? AMOUNT_MESSAGE[reason] : AMOUNT_MESSAGE.invalid;
}

const PRICE_FIELD_MESSAGE: Record<RepairPriceField, string> = {
  price: "",
  cost: "",
  priceCurrency: "Elegí una moneda de la lista.",
  costCurrency: "Elegí una moneda de la lista.",
};

export function priceRejection(
  result: Exclude<SetRepairPriceResult, { ok: true }>,
  requestId: string,
): { field: string | null; message: string } {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    const field = result.fields[0] ?? "price";
    if (field === "price")
      return { field, message: amountMessage(result.priceReason) };
    if (field === "cost")
      return { field, message: amountMessage(result.costReason) };
    return { field, message: PRICE_FIELD_MESSAGE[field] };
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

// La orden.

const ORDER_FIELD_MESSAGE: Record<ServiceOrderField, string> = {
  client: "Elegí un cliente de la lista.",
  model: "Elegí el modelo del equipo.",
  deviceSerial:
    "El IMEI o número de serie lleva hasta 32 letras, números o guiones, sin espacios.",
  reportedIssue: "Escribí lo que reporta el cliente, hasta 1000 caracteres.",
};

export function createOrderRejection(
  result: Exclude<CreateServiceOrderResult, { ok: true }>,
  requestId: string,
): { field: string | null; message: string } {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    const field = result.fields[0] ?? "reportedIssue";
    return { field, message: ORDER_FIELD_MESSAGE[field] };
  }
  if (result.code === "NOT_FOUND" && "target" in result) {
    return result.target === "client"
      ? { field: "client", message: ORDER_FIELD_MESSAGE.client }
      : { field: "model", message: ORDER_FIELD_MESSAGE.model };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return result.rule === "inactive_client"
      ? {
          field: "client",
          message:
            "El cliente está desactivado: reactivalo antes de cargarle una orden.",
        }
      : {
          field: "model",
          message: "El modelo está desactivado: elegí otro o reactivalo.",
        };
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

function transitionText(status: ServiceOrderStatus): string {
  return `La orden ya está ${STATUS_LABEL[status].toLowerCase()}: recargá la página para ver lo que se puede hacer.`;
}

export function transitionMessage(
  result: Exclude<TransitionResult, { ok: true }>,
  requestId: string,
): string {
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return transitionText(result.status);
  }
  return changeMessage(result.code, requestId);
}

export function sendMessage(
  result: Exclude<SendServiceOrderResult, { ok: true }>,
  requestId: string,
): string {
  if (result.code === "NOT_FOUND" && "target" in result) {
    return "Elegí un técnico de la lista.";
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    if (result.rule === "inactive_technician") {
      return "Ese técnico está desactivado: elegí otro.";
    }
    if (result.rule === "not_technician") {
      return "Ese proveedor no está marcado como técnico.";
    }
    if (result.rule === "invalid_transition") {
      return transitionText(result.status);
    }
  }
  return changeMessage(result.code, requestId);
}

const QUOTE_RULE_MESSAGE: Record<QuoteRuleIssue["rule"], string> = {
  missing_type: "Ese tipo de reparación ya no existe.",
  inactive_type: "Ese tipo de reparación está desactivado.",
  price_currency_mismatch:
    "Su precio de la lista está en otra moneda que la del cliente: no se presupuestan monedas mezcladas.",
  cost_currency_mismatch:
    "Su costo de la lista está en otra moneda que la del técnico: no se presupuestan monedas mezcladas.",
};

export type QuoteRejection = {
  message: string;
  // Por tipo de reparación: el error de su fila.
  rows: Record<string, string>;
};

export function quoteRejection(
  result: Exclude<QuoteServiceOrderResult, { ok: true }>,
  requestId: string,
  typeIds: string[],
): QuoteRejection {
  if (result.code === "VALIDATION_ERROR" && "reason" in result) {
    switch (result.reason) {
      case "customer_currency":
        return { message: "Elegí la moneda del cliente.", rows: {} };
      case "technician_currency":
        return { message: "Elegí la moneda del técnico.", rows: {} };
      case "no_lines":
        return {
          message: "Marcá al menos una reparación para el presupuesto.",
          rows: {},
        };
      case "too_many_lines":
        return {
          message: "Son demasiadas reparaciones para una orden.",
          rows: {},
        };
      case "lines":
        return {
          message: "Revisá las reparaciones marcadas.",
          rows: Object.fromEntries(
            result.lines.map((issue: QuoteLineIssue) => [
              typeIds[issue.position - 1] ?? "",
              issue.field === "repairType"
                ? "Esta reparación no se puede presupuestar."
                : `${issue.field === "price" ? "Precio" : "Costo"}: ${amountMessage(issue.reason)}`,
            ]),
          ),
        };
    }
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    if (result.rule === "line_rules") {
      return {
        message: "Revisá las reparaciones marcadas.",
        rows: Object.fromEntries(
          result.lines.map((issue) => [
            issue.repairTypeId,
            QUOTE_RULE_MESSAGE[issue.rule],
          ]),
        ),
      };
    }
    if (result.rule === "total_too_large") {
      return {
        message: "El total del presupuesto es demasiado grande.",
        rows: {},
      };
    }
    return { message: transitionText(result.status), rows: {} };
  }
  return { message: changeMessage(result.code, requestId), rows: {} };
}

export function deliverMessage(
  result: Exclude<DeliverServiceOrderResult, { ok: true }>,
  requestId: string,
): string {
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    if (result.rule === "no_service_product") {
      return "Falta el producto de servicio de las reparaciones: lo crea el comando que activa la capacidad. Pedíselo a quien administra el sistema.";
    }
    return transitionText(result.status);
  }
  return changeMessage(result.code, requestId);
}

// Marcar reparada una unidad propia (brief-29.6.2, D-3): las líneas con lo que cobró el técnico.
export function markRepairedRejection(
  result: Exclude<MarkOwnUnitRepairedResult, { ok: true }>,
  requestId: string,
  typeIds: string[],
): QuoteRejection {
  if (result.code === "VALIDATION_ERROR" && "reason" in result) {
    switch (result.reason) {
      case "currency":
        return {
          message: "La moneda del costo de la unidad no se acepta.",
          rows: {},
        };
      case "no_lines":
        return {
          message: "Marcá al menos una reparación que hizo el técnico.",
          rows: {},
        };
      case "too_many_lines":
        return {
          message: "Son demasiadas reparaciones para una orden.",
          rows: {},
        };
      case "lines":
        return {
          message: "Revisá las reparaciones marcadas.",
          rows: Object.fromEntries(
            result.lines.map((issue) => [
              typeIds[issue.position - 1] ?? "",
              issue.field === "repairType"
                ? "Esta reparación no se puede cargar."
                : `Costo: ${amountMessage(issue.reason)}`,
            ]),
          ),
        };
    }
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    if (result.rule === "line_rules") {
      return {
        message: "Revisá las reparaciones marcadas.",
        rows: Object.fromEntries(
          result.lines.map((issue) => [
            issue.repairTypeId,
            QUOTE_RULE_MESSAGE[issue.rule],
          ]),
        ),
      };
    }
    if (result.rule === "invalid_transition") {
      return { message: transitionText(result.status), rows: {} };
    }
    return {
      message:
        result.rule === "cost_limit"
          ? "El costo de la unidad pasaría el máximo que se puede guardar."
          : "El total es demasiado grande.",
      rows: {},
    };
  }
  return { message: changeMessage(result.code, requestId), rows: {} };
}

// El reclamo de garantía (brief-29.9.2, D-5).
export const WARRANTY_CLAIM_TITLE = "Reclamo de garantía";
export const NEW_WARRANTY_CLAIM_TITLE = "Nuevo reclamo de garantía";

const CLAIM_RULE_MESSAGE: Record<WarrantyClaimRule, string> = {
  not_claimable:
    "Ese equipo no se puede reclamar: tiene que ser una unidad vendida o una reparación entregada.",
  not_in_warranty:
    "Ese equipo no está en garantía. Si corresponde cubrirlo igual, cambiá los días de garantía de la unidad.",
  claim_open: "Ese equipo ya tiene un reclamo abierto.",
  inactive_client:
    "El cliente está desactivado: reactivalo antes de cargarle un reclamo.",
  unit_without_model:
    "El producto de la unidad no tiene modelo: asignale uno para cargar el reclamo.",
};

export function createClaimRejection(
  result: Exclude<CreateWarrantyClaimResult, { ok: true }>,
  requestId: string,
): { field: string | null; message: string } {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    return {
      field: "reportedIssue",
      message: ORDER_FIELD_MESSAGE.reportedIssue,
    };
  }
  if (result.code === "NOT_FOUND" && "target" in result) {
    return {
      field: null,
      message:
        result.target === "client"
          ? "El cliente ya no existe."
          : "El equipo ya no existe.",
    };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return { field: null, message: CLAIM_RULE_MESSAGE[result.rule] };
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

export function claimFormMessage(
  result: Exclude<CreateWarrantyClaimResult, { ok: true }>,
): string {
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return CLAIM_RULE_MESSAGE[result.rule];
  }
  if (result.code === "FORBIDDEN") return ADMIN_ONLY_MESSAGE;
  return "Ese equipo no existe.";
}

// Marcar reparado un reclamo: con lo que cobró el técnico, o sin cargo.
export function markClaimRepairedRejection(
  result: Exclude<MarkWarrantyClaimRepairedResult, { ok: true }>,
  requestId: string,
  typeIds: string[],
): QuoteRejection {
  if (
    result.code === "VALIDATION_ERROR" &&
    "reason" in result &&
    result.reason === "currency"
  ) {
    return { message: "Elegí la moneda de lo que cobró el técnico.", rows: {} };
  }
  if (
    result.code === "BUSINESS_RULE_VIOLATION" &&
    result.rule === "total_too_large"
  ) {
    return { message: "El total es demasiado grande.", rows: {} };
  }
  return markRepairedRejection(
    result as Exclude<MarkOwnUnitRepairedResult, { ok: true }>,
    requestId,
    typeIds,
  );
}

const NOTICES: Record<string, string> = {
  "tipo-creado": "Tipo de reparación creado.",
  "tipo-editado": "Tipo de reparación actualizado.",
  "tipo-desactivado":
    "Tipo desactivado: ya no se ofrece en el presupuesto. Las órdenes que lo tienen lo conservan.",
  "tipo-reactivado": "Tipo reactivado.",
  "precio-guardado": "Precio guardado.",
  // Desde la 29.9 (brief-29.9, D-1).
  "garantia-guardada": WARRANTY_SETTINGS_NOTICE,
  "orden-creada": "Orden de servicio creada.",
  "orden-mandada": "Orden mandada al técnico.",
  "orden-presupuestada": "Presupuesto guardado.",
  "orden-aprobada": "Presupuesto aprobado.",
  "orden-rechazada":
    "Presupuesto rechazado: el equipo se devuelve sin reparar y sin cobrar.",
  "orden-reparada":
    "Orden reparada: lo que cobra el técnico quedó en su cuenta de proveedor.",
  "orden-entregada": "Equipo entregado.",
  "orden-entregada-venta":
    "Equipo entregado: se emitió la venta. Cobrala desde su detalle.",
  "orden-cancelada": "Orden cancelada.",
  // Desde la 29.6.2 (brief-29.6.2, D-7).
  "unidad-mandada":
    "Unidad mandada a reparar: salió del stock hasta que vuelva y se libere a la venta.",
  "unidad-reparada":
    "Unidad reparada: lo que cobró el técnico se sumó a su costo y quedó en su cuenta de proveedor. La unidad está en revisión: liberala a la venta desde sus unidades.",
  "unidad-cancelada":
    "Orden cancelada: la unidad volvió en revisión, sin cambiar su costo.",
  // Desde la 29.9.2 (brief-29.9.2, D-5).
  "reclamo-creado": "Reclamo de garantía creado.",
  "reclamo-reparado":
    "Reclamo reparado: lo que cobró el técnico quedó en su cuenta de proveedor.",
  "reclamo-reparado-sin-cargo":
    "Reclamo reparado sin cargo: no queda deuda con el técnico.",
  "reclamo-entregado": "Equipo entregado, sin cobrarle al cliente.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
