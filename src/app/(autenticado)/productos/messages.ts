import type {
  ProductCondition,
  ProductConflictField,
  ProductField,
  VariantField,
} from "@/modules/catalog";
import type { ErrorCode } from "@/shared/errors";
import type {
  StockAdjustmentField,
  StockAdjustmentResult,
} from "@/modules/inventory";
import { formatQuantity } from "@/shared/quantity";

// Textos de las pantallas 3, 4 y 5 (wireframes 03 a 05), derivados de la taxonomía de errores
// (brief-4.4). Cada rechazo del ajuste tiene su propio mensaje (Screens.md §5).

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const PRODUCT_NOT_FOUND_MESSAGE = "Este producto no existe.";
export const SKU_TAKEN_MESSAGE = "Ya existe un producto con ese SKU.";
export const BARCODE_TAKEN_MESSAGE =
  "Ya existe un producto con ese código de barras.";
export const NO_PRODUCTS_MESSAGE = "Todavía no hay productos.";
export const NO_PRODUCT_RESULTS_MESSAGE =
  "Ningún producto coincide con estos filtros.";
export const NO_MOVEMENTS_MESSAGE = "Este producto no tiene movimientos.";
export const NO_MOVEMENT_RESULTS_MESSAGE =
  "Ningún movimiento coincide con estos filtros.";
export const INACTIVE_PRODUCT_NOTICE =
  "Este producto está desactivado y no admite ajustes.";

// Un producto por unidad (brief-29.5, D-4 y D-6): su stock se mueve cargando o dando de baja unidades.
export const UNIT_TRACKED_ADJUSTMENT_MESSAGE =
  "Este producto se lleva por unidad: su stock se mueve cargando o dando de baja unidades, no con un ajuste de cantidad.";
export const UNIT_CONDITION_LOCKED_MESSAGE =
  "Este producto se lleva por unidad: su condición no cambia. Para vender el equipo con otra condición, cargalo en otro producto.";

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

export function loadErrorMessage(requestId: string): string {
  return `No pudimos cargar los datos. Código: ${requestId}`;
}

// Formulario de producto (alta y edición).

export const SKU_REQUIRED_MESSAGE =
  "Ingresá un SKU de hasta 64 caracteres, sin espacios.";
export const NAME_REQUIRED_MESSAGE =
  "Ingresá un nombre de hasta 200 caracteres.";
export const DESCRIPTION_TOO_LONG_MESSAGE =
  "La descripción no puede superar los 2000 caracteres.";
export const UNIT_REQUIRED_MESSAGE =
  "Ingresá una unidad de hasta 32 caracteres.";
export const REORDER_POINT_MESSAGE =
  "Ingresá una cantidad con hasta tres decimales, por ejemplo 10 o 2,5.";
export const BRAND_TOO_LONG_MESSAGE =
  "La marca no puede superar los 100 caracteres.";
export const CATEGORY_TOO_LONG_MESSAGE =
  "La categoría no puede superar los 100 caracteres.";
export const CONDITION_REQUIRED_MESSAGE = "Elegí la condición del producto.";
// Campos de operación (brief-17.2).
export const BARCODE_MESSAGE =
  "Ingresá un código de barras de hasta 64 caracteres, sin espacios.";
export const WEIGHT_MESSAGE =
  "Ingresá el peso en kg, mayor a 0 y con hasta tres decimales, por ejemplo 1,5.";
const DIMENSIONS_RULE =
  "mayor a 0 y con un decimal como máximo. Largo, ancho y alto van juntos.";
export const LENGTH_MESSAGE = `Ingresá el largo en cm, ${DIMENSIONS_RULE}`;
export const WIDTH_MESSAGE = `Ingresá el ancho en cm, ${DIMENSIONS_RULE}`;
export const HEIGHT_MESSAGE = `Ingresá el alto en cm, ${DIMENSIONS_RULE}`;
export const LOCATION_TOO_LONG_MESSAGE =
  "La ubicación no puede superar los 60 caracteres.";
