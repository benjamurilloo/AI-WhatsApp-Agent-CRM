import type { ProductField } from "@/modules/catalog";
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
export const NO_PRODUCTS_MESSAGE = "Todavía no hay productos.";
export const NO_PRODUCT_RESULTS_MESSAGE =
  "Ningún producto coincide con estos filtros.";
export const NO_MOVEMENTS_MESSAGE = "Este producto no tiene movimientos.";
export const NO_MOVEMENT_RESULTS_MESSAGE =
  "Ningún movimiento coincide con estos filtros.";
export const INACTIVE_PRODUCT_NOTICE =
  "Este producto está desactivado y no admite ajustes.";

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

const PRODUCT_FIELD_MESSAGES: Record<ProductField, string> = {
  sku: SKU_REQUIRED_MESSAGE,
  name: NAME_REQUIRED_MESSAGE,
  description: DESCRIPTION_TOO_LONG_MESSAGE,
  unit: UNIT_REQUIRED_MESSAGE,
  reorderPoint: REORDER_POINT_MESSAGE,
};

const PRODUCT_FIELD_ORDER: ProductField[] = [
  "sku",
  "name",
  "description",
  "unit",
  "reorderPoint",
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

export type ProductFormValues = {
  sku: string;
  name: string;
  description: string;
  unit: string;
  reorderPoint: string;
};

export type ProductFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: ProductField | null;
      message: string;
      values: ProductFormValues;
    };

// Desactivar y reactivar (pantalla 4).

export type ProductChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

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
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
