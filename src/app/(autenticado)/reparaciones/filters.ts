import type {
  ServiceOrderKindFilter,
  ServiceOrderStatusFilter,
} from "@/modules/service";

// Los filtros de la lista de órdenes de servicio, en la URL (brief-29.6, D-10): el estado y el número;
// desde la 29.6.2, el tipo (brief-29.6.2, D-7).

export type SearchParams = Record<string, string | string[] | undefined>;

export type ServiceOrderFilters = {
  status: ServiceOrderStatusFilter;
  kind: ServiceOrderKindFilter;
  number: string;
  page: number;
};

// El estado en la URL, en castellano. Sin parámetro, las que están en curso.
export const STATUS_PARAMS: readonly [string, ServiceOrderStatusFilter][] = [
  ["en-curso", "open"],
  ["todas", "all"],
  ["recibidas", "received"],
  ["en-el-tecnico", "sent"],
  ["presupuestadas", "quoted"],
  ["aprobadas", "approved"],
  ["rechazadas", "rejected"],
  ["reparadas", "repaired"],
  ["entregadas", "delivered"],
  ["canceladas", "cancelled"],
];

// El tipo en la URL. Sin parámetro, los dos.
export const KIND_PARAMS: readonly [string, ServiceOrderKindFilter][] = [
  ["todos", "all"],
  ["clientes", "customer_device"],
  ["unidades-propias", "own_unit"],
];

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseServiceOrderFilters(
  query: SearchParams,
): ServiceOrderFilters {
  const status =
    STATUS_PARAMS.find(([param]) => param === single(query.estado))?.[1] ??
    "open";
  const kind =
    KIND_PARAMS.find(([param]) => param === single(query.tipo))?.[1] ?? "all";
  const rawPage = single(query.pagina);
  return {
    status,
    kind,
    number: single(query.numero).slice(0, 30),
    page: /^[1-9][0-9]{0,5}$/.test(rawPage) ? Number(rawPage) : 1,
  };
}

export function statusParam(status: ServiceOrderStatusFilter): string {
  return STATUS_PARAMS.find(([, value]) => value === status)?.[0] ?? "en-curso";
}

export function kindParam(kind: ServiceOrderKindFilter): string {
  return KIND_PARAMS.find(([, value]) => value === kind)?.[0] ?? "todos";
}

export function hasActiveServiceOrderFilters(
  filters: ServiceOrderFilters,
): boolean {
  return (
    filters.status !== "open" ||
    filters.kind !== "all" ||
    filters.number.trim() !== ""
  );
}

export function serviceOrderFiltersHref(filters: ServiceOrderFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== "open")
    params.set("estado", statusParam(filters.status));
  if (filters.kind !== "all") params.set("tipo", kindParam(filters.kind));
  if (filters.number.trim() !== "") params.set("numero", filters.number.trim());
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `/reparaciones?${query}` : "/reparaciones";
}