export const SHELF_TOO_LONG_MESSAGE =
  "El estante no puede superar los 30 caracteres.";

const PRODUCT_FIELD_MESSAGES: Record<ProductField, string> = {
  sku: SKU_REQUIRED_MESSAGE,
  name: NAME_REQUIRED_MESSAGE,
  description: DESCRIPTION_TOO_LONG_MESSAGE,
  unit: UNIT_REQUIRED_MESSAGE,
  reorderPoint: REORDER_POINT_MESSAGE,
  brand: BRAND_TOO_LONG_MESSAGE,
  category: CATEGORY_TOO_LONG_MESSAGE,
  condition: CONDITION_REQUIRED_MESSAGE,
  barcode: BARCODE_MESSAGE,
  weightKg: WEIGHT_MESSAGE,
  lengthCm: LENGTH_MESSAGE,
  widthCm: WIDTH_MESSAGE,
  heightCm: HEIGHT_MESSAGE,
  location: LOCATION_TOO_LONG_MESSAGE,
  shelf: SHELF_TOO_LONG_MESSAGE,
};

const PRODUCT_FIELD_ORDER: ProductField[] = [
  "sku",
  "barcode",
  "name",
  "brand",
  "category",
  "condition",
  "description",
  "unit",
  "reorderPoint",
  "weightKg",
  "lengthCm",
  "widthCm",
  "heightCm",
  "location",
  "shelf",
];

// Primer campo inválido en el orden del formulario, con su mensaje.
export function productFieldError(fields: ProductField[]): {
  field: ProductField;
  message: string;
} {
  const field =
    PRODUCT_FIELD_ORDER.find((candidate) => fields.includes(candidate)) ??
    "sku";
  return { field, message: PRODUCT_FIELD_MESSAGES[field] };
}

// El SKU o el código de barras repetido (brief-17.2, D-3), en su campo.
export function productConflictError(field: ProductConflictField): {
  field: ProductConflictField;
  message: string;
} {
  return {
    field,
    message: field === "barcode" ? BARCODE_TAKEN_MESSAGE : SKU_TAKEN_MESSAGE,
  };
}

// El modelo y los atributos (brief-29.2, D-5): un modelo activo, y un valor válido en cada atributo;
// los obligatorios, solo con modelo.
export const MODEL_INVALID_MESSAGE =
  "Elegí un modelo de la lista. Un modelo desactivado no se puede asignar.";
export const ATTRIBUTE_INVALID_MESSAGE =
  "Completá este dato con un valor válido. Es obligatorio en un producto con modelo.";

export function variantDuplicateMessage(name: string): string {
  return `Ya hay un producto activo de este modelo con la misma condición y la misma variante: «${name}».`;
}

// El primer campo inválido del modelo y los atributos: el modelo primero, después los atributos
// en el orden del formulario, que es el del servicio.
export function variantFieldError(fields: VariantField[]): {
  field: VariantField;
  message: string;
} {
  if (fields.includes("modelId")) {
    return { field: "modelId", message: MODEL_INVALID_MESSAGE };
  }
  return { field: fields[0] ?? "modelId", message: ATTRIBUTE_INVALID_MESSAGE };
}

export type ProductFormValues = Record<ProductField, string>;

// Lo que el formulario manda del modelo y los atributos, para volver a mostrarlo tras un error.
export type VariantFormValues = {
  modelId: string;
  attributes: Record<string, string>;
};

