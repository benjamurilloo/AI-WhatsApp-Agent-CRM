import type {
  ClientInteractionFilters,
  ClientSort,
  InteractionFilter,
} from "@/modules/conversations";
import type {
  ClientActivityFilter,
  ClientKind,
  ClientListFilters,
} from "@/modules/crm";
import { DEFAULT_PAGE_SIZE, parsePageSize } from "@/app/_components/pagination";

// Búsqueda, actividad y página de la pantalla 6 en la URL (brief-5.3): ?q=&actividad=&pagina=,
// más el orden y las filas por página de la brief-15.2: ?orden=&filas=, y la etiqueta de la
// brief-16.1: ?etiqueta=<id>, y el tipo, la provincia y el segmento de la brief-17.1 (D-9):
// ?tipo=&provincia=&segmento=. Desde la 24.4.2, la vista y la última interacción (brief-24.4.2, D-1
// y D-4): ?vista=&interaccion=. Un valor desconocido se reemplaza por el de defecto, nunca da error.

// Las vistas de la lista (D-1). «Con reparaciones» necesita repairs: sin la capacidad, la página la
// trata como «Todos».
export const CLIENT_VIEWS = ["all", "with_balance", "with_repairs"] as const;
export type ClientView = (typeof CLIENT_VIEWS)[number];

export const VIEW_PARAM: Record<string, ClientView> = {
  todos: "all",
  "con-saldo": "with_balance",
  "con-reparaciones": "with_repairs",
};

export const VIEW_LABEL: Record<ClientView, string> = {
  all: "Todos",
  with_balance: "Con saldo",
  with_repairs: "Con reparaciones",
};

export const viewParam = (view: ClientView) =>
  Object.keys(VIEW_PARAM).find((key) => VIEW_PARAM[key] === view)!;

// La última interacción (D-4), como período: la fecha la calcula la página con interactionFilter.
export const INTERACTION_PERIODS = ["7d", "30d", "none"] as const;
export type InteractionPeriod = (typeof INTERACTION_PERIODS)[number];

export const INTERACTION_PARAM: Record<string, InteractionPeriod> = {
  "7-dias": "7d",
  "30-dias": "30d",
  sin: "none",
};

export const INTERACTION_LABEL: Record<InteractionPeriod, string> = {
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  none: "Sin interacciones",
};

export const interactionParam = (period: InteractionPeriod) =>
  Object.keys(INTERACTION_PARAM).find(
    (key) => INTERACTION_PARAM[key] === period,
  )!;

const DAY_MS = 24 * 60 * 60 * 1000;

// Los últimos 7 o 30 días, contados hacia atrás desde ahora.
export function interactionFilter(
  period: InteractionPeriod | null,
  now: Date,
): InteractionFilter {
  if (period === null) return null;
  if (period === "none") return "none";
  const days = period === "7d" ? 7 : 30;
  return { since: new Date(now.getTime() - days * DAY_MS) };
}

export type ClientFilters = Required<
  Omit<ClientInteractionFilters, "interaction">
> & {
  interaction: InteractionPeriod | null;
  view: ClientView;
};

// Lo que arma un enlace de la lista: cualquier subconjunto de los filtros.
export type ClientFiltersLink = Omit<
  ClientInteractionFilters,
  "interaction"
> & {
  interaction?: InteractionPeriod | null;
  view?: ClientView;
};

// Órdenes en la URL, en el orden en que se ofrecen (brief-15.2, D-1).
export const SORT_PARAM: Record<string, ClientSort> = {
  interaccion: "last_interaction",
  nombre: "name_asc",
  "nombre-za": "name_desc",
};

export const SORT_LABEL: Record<ClientSort, string> = {
  last_interaction: "Última interacción",
  name_asc: "Nombre (A–Z)",
  name_desc: "Nombre (Z–A)",
};

// Cómo se nombra el orden al pie del listado: «Ordenados por última interacción».
export const SORT_CAPTION: Record<ClientSort, string> = {
  last_interaction: "última interacción",
  name_asc: "nombre (A–Z)",
  name_desc: "nombre (Z–A)",
};

export const sortParam = (sort: ClientSort) =>
  Object.keys(SORT_PARAM).find((key) => SORT_PARAM[key] === sort)!;

export type SearchParams = Record<string, string | string[] | undefined>;

export const ACTIVITY_PARAM: Record<string, ClientActivityFilter> = {
  activos: "active",
  inactivos: "inactive",
  todos: "all",
};

// El texto se recorta y se acota: es un prefijo de nombre o un teléfono (brief-5.2, D-3).
const MAX_TEXT_LENGTH = 100;

