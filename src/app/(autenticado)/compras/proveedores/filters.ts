import type {
  SupplierListQuery,
  SupplierStatusFilter,
} from "@/modules/purchasing";

// La búsqueda, el estado y la página de la lista de proveedores en la URL (brief-22.2, D-10):
// ?q=&estado=&pagina=. Un valor desconocido se reemplaza por el de defecto, nunca da error.

export type SearchParams = Record<string, string | string[] | undefined>;

export const STATUS_PARAM: Record<string, SupplierStatusFilter> = {
  activos: "active",
  inactivos: "inactive",
  todos: "all",
};

export const statusParam = (status: SupplierStatusFilter) =>
  Object.keys(STATUS_PARAM).find((key) => STATUS_PARAM[key] === status)!;

const MAX_TEXT_LENGTH = 100;

export const DEFAULT_SUPPLIER_FILTERS: SupplierListQuery = {
  text: "",
  status: "active",
  page: 1,
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseSupplierFilters(params: SearchParams): SupplierListQuery {
  const text = (single(params.q) ?? "").trim().slice(0, MAX_TEXT_LENGTH);
  const statusKey = single(params.estado) ?? "";
  const status = Object.hasOwn(STATUS_PARAM, statusKey)
    ? STATUS_PARAM[statusKey]!
    : DEFAULT_SUPPLIER_FILTERS.status;
  const page = Number(single(params.pagina));
  return {
    text,
    status,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function hasActiveFilters(filters: SupplierListQuery): boolean {
  return (
    filters.text !== DEFAULT_SUPPLIER_FILTERS.text ||
    filters.status !== DEFAULT_SUPPLIER_FILTERS.status
  );
}

// La URL de la lista, con solo lo que difiere del defecto.
export function supplierFiltersHref(filters: SupplierListQuery): string {
  const params = new URLSearchParams();
  if (filters.text) params.set("q", filters.text);
  if (filters.status !== DEFAULT_SUPPLIER_FILTERS.status) {
    params.set("estado", statusParam(filters.status));
  }
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `/compras/proveedores?${query}` : "/compras/proveedores";
}
