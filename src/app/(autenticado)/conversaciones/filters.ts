import type {
  ConversationChannel,
  ConversationListFilters,
  ConversationStatus,
} from "@/modules/conversations";
import { calendarDayIn, shiftDays } from "@/app/_format/date-time";

// Filtros de la pantalla 8 en la URL (brief-6.4):
// ?periodo=&desde=&hasta=&estado=&canal=&cliente=&buscar_cliente=&pagina=.
// El parseo es puro y un valor desconocido vuelve al de defecto. Los atajos de período son los de
// la pantalla 5, con "todo" por defecto (D-2); la búsqueda de cliente se resuelve en la página
// con crm (D-1).

export type SearchParams = Record<string, string | string[] | undefined>;

export type PeriodKey = "todo" | "7d" | "30d" | "90d" | "personalizado";
export type StatusKey = "todos" | "abierta" | "pendiente" | "cerrada";
export type ChannelKey = "todos" | "whatsapp";

export const PERIOD_KEYS: readonly PeriodKey[] = [
  "todo",
  "7d",
  "30d",
  "90d",
  "personalizado",
];

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  todo: "Todas las fechas",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  personalizado: "Personalizado",
};

const PERIOD_DAYS: Record<"7d" | "30d" | "90d", number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const STATUS_PARAM: Record<StatusKey, ConversationStatus | "all"> = {
  todos: "all",
  abierta: "open",
  pendiente: "pending",
  cerrada: "closed",
};

export const CHANNEL_PARAM: Record<ChannelKey, ConversationChannel | "all"> = {
  todos: "all",
  whatsapp: "whatsapp",
};

export type ConversationView = {
  period: PeriodKey;
  // Solo con period "personalizado"; llegan tal como se escribieron y los valida el servicio.
  from: string;
  to: string;
  status: StatusKey;
  channel: ChannelKey;
  // Id del cliente elegido; lo valida el servicio.
  clientId: string;
  // Texto de la caja de cliente, pendiente de resolver a un id.
  clientSearch: string;
  page: number;
};

export const DEFAULT_VIEW: ConversationView = {
  period: "todo",
  from: "",
  to: "",
  status: "todos",
  channel: "todos",
  clientId: "",
  clientSearch: "",
  page: 1,
};

const MAX_TEXT_LENGTH = 100;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function keyOf<T extends string>(
  candidate: string | undefined,
  keys: readonly T[],
  fallback: T,
): T {
  return candidate && (keys as readonly string[]).includes(candidate)
    ? (candidate as T)
    : fallback;
}

export function parsePage(value: string | string[] | undefined): number {
  const raw = single(value);
  return raw && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
}

export function parseStatusKey(
  value: string | string[] | undefined,
): StatusKey {
  return keyOf(
    single(value),
    Object.keys(STATUS_PARAM) as StatusKey[],
    DEFAULT_VIEW.status,
  );
}

export function parseConversationView(params: SearchParams): ConversationView {
  const period = keyOf(single(params.periodo), PERIOD_KEYS, "todo");
  const custom = period === "personalizado";
  const clientId = single(params.cliente)?.trim().slice(0, 64) ?? "";
  return {
    period,
    from: custom ? (single(params.desde)?.trim().slice(0, 10) ?? "") : "",
    to: custom ? (single(params.hasta)?.trim().slice(0, 10) ?? "") : "",
    status: parseStatusKey(params.estado),
    channel: keyOf(
      single(params.canal),
      Object.keys(CHANNEL_PARAM) as ChannelKey[],
      DEFAULT_VIEW.channel,
    ),
    clientId,
    // Un cliente ya elegido manda sobre una búsqueda pendiente.
    clientSearch: clientId
      ? ""
      : (single(params.buscar_cliente)?.trim().slice(0, MAX_TEXT_LENGTH) ?? ""),
    page: parsePage(params.pagina),
  };
}

// Traduce la vista a lo que espera el servicio, con los atajos resueltos en días de la zona de
// la organización (brief-4.3.3, D-3).
export function toListFilters(
  view: ConversationView,
  timeZone: string,
  now = new Date(),
): ConversationListFilters {
  const base = {
    status: STATUS_PARAM[view.status],
    channel: CHANNEL_PARAM[view.channel],
    clientId: view.clientId,
    page: view.page,
  };
  if (view.period === "personalizado") {
    return { ...base, from: view.from, to: view.to };
  }
  if (view.period === "todo") return { ...base, from: "", to: "" };
  const today = calendarDayIn(timeZone, now);
  return {
    ...base,
    from: shiftDays(today, 1 - PERIOD_DAYS[view.period]),
    to: today,
  };
}

// Query string sin los valores por defecto: "/conversaciones" equivale a los filtros iniciales.
export function conversationFiltersHref(view: ConversationView): string {
  const query = new URLSearchParams();
  if (view.period !== DEFAULT_VIEW.period) {
    query.set("periodo", view.period);
    if (view.period === "personalizado") {
      if (view.from) query.set("desde", view.from);
      if (view.to) query.set("hasta", view.to);
    }
  }
  if (view.status !== DEFAULT_VIEW.status) query.set("estado", view.status);
  if (view.channel !== DEFAULT_VIEW.channel) query.set("canal", view.channel);
  if (view.clientId) {
    query.set("cliente", view.clientId);
  } else if (view.clientSearch) {
    query.set("buscar_cliente", view.clientSearch);
  }
  if (view.page > 1) query.set("pagina", String(view.page));
  const text = query.toString();
  return text ? `/conversaciones?${text}` : "/conversaciones";
}

export function hasActiveConversationFilters(view: ConversationView): boolean {
  return (
    view.period !== DEFAULT_VIEW.period ||
    view.status !== DEFAULT_VIEW.status ||
    view.channel !== DEFAULT_VIEW.channel ||
    view.clientId !== "" ||
    view.clientSearch !== ""
  );
}

// Enlaces de la sección de conversaciones de la pantalla 7 (D-4): sus parámetros conviven con
// los de la auditoría, y cada enlace conserva los de la otra sección.
export type ClientSectionsView = {
  auditPage: number;
  conversationStatus: StatusKey;
  conversationPage: number;
};

export function parseClientSectionsView(
  params: SearchParams,
): ClientSectionsView {
  return {
    auditPage: parsePage(params.auditoria),
    conversationStatus: parseStatusKey(params.estado_conv),
    conversationPage: parsePage(params.pagina_conv),
  };
}

export function clientSectionsHref(
  clientId: string,
  view: ClientSectionsView,
): string {
  const query = new URLSearchParams();
  if (view.auditPage > 1) query.set("auditoria", String(view.auditPage));
  if (view.conversationStatus !== "todos") {
    query.set("estado_conv", view.conversationStatus);
  }
  if (view.conversationPage > 1) {
    query.set("pagina_conv", String(view.conversationPage));
  }
  const text = query.toString();
  return text ? `/clientes/${clientId}?${text}` : `/clientes/${clientId}`;
}
