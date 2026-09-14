import type {
  MemberListFilters,
  MemberRoleFilter,
  MemberStatusFilter,
} from "@/modules/organizations";

// Filtros y página de la pantalla 10 en la URL (brief-3.7): ?rol=&estado=&pagina=.
// Un valor desconocido se reemplaza por el de defecto, nunca da error.

export type SearchParams = Record<string, string | string[] | undefined>;

export const ROLE_PARAM: Record<string, MemberRoleFilter> = {
  todos: "all",
  admin: "admin",
  viewer: "viewer",
};

export const STATUS_PARAM: Record<string, MemberStatusFilter> = {
  activos: "active",
  inactivos: "inactive",
  todos: "all",
};

export const DEFAULT_FILTERS: MemberListFilters = {
  role: "all",
  status: "active",
  page: 1,
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseMemberFilters(params: SearchParams): MemberListFilters {
  const role = single(params.rol);
  const status = single(params.estado);
  const page = single(params.pagina);
  return {
    role:
      (role && Object.hasOwn(ROLE_PARAM, role) && ROLE_PARAM[role]) ||
      DEFAULT_FILTERS.role,
    status:
      (status && Object.hasOwn(STATUS_PARAM, status) && STATUS_PARAM[status]) ||
      DEFAULT_FILTERS.status,
    page: page && /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

const paramOf = <T extends string>(map: Record<string, T>, value: T) =>
  Object.keys(map).find((key) => map[key] === value)!;

// Query string sin los valores por defecto: "/usuarios" limpio equivale a los filtros iniciales.
export function memberFiltersHref(filters: MemberListFilters): string {
  const query = new URLSearchParams();
  if (filters.role !== DEFAULT_FILTERS.role) {
    query.set("rol", paramOf(ROLE_PARAM, filters.role));
  }
  if (filters.status !== DEFAULT_FILTERS.status) {
    query.set("estado", paramOf(STATUS_PARAM, filters.status));
  }
  if (filters.page > 1) query.set("pagina", String(filters.page));
  const text = query.toString();
  return text ? `/usuarios?${text}` : "/usuarios";
}

export function hasActiveFilters(filters: MemberListFilters): boolean {
  return (
    filters.role !== DEFAULT_FILTERS.role ||
    filters.status !== DEFAULT_FILTERS.status
  );
}
