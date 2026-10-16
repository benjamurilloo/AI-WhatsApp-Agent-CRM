// Los filtros de la lista de recepciones en la URL (brief-22.4, D-12): ?proveedor=&numero=&pagina=.
// Un valor que no se entiende vuelve al de por omisión, nunca da error.

export type SearchParams = Record<string, string | string[] | undefined>;

export type GoodsReceiptFilters = {
  supplierId: string;
  number: string;
  page: number;
};

export const DEFAULT_GOODS_RECEIPT_FILTERS: GoodsReceiptFilters = {
  supplierId: "",
  number: "",
  page: 1,
};

const LIST_PATH = "/compras/recepciones";

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseGoodsReceiptFilters(
  params: SearchParams,
): GoodsReceiptFilters {
  const page = first(params.pagina);
  return {
    supplierId: first(params.proveedor).trim().slice(0, 64),
    number: first(params.numero).trim().slice(0, 20),
    page: /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export function hasActiveGoodsReceiptFilters(
  filters: GoodsReceiptFilters,
): boolean {
  return filters.supplierId !== "" || filters.number !== "";
}

// La URL de la lista, con solo lo que difiere del defecto.
export function goodsReceiptFiltersHref(filters: GoodsReceiptFilters): string {
  const params = new URLSearchParams();
  if (filters.supplierId) params.set("proveedor", filters.supplierId);
  if (filters.number) params.set("numero", filters.number);
  if (filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `${LIST_PATH}?${query}` : LIST_PATH;
}
