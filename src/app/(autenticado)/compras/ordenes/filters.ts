import type { PurchaseOrderStatusFilter } from "@/modules/purchasing";

// Los filtros de la lista de órdenes de compra en la URL (brief-22.3, D-11): ?estado=&proveedor=
// &numero=&pagina=. Un valor que no se entiende vuelve al de por omisión, nunca da error.

export type SearchParams = Record<string, string | string[] | undefined>;

export type PurchaseOrderFilters = {
  status: PurchaseOrderStatusFilter;
  supplierId: string;
  number: string;
  page: number;
};

export const DEFAULT_PURCHASE_ORDER_FILTERS: PurchaseOrderFilters = {
  status: "all",
  supplierId: "",
  number: "",
  page: 1,
};

// Los estados en la URL, en español.
export const STATUS_PARAM: Record<string, PurchaseOrderStatusFilter> = {
  todas: "all",
  abiertas: "open",
  cerradas: "closed",
  canceladas: "cancelled",
};

const LIST_PATH = "/compras/ordenes";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parsePurchaseOrderFilters(
  params: SearchParams,
): PurchaseOrderFilters {
  const status = first(params.estado);
  const page = first(params.pagina);
  return {
    status: Object.hasOwn(STATUS_PARAM, status) ? STATUS_PARAM[status]! : "all",
    supplierId: first(params.proveedor).trim().slice(0, 64),
    number: first(params.numero).trim().slice(0, 20),
    page: /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export function statusParam(status: PurchaseOrderStatusFilter): string {
  return (
    Object.entries(STATUS_PARAM).find(([, value]) => value === status)?.[0] ??
    "todas"
  );
}

export function hasActivePurchaseOrderFilters(
  filters: PurchaseOrderFilters,
): boolean {
  return (
    filters.status !== "all" ||
    filters.supplierId !== "" ||
    filters.number !== ""
  );
}

// La URL de la lista, con solo lo que difiere del defecto.
export function purchaseOrderFiltersHref(
  filters: PurchaseOrderFilters,
): string {
  const params = new URLSearchParams();
  if (filters.status !== "all") {
    params.set("estado", statusParam(filters.status));
  }
  if (filters.supplierId) params.set("proveedor", filters.supplierId);
  if (filters.number) params.set("numero", filters.number);
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `${LIST_PATH}?${query}` : LIST_PATH;
}
