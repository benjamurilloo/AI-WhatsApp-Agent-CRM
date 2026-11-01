import type {
  ChangeTrackingResult,
  CorrectUnitResult,
  RegisterUnitResult,
  ReleaseUnitResult,
  UnitField,
  UnitStatus,
  UnitWarrantyDaysResult,
  WriteOffUnitResult,
} from "@/modules/inventory";
import type { CreateOwnUnitServiceOrderResult } from "@/modules/service";
import type { StockTracking } from "@/modules/catalog";
import type { IconName } from "@/app/_components/icons";
import type { StatusTone } from "@/app/_components/status-badge";
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
  trade_in: "Usado recibido",
} as const;

// El tono y el ícono de cada estado (brief-24.5.2, D-6; criterios de la v2): disponible verde,
// reservada azul y en revisión ámbar, **siempre con texto**, que es lo que leen los lectores de
// pantalla. «En reparación» va en neutro y no en ámbar para que no se confunda con «en revisión»:
// son dos estados distintos desde la 29.6.2 y esta subfase los separa.
export const UNIT_STATUS_TONE: Record<UnitStatus, StatusTone> = {
  available: "success",
  reserved: "info",
  sold: "primary",
  in_repair: "neutral",
  in_review: "warning",
  written_off: "danger",
};

export const UNIT_STATUS_ICON: Record<UnitStatus, IconName> = {
  available: "check",
  reserved: "receipt",
  sold: "banknote",
  in_repair: "wrench",
  in_review: "eye",
  written_off: "power",
};

// Los tipos de movimiento, para el historial de una unidad (brief-24.5.2, D-3).
//
// **Duplica `TYPE_LABEL` de `movimientos/page.tsx`, y la duplicación es deliberada**: ese archivo
// está fuera de la lista cerrada de archivos autorizados de esta subfase, y la regla es que salirse
// de la lista se para y se pregunta. Unificarlos en un módulo compartido es el remedio, y
// corresponde hacerlo cuando una subfase tenga autorizados los dos archivos. Mientras tanto, el
// riesgo es que se separen: si se agrega un tipo al enum, hay que tocar las dos copias.
export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  adjustment_positive: "Ajuste positivo",
  adjustment_negative: "Ajuste negativo",
  order_delivery: "Entrega de pedido",
  sale: "Venta",
  sale_void: "Anulación de venta",
  goods_receipt: "Recepción",
  goods_receipt_void: "Anulación de recepción",
  unit_to_repair: "A reparación",
  unit_released: "Liberada a la venta",
  unit_written_off: "Baja de usado",
};

export function movementTypeLabel(type: string): string {
  return MOVEMENT_TYPE_LABEL[type] ?? type;
}

// El historial del panel y sus estados (brief-24.5.2, D-3, D-10 e I-2).
export const HISTORY_EMPTY_MESSAGE = "Esta unidad todavía no tiene eventos.";
export const HISTORY_MOVEMENTS_UNAVAILABLE_MESSAGE =
  "No disponible: no pudimos leer los movimientos de esta unidad. No significa que no tenga.";
export const HISTORY_AUDIT_UNAVAILABLE_MESSAGE =
  "No disponible: no pudimos leer los cambios de estado de esta unidad. No significa que no tenga.";
// Lo que ve un viewer. No es un error: es la frontera de roles que ya existía (SecurityModel).
export const HISTORY_AUDIT_ADMIN_ONLY_MESSAGE =
  "Los cambios de estado de una unidad los ve un administrador.";

// El aviso de tope, **por fuente**. Antes solo cubría los movimientos y la auditoría quedaba
// recortada en silencio: era el riesgo R-2 del brief sin mitigar, y lo encontró la revisión
// independiente (N-1). Un historial recortado que se ve completo es peor que uno que lo dice.
export function historyCapMessage({
  movementsShown,
  movementsLimit,
  auditShown,
  auditTotal,
}: {
  movementsShown: number;
  movementsLimit: number;
  auditShown: number;
  auditTotal: number | null;
}): string {
  const avisos: string[] = [];
  if (movementsLimit > 0 && movementsShown >= movementsLimit) {
    avisos.push(`los últimos ${movementsLimit} movimientos`);
  }
  // El total de la auditoría lo devuelve la lectura, así que acá no se estima: se compara.
  if (auditTotal !== null && auditTotal > auditShown) {
    avisos.push(`${auditShown} de ${auditTotal} cambios`);
  }
  return avisos.length === 0
    ? ""
    : `Se muestran ${avisos.join(" y ")}: el historial está recortado.`;
}

// Cómo se nombra cada acción de auditoría sobre una unidad. Son **cinco**, no una: antes todas se
// dibujaban como «Cambio de estado», así que una corrección de grado o un cambio de días de
// garantía aparecía como un cambio de estado y sin ningún dato (N-2).
const UNIT_AUDIT_ACTION_LABEL: Record<string, string> = {
  create: "Alta de la unidad",
  status_change: "Cambio de estado",
  update: "Corrección",
  price_change: "Cambio de precio",
  cost_change: "Cambio de costo",
};

export function unitAuditActionLabel(action: string): string {
  return UNIT_AUDIT_ACTION_LABEL[action] ?? "Cambio registrado";
}

