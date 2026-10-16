import type {
  CancelPurchaseOrderResult,
  CreatePurchaseOrderResult,
  PurchaseOrderLineField,
  PurchaseOrderLineIssue,
  PurchaseOrderLineRule,
  PurchaseOrderStatus,
} from "@/modules/purchasing";
import { currencyDecimals } from "@/shared/money";

// Textos de las pantallas de órdenes de compra (brief-22.3, D-8 y D-10), derivados de la taxonomía
// de errores, como los del pedido.

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const PURCHASE_ORDER_NOT_FOUND_MESSAGE =
  "Esta orden de compra no existe.";
export const NO_PURCHASE_ORDERS_MESSAGE = "Todavía no hay órdenes de compra.";
export const NO_PURCHASE_ORDER_RESULTS_MESSAGE =
  "Ninguna orden de compra coincide con estos filtros.";
export const NO_SUPPLIER_PURCHASE_ORDERS_MESSAGE =
  "Este proveedor no tiene órdenes de compra.";
// La leyenda de la página imprimible (ADR 0023, punto 13; H-9), como la de la venta.
export const NOT_AN_INVOICE_LEGEND = "Documento no válido como factura";
// La orden no copia el nombre del producto ni los datos del proveedor (punto 14).
export const CURRENT_DATA_NOTE =
  "Los productos y el proveedor se muestran con sus datos de hoy. Los costos y los totales son los del día en que se creó la orden.";
export const UNKNOWN_PRODUCT_TEXT = "Producto no disponible";
export const UNKNOWN_SUPPLIER_TEXT = "Proveedor no disponible";

export const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  open: "Abierta",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

// El alta: lo que el formulario envió, para volver a mostrarlo, y por qué se rechazó.

export type PurchaseOrderFormLine = {
  productId: string;
  // Lo que se ve en el campo del producto: «Nombre (SKU)», o lo que escribió quien carga.
  productText: string;
  quantity: string;
  unitCost: string;
};

export type PurchaseOrderFormValues = {
  supplierId: string;
  supplierText: string;
  currency: string;
  lines: PurchaseOrderFormLine[];
};

export type PurchaseOrderFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: PurchaseOrderFormValues;
      message: string;
      // Errores por línea, por su posición entre las líneas enviadas (desde 1).
      lineErrors: Record<number, string>;
      supplierError: string | null;
      currencyError: string | null;
    };

// Por qué no se lee un costo (parseMoneyInput), con los decimales de la moneda elegida.
function unitCostMessage(
  reason: PurchaseOrderLineIssue["reason"],
  currency: string,
): string {
  const found = currencyDecimals(currency);
  const decimals = found.ok ? found.decimals : 2;
  switch (reason) {
    case "separator":
      return `${currency} no tiene decimales: escribí el costo sin puntos ni comas.`;
    case "decimals":
      // Con una moneda sin decimales, parseMoneyInput responde separator antes; por las dudas, el
      // mismo texto.
      if (decimals === 0) {
        return `${currency} no tiene decimales: escribí el costo sin puntos ni comas.`;
      }
      return decimals === 1
        ? `Escribí el costo con un decimal como máximo, en ${currency}.`
        : `Escribí el costo con hasta ${decimals} decimales, en ${currency}.`;
    case "too_large":
      return "El costo es demasiado grande.";
    case "zero":
      return "Escribí un costo mayor que cero.";
    default:
      return "Escribí el costo unitario, por ejemplo 1500,50.";
  }
}

const LINE_FIELD_MESSAGE: Record<
  Exclude<PurchaseOrderLineField, "unitCost">,
  string
> = {
  product: "Elegí un producto de la lista.",
  quantity: "Escribí una cantidad mayor que cero, con hasta tres decimales.",
};

export function lineFieldMessage(
  issue: PurchaseOrderLineIssue,
  currency: string,
): string {
  return issue.field === "unitCost"
    ? unitCostMessage(issue.reason, currency)
    : LINE_FIELD_MESSAGE[issue.field];
}