// Peso y dimensiones para mostrar y para editar (brief-17.2, D-5): "1.500" se lee "1,5" y "10.0",
// "10". Sin ceros finales y con coma decimal, como formatQuantity, para cualquier escala.
export function formatMeasure(value: string): string {
  const [integer, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${integer},${trimmed}` : integer!;
}

// Condición comercial (brief-11.1, D-3), como se lee en pantalla.
export const CONDITION_LABEL: Record<ProductCondition, string> = {
  new: "Nuevo",
  refurbished: "Reacondicionado",
  used: "Usado",
};

export type ProductFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: ProductField | VariantField | null;
      message: string;
      values: ProductFormValues;
      variant?: VariantFormValues;
    };

// Desactivar y reactivar (pantalla 4).

export type ProductChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

// Reactivar un producto que hoy sería un duplicado de variante (brief-29.2, D-6).
export function reactivationDuplicateMessage(name: string): string {
  return `No se puede reactivar: ya hay un producto activo de este modelo con la misma condición y la misma variante, «${name}». Desactivá ese o cambiá la variante de este.`;
}

export function productChangeMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return PRODUCT_NOT_FOUND_MESSAGE;
    case "CONFLICT":
      return SKU_TAKEN_MESSAGE;
    default:
      return unexpectedErrorMessage(requestId);
  }
}

// Formulario de ajuste (pantalla 5).

export const QUANTITY_REQUIRED_MESSAGE =
  "Ingresá una cantidad mayor a 0, con hasta tres decimales.";
export const REASON_REQUIRED_MESSAGE =
  "Escribí un motivo de hasta 500 caracteres.";
export const TYPE_REQUIRED_MESSAGE = "Elegí el tipo de ajuste.";
export const STALE_BALANCE_MESSAGE =
  "El stock cambió mientras registrabas el ajuste.";

const ADJUSTMENT_FIELD_MESSAGES: Record<StockAdjustmentField, string> = {
  type: TYPE_REQUIRED_MESSAGE,
  quantity: QUANTITY_REQUIRED_MESSAGE,
  expectedQuantityOnHand: STALE_BALANCE_MESSAGE,
  reason: REASON_REQUIRED_MESSAGE,
};

const ADJUSTMENT_FIELD_ORDER: StockAdjustmentField[] = [
  "type",
  "quantity",
  "reason",
  "expectedQuantityOnHand",
];

export function adjustmentFieldError(fields: StockAdjustmentField[]): {
  field: StockAdjustmentField;
  message: string;
} {
  const field =
    ADJUSTMENT_FIELD_ORDER.find((candidate) => fields.includes(candidate)) ??
    "quantity";
  return { field, message: ADJUSTMENT_FIELD_MESSAGES[field] };
}

export type AdjustmentRejection = Exclude<StockAdjustmentResult, { ok: true }>;

// Mensaje de un ajuste rechazado, con los datos que el servicio devuelve (Screens.md §5).
export function adjustmentRejectionMessage(
  rejection: AdjustmentRejection,
  requestId: string,
): { field: StockAdjustmentField | null; message: string } {
  switch (rejection.code) {
    case "VALIDATION_ERROR":
      return "fields" in rejection
        ? adjustmentFieldError(rejection.fields)
        : { field: null, message: PRODUCT_NOT_FOUND_MESSAGE };
    case "CONFLICT":
      return {
        field: null,
        message: `${STALE_BALANCE_MESSAGE} Saldo actualizado: ${formatQuantity(
          rejection.currentQuantityOnHand,
        )}. Revisá y confirmá de nuevo.`,
      };
    case "BUSINESS_RULE_VIOLATION":
      if (rejection.rule === "inactive_product") {
        return { field: null, message: INACTIVE_PRODUCT_NOTICE };
      }
      // Desde la 29.5 (brief-29.5, D-4).
      if (rejection.rule === "unit_tracked") {
        return { field: null, message: UNIT_TRACKED_ADJUSTMENT_MESSAGE };
      }
      // Desde la 19.3, below_reserved (ADR 0020, punto 5): primero se cancela un pedido.
      if (rejection.rule === "below_reserved") {
        return {
          field: "quantity",
          message: `El ajuste dejaría el stock por debajo de lo reservado por pedidos confirmados. Saldo actual: ${formatQuantity(
            rejection.currentQuantityOnHand,
          )}, reservado: ${formatQuantity(
            rejection.currentQuantityReserved,
          )}, cantidad solicitada: ${formatQuantity(
            rejection.requestedQuantity,
          )}. Para corregir un faltante, primero cancelá el pedido que no se puede cumplir. No se registró ningún movimiento.`,
        };
      }
      return {
        field: "quantity",
        message:
          rejection.rule === "negative_stock"
            ? `El ajuste dejaría el stock negativo. Saldo actual: ${formatQuantity(
                rejection.currentQuantityOnHand,
              )}, cantidad solicitada: ${formatQuantity(
                rejection.requestedQuantity,
              )}. No se registró ningún movimiento.`
            : `El ajuste supera el máximo que admite el stock. Saldo actual: ${formatQuantity(
                rejection.currentQuantityOnHand,
              )}, cantidad solicitada: ${formatQuantity(
                rejection.requestedQuantity,
              )}. No se registró ningún movimiento.`,
      };
    case "NOT_FOUND":
      return { field: null, message: PRODUCT_NOT_FOUND_MESSAGE };
    case "FORBIDDEN":
      return { field: null, message: FORBIDDEN_ACTION_MESSAGE };
    default:
      return { field: null, message: unexpectedErrorMessage(requestId) };
  }
}

export type AdjustmentState =
  | { status: "idle" }
  | { status: "registrado"; quantityOnHand: string }
  | {
      status: "error";
      requestId: string;
      field: StockAdjustmentField | null;
      message: string;
      // Saldo que la pantalla tiene que volver a confirmar tras un CONFLICT.
      quantityOnHand: string | null;
    };

// Avisos tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  creado: "Producto creado.",
  editado: "Producto actualizado.",
  desactivado: "Producto desactivado.",
  reactivado: "Producto reactivado.",
  ajustado: "Ajuste registrado.",
  "imagen-subida": "Imagen guardada.",
  "imagen-quitada": "Imagen quitada.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}

// Imagen de producto (brief-17.5, D-7). La subida va por fetch a un Route Handler, que responde un
// código; la pantalla lo traduce acá.
export const IMAGE_RULES_MESSAGE =
  "JPEG, PNG o WebP, hasta 5 MB. Se guarda reducida a 1600 px y sin los datos de la cámara ni la ubicación.";
export const IMAGE_PEOPLE_NOTICE =
  "La imagen es del producto: no subas fotos en las que se vean personas.";
export const IMAGE_TOO_LARGE_MESSAGE = "La imagen pesa más de 5 MB.";

export type ImageUploadError =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "busy"
  | "length_required"
  | "too_large"
  | "empty"
  | "unsupported_format"
  | "too_many_pixels"
  | "animated"
  | "unreadable"
  | "internal";

export function imageUploadMessage(error: ImageUploadError): string {
  switch (error) {
    case "unauthenticated":
      return "Tu sesión venció. Volvé a ingresar y probá de nuevo.";
    case "forbidden":
      return FORBIDDEN_ACTION_MESSAGE;
    case "not_found":
      return PRODUCT_NOT_FOUND_MESSAGE;
    case "rate_limited":
      return "Subiste muchas imágenes seguidas. Probá de nuevo en unos minutos.";
    case "busy":
      return "Se está procesando otra imagen. Probá de nuevo en unos segundos.";
    case "too_large":
      return IMAGE_TOO_LARGE_MESSAGE;
    case "empty":
      return "El archivo está vacío.";
    case "unsupported_format":
      return "El archivo no es una imagen JPEG, PNG o WebP.";
    case "too_many_pixels":
      return "La imagen tiene demasiados píxeles: hasta 40 megapíxeles.";
    case "animated":
      return "Las imágenes animadas no se aceptan. Subí una imagen fija.";
    case "length_required":
    case "unreadable":
      return "No se pudo leer la imagen. Probá con otro archivo.";
    case "internal":
      return "No se pudo guardar la imagen. Probá de nuevo.";
  }
}
