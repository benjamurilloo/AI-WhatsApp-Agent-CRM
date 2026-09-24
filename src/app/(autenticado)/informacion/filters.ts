import type { KnowledgeStatusFilter } from "@/modules/knowledge";

// Filtros y página de la pantalla 11 en la URL (brief-11.2, D-7): ?q=&estado=&pagina=. Un valor
// desconocido se reemplaza por el de defecto, nunca da error.

export type SearchParams = Record<string, string | string[] | undefined>;

export type KnowledgeFilters = {
  text: string;
  status: KnowledgeStatusFilter;
  page: number;
};

export const STATUS_PARAM: Record<string, KnowledgeStatusFilter> = {
  todas: "all",
  vigentes: "current",
  programadas: "scheduled",
  vencidas: "expired",
  inactivas: "inactive",
};

// La búsqueda es por palabras sueltas sobre título, categoría y contenido (FR-INFO-02).
const MAX_TEXT_LENGTH = 100;

export const DEFAULT_FILTERS: KnowledgeFilters = {
  text: "",
  status: "all",
  page: 1,
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseKnowledgeFilters(params: SearchParams): KnowledgeFilters {
  const text = single(params.q)?.trim().slice(0, MAX_TEXT_LENGTH) ?? "";
  const status = single(params.estado);
  const page = single(params.pagina);
  return {
    text,
    status:
      (status && Object.hasOwn(STATUS_PARAM, status) && STATUS_PARAM[status]) ||
      DEFAULT_FILTERS.status,
    page: page && /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export function statusParam(status: KnowledgeStatusFilter): string {
  return Object.keys(STATUS_PARAM).find((key) => STATUS_PARAM[key] === status)!;
}

// Query string sin los valores por defecto: "/informacion" limpio equivale a los filtros iniciales.
export function knowledgeFiltersHref(filters: KnowledgeFilters): string {
  const query = new URLSearchParams();
  if (filters.text !== DEFAULT_FILTERS.text) query.set("q", filters.text);
  if (filters.status !== DEFAULT_FILTERS.status) {
    query.set("estado", statusParam(filters.status));
  }
  if (filters.page > 1) query.set("pagina", String(filters.page));
  const text = query.toString();
  return text ? `/informacion?${text}` : "/informacion";
}

export function hasActiveFilters(filters: KnowledgeFilters): boolean {
  return (
    filters.text !== DEFAULT_FILTERS.text ||
    filters.status !== DEFAULT_FILTERS.status
  );
}
