import type {
  CreateOrderResult,
  OrderLineField,
  OrderLineRule,
  OrderStatus,
} from "@/modules/orders";

// Textos de las pantallas de pedidos (brief-19.2; Screens.md §14 a §16).

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const ORDER_NOT_FOUND_MESSAGE = "Este pedido no existe.";
export const NO_ORDERS_MESSAGE = "Todavía no hay pedidos.";
export const NO_ORDER_RESULTS_MESSAGE =
  "Ningún pedido coincide con estos filtros.";
export const NO_CLIENT_ORDERS_MESSAGE = "Este cliente no tiene pedidos.";
// El pedido no copia el nombre del producto (brief-19.2, H-4): se dice en la pantalla.
export const CURRENT_PRODUCT_NAME_NOTE =
  "Los productos se muestran con su nombre de hoy. Los precios y los totales son los del día en que se creó el pedido.";
export const UNKNOWN_PRODUCT_TEXT = "Producto no disponible";
export const UNKNOWN_CLIENT_TEXT = "Cliente no disponible";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

// Alta: lo que el formulario envió, para volver a mostrarlo, y por qué se rechazó.

export type OrderFormLine = {
  productId: string;
  // Lo que se ve en el campo del producto: «Nombre (SKU)», o lo que escribió quien carga.
  productText: string;
  quantity: string;
  expectedPriceId: string;
  // El precio que se mostró, para que el formulario lo siga mostrando.
  price: { amount: string; currency: string } | null;
};

export type OrderFormValues = {
  clientId: string;
  clientText: string;
  lines: OrderFormLine[];
};

export type OrderFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: OrderFormValues;
      message: string;
      // Errores por línea, por su posición entre las líneas enviadas (desde 1).
      lineErrors: Record<number, string>;
      clientError: string | null;
    };

const LINE_FIELD_MESSAGE: Record<OrderLineField, string> = {
  product: "Elegí un producto de la lista.",
  quantity: "Escribí una cantidad mayor que cero, con hasta tres decimales.",
  expectedPrice: "Volvé a elegir el producto.",
};

export function lineRuleMessage(rule: OrderLineRule, currency: string): string {
  return {
    inactive_product: "El producto está desactivado.",
    no_price: "El producto no tiene precio: fijalo antes de pedirlo.",
    currency_mismatch: `El precio está en otra moneda que la primera línea (${currency}).`,
    duplicate_product:
      "El producto ya está en otra línea: sumá la cantidad ahí.",
    zero_total: "El total de la línea da cero: subí la cantidad.",
    amount_too_large: "El total de la línea es demasiado grande.",
  }[rule];
}

type Rejection = Pick<
  Extract<OrderFormState, { status: "error" }>,
  "message" | "lineErrors" | "clientError"
>;

// Un mensaje general y, si corresponde, uno por línea o para el cliente.
export function orderRejection(
  result: Exclude<CreateOrderResult, { ok: true }>,
  firstCurrency: string,
): Rejection {
  const none = { lineErrors: {}, clientError: null };
  switch (result.code) {
    case "FORBIDDEN":
      return {
        ...none,
        message: "No tenés permiso para crear pedidos.",
      };
    case "VALIDATION_ERROR":
      if (result.reason === "client") {
        return {
          message: "Revisá el cliente.",
          lineErrors: {},
          clientError: "Elegí un cliente de la lista.",
        };
      }
      if (result.reason === "no_lines") {
        return {
          ...none,
          message: "Agregá al menos una línea con producto y cantidad.",
        };
      }
      if (result.reason === "too_many_lines") {
        return {
          ...none,
          message: "Un pedido tiene como máximo 50 líneas.",
        };
      }
      return {
        message: "Revisá las líneas marcadas.",
        lineErrors: Object.fromEntries(
          result.lines.map((line) => [
            line.position,
            LINE_FIELD_MESSAGE[line.field],
          ]),
        ),
        clientError: null,
      };
    case "NOT_FOUND":
      if (result.target === "client") {
        return {
          message: "Revisá el cliente.",
          lineErrors: {},
          clientError: "El cliente ya no existe.",
        };
      }
      return {
        message: "Revisá las líneas marcadas.",
        lineErrors: Object.fromEntries(
          result.lines.map((line) => [
            line.position,
            "El producto ya no existe.",
          ]),
        ),
        clientError: null,
      };
    case "BUSINESS_RULE_VIOLATION":
      if (result.rule === "inactive_client") {
        return {
          message: "Revisá el cliente.",
          lineErrors: {},
          clientError:
            "El cliente está desactivado: reactivalo para cargarle un pedido.",
        };
      }
      if (result.rule === "total_too_large") {
        return { ...none, message: "El total del pedido es demasiado grande." };
      }
      return {
        message: "Revisá las líneas marcadas.",
        lineErrors: Object.fromEntries(
          result.lines.map((line) => [
            line.position,
            lineRuleMessage(line.rule, firstCurrency),
          ]),
        ),
        clientError: null,
      };
    case "CONFLICT":
      return {
        message:
          result.prices.length === 1
            ? "Cambió el precio de un producto desde que lo elegiste. Revisá el precio nuevo y volvé a crear el pedido."
            : "Cambiaron los precios de algunos productos desde que los elegiste. Revisá los precios nuevos y volvé a crear el pedido.",
        lineErrors: Object.fromEntries(
          result.prices.map((line) => [line.position, "El precio cambió."]),
        ),
        clientError: null,
      };
  }
}

// Detalle: la cancelación.

export type CancelState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export const CANCELLED_NOTICE = "Pedido cancelado.";
export const CREATED_NOTICE = "Pedido creado.";

export function orderNoticeMessage(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "creado") return CREATED_NOTICE;
  if (raw === "cancelado") return CANCELLED_NOTICE;
  return null;
}
