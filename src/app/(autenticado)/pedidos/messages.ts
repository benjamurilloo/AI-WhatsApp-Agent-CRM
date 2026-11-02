import type { LineUnitIssue, UnitStatus } from "@/modules/inventory";
import type {
  CreateOrderResult,
  OrderLineField,
  OrderLineRule,
  OrderStatus,
  OrderStatusFilter,
  OrderTransitionResult,
} from "@/modules/orders";
import { formatQuantity } from "@/shared/quantity";

// El estado de una unidad que impide confirmar o vender, en una frase (brief-29.5.2, D-5).
export const UNIT_STATUS_TEXT: Record<UnitStatus, string> = {
  available: "está disponible",
  reserved: "está reservada por otro pedido",
  sold: "ya se vendió",
  written_off: "se dio de baja",
  in_repair: "está en reparación",
  in_review: "está en revisión, sin liberar a la venta",
};

// La marca de una unidad de un pendiente que ya no está disponible: confirmar la va a rechazar.
export const UNIT_UNAVAILABLE_MARK = "No disponible";

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

// El subtítulo y la leyenda de la lámina 01 (brief-24.6.1). La leyenda dice qué compromete cada
// estado, que es lo que distingue un pedido de una venta y lo que la columna «Estado» sola no
// alcanza a decir. Cancelado no está en la leyenda, como en la lámina: no compromete nada.
export const ORDERS_SUBTITLE = "Reservas y entregas de clientes.";
export const ORDERS_STATUS_LEGEND =
  "Pendiente: sin reserva · Confirmado: stock reservado · Entregado: salida registrada.";

// La barra de estados del listado (lámina 01). El orden es el del ciclo del pedido, no el
// alfabético, y «Todos» va primero. Cada pestaña es un enlace con su cantidad, que `SubNav`
// incorpora al nombre accesible desde la 24.3.
export const STATUS_TAB_LABEL: Record<OrderStatusFilter, string> = {
  all: "Todos",
  pending: "Pendientes",
  confirmed: "Confirmados",
  delivered: "Entregados",
  cancelled: "Cancelados",
};

export const STATUS_TABS: OrderStatusFilter[] = [
  "all",
  "pending",
  "confirmed",
  "delivered",
  "cancelled",
];

// La columna «Resumen» de la lámina 01 (brief-24.6.1, D-2): qué se pidió, de un vistazo, sin abrir
// la ficha. La lámina dibuja «iPhone 13 · 1 equipo», que es el caso de una línea y una unidad.
// Con más de una línea se nombra la primera y se dice cuántas más hay, en vez de callarlas. El
// recuento es de **equipos** cuando el pedido tiene unidades y de **líneas** cuando no: un pedido
// por cantidad no tiene equipos y decir «1 equipo» de dos kilos de algo sería falso.
export function orderSummaryText(order: {
  firstProductName: string | null;
  lineCount: number;
  unitCount: number;
}): string {
  const name = order.firstProductName ?? UNKNOWN_PRODUCT_TEXT;
  const rest = order.lineCount - 1;
  const product = rest > 0 ? `${name} y ${rest} más` : name;
  const count =
    order.unitCount > 0
      ? `${order.unitCount} ${order.unitCount === 1 ? "equipo" : "equipos"}`
      : `${order.lineCount} ${order.lineCount === 1 ? "línea" : "líneas"}`;
  return `${product} · ${count}`;
}

// Un pedido sin líneas no debería existir —el alta exige al menos una—, pero la lista no se rompe
// si lo encuentra.
export const EMPTY_ORDER_SUMMARY = "Sin líneas";

// Que los precios son los del alta, en la cabecera de la tabla de productos (lámina 03).
export const FIXED_PRICES_NOTE = "Precios fijados al crear el pedido";

