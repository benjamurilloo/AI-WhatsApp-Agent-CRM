import type {
  CreateOrderResult,
  OrderLineField,
  OrderLineRule,
  OrderStatus,
  OrderTransitionResult,
} from "@/modules/orders";
import { formatQuantity } from "@/shared/quantity";

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
// Lo disponible de un pendiente es el de hoy (brief-19.3, D-9): puede cambiar antes de confirmar.
export const AVAILABLE_NOTE =
  "«Disponible» es el stock de hoy menos lo reservado por otros pedidos confirmados. Confirmar reserva lo de cada línea.";
export const UNKNOWN_PRODUCT_TEXT = "Producto no disponible";
export const UNKNOWN_CLIENT_TEXT = "Cliente no disponible";

// El origen de un pedido (brief-19.4, D-11): el agente, por su credencial, o una persona del equipo
// desde la app. El emisor de la credencial lo compone la página, como en la historia
// (_audit/actor.ts); la lista muestra solo «Agente».
export const AGENT_ORIGIN_LABEL = "Agente";
export const TEAM_ORIGIN_LABEL = "Equipo";

export function orderOriginLabel(
  createdByCredentialId: string | null,
  sources: ReadonlyMap<string, string> = new Map(),
): string {
  if (createdByCredentialId === null) return TEAM_ORIGIN_LABEL;
  const source = sources.get(createdByCredentialId);
  return source ? `${AGENT_ORIGIN_LABEL} · ${source}` : AGENT_ORIGIN_LABEL;
}

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

// Detalle: las transiciones (brief-19.2; desde la 19.3, confirmar y entregar).

export type TransitionState =
  | { status: "idle" }
  | { status: "error"; requestId: string; message: string; details: string[] };
export type CancelState = TransitionState;

export type OrderTransitionName = "confirm" | "deliver" | "cancel";

export const CANCELLED_NOTICE = "Pedido cancelado.";
export const CREATED_NOTICE = "Pedido creado.";
export const CONFIRMED_NOTICE = "Pedido confirmado: el stock quedó reservado.";
export const DELIVERED_NOTICE =
  "Pedido entregado: el stock se descontó con un movimiento por línea.";

const NOTICES: Record<string, string> = {
  creado: CREATED_NOTICE,
  cancelado: CANCELLED_NOTICE,
  confirmado: CONFIRMED_NOTICE,
  entregado: DELIVERED_NOTICE,
};

// El aviso de la URL después de cada transición.
export const TRANSITION_NOTICE: Record<OrderTransitionName, string> = {
  confirm: "confirmado",
  deliver: "entregado",
  cancel: "cancelado",
};

export function orderNoticeMessage(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? (NOTICES[raw] ?? null) : null;
}

const FORBIDDEN_TRANSITION: Record<OrderTransitionName, string> = {
  confirm: "No tenés permiso para confirmar pedidos.",
  deliver: "No tenés permiso para entregar pedidos.",
  cancel: "No tenés permiso para cancelar pedidos.",
};

// El rechazo de una transición (brief-19.3, D-5): el motivo y, por línea, lo que falta. names da
// el nombre de hoy de cada producto; si no está, la línea se nombra por su número.
export function transitionRejection(
  transition: OrderTransitionName,
  result: Exclude<OrderTransitionResult, { ok: true }>,
  names: Map<string, string>,
): { message: string; details: string[] } {
  const label = (line: { position: number; productId: string }) =>
    names.get(line.productId) ?? `Línea ${line.position}`;
  if (result.code === "FORBIDDEN") {
    return { message: FORBIDDEN_TRANSITION[transition], details: [] };
  }
  if (result.code !== "BUSINESS_RULE_VIOLATION") {
    return { message: ORDER_NOT_FOUND_MESSAGE, details: [] };
  }
  switch (result.rule) {
    case "insufficient_stock":
      return {
        message:
          "No hay stock disponible para confirmar el pedido. No se reservó nada.",
        details: result.lines.map(
          (line) =>
            `${label(line)}: pide ${formatQuantity(line.requested)}, hay ${formatQuantity(line.available)} disponible.`,
        ),
      };
    case "inactive_product":
      return {
        message:
          "El pedido tiene productos desactivados: reactivalos o cancelá el pedido. No se reservó nada.",
        details: result.lines.map((line) => `${label(line)}: desactivado.`),
      };
    case "invalid_transition":
      return {
        message: `El pedido ya está ${STATUS_LABEL[result.status].toLowerCase()}: este cambio ya no se puede hacer. Recargá la página.`,
        details: [],
      };
  }
}
