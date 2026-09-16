import type { ClientActivityFilter, ClientListFilters } from "@/modules/crm";

// Búsqueda, actividad y página de la pantalla 6 en la URL (brief-5.3): ?q=&actividad=&pagina=.
// Un valor desconocido se reemplaza por el de defecto, nunca da error.

export type SearchParams = Record<string, string | string[] | undefined>;

export const ACTIVITY_PARAM: Record<string, ClientActivityFilter> = {
  activos: "active",
  inactivos: "inactive",
  todos: "all",
};

// El texto se recorta y se acota: es un prefijo de nombre o un teléfono (brief-5.2, D-3).
const MAX_TEXT_LENGTH = 100;

export const DEFAULT_FILTERS: ClientListFilters = {
  text: "",
  activity: "active",
  page: 1,
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseClientFilters(params: SearchParams): ClientListFilters {
  const text = single(params.q)?.trim().slice(0, MAX_TEXT_LENGTH) ?? "";
  const activity = single(params.actividad);
  const page = single(params.pagina);
  return {
    text,
    activity:
      (activity &&
        Object.hasOwn(ACTIVITY_PARAM, activity) &&
        ACTIVITY_PARAM[activity]) ||
      DEFAULT_FILTERS.activity,
    page: page && /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export function activityParam(activity: ClientActivityFilter): string {
  return Object.keys(ACTIVITY_PARAM).find(
    (key) => ACTIVITY_PARAM[key] === activity,
  )!;
}

// Query string sin los valores por defecto: "/clientes" limpio equivale a los filtros iniciales.
export function clientFiltersHref(filters: ClientListFilters): string {
  const query = new URLSearchParams();
  if (filters.text !== DEFAULT_FILTERS.text) query.set("q", filters.text);
  if (filters.activity !== DEFAULT_FILTERS.activity) {
    query.set("actividad", activityParam(filters.activity));
  }
  if (filters.page > 1) query.set("pagina", String(filters.page));
  const text = query.toString();
  return text ? `/clientes?${text}` : "/clientes";
}

export function hasActiveFilters(filters: ClientListFilters): boolean {
  return (
    filters.text !== DEFAULT_FILTERS.text ||
    filters.activity !== DEFAULT_FILTERS.activity
  );
}