// La franja que dice qué compromete el estado, debajo de las tarjetas (láminas 03, 05, 06 y 07).
// Dice la **consecuencia sobre el stock**, no el nombre del estado, que ya está en el badge. Las
// etiquetas Pendiente → Confirmado → Entregado son estados **del pedido**; el estado físico del
// equipo va de Disponible a Reservada a Vendida, y la v2 pide rotular las dos dimensiones sin
// confundirlas.
export function statusStripText(status: OrderStatus): {
  title: string;
  text: string;
  icon: "clock" | "circleCheck" | "truck" | "circleX";
  className: string;
} {
  switch (status) {
    case "pending":
      return {
        title: "Pendiente",
        text: "Todavía no reserva stock. Confirmar reserva las unidades elegidas.",
        icon: "clock",
        className: "border-border-strong bg-warning-soft text-on-warning-soft",
      };
    case "confirmed":
      return {
        title: "Confirmado",
        text: "El equipo está reservado para este pedido. Todavía no se registró la salida.",
        icon: "circleCheck",
        className: "border-border-strong bg-primary-soft text-on-primary-soft",
      };
    case "delivered":
      return {
        title: "Entregado",
        text: "La salida de stock ya está registrada. La venta se emite aparte.",
        icon: "truck",
        className: "border-border-strong bg-success-soft text-on-success-soft",
      };
    case "cancelled":
      return {
        title: "Cancelado",
        text: "No reserva ni compromete stock. Un pedido cancelado no se reabre ni se edita.",
        icon: "circleX",
        className: "border-border bg-surface-muted text-muted",
      };
  }
}

// «Siguiente paso» de la lámina 03: qué va a hacer el botón principal, antes de abrirlo. Un pedido
// entregado o cancelado no tiene siguiente paso obligatorio, y la tarjeta no se dibuja.
export function nextStepHint(status: OrderStatus): string | null {
  switch (status) {
    case "pending":
      return "Confirmar reservará este equipo. Se volverá a comprobar su disponibilidad.";
    case "confirmed":
      return "Marcar entregado registra la salida del equipo y libera su reserva. No se puede deshacer.";
    case "delivered":
    case "cancelled":
      return null;
  }
}

// Qué decir cuando el nombre escrito en el buscador de clientes no resuelve a uno solo
// (brief-24.6.1, D-11). Pasa en el recorrido sin JavaScript, donde no hay id. Ninguno de los dos
// casos filtra por un cliente elegido a dedo: la lista queda vacía y la pantalla explica por qué.
export function clientFilterProblemMessage(
  problem: "not-found" | "ambiguous",
  text: string,
): string {
  return problem === "not-found"
    ? `Ningún cliente activo se llama «${text}». Elegilo de la lista de sugerencias o escribí su nombre completo.`
    : `Hay más de un cliente activo que se llama «${text}». Elegí cuál de la lista de sugerencias.`;
}

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
  // Desde la 29.5.2 (brief-29.5.2, D-5): los IMEI de la línea, uno por renglón, y el monto que vio
  // quien carga con esas unidades (vacío si no lo vio).
  serials: string;
  expectedLineTotal: string;
  // Si el producto elegido se lleva por unidad: el formulario muestra el campo de IMEI en lugar de la
  // cantidad. Sin JavaScript se muestran los dos.
  unitTracked: boolean;
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
  serials:
    "Revisá los IMEI: uno por renglón, sin repetir, con letras, dígitos o guiones.",
};

// Con el IMEI que la línea repite o escribió mal, lo nombra (brief-29.5.2, AC-1).
export function lineFieldMessage(
  field: OrderLineField,
  serial?: string,
): string {
  if (field === "serials" && serial !== undefined) {
    return `Revisá el IMEI ${serial}: está repetido en la línea o tiene caracteres que no van (solo letras, dígitos y guiones).`;
  }
  return LINE_FIELD_MESSAGE[field];
}

