// Los filtros de la lista de pagos a proveedores en la URL (brief-22.6, D-13):
// ?proveedor=&numero=&estado=&pagina=. Un valor que no se entiende vuelve al de por omisión, nunca da
// error.

import type { SupplierPaymentStatusFilter } from "@/modules/cash";

export type SearchParams = Record<string, string | string[] | undefined>;

export type SupplierPaymentFilters = {
  supplierId: string;
  number: string;
  status: SupplierPaymentStatusFilter;
  page: number;
};

export const DEFAULT_SUPPLIER_PAYMENT_FILTERS: SupplierPaymentFilters = {
  supplierId: "",
  number: "",
  status: "all",
  page: 1,
};

const LIST_PATH = "/compras/pagos";

const STATUS_PARAMS: Record<string, SupplierPaymentStatusFilter> = {
  vigente: "current",
  anulado: "voided",
};

export function statusParam(status: SupplierPaymentStatusFilter): string {
  return status === "current"
    ? "vigente"
    : status === "voided"
      ? "anulado"
      : "todos";
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseSupplierPaymentFilters(
  params: SearchParams,
): SupplierPaymentFilters {
  const page = first(params.pagina);
  const status = first(params.estado);
  return {
    supplierId: first(params.proveedor).trim().slice(0, 64),
    number: first(params.numero).trim().slice(0, 20),
    status: Object.hasOwn(STATUS_PARAMS, status)
      ? STATUS_PARAMS[status]!
      : "all",
    page: /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export function hasActiveSupplierPaymentFilters(
  filters: SupplierPaymentFilters,
): boolean {
  return (
    filters.supplierId !== "" ||
    filters.number !== "" ||
    filters.status !== "all"
  );
}

// La URL de la lista, con solo lo que difiere del defecto.
export function supplierPaymentFiltersHref(
  filters: SupplierPaymentFilters,
): string {
  const params = new URLSearchParams();
  if (filters.supplierId) params.set("proveedor", filters.supplierId);
  if (filters.number) params.set("numero", filters.number);
  if (filters.status !== "all") {
    params.set("estado", statusParam(filters.status));
  }
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `${LIST_PATH}?${query}` : LIST_PATH;
}
