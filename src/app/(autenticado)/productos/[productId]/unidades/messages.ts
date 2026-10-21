import type {
  ChangeTrackingResult,
  CorrectUnitResult,
  RegisterUnitResult,
  ReleaseUnitResult,
  UnitField,
  UnitStatus,
  WriteOffUnitResult,
} from "@/modules/inventory";
import type { CreateOwnUnitServiceOrderResult } from "@/modules/service";
import type { StockTracking } from "@/modules/catalog";
import { formatQuantity } from "@/shared/quantity";

// Textos de la pantalla de unidades de un producto (brief-29.5, D-3, D-4 y D-6).

export const UNITS_TITLE = "Unidades";

export const TRACKING_LABEL: Record<StockTracking, string> = {
  quantity: "Por cantidad",
  unit: "Por unidad, con IMEI",
};

export const TRACKING_HINT: Record<StockTracking, string> = {
  quantity:
    "El stock es un número: sube con las recepciones y los ajustes, y baja con las ventas.",
  unit: "Cada unidad tiene su IMEI o número de serie, su costo, su grado y su batería. El stock es la cantidad de unidades disponibles.",
};

export const TRACKING_LOCKED_MESSAGE =
  "No se puede cambiar: el producto ya tiene movimientos de stock. Para llevar este equipo por unidad, creá otro producto.";

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  available: "Disponible",
  written_off: "Dada de baja",
  // Desde la 29.5.2 (brief-29.5.2, D-5).
  reserved: "Reservada",
  sold: "Vendida",
  // Desde la 29.6.2 (brief-29.6.2, D-7).
  in_repair: "En reparación",
  in_review: "En revisión",
};

export const UNIT_ORIGIN_LABEL = {
  goods_receipt: "Recepción de mercadería",
  manual: "Alta manual",
} as const;

export const NO_AVAILABLE_UNITS_MESSAGE = "No hay unidades disponibles.";
export const NOT_UNIT_TRACKED_MESSAGE =
  "Este producto se lleva por cantidad: no tiene unidades.";
export const UNIT_NOT_FOUND_MESSAGE = "Esta unidad no existe.";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

// La batería, como se muestra: «87 %», o vacío.
export function batteryText(value: number | null): string {
  return value === null ? "" : `${value} %`;
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

export type Rejection = { field: string | null; message: string };

const UNIT_FIELD_MESSAGE: Record<UnitField, string> = {
  serial:
    "Escribí el IMEI o número de serie: de 1 a 32 letras, números o guiones, sin espacios.",
  cost: "Escribí el costo, mayor que cero, con los decimales de la moneda.",
  currency: "Elegí la moneda del costo.",
  gradeId: "Elegí un grado activo de la lista, o ninguno.",
  batteryHealth:
    "Escribí la batería como un número de 0 a 100, o dejala vacía.",
  price:
    "Escribí el precio, mayor que cero, con los decimales de la moneda, o dejá el precio y la moneda vacíos.",
  priceCurrency:
    "Elegí la moneda del precio, o dejá el precio y la moneda vacíos.",
};

function balanceMessage(rule: string): string {
  switch (rule) {
    case "below_reserved":
      return "La baja dejaría el stock por debajo de lo reservado por pedidos confirmados.";
    case "stock_limit":
      return "El stock del producto pasaría el máximo que se puede guardar.";
    default:
      return "La baja dejaría el stock negativo.";
  }
}

function commonRejection(code: string, requestId: string): Rejection {
  switch (code) {
    case "FORBIDDEN":
      return { field: null, message: FORBIDDEN_ACTION_MESSAGE };
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return { field: null, message: "Lo que querías cambiar ya no existe." };
    default:
      return { field: null, message: unexpectedErrorMessage(requestId) };
  }
}

export function trackingRejection(
  result: Exclude<ChangeTrackingResult, { ok: true }>,
  requestId: string,
): Rejection {
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return {
      field: null,
      message:
        result.rule === "has_movements"
          ? TRACKING_LOCKED_MESSAGE
          : result.rule === "service_product"
            ? "Este es el producto de las reparaciones: no tiene stock ni unidades."
            : "La organización no tiene activada la carga por unidad.",
    };
  }
  return commonRejection(result.code, requestId);
}

