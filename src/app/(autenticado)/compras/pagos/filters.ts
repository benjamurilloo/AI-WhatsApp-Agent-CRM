// Los filtros de la lista de pagos a proveedores en la URL (brief-22.6, D-13):
// ?proveedor=&numero=&estado=&moneda=&pagina=, y ?pago= con el panel abierto (brief-24.8.2, D-2 y
// D-5). Un valor que no se entiende vuelve al de por omisión, nunca da error.
//
// El panel es **un parámetro más de esta dirección**, no un destino aparte: por eso cerrarlo
// devuelve al listado con los filtros y la página donde estaban (molde de la 24.7.2-b, D-3).

import type { SupplierPaymentStatusFilter } from "@/modules/cash";

export type SearchParams = Record<string, string | string[] | undefined>;

export type SupplierPaymentFilters = {
  supplierId: string;
  number: string;
  status: SupplierPaymentStatusFilter;
  // El código de tres letras, en mayúsculas. Vacío es «Todas».
  currency: string;
  page: number;
  // El pago abierto en el panel. No es un filtro: no cambia la lista.
  payment: string;
};

export const DEFAULT_SUPPLIER_PAYMENT_FILTERS: SupplierPaymentFilters = {
  supplierId: "",
  number: "",
  status: "all",
  currency: "",
  page: 1,
  payment: "",
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
  const currency = first(params.moneda).trim().toUpperCase();
  return {
    supplierId: first(params.proveedor).trim().slice(0, 64),
    number: first(params.numero).trim().slice(0, 20),
    status: Object.hasOwn(STATUS_PARAMS, status)
      ? STATUS_PARAMS[status]!
      : "all",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
    page: /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
    payment: first(params.pago).trim().slice(0, 64),
  };
}

export function hasActiveSupplierPaymentFilters(
  filters: SupplierPaymentFilters,
): boolean {
  // El panel abierto no cuenta: no filtra nada, y «Limpiar filtros» no tiene por qué cerrarlo.
  return (
    filters.supplierId !== "" ||
    filters.number !== "" ||
    filters.currency !== "" ||
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
  if (filters.currency) params.set("moneda", filters.currency);
  if (filters.page > 1) params.set("pagina", String(filters.page));
  if (filters.payment) params.set("pago", filters.payment);
  const query = params.toString();
  return query ? `${LIST_PATH}?${query}` : LIST_PATH;
}