export function lineRuleMessage(
  rule: OrderLineRule,
  currency: string,
  serial?: string,
): string {
  if (rule === "duplicate_unit" && serial !== undefined) {
    return `El IMEI ${serial} ya está en otra línea.`;
  }
  if (rule === "unit_currency_mismatch" && serial !== undefined) {
    return `La unidad con IMEI ${serial} tiene su precio en otra moneda que la primera línea (${currency}): corregí su precio.`;
  }
  return {
    inactive_product: "El producto está desactivado.",
    service_product:
      "Una reparación no se pide: se cobra al entregar su orden de servicio.",
    units_required:
      "Este producto se vende por unidad: escribí el IMEI de cada unidad, uno por renglón.",
    not_unit_tracked:
      "Este producto no se vende por unidad: borrá los IMEI y escribí la cantidad.",
    no_price: "El producto no tiene precio: fijalo antes de pedirlo.",
    currency_mismatch: `El precio está en otra moneda que la primera línea (${currency}).`,
    unit_currency_mismatch: `Una unidad tiene su precio en otra moneda que la primera línea (${currency}): corregí su precio.`,
    duplicate_product:
      "El producto ya está en otra línea: sumá la cantidad ahí.",
    duplicate_unit: "Un IMEI de esta línea ya está en otra línea.",
    zero_total: "El total de la línea da cero: subí la cantidad.",
    amount_too_large: "El total de la línea es demasiado grande.",
  }[rule];
}

// Un IMEI rechazado (brief-29.5.2, AC-1), nombrándolo.
const UNIT_ISSUE_TEXT: Record<LineUnitIssue["reason"], string> = {
  not_found: "no es de ninguna unidad",
  other_product: "es de una unidad de otro producto",
  unavailable:
    "ya no está disponible (está reservado, vendido o en otro pedido)",
};

export function unitIssuesByLine(
  issues: LineUnitIssue[],
): Record<number, string> {
  const byLine = new Map<number, string[]>();
  for (const issue of issues) {
    byLine.set(issue.position, [
      ...(byLine.get(issue.position) ?? []),
      `${issue.serial} ${UNIT_ISSUE_TEXT[issue.reason]}`,
    ]);
  }
  return Object.fromEntries(
    [...byLine].map(([position, texts]) => [
      position,
      `IMEI ${texts.join("; ")}.`,
    ]),
  );
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
            lineFieldMessage(line.field, line.serial),
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
      if (result.rule === "units") {
        return {
          message: "Revisá los IMEI marcados.",
          lineErrors: unitIssuesByLine(result.units),
          clientError: null,
        };
      }
      return {
        message: "Revisá las líneas marcadas.",
        lineErrors: Object.fromEntries(
          result.lines.map((line) => [
            line.position,
            lineRuleMessage(line.rule, firstCurrency, line.serial),
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
          result.prices.map((line) => [
            line.position,
            line.lineTotal === null
              ? "El precio cambió."
              : "Cambió el precio de una unidad: revisá el total de la línea.",
          ]),
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
  "Pedido entregado: el stock se descontó con un movimiento por línea, o uno por unidad en un producto que se vende por unidad.";

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
    case "unit_tracked":
      return {
        message:
          "El pedido tiene productos que pasaron a venderse por unidad y sus líneas no tienen IMEI. Cancelalo y creá otro eligiendo las unidades. No se reservó nada.",
        details: result.lines.map(
          (line) => `${label(line)}: se vende por unidad.`,
        ),
      };
    case "units_unavailable":
      return {
        message:
          "Algunas unidades del pedido ya no están disponibles. Para cambiarlas, cancelá el pedido y creá otro. No se reservó nada.",
        details: result.units.map(
          (unit) =>
            `${label(unit)}: IMEI ${unit.serial} ${UNIT_STATUS_TEXT[unit.status]}.`,
        ),
      };
    case "invalid_transition":
      return {
        message: `El pedido ya está ${STATUS_LABEL[result.status].toLowerCase()}: este cambio ya no se puede hacer. Recargá la página.`,
        details: [],
      };
  }
}
