import type { ProductActivityFilter, StockStatus } from "@/modules/catalog";
import { NO_MODEL_GROUP } from "@/modules/inventory";
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

// Los grupos **cerrados** del catálogo agrupado (brief-24.5.1, D-3). Se listan los cerrados y no los
// abiertos para que la ausencia del parámetro sea el estado inicial: todos abiertos. Repetible:
// ?cerrado=<id>&cerrado=<id>. Un valor que no es un uuid se ignora, como ?modelo=.
export const COLLAPSED_PARAM = "cerrado";

// Cuántos grupos se pueden recordar cerrados. Un tope porque la URL la escribe quien quiera: sin él,
// una dirección fabricada podría traer miles de valores y hacer trabajo inútil en cada render.
export const MAX_COLLAPSED = 200;

// El grupo de los productos sin modelo se identifica internamente con NO_MODEL_GROUP, la cadena
// vacía, que no se puede escribir en una URL. En el parámetro usa este valor, que ningún uuid puede
// ser, así que ese grupo también se puede cerrar.
export const NO_MODEL_PARAM = "sin-modelo";

const groupKeyFromParam = (value: string): string | null => {
  if (value === NO_MODEL_PARAM) return NO_MODEL_GROUP;
  return UUID_PATTERN.test(value) ? value : null;
};

const groupKeyToParam = (key: string): string =>
  key === NO_MODEL_GROUP ? NO_MODEL_PARAM : key;

export function parseCollapsedModels(params: SearchParams): Set<string> {
  const raw = params[COLLAPSED_PARAM];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const keys = values
    .map(groupKeyFromParam)
    .filter((key): key is string => key !== null);
  return new Set(keys.slice(0, MAX_COLLAPSED));
}

const paramOf = <T extends string>(map: Record<string, T>, value: T) =>
  Object.keys(map).find((key) => map[key] === value)!;

export const sortParam = (sort: ProductSort) => paramOf(SORT_PARAM, sort);

// Query string sin los valores por defecto: "/productos" limpio equivale a los filtros iniciales.
// `collapsed` conserva los grupos cerrados al cambiar de página o de filtro (brief-24.5.1, D-3).
export function productFiltersHref(
  filters: ProductListFilters,
  collapsed?: Iterable<string>,
): string {
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
  // Solo cuando se agrupa: sin grupos, un ?cerrado= no significa nada.
  if (filters.groupByModel) {
    for (const key of collapsed ?? []) {
      query.append(COLLAPSED_PARAM, groupKeyToParam(key));
    }
  }
  const text = query.toString();
  return text ? `/productos?${text}` : "/productos";
}

// El enlace del chevron: cierra el grupo si está abierto y lo abre si está cerrado, conservando
// filtros, orden, página y los demás grupos (brief-24.5.1, D-3). Es un enlace, así que funciona sin
// JavaScript.
export function toggleGroupHref(
  filters: ProductListFilters,
  collapsed: Set<string>,
  groupKey: string,
): string {
  const next = new Set(collapsed);
  if (next.has(groupKey)) next.delete(groupKey);
  else next.add(groupKey);
  return productFiltersHref(filters, next);
}

// «Volver a productos» con el contexto del catálogo (brief-24.5.1, D-5). La ficha recibe la query
// del catálogo en ?desde= y la usa para volver; sin ella, vuelve a /productos limpio. Se guarda
// codificada porque lleva sus propios `&` y `=`.
export const RETURN_PARAM = "desde";

export function productHref(
  productId: string,
  filters: ProductListFilters,
  collapsed?: Iterable<string>,
): string {
  const href = productFiltersHref(filters, collapsed);
  const query = href.slice(href.indexOf("?") + 1);
  // Sin filtros ni página, `productFiltersHref` devuelve "/productos" sin "?": no hay qué recordar.
  if (!href.includes("?") || !query) return `/productos/${productId}`;
  return `/productos/${productId}?${RETURN_PARAM}=${encodeURIComponent(query)}`;
}

// La vuelta al catálogo, desde la ficha. Solo se aceptan parámetros que el catálogo entiende: una
// ?desde= fabricada no puede inyectar nada más, ni mandar a otra ruta.
export function catalogReturnHref(params: SearchParams): string {
  const raw = single(params[RETURN_PARAM]);
  if (!raw) return "/productos";
  const incoming = new URLSearchParams(raw);
  const asRecord: SearchParams = {};
  for (const [key, value] of incoming) {
    if (key === COLLAPSED_PARAM) {
      const previous = asRecord[key];
      asRecord[key] = Array.isArray(previous)
        ? [...previous, value]
        : previous
          ? [previous as string, value]
          : [value];
    } else {
      asRecord[key] = value;
    }
  }
  return productFiltersHref(
    parseProductFilters(asRecord),
    parseCollapsedModels(asRecord),
  );
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
