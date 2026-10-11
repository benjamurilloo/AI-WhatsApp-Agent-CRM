import type { OrderStatusFilter } from "@/modules/orders";

// Filtros de la lista de pedidos en la URL (brief-19.2, D-10): estado, cliente, número y página.
// Un valor que no se entiende vuelve al de por omisión.

export type SearchParams = Record<string, string | string[] | undefined>;

export type OrderFilters = {
  status: OrderStatusFilter;
  clientId: string;
  number: string;
  page: number;
};

export const DEFAULT_ORDER_FILTERS: OrderFilters = {
  status: "all",
  clientId: "",
  number: "",
  page: 1,
};

// Los estados en la URL, en español. Confirmado y entregado se ofrecen desde la 19.3.
export const STATUS_PARAM: Record<string, OrderStatusFilter> = {
  todos: "all",
  pendientes: "pending",
  confirmados: "confirmed",
  entregados: "delivered",
  cancelados: "cancelled",
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseOrderFilters(params: SearchParams): OrderFilters {
  const page = first(params.pagina);
  return {
    status: STATUS_PARAM[first(params.estado)] ?? "all",
    clientId: first(params.cliente).trim().slice(0, 64),
    number: first(params.numero).trim().slice(0, 20),
    page: /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export function statusParam(status: OrderStatusFilter): string {
  return (
    Object.entries(STATUS_PARAM).find(([, value]) => value === status)?.[0] ??
    "todos"
  );
}

export function hasActiveOrderFilters(filters: OrderFilters): boolean {
  return (
    filters.status !== "all" || filters.clientId !== "" || filters.number !== ""
  );
}

export function orderFiltersHref(filters: OrderFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== "all")
    params.set("estado", statusParam(filters.status));
  if (filters.clientId) params.set("cliente", filters.clientId);
  if (filters.number) params.set("numero", filters.number);
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `/pedidos?${query}` : "/pedidos";
}
