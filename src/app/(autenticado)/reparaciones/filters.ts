import type {
  ServiceOrderKindFilter,
  ServiceOrderStatusFilter,
} from "@/modules/service";

// Los filtros de la lista de órdenes de servicio, en la URL (brief-29.6, D-10): el estado y el número;
// desde la 29.6.2, el tipo (brief-29.6.2, D-7).
// Desde la 24.8.2-b, el técnico (brief-24.8.2-b, D-5), que es a donde lleva «Ver reparaciones» de
// la ficha del proveedor. El id viaja tal cual: quien valida que sea un uuid es el módulo, que ante
// uno que no lo es responde una lista vacía en lugar de romperse.
// Desde la 24.9.1 (D-3), el parámetro «numero» pasó a llamarse «buscar» y encuentra por número de
// orden **o** por modelo del equipo. No busca por nombre de cliente: la guarda module-boundary no
// deja que service lea la tabla de clientes, y el buscador global ya los encuentra desde la 24.2.

export type SearchParams = Record<string, string | string[] | undefined>;

export type ServiceOrderFilters = {
  status: ServiceOrderStatusFilter;
  kind: ServiceOrderKindFilter;
  // Lo que se escribió en el buscador: un número de orden o un modelo (D-3).
  text: string;
  // Desde la 24.8.2-b (brief-24.8.2-b, D-5): el técnico, para «Ver reparaciones» de su ficha.
  technicianId: string;
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
  // Desde la 29.9.2 (brief-29.9.2, D-5).
  ["reclamos", "warranty_claim"],
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
    text: single(query.buscar).slice(0, 60),
    technicianId: single(query.tecnico).slice(0, 36),
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
    filters.text.trim() !== "" ||
    filters.technicianId.trim() !== ""
  );
}

export function serviceOrderFiltersHref(filters: ServiceOrderFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== "open")
    params.set("estado", statusParam(filters.status));
  if (filters.kind !== "all") params.set("tipo", kindParam(filters.kind));
  if (filters.text.trim() !== "") params.set("buscar", filters.text.trim());
  if (filters.technicianId.trim() !== "")
    params.set("tecnico", filters.technicianId.trim());
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `/reparaciones?${query}` : "/reparaciones";
}