export function lineRuleMessage(rule: PurchaseOrderLineRule): string {
  return {
    inactive_product: "El producto está desactivado.",
    duplicate_product:
      "El producto ya está en otra línea: sumá la cantidad ahí.",
    zero_total: "El total de la línea da cero: subí la cantidad o el costo.",
    amount_too_large: "El total de la línea es demasiado grande.",
  }[rule];
}

type Rejection = Pick<
  Extract<PurchaseOrderFormState, { status: "error" }>,
  "message" | "lineErrors" | "supplierError" | "currencyError"
>;

const REVIEW_LINES = "Revisá las líneas marcadas.";

const NO_ERRORS = { lineErrors: {}, supplierError: null, currencyError: null };

function validationRejection(
  result: Extract<CreatePurchaseOrderResult, { code: "VALIDATION_ERROR" }>,
  currency: string,
): Rejection {
  switch (result.reason) {
    case "supplier":
      return {
        ...NO_ERRORS,
        message: "Revisá el proveedor.",
        supplierError: "Elegí un proveedor de la lista.",
      };
    case "currency":
      return {
        ...NO_ERRORS,
        message: "Revisá la moneda.",
        currencyError: "Elegí la moneda de la orden.",
      };
    case "no_lines":
      return {
        ...NO_ERRORS,
        message: "Agregá al menos una línea con producto, cantidad y costo.",
      };
    case "too_many_lines":
      return {
        ...NO_ERRORS,
        message: "Una orden de compra tiene como máximo 50 líneas.",
      };
    case "lines":
      return {
        ...NO_ERRORS,
        message: REVIEW_LINES,
        lineErrors: Object.fromEntries(
          result.lines.map((issue) => [
            issue.position,
            lineFieldMessage(issue, currency),
          ]),
        ),
      };
  }
}

// Un mensaje general y, si corresponde, uno por línea, para el proveedor o para la moneda.
export function purchaseOrderRejection(
  result: Exclude<CreatePurchaseOrderResult, { ok: true }>,
  currency: string,
): Rejection {
  const none = NO_ERRORS;
  switch (result.code) {
    case "FORBIDDEN":
      return {
        ...none,
        message: "No tenés permiso para crear órdenes de compra.",
      };
    case "VALIDATION_ERROR":
      return validationRejection(result, currency);
    case "NOT_FOUND":
      if (result.target === "supplier") {
        return {
          ...none,
          message: "Revisá el proveedor.",
          supplierError: "El proveedor ya no existe.",
        };
      }
      return {
        ...none,
        message: REVIEW_LINES,
        lineErrors: Object.fromEntries(
          result.lines.map((line) => [
            line.position,
            "El producto ya no existe.",
          ]),
        ),
      };
    case "BUSINESS_RULE_VIOLATION":
      if (result.rule === "inactive_supplier") {
        return {
          ...none,
          message: "Revisá el proveedor.",
          supplierError:
            "El proveedor está desactivado: reactivalo para hacerle una orden.",
        };
      }
      if (result.rule === "total_too_large") {
        return {
          ...none,
          message: "El total de la orden es demasiado grande.",
        };
      }
      return {
        ...none,
        message: REVIEW_LINES,
        lineErrors: Object.fromEntries(
          result.lines.map((line) => [
            line.position,
            lineRuleMessage(line.rule),
          ]),
        ),
      };
  }
}

// El detalle: la cancelación.

export type CancelState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function cancelRejectionMessage(
  result: Exclude<CancelPurchaseOrderResult, { ok: true }>,
): string {
  switch (result.code) {
    case "FORBIDDEN":
      return "No tenés permiso para cancelar órdenes de compra.";
    case "BUSINESS_RULE_VIOLATION":
      return `La orden ya está ${STATUS_LABEL[result.status].toLowerCase()}: no se puede cancelar. Recargá la página.`;
    default:
      return PURCHASE_ORDER_NOT_FOUND_MESSAGE;
  }
}

// Avisos tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  creada: "Orden de compra creada.",
  cancelada: "Orden de compra cancelada.",
};

export function purchaseOrderNoticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