export function registerRejection(
  result: Exclude<RegisterUnitResult, { ok: true }>,
  requestId: string,
): Rejection {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    const field = result.fields[0] ?? "serial";
    return { field, message: UNIT_FIELD_MESSAGE[field] };
  }
  if (result.code === "CONFLICT") {
    return {
      field: "serial",
      message:
        "Ya hay una unidad vigente con ese IMEI. Si se cargó mal, dala de baja y cargala de nuevo.",
    };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    switch (result.rule) {
      case "inactive_product":
        return {
          field: null,
          message:
            "El producto está desactivado: reactivalo para cargarle unidades.",
        };
      case "not_unit_tracked":
        return { field: null, message: NOT_UNIT_TRACKED_MESSAGE };
      default:
        return { field: null, message: balanceMessage(result.rule) };
    }
  }
  return commonRejection(result.code, requestId);
}

export function writeOffRejection(
  result: Exclude<WriteOffUnitResult, { ok: true }>,
  requestId: string,
): Rejection {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    return {
      field: "reason",
      message: "Escribí el motivo de la baja, de hasta 500 caracteres.",
    };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return {
      field: null,
      message:
        result.rule === "unit_not_available"
          ? "Esta unidad ya no está disponible ni en revisión: está reservada, vendida, en reparación o dada de baja."
          : balanceMessage(result.rule),
    };
  }
  return commonRejection(result.code, requestId);
}

export function correctRejection(
  result: Exclude<CorrectUnitResult, { ok: true }>,
  requestId: string,
): Rejection {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    const field = result.fields[0] ?? "gradeId";
    return { field, message: UNIT_FIELD_MESSAGE[field] };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return {
      field: null,
      message:
        "Esta unidad ya no está disponible ni en revisión (está reservada, vendida, en reparación o dada de baja): no se corrige.",
    };
  }
  return commonRejection(result.code, requestId);
}

// Mandar una unidad a reparar (brief-29.6.2, D-7). El campo es el técnico o qué hay que reparar.
export function sendToRepairRejection(
  result: Exclude<CreateOwnUnitServiceOrderResult, { ok: true }>,
  requestId: string,
): Rejection {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    return result.fields[0] === "technician"
      ? { field: "technicianId", message: "Elegí un técnico de la lista." }
      : {
          field: "reportedIssue",
          message: "Escribí qué hay que reparar, de hasta 1000 caracteres.",
        };
  }
  if (result.code === "NOT_FOUND" && "target" in result) {
    return result.target === "technician"
      ? { field: "technicianId", message: "Ese técnico ya no existe." }
      : { field: null, message: UNIT_NOT_FOUND_MESSAGE };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    switch (result.rule) {
      case "unit_not_available":
        return {
          field: null,
          message:
            "Esta unidad ya no está disponible ni en revisión: está reservada, vendida, en reparación o dada de baja.",
        };
      case "unit_without_model":
        return {
          field: null,
          message:
            "El producto de esta unidad no tiene modelo: asignale uno para mandarla a reparar, porque las reparaciones se cargan con la lista del modelo.",
        };
      case "inactive_technician":
        return {
          field: "technicianId",
          message: "Ese técnico está desactivado. Elegí otro.",
        };
      case "not_technician":
        return {
          field: "technicianId",
          message: "Ese proveedor no está marcado como técnico. Elegí otro.",
        };
      default:
        return {
          field: null,
          message:
            "Mandarla a reparar dejaría el stock por debajo de lo reservado por pedidos confirmados.",
        };
    }
  }
  return commonRejection(result.code, requestId);
}

// Liberar una unidad en revisión a la venta (brief-29.6.2, D-2).
export function releaseRejection(
  result: Exclude<ReleaseUnitResult, { ok: true }>,
  requestId: string,
): Rejection {
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return {
      field: null,
      message:
        result.rule === "unit_not_in_review"
          ? "Esta unidad ya no está en revisión."
          : balanceMessage(result.rule),
    };
  }
  return commonRejection(result.code, requestId);
}

// Avisos tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  "seguimiento-cambiado": "Listo: cambió cómo se lleva el stock del producto.",
  "unidad-cargada": "Unidad cargada: el stock subió en 1.",
  "unidad-baja": "Unidad dada de baja: el stock bajó en 1.",
  "unidad-corregida": "Unidad corregida.",
  // Desde la 29.6.2 (brief-29.6.2, D-7).
  "unidad-liberada": "Unidad liberada a la venta: el stock subió en 1.",
  "unidad-baja-revision":
    "Unidad dada de baja. Estaba en revisión, fuera del stock: el stock no cambió.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}

// El saldo, como texto: «3 unidades disponibles».
export function availableText(quantity: string): string {
  const value = formatQuantity(quantity);
  return value === "1"
    ? "1 unidad disponible"
    : `${value} unidades disponibles`;
}
