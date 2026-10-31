import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import {
  getCurrentPrices,
  getProductImageVersions,
  getProductVariants,
  listModels,
  listProductFilterOptions,
} from "@/modules/catalog";
import { listProductStock, NO_MODEL_GROUP } from "@/modules/inventory";
import { requireSession } from "@/app/_auth/session";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  roleBadgeClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import {
  EditLink,
  PageHeader,
  SearchIcon,
} from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SuggestInput } from "@/app/_components/suggest-input";
import { suggestProductsAction } from "./actions";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatMoney } from "@/shared/money";
import { formatQuantity, quantityFromDatabase } from "@/shared/quantity";
import {
  DEFAULT_FILTERS,
  hasActiveFilters,
  parseProductFilters,
  productFiltersHref,
  parseCollapsedModels,
  productHref,
  toggleGroupHref,
  SORT_LABEL,
  SORT_PARAM,
  sortParam,
  STOCK_STATUS_LABEL,
  type SearchParams,
} from "./filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NO_PRODUCT_RESULTS_MESSAGE,
  NO_PRODUCTS_MESSAGE,
} from "./messages";
import { ProductThumbnail } from "./product-image-view";
import { ModelGroupHeading } from "./model-group-heading";
import { StockStatusBadge } from "./stock-status";

export const metadata: Metadata = {
  title: "Productos — AI WhatsApp Agent CRM",
};

const TITLE = "Productos";

// Diez columnas: la tabla usa menos relleno horizontal para entrar sin desplazarse (brief-15.1).
const cellClass = tableCellClass.replace("px-4", "px-2.5");
const headCellClass = tableHeadCellClass.replace("px-4", "px-2.5");

// Lo reservado por pedidos confirmados se muestra solo si hay algo (brief-19.3, D-7).
const hasReserved = (product: { quantityReserved: string }) =>
  quantityFromDatabase(product.quantityReserved) > 0n;

