import type {
  ClientInteractionFilters,
  ClientSort,
} from "@/modules/conversations";
import type { ClientActivityFilter, ClientListFilters } from "@/modules/crm";
import { DEFAULT_PAGE_SIZE, parsePageSize } from "@/app/_components/pagination";

// Búsqueda, actividad y página de la pantalla 6 en la URL (brief-5.3): ?q=&actividad=&pagina=,
// más el orden y las filas por página de la brief-15.2: ?orden=&filas=, y la etiqueta de la
// brief-16.1: ?etiqueta=<id>. Un valor desconocido se reemplaza por el de defecto, nunca da error.

export type ClientFilters = Required<ClientInteractionFilters>;

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
};

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
  };
}

export function activityParam(activity: ClientActivityFilter): string {
  return Object.keys(ACTIVITY_PARAM).find(
    (key) => ACTIVITY_PARAM[key] === activity,
  )!;
}

// Query string sin los valores por defecto: "/clientes" limpio equivale a los filtros iniciales.
export function clientFiltersHref(filters: ClientInteractionFilters): string {
  const query = new URLSearchParams();
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
  if (filters.page > 1) query.set("pagina", String(filters.page));
  const text = query.toString();
  return text ? `/clientes?${text}` : "/clientes";
}

export function hasActiveFilters(filters: ClientListFilters): boolean {
  return (
    filters.text !== DEFAULT_FILTERS.text ||
    filters.activity !== DEFAULT_FILTERS.activity ||
    Boolean(filters.tagId)
  );
}