export const DEFAULT_FILTERS: ClientFilters = {
  text: "",
  activity: "active",
  page: 1,
  sort: "last_interaction",
  pageSize: DEFAULT_PAGE_SIZE,
  tagId: null,
  kind: null,
  province: null,
  segment: null,
  interaction: null,
  view: "all",
};

// Tipos de cliente en la URL (brief-17.1, D-3).
export const KIND_PARAM: Record<string, ClientKind> = {
  persona: "person",
  empresa: "company",
};

export const KIND_LABEL: Record<ClientKind, string> = {
  person: "Persona",
  company: "Empresa",
};

export const kindParam = (kind: ClientKind) =>
  Object.keys(KIND_PARAM).find((key) => KIND_PARAM[key] === kind)!;

// Solo la forma de un código ISO 3166-2 de Argentina: si es una provincia lo decide crm.
const PROVINCE = /^AR-[A-Z]$/;
const MAX_SEGMENT_LENGTH = 60;

// Solo la forma de un id: si la etiqueta existe, es de la organización y está activa lo decide crm,
// que ignora cualquier otra (brief-16.1, D-9).
const TAG_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseClientFilters(params: SearchParams): ClientFilters {
  const text = single(params.q)?.trim().slice(0, MAX_TEXT_LENGTH) ?? "";
  const activity = single(params.actividad);
  const page = single(params.pagina);
  const sort = single(params.orden);
  const tag = single(params.etiqueta);
  const kind = single(params.tipo);
  const province = single(params.provincia)?.toUpperCase();
  const segment = single(params.segmento)?.trim();
  const view = single(params.vista);
  const interaction = single(params.interaccion);
  return {
    text,
    activity:
      (activity &&
        Object.hasOwn(ACTIVITY_PARAM, activity) &&
        ACTIVITY_PARAM[activity]) ||
      DEFAULT_FILTERS.activity,
    page: page && /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
    sort:
      (sort && Object.hasOwn(SORT_PARAM, sort) && SORT_PARAM[sort]) ||
      DEFAULT_FILTERS.sort,
    pageSize: parsePageSize(params.filas),
    tagId: tag && TAG_ID.test(tag) ? tag.toLowerCase() : null,
    kind: (kind && Object.hasOwn(KIND_PARAM, kind) && KIND_PARAM[kind]) || null,
    province: province && PROVINCE.test(province) ? province : null,
    segment: segment && segment.length <= MAX_SEGMENT_LENGTH ? segment : null,
    interaction:
      (interaction &&
        Object.hasOwn(INTERACTION_PARAM, interaction) &&
        INTERACTION_PARAM[interaction]) ||
      null,
    view:
      (view && Object.hasOwn(VIEW_PARAM, view) && VIEW_PARAM[view]) ||
      DEFAULT_FILTERS.view,
  };
}

export function activityParam(activity: ClientActivityFilter): string {
  return Object.keys(ACTIVITY_PARAM).find(
    (key) => ACTIVITY_PARAM[key] === activity,
  )!;
}

// Query string sin los valores por defecto: "/clientes" limpio equivale a los filtros iniciales.
export function clientFiltersHref(filters: ClientFiltersLink): string {
  const query = new URLSearchParams();
  if (filters.view && filters.view !== DEFAULT_FILTERS.view) {
    query.set("vista", viewParam(filters.view));
  }
  if (filters.text !== DEFAULT_FILTERS.text) query.set("q", filters.text);
  if (filters.activity !== DEFAULT_FILTERS.activity) {
    query.set("actividad", activityParam(filters.activity));
  }
  if (filters.sort && filters.sort !== DEFAULT_FILTERS.sort) {
    query.set("orden", sortParam(filters.sort));
  }
  if (filters.pageSize && filters.pageSize !== DEFAULT_FILTERS.pageSize) {
    query.set("filas", String(filters.pageSize));
  }
  if (filters.tagId) query.set("etiqueta", filters.tagId);
  if (filters.kind) query.set("tipo", kindParam(filters.kind));
  if (filters.province) query.set("provincia", filters.province);
  if (filters.segment) query.set("segmento", filters.segment);
  if (filters.interaction) {
    query.set("interaccion", interactionParam(filters.interaction));
  }
  if (filters.page > 1) query.set("pagina", String(filters.page));
  const text = query.toString();
  return text ? `/clientes?${text}` : "/clientes";
}

// La vista no es un filtro: «Limpiar filtros» la conserva.
export function hasActiveFilters(
  filters: ClientListFilters & {
    interaction?: InteractionPeriod | null;
    view?: ClientView;
  },
): boolean {
  return (
    Boolean(filters.interaction) ||
    filters.text !== DEFAULT_FILTERS.text ||
    filters.activity !== DEFAULT_FILTERS.activity ||
    Boolean(filters.tagId) ||
    Boolean(filters.kind) ||
    Boolean(filters.province) ||
    Boolean(filters.segment)
  );
}
