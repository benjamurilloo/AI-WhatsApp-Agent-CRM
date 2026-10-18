import type { ProductActivityFilter, StockStatus } from "@/modules/catalog";
import type {
  ProductListFilters,
  ProductSort,
  StockStatusFilter,
} from "@/modules/inventory";
import { DEFAULT_PAGE_SIZE, parsePageSize } from "@/app/_components/pagination";

// Filtros y página de la pantalla 3 en la URL (brief-4.4): ?q=&estado=&actividad=&pagina=, más
// la categoría, la marca, el orden y las filas por página de la brief-15.2:
// ?categoria=&marca=&orden=&filas=. Categoría y marca vacías no filtran. Desde la 29.2, ?modelo=<id>
// con la capacidad variants (brief-29.2, D-4); un id que no es un uuid no filtra. ?agrupar=modelo
// agrupa la lista por modelo; como el orden, no es un filtro.
// Un valor desconocido se reemplaza por el de defecto, nunca da error.

export type SearchParams = Record<string, string | string[] | undefined>;

export const STOCK_STATUS_PARAM: Record<string, StockStatusFilter> = {
  todos: "all",
  disponible: "disponible",
  bajo: "bajo_stock",
  sin: "sin_stock",
};

export const ACTIVITY_PARAM: Record<string, ProductActivityFilter> = {
  activos: "active",
  inactivos: "inactive",
  todos: "all",
};

// Órdenes en la URL y su nombre en el selector, en el orden en que se ofrecen (brief-15.2, D-1).
export const SORT_PARAM: Record<string, ProductSort> = {
  nombre: "name_asc",
  "nombre-za": "name_desc",
  sku: "sku_asc",
  "stock-menor": "stock_asc",
  "stock-mayor": "stock_desc",
  "precio-menor": "price_asc",
  "precio-mayor": "price_desc",
};

export const SORT_LABEL: Record<ProductSort, string> = {
  name_asc: "Nombre (A–Z)",
  name_desc: "Nombre (Z–A)",
  sku_asc: "SKU",
  stock_asc: "Menor stock",
  stock_desc: "Mayor stock",
  price_asc: "Menor precio",
  price_desc: "Mayor precio",
};

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  disponible: "Disponible",
  bajo_stock: "Bajo stock",
  sin_stock: "Sin stock",
};

// El texto que se busca se recorta y se acota: la búsqueda es por palabras sueltas sobre nombre,
// marca y categoría, o por SKU exacto (brief-11.1, D-4).
const MAX_TEXT_LENGTH = 100;

export const DEFAULT_FILTERS: Required<ProductListFilters> = {
  text: "",
  stockStatus: "all",
  activity: "active",
  brand: "",
  category: "",
  modelId: "",
  groupByModel: false,
  page: 1,
  sort: "name_asc",
  pageSize: DEFAULT_PAGE_SIZE,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseProductFilters(
  params: SearchParams,
): Required<ProductListFilters> {
  const text = single(params.q)?.trim().slice(0, MAX_TEXT_LENGTH) ?? "";
  const status = single(params.estado);
  const activity = single(params.actividad);
  const page = single(params.pagina);
  const sort = single(params.orden);
  const facet = (value: string | string[] | undefined) =>
    single(value)?.trim().slice(0, MAX_TEXT_LENGTH) ?? "";
  return {
    text,
    stockStatus:
      (status &&
        Object.hasOwn(STOCK_STATUS_PARAM, status) &&
        STOCK_STATUS_PARAM[status]) ||
      DEFAULT_FILTERS.stockStatus,
    activity:
      (activity &&
        Object.hasOwn(ACTIVITY_PARAM, activity) &&
        ACTIVITY_PARAM[activity]) ||
      DEFAULT_FILTERS.activity,
    brand: facet(params.marca),
    category: facet(params.categoria),
    modelId: UUID_PATTERN.test(single(params.modelo) ?? "")
      ? single(params.modelo)!
      : "",
    groupByModel: single(params.agrupar) === "modelo",
    page: page && /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
    sort:
      (sort && Object.hasOwn(SORT_PARAM, sort) && SORT_PARAM[sort]) ||
      DEFAULT_FILTERS.sort,
    pageSize: parsePageSize(params.filas),
  };
}

const paramOf = <T extends string>(map: Record<string, T>, value: T) =>
  Object.keys(map).find((key) => map[key] === value)!;

export const sortParam = (sort: ProductSort) => paramOf(SORT_PARAM, sort);

// Query string sin los valores por defecto: "/productos" limpio equivale a los filtros iniciales.
export function productFiltersHref(filters: ProductListFilters): string {
  const query = new URLSearchParams();
  if (filters.text !== DEFAULT_FILTERS.text) query.set("q", filters.text);
  if (filters.stockStatus !== DEFAULT_FILTERS.stockStatus) {
    query.set("estado", paramOf(STOCK_STATUS_PARAM, filters.stockStatus));
  }
  if (filters.activity !== DEFAULT_FILTERS.activity) {
    query.set("actividad", paramOf(ACTIVITY_PARAM, filters.activity));
  }
  if (filters.category) query.set("categoria", filters.category);
  if (filters.brand) query.set("marca", filters.brand);
  if (filters.modelId) query.set("modelo", filters.modelId);
  if (filters.groupByModel) query.set("agrupar", "modelo");
  if (filters.sort && filters.sort !== DEFAULT_FILTERS.sort) {
    query.set("orden", paramOf(SORT_PARAM, filters.sort));
  }
  if (filters.pageSize && filters.pageSize !== DEFAULT_FILTERS.pageSize) {
    query.set("filas", String(filters.pageSize));
  }
  if (filters.page > 1) query.set("pagina", String(filters.page));
  const text = query.toString();
  return text ? `/productos?${text}` : "/productos";
}

export function hasActiveFilters(filters: ProductListFilters): boolean {
  return (
    filters.text !== DEFAULT_FILTERS.text ||
    filters.stockStatus !== DEFAULT_FILTERS.stockStatus ||
    filters.activity !== DEFAULT_FILTERS.activity ||
    Boolean(filters.category) ||
    Boolean(filters.brand) ||
    Boolean(filters.modelId)
  );
}
