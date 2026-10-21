import type {
  TradeInDestinationFilter,
  TradeInStatusFilter,
} from "@/modules/tradeins";

// Los filtros de la lista de usados recibidos, en la URL (brief-29.7, D-7): el estado, el destino y la
// búsqueda por número o IMEI.

export type SearchParams = Record<string, string | string[] | undefined>;

export type TradeInFilters = {
  status: TradeInStatusFilter;
  destination: TradeInDestinationFilter;
  search: string;
  page: number;
};

// El estado en la URL, en castellano. Sin parámetro, todas.
export const STATUS_PARAMS: readonly [string, TradeInStatusFilter, string][] = [
  ["todas", "all", "Todas"],
  ["vigentes", "current", "Vigentes"],
  ["anuladas", "voided", "Anuladas"],
];

export const DESTINATION_PARAMS: readonly [
  string,
  TradeInDestinationFilter,
  string,
][] = [
  ["todos", "all", "Todos"],
  ["permuta", "sale_credit", "Permuta"],
  ["compra", "purchase", "Compra"],
];

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseTradeInFilters(query: SearchParams): TradeInFilters {
  const status =
    STATUS_PARAMS.find(([param]) => param === single(query.estado))?.[1] ??
    "all";
  const destination =
    DESTINATION_PARAMS.find(
      ([param]) => param === single(query.destino),
    )?.[1] ?? "all";
  const rawPage = single(query.pagina);
  return {
    status,
    destination,
    search: single(query.buscar).slice(0, 40),
    page: /^[1-9][0-9]{0,5}$/.test(rawPage) ? Number(rawPage) : 1,
  };
}

export function statusParam(status: TradeInStatusFilter): string {
  return STATUS_PARAMS.find(([, value]) => value === status)?.[0] ?? "todas";
}

export function destinationParam(
  destination: TradeInDestinationFilter,
): string {
  return (
    DESTINATION_PARAMS.find(([, value]) => value === destination)?.[0] ??
    "todos"
  );
}

export function hasActiveTradeInFilters(filters: TradeInFilters): boolean {
  return (
    filters.status !== "all" ||
    filters.destination !== "all" ||
    filters.search.trim() !== ""
  );
}

export function tradeInFiltersHref(filters: TradeInFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== "all")
    params.set("estado", statusParam(filters.status));
  if (filters.destination !== "all") {
    params.set("destino", destinationParam(filters.destination));
  }
  if (filters.search.trim() !== "") params.set("buscar", filters.search.trim());
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `/usados?${query}` : "/usados";
}
