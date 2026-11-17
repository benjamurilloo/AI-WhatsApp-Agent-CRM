import type {
  SupplierListQuery,
  SupplierStatusFilter,
} from "@/modules/purchasing";

// La búsqueda, el estado, el tipo y la página de la lista de proveedores en la URL (brief-22.2,
// D-10; brief-24.8.2-b, D-3): ?q=&estado=&tipo=&pagina=. Un valor desconocido se reemplaza por el
// de defecto, nunca da error.

export type SearchParams = Record<string, string | string[] | undefined>;

export const STATUS_PARAM: Record<string, SupplierStatusFilter> = {
  activos: "active",
  inactivos: "inactive",
  todos: "all",
};

export const statusParam = (status: SupplierStatusFilter) =>
  Object.keys(STATUS_PARAM).find((key) => STATUS_PARAM[key] === status)!;

// El tipo sale del contrato del módulo, sin repetir la unión (brief-24.8.2-b, D-3).
export type SupplierTypeFilter = NonNullable<SupplierListQuery["type"]>;

export const TYPE_PARAM: Record<string, SupplierTypeFilter> = {
  todos: "all",
  proveedores: "supplier",
  tecnicos: "technician",
};

export const typeParam = (type: SupplierTypeFilter) =>
  Object.keys(TYPE_PARAM).find((key) => TYPE_PARAM[key] === type)!;

const MAX_TEXT_LENGTH = 100;

export const DEFAULT_SUPPLIER_FILTERS: Required<SupplierListQuery> = {
  text: "",
  status: "active",
  type: "all",
  page: 1,
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseSupplierFilters(
  params: SearchParams,
): Required<SupplierListQuery> {
  const text = (single(params.q) ?? "").trim().slice(0, MAX_TEXT_LENGTH);
  const statusKey = single(params.estado) ?? "";
  const status = Object.hasOwn(STATUS_PARAM, statusKey)
    ? STATUS_PARAM[statusKey]!
    : DEFAULT_SUPPLIER_FILTERS.status;
  const typeKey = single(params.tipo) ?? "";
  const type = Object.hasOwn(TYPE_PARAM, typeKey)
    ? TYPE_PARAM[typeKey]!
    : DEFAULT_SUPPLIER_FILTERS.type;
  const page = Number(single(params.pagina));
  return {
    text,
    status,
    type,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function hasActiveFilters(filters: SupplierListQuery): boolean {
  return (
    filters.text !== DEFAULT_SUPPLIER_FILTERS.text ||
    filters.status !== DEFAULT_SUPPLIER_FILTERS.status ||
    (filters.type ?? "all") !== DEFAULT_SUPPLIER_FILTERS.type
  );
}

// La URL de la lista, con solo lo que difiere del defecto.
export function supplierFiltersHref(filters: SupplierListQuery): string {
  const params = new URLSearchParams();
  if (filters.text) params.set("q", filters.text);
  if (filters.status !== DEFAULT_SUPPLIER_FILTERS.status) {
    params.set("estado", statusParam(filters.status));
  }
  if (filters.type && filters.type !== DEFAULT_SUPPLIER_FILTERS.type) {
    params.set("tipo", typeParam(filters.type));
  }
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `/compras/proveedores?${query}` : "/compras/proveedores";
}
