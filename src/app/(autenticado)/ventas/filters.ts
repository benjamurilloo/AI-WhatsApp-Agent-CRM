// Filtros de la lista de ventas en la URL (brief-20.2, D-6): número, período, cliente y página. Desde
// la 20.4, el estado: todas, las vigentes o las anuladas (brief-20.4, D-8). Un valor que no se
// entiende vuelve al de por omisión; las fechas las valida sales.

import type { SaleStatusFilter } from "@/modules/sales";

export type SearchParams = Record<string, string | string[] | undefined>;

export type SaleFilters = {
  number: string;
  from: string;
  to: string;
  clientId: string;
  status: SaleStatusFilter;
  page: number;
};

const STATUS_PARAMS: Record<string, SaleStatusFilter> = {
  vigente: "current",
  anulada: "voided",
};

export function statusParam(status: SaleStatusFilter): string {
  return status === "current"
    ? "vigente"
    : status === "voided"
      ? "anulada"
      : "todas";
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseSaleFilters(params: SearchParams): SaleFilters {
  const page = first(params.pagina);
  return {
    number: first(params.numero).trim().slice(0, 20),
    from: first(params.desde).trim().slice(0, 10),
    to: first(params.hasta).trim().slice(0, 10),
    clientId: first(params.cliente).trim().slice(0, 64),
    status: STATUS_PARAMS[first(params.estado)] ?? "all",
    page: /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export function hasActiveSaleFilters(filters: SaleFilters): boolean {
  return (
    filters.number !== "" ||
    filters.from !== "" ||
    filters.to !== "" ||
    filters.clientId !== "" ||
    filters.status !== "all"
  );
}

export function saleFiltersHref(filters: SaleFilters): string {
  const params = new URLSearchParams();
  if (filters.number) params.set("numero", filters.number);
  if (filters.from) params.set("desde", filters.from);
  if (filters.to) params.set("hasta", filters.to);
  if (filters.clientId) params.set("cliente", filters.clientId);
  if (filters.status !== "all")
    params.set("estado", statusParam(filters.status));
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `/ventas?${query}` : "/ventas";
}
