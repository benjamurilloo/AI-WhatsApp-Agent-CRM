// Los filtros de la lista de recepciones en la URL (brief-22.4, D-12): ?proveedor=&numero=&pagina=.
// Desde la 22.5, el estado: todas, las vigentes o las anuladas (?estado=; brief-22.5, D-9). Un valor
// que no se entiende vuelve al de por omisión, nunca da error.
// Desde la 24.8.1-b, el origen: todas, las que tienen orden de compra o las que no (?orden=;
// brief-24.8.1-b, D-5). No cuesta una lectura: es un `where` sobre `purchase_order_id`.

import type {
  GoodsReceiptOrderFilter,
  GoodsReceiptStatusFilter,
} from "@/modules/purchasing";

export type SearchParams = Record<string, string | string[] | undefined>;

export type GoodsReceiptFilters = {
  supplierId: string;
  number: string;
  status: GoodsReceiptStatusFilter;
  withOrder: GoodsReceiptOrderFilter;
  page: number;
};

export const DEFAULT_GOODS_RECEIPT_FILTERS: GoodsReceiptFilters = {
  supplierId: "",
  number: "",
  status: "all",
  withOrder: "all",
  page: 1,
};

const LIST_PATH = "/compras/recepciones";

const STATUS_PARAMS: Record<string, GoodsReceiptStatusFilter> = {
  vigente: "current",
  anulada: "voided",
};

// El origen en la URL, en español.
const ORDER_PARAMS: Record<string, GoodsReceiptOrderFilter> = {
  con: "with",
  sin: "without",
};

export function statusParam(status: GoodsReceiptStatusFilter): string {
  return status === "current"
    ? "vigente"
    : status === "voided"
      ? "anulada"
      : "todas";
}

export function orderParam(withOrder: GoodsReceiptOrderFilter): string {
  return withOrder === "with"
    ? "con"
    : withOrder === "without"
      ? "sin"
      : "todas";
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseGoodsReceiptFilters(
  params: SearchParams,
): GoodsReceiptFilters {
  const page = first(params.pagina);
  const status = first(params.estado);
  const withOrder = first(params.orden);
  return {
    supplierId: first(params.proveedor).trim().slice(0, 64),
    number: first(params.numero).trim().slice(0, 20),
    status: Object.hasOwn(STATUS_PARAMS, status)
      ? STATUS_PARAMS[status]!
      : "all",
    withOrder: Object.hasOwn(ORDER_PARAMS, withOrder)
      ? ORDER_PARAMS[withOrder]!
      : "all",
    page: /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export function hasActiveGoodsReceiptFilters(
  filters: GoodsReceiptFilters,
): boolean {
  return (
    filters.supplierId !== "" ||
    filters.number !== "" ||
    filters.status !== "all" ||
    filters.withOrder !== "all"
  );
}

// La URL de la lista, con solo lo que difiere del defecto.
export function goodsReceiptFiltersHref(filters: GoodsReceiptFilters): string {
  const params = new URLSearchParams();
  if (filters.supplierId) params.set("proveedor", filters.supplierId);
  if (filters.number) params.set("numero", filters.number);
  if (filters.status !== "all") {
    params.set("estado", statusParam(filters.status));
  }
  if (filters.withOrder !== "all") {
    params.set("orden", orderParam(filters.withOrder));
  }
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `${LIST_PATH}?${query}` : LIST_PATH;
}