// Pantalla 3 (wireframe 03): búsqueda, filtros y página en la URL. Tabla en escritorio y
// tarjetas en móvil; la versión oculta no entra al árbol de accesibilidad. La búsqueda es por
// palabras sobre nombre, marca y categoría, o por SKU exacto (brief-11.1, FR-PROD-11), y cada
// producto muestra su precio vigente o «Sin precio» (FR-PROD-12). Desde la brief-15.1, con el
// aspecto de los bocetos: lápiz para el admin y paginación numerada. Desde la 29.2, con la capacidad
// variants, el filtro por modelo y, debajo del nombre, el modelo y la variante (brief-29.2, D-4).
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const parsed = parseProductFilters(query);
  const collapsed = parseCollapsedModels(query);
  const models = await listModels(context);
  // Sin la capacidad, ?modelo= y ?agrupar= no hacen nada: la lista queda como antes de la 29.2.
  const filters = models.ok
    ? parsed
    : { ...parsed, modelId: "", groupByModel: false };
  const [result, options] = await Promise.all([
    listProductStock(context, filters),
    listProductFilterOptions(context),
  ]);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  // Solo los precios y las miniaturas de la página que se muestra (brief-17.5, D-7).
  const pageIds = result.products.map((product) => product.id);
  const [found, imageVersions, variants] = await Promise.all([
    getCurrentPrices(context, pageIds),
    getProductImageVersions(context, pageIds),
    getProductVariants(context, result.products),
  ]);
  // «iPhone 13 · 128 GB · Azul»: el modelo y los atributos de variante. Vacío sin la capacidad.
  const variantText = (productId: string) => {
    const view = variants?.get(productId);
    if (!view) return "";
    return [
      view.model?.name,
      ...view.attributes
        .filter((attribute) => attribute.isVariant)
        .map((attribute) => attribute.value),
    ]
      .filter(Boolean)
      .join(" · ");
  };
  // Agrupada por modelo (brief-29.2, D-4): el servicio ordena por modelo, y la página pone el nombre
  // del modelo antes de su primer producto, también al empezar cada página.
  const modelNames = new Map(
    models.ok ? models.models.map((model) => [model.id, model.name]) : [],
  );
  const groupKeyAt = (index: number) =>
    result.products[index]!.modelId ?? NO_MODEL_GROUP;
  // Desde la 24.5.1 (brief-24.5.1, D-3): el encabezado del grupo es una fila con el nombre del
  // modelo, su chevron y sus sumas, y los grupos cerrados viajan en la URL.
  const startsGroup = (index: number): boolean => {
    if (!filters.groupByModel) return false;
    return index === 0 || groupKeyAt(index - 1) !== groupKeyAt(index);
  };
  const groupHeading = (index: number): string | null => {
    if (!startsGroup(index)) return null;
    const key = groupKeyAt(index);
    return (key && modelNames.get(key)) || "Sin modelo";
  };
  const isCollapsed = (index: number) =>
    filters.groupByModel && collapsed.has(groupKeyAt(index));
  // Las sumas del grupo: del resultado filtrado entero, no de esta página (brief-24.5.1, D-2).
  const groupTotals = (index: number) =>
    result.modelTotals.get(groupKeyAt(index)) ?? null;
  const columnCount = context.role === "admin" ? 10 : 9;
  const thumbnails = imageVersions.ok ? imageVersions.versions : new Map();
  const prices = found.ok ? found.prices : new Map();
  const priceText = (productId: string) => {
    const price = prices.get(productId);
    return price ? formatMoney(price.amount, price.currency) : "Sin precio";
  };

  // Las listas tienen tope (SUGGESTIONS_LIMIT): un valor de la URL que no entra se agrega para que
  // el selector lo muestre elegido (brief-15.2, D-4).
  const choices = (values: string[], current: string) =>
    current && !values.includes(current) ? [current, ...values] : values;
  const categories = choices(
    options.ok ? options.categories : [],
    filters.category,
  );
  const brands = choices(options.ok ? options.brands : [], filters.brand);

  const filtered = hasActiveFilters(filters);
  const isAdmin = context.role === "admin";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Gestioná tu catálogo de productos, precios, stock y categorías."
        action={
          isAdmin
            ? { href: "/productos/nuevo", label: "+ Nuevo producto" }
            : null
        }
      />

      <form
        key={productFiltersHref(filters)}
        method="get"
        action="/productos"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className={labelClass}>
            Buscar
          </label>
          <div className="relative">
            {/* Sugerencias mientras se escribe; elegir una abre el producto (brief-15.2, D-6). */}
            <SuggestInput
              id="q"
              name="q"
              type="search"
              defaultValue={filters.text}
              placeholder="Nombre, marca, categoría o SKU"
              className={`${inputClass} w-72 pl-9`}
              load={suggestProductsAction}
            >
              <SearchIcon />
            </SuggestInput>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="estado" className={labelClass}>
            Estado de stock
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={
              {
                all: "todos",
                disponible: "disponible",
                bajo_stock: "bajo",
                sin_stock: "sin",
              }[filters.stockStatus]
            }
            className={selectClass}
          >
            <option value="todos">Todos</option>
            <option value="disponible">Disponible</option>
            <option value="bajo">Bajo stock</option>
            <option value="sin">Sin stock</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="actividad" className={labelClass}>
            Actividad
          </label>
          <select
            id="actividad"
            name="actividad"
            defaultValue={
              { active: "activos", inactive: "inactivos", all: "todos" }[
                filters.activity
              ]
            }
            className={selectClass}
          >
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="categoria" className={labelClass}>
            Categoría
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={filters.category}
            className={`${selectClass} max-w-48`}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="marca" className={labelClass}>
            Marca
          </label>
          <select
            id="marca"
            name="marca"
            defaultValue={filters.brand}
            className={`${selectClass} max-w-48`}
          >
            <option value="">Todas</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </div>
        {models.ok ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="modelo" className={labelClass}>
              Modelo
            </label>
            <select
              id="modelo"
              name="modelo"
              defaultValue={filters.modelId}
              className={`${selectClass} max-w-48`}
            >
              <option value="">Todos</option>
              {models.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {/* La vista se elige arriba de la tabla, no acá (brief-24.5.1, D-4). Va como campo oculto
            para que cambiar un filtro no te saque de la vista en la que estabas. *Hasta la 24.5.1*
            era una casilla «Agrupar por modelo» dentro de este formulario (brief-29.2, D-4). */}
        {models.ok && filters.groupByModel ? (
          <input type="hidden" name="agrupar" value="modelo" />
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="orden" className={labelClass}>
            Ordenar por
          </label>
          <select
            id="orden"
            name="orden"
            defaultValue={sortParam(filters.sort)}
            className={selectClass}
          >
            {Object.entries(SORT_PARAM).map(([param, sort]) => (
              <option key={param} value={param}>
                {SORT_LABEL[sort]}
              </option>
            ))}
          </select>
        </div>
        {filters.pageSize !== DEFAULT_FILTERS.pageSize ? (
          <input type="hidden" name="filas" value={filters.pageSize} />
        ) : null}
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Aplicar filtros
        </button>
        {filtered ? (
          <Link href="/productos" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {result.total === 0 ? (
        <EmptyState
          icon="package"
          title={filtered ? NO_PRODUCT_RESULTS_MESSAGE : NO_PRODUCTS_MESSAGE}
          description={
            filtered
              ? "Probá con otras palabras o quitá algún filtro."
              : "Cada producto que cargues aparece acá, con su precio y su stock."
          }
          actions={
            filtered
              ? [
                  {
                    href: "/productos",
                    label: "Limpiar filtros",
                    variant: "outline",
                  },
                ]
              : isAdmin
                ? [
                    {
                      href: "/productos/nuevo",
                      label: "Crear el primero",
                      variant: "primary",
                    },
                  ]
                : []
          }
        />
      ) : (
        <>
          {/* Las dos vistas de la v2 sobre los mismos resultados (brief-24.5.1, D-4). Son enlaces,
              así que conservan filtros, orden y página y funcionan sin JavaScript. Sin la capacidad
              `variants` no se ofrecen: no hay modelos que agrupar. */}
          {models.ok ? (
            <nav
              aria-label="Vista del catálogo"
              className="mt-8 flex items-center gap-1 text-sm"
            >
              {(
                [
                  ["Por modelo", true],
                  ["Lista", false],
                ] as const
              ).map(([label, grouped]) => {
                const current = filters.groupByModel === grouped;
                return (
                  <Link
                    key={label}
                    href={productFiltersHref(
                      { ...filters, groupByModel: grouped, page: 1 },
                      grouped ? collapsed : [],
                    )}
                    aria-current={current ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 ${
                      current
                        ? "bg-surface-muted font-semibold"
                        : "text-muted hover:bg-surface-muted"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
          <div
            className={`${models.ok ? "mt-3" : "mt-8"} hidden overflow-x-auto md:block ${cardClass}`}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Productos de la organización
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={headCellClass}>
                    SKU
                  </th>
                  <th scope="col" className={headCellClass}>
                    Nombre
                  </th>
                  <th scope="col" className={headCellClass}>
                    Marca
                  </th>
                  <th scope="col" className={headCellClass}>
                    Categoría
                  </th>
                  <th scope="col" className={`${headCellClass} text-right`}>
                    Precio
                  </th>
                  {/* Lo disponible desde la 19.3 (ADR 0020, punto 7; brief-19.3, D-7). */}
                  <th scope="col" className={`${headCellClass} text-right`}>
                    Disponible
                  </th>
                  <th scope="col" className={headCellClass}>
                    Unidad
                  </th>
                  <th scope="col" className={headCellClass}>
                    Estado
                  </th>
                  <th scope="col" className={headCellClass}>
                    Activo
                  </th>
                  {isAdmin ? (
                    <th scope="col" className={headCellClass}>
                      Acciones
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {result.products.map((product, index) => (
                  <Fragment key={product.id}>
                    {groupHeading(index) ? (
                      <tr>
                        <th
                          scope="colgroup"
                          colSpan={columnCount}
                          className={`${headCellClass} bg-surface-muted`}
                        >
                          <ModelGroupHeading
                            name={groupHeading(index)!}
                            modelId={groupKeyAt(index)}
                            collapsed={collapsed.has(groupKeyAt(index))}
                            href={toggleGroupHref(
                              filters,
                              collapsed,
                              groupKeyAt(index),
                            )}
                            totals={groupTotals(index)}
                            filtered={hasActiveFilters(filters)}
                          />
                        </th>
                      </tr>
                    ) : null}
                    {/* Un grupo cerrado oculta sus filas; su encabezado sigue diciendo cuántas son
                        y cuánto hay (brief-24.5.1, D-3). El atributo `hidden` las saca del árbol de
                        accesibilidad, y la clase asegura el `display: none`: el `display: table-row`
                        de la hoja del navegador le gana al `hidden` a secas. */}
                    <tr
                      hidden={isCollapsed(index)}
                      className={isCollapsed(index) ? "hidden" : undefined}
                    >
                      <td
                        className={`${cellClass} font-mono text-xs whitespace-nowrap`}
                      >
                        {product.sku}
                      </td>
                      <td className={`${cellClass} font-semibold`}>
                        <span className="flex items-center gap-2.5">
                          <ProductThumbnail
                            productId={product.id}
                            version={thumbnails.get(product.id)}
                          />
                          <span>
                            <Link
                              id={`producto-${product.id}`}
                              href={productHref(product.id, filters, collapsed)}
                              className={linkClass}
                            >
                              {product.name}
                            </Link>
                            {variantText(product.id) ? (
                              <span className="block text-xs font-normal text-muted">
                                {variantText(product.id)}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className={cellClass}>{product.brand ?? "—"}</td>
                      <td className={cellClass}>{product.category ?? "—"}</td>
                      <td
                        className={`${cellClass} text-right whitespace-nowrap tabular-nums ${prices.has(product.id) ? "" : "text-muted"}`}
                      >
                        {priceText(product.id)}
                      </td>
                      <td className={`${cellClass} text-right tabular-nums`}>
                        {formatQuantity(product.quantityAvailable)}
                        {hasReserved(product) ? (
                          <span className="block text-xs whitespace-nowrap text-muted">
                            {formatQuantity(product.quantityReserved)} reservado
                          </span>
                        ) : null}
                      </td>
                      <td className={`${cellClass} text-muted`}>
                        {product.unit}
                      </td>
                      <td className={cellClass}>
                        {product.isService ? (
                          <span className={roleBadgeClass}>Servicio</span>
                        ) : (
                          <StockStatusBadge status={product.stockStatus} />
                        )}
                      </td>
                      <td className={cellClass}>
                        <span
                          className={
                            product.isActive
                              ? activeBadgeClass
                              : inactiveBadgeClass
                          }
                        >
                          {product.isActive ? "Sí" : "No"}
                        </span>
                      </td>
                      {isAdmin ? (
                        <td className={cellClass}>
                          <EditLink
                            href={`/productos/${product.id}?editar=1`}
                            describedBy={`producto-${product.id}`}
                          />
                        </td>
                      ) : null}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Productos de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.products.map((product, index) => (
              <Fragment key={product.id}>
                {groupHeading(index) ? (
                  <li className="mt-2 text-sm font-semibold">
                    <ModelGroupHeading
                      name={groupHeading(index)!}
                      modelId={groupKeyAt(index)}
                      collapsed={collapsed.has(groupKeyAt(index))}
                      href={toggleGroupHref(
                        filters,
                        collapsed,
                        groupKeyAt(index),
                      )}
                      totals={groupTotals(index)}
                      filtered={hasActiveFilters(filters)}
                    />
                  </li>
                ) : null}
                <li
                  hidden={isCollapsed(index)}
                  className={isCollapsed(index) ? "hidden" : `${cardClass} p-4`}
                >
                  <p className="flex items-center gap-2.5 font-semibold">
                    <ProductThumbnail
                      productId={product.id}
                      version={thumbnails.get(product.id)}
                    />
                    <span>
                      <Link
                        href={productHref(product.id, filters, collapsed)}
                        className={linkClass}
                      >
                        {product.name}
                      </Link>
                      {product.isActive ? null : (
                        <span className="ml-2 text-sm font-normal text-muted">
                          · Inactivo
                        </span>
                      )}
                    </span>
                  </p>
                  {variantText(product.id) ? (
                    <p className="mt-1 text-sm text-muted">
                      {variantText(product.id)}
                    </p>
                  ) : null}
                  {product.brand || product.category ? (
                    <p className="mt-1 text-sm text-muted">
                      {[product.brand, product.category]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                  <p
                    className={`mt-1 text-sm tabular-nums ${prices.has(product.id) ? "" : "text-muted"}`}
                  >
                    {priceText(product.id)}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm tabular-nums">
                      {formatQuantity(product.quantityAvailable)} {product.unit}{" "}
                      disponible
                      {hasReserved(product) ? (
                        <span className="text-muted">
                          {" "}
                          · {formatQuantity(product.quantityReserved)} reservado
                        </span>
                      ) : null}
                    </p>
                    {product.isService ? (
                      <span className={roleBadgeClass}>Servicio</span>
                    ) : (
                      <StockStatusBadge status={product.stockStatus} />
                    )}
                  </div>
                </li>
              </Fragment>
            ))}
          </ul>
        </>
      )}

      {result.total > 0 ? (
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          rangeText={shownRangeText({
            page: result.page,
            pageSize: filters.pageSize,
            shown: result.products.length,
            total: result.total,
            singular: "producto",
            plural: "productos",
          })}
          hrefFor={(page) =>
            productFiltersHref({ ...filters, page }, collapsed)
          }
          pageSize={{
            current: filters.pageSize,
            hrefFor: (pageSize) =>
              productFiltersHref({ ...filters, pageSize, page: 1 }, collapsed),
          }}
        />
      ) : null}
      {/* La nota al pie de la lámina 01: qué quiere decir «disponible», que es de lo que habla
          toda la columna y todas las sumas de los grupos (brief-24.5.1, D-2). */}
      {result.total > 0 ? (
        <p className="mt-4 text-sm text-muted">
          Disponible no cuenta lo reservado por pedidos confirmados ni las
          unidades que no están a la venta.
        </p>
      ) : null}
      <p className="sr-only">
        {STOCK_STATUS_LABEL.disponible}, {STOCK_STATUS_LABEL.bajo_stock} y{" "}
        {STOCK_STATUS_LABEL.sin_stock} se indican con texto e ícono.
      </p>
    </main>
  );
}