// Los campos de una entrada, con su nombre en español. Se dice **qué** cambió y no a qué valor: un
// valor de auditoría puede ser un dato que esta pantalla no muestra a este rol.
const UNIT_AUDIT_FIELD_LABEL: Record<string, string> = {
  gradeId: "el grado",
  batteryHealth: "la batería",
  price: "el precio",
  priceCurrency: "la moneda del precio",
  cost: "el costo",
  costCurrency: "la moneda del costo",
  warrantyDays: "los días de garantía",
  serial: "el IMEI",
};

export function unitAuditChangedText(changed: string[]): string {
  if (changed.length === 0) return "";
  const nombres = changed.map(
    (campo) => UNIT_AUDIT_FIELD_LABEL[campo] ?? campo,
  );
  return nombres.length === 1
    ? `Cambió ${nombres[0]}.`
    : `Cambiaron ${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}.`;
}

// El filtro por estado y la búsqueda de la lista (brief-24.5.2, D-5 y D-7).
export const ALL_UNITS_LABEL = "Todas";
export const SEARCH_LABEL = "Buscar por IMEI o serie";

export function searchTooShortMessage(min: number): string {
  return `Escribí al menos ${min} caracteres del final del IMEI para buscar. Mientras tanto, la lista no está filtrada por búsqueda.`;
}

export const NO_UNITS_FOR_FILTER_MESSAGE =
  "Ninguna unidad coincide con el filtro o la búsqueda.";
export const NO_UNITS_MESSAGE = "Este producto todavía no tiene unidades.";
// Los tres mensajes son distintos a propósito: «no coincide ninguna» habla del filtro, «todavía no
// tiene» afirma algo sobre el producto, y este dice que **no se sabe**. Confundirlos es lo que I-2
// prohíbe.
export const UNITS_UNAVAILABLE_MESSAGE =
  "No disponible: no pudimos leer las unidades de este producto. No significa que no tenga.";
export const UNIT_COUNTS_UNAVAILABLE_MESSAGE =
  "No disponible: no pudimos leer cuántas unidades hay en cada estado, así que los filtros van sin su cantidad.";
// Un `?unidad=` que no resuelve. Es **otra cosa** que los tres de arriba: la lectura salió bien y la
// respuesta es que esa unidad no está acá, así que no se dice «no disponible» ni se calla. No se
// distingue entre «no existe», «es de otra organización» y «es de otro producto»: para quien mira es
// el mismo hecho, y separarlos le contaría a una organización algo de las otras.
export const UNIT_PANEL_NOT_FOUND_MESSAGE =
  "No encontramos esa unidad entre las de este producto. El enlace puede ser viejo.";

// `NO_AVAILABLE_UNITS_MESSAGE` («No hay unidades disponibles.») se retiró en la 24.5.2: era el vacío
// de la sección «Unidades disponibles», que D-11 reemplazó por la lista única. Sus dos vacíos son
// `NO_UNITS_MESSAGE` y `NO_UNITS_FOR_FILTER_MESSAGE`, que distinguen «no tiene ninguna» de «ninguna
// coincide con el filtro».
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
      // Desde la 24.5.2-b (D-9): adónde ir cuando el error tiene un destino. Hoy lo usa un solo
      // caso, el IMEI repetido, y por eso es opcional: los demás rechazos no llevan a ninguna
      // parte. `actions.ts` esparce el rechazo entero en el estado, así que viaja sin tocarlo.
      linkHref?: string;
      linkLabel?: string;
    };

export type Rejection = {
  field: string | null;
  message: string;
  linkHref?: string;
  linkLabel?: string;
};

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
    // D-9: el error dice **cuál** unidad lo tiene y lleva hasta ella. Antes solo decía que existía,
    // y encontrarla era trabajo del usuario: volver a la lista y buscar el IMEI a mano. La unidad
    // puede ser de **otro** producto, así que el enlace sale del productId que trae el rechazo, no
    // del de la pantalla.
    const existing = result.existing;
    return {
      field: "serial",
      message: existing
        ? "Ya hay una unidad vigente con ese IMEI."
        : "Ya hay una unidad vigente con ese IMEI. Si se cargó mal, dala de baja y cargala de nuevo.",
      ...(existing
        ? {
            linkHref: `/productos/${existing.productId}/unidades?unidad=${existing.unitId}`,
            linkLabel: "Ver la unidad que lo tiene",
          }
        : {}),
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

// Los días de garantía de una unidad (brief-29.9, D-1).
export const WARRANTY_DAYS_MESSAGE =
  "Escribí los días de garantía como un número entero de 0 a 3650, o dejalo vacío para usar los de la organización.";

export function warrantyDaysRejection(
  result: Exclude<UnitWarrantyDaysResult, { ok: true }>,
  requestId: string,
): Rejection {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    return { field: "warrantyDays", message: WARRANTY_DAYS_MESSAGE };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return {
      field: null,
      message: "Esta unidad está dada de baja: ya no cambia.",
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
  // Desde la 29.9 (brief-29.9, D-1).
  "garantia-cambiada": "Días de garantía de la unidad guardados.",
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
