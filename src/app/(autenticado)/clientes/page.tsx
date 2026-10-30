import type { Metadata } from "next";
import Link from "next/link";
import {
  listActiveClientTags,
  listClientFilterOptions,
  PROVINCES,
} from "@/modules/crm";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inactiveBadgeClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryLinkClass,
  secondaryLinkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Avatar } from "@/app/_components/avatar";
import { Icon } from "@/app/_components/icons";
import { SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SubNav } from "@/app/_components/sub-nav";
import { SuggestInput } from "@/app/_components/suggest-input";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatShortDateTime } from "@/app/_format/date-time";
import { NO_INTERACTIONS_TEXT } from "@/app/(autenticado)/conversaciones/messages";
import {
  activityParam,
  clientFiltersHref,
  DEFAULT_FILTERS,
  hasActiveFilters,
  INTERACTION_LABEL,
  INTERACTION_PARAM,
  interactionParam,
  KIND_LABEL,
  kindParam,
  parseClientFilters,
  SORT_CAPTION,
  SORT_LABEL,
  SORT_PARAM,
  sortParam,
  VIEW_LABEL,
  viewParam,
  type SearchParams,
} from "./filters";
import {
  BalanceBox,
  BalanceCell,
  OpenWorkCell,
  RowActions,
  RowTags,
} from "./list-cells";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NO_CLIENT_RESULTS_MESSAGE,
  NO_CLIENTS_IN_VIEW_MESSAGE,
  NO_CLIENTS_MESSAGE,
} from "./messages";
import { suggestClientsAction } from "./actions";
import { readClientList } from "./list-data";
import { PhoneText } from "./phone-text";

export const metadata: Metadata = {
  title: "Clientes — AI WhatsApp Agent CRM",
};

const TITLE = "Clientes";

// Pantalla 6 (wireframe 06): búsqueda, actividad y página en la URL. Tabla en escritorio y
// tarjetas en móvil; la versión oculta no entra al árbol de accesibilidad. Orden por última
// interacción, compuesto por conversations (brief-6.4). El teléfono llega de crm ya enmascarado
// para viewer. Desde la brief-15.1, con el aspecto de los bocetos: avatar, lápiz para el admin y
// paginación numerada. Desde la 17.1, los filtros por tipo, provincia y segmento (D-9).
// Desde la 24.4.2, como 01 y 06 de la v2 (brief-24.4.2): las vistas con su cantidad, el saldo por
// moneda de cash y «En curso» de cada módulo, compuestos en list-data.ts, sin JOIN entre módulos.
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const parsed = parseClientFilters(await searchParams);
  const [activeTags, options] = await Promise.all([
    listActiveClientTags(context),
    listClientFilterOptions(context),
  ]);
  const tags = activeTags.ok ? activeTags.tags : [];
  // Una etiqueta ajena, inexistente o inactiva se ignora, también en la URL y en el formulario
  // (brief-16.1, D-8 y D-9).
  // El tipo, la provincia y el segmento, como la etiqueta: solo los que tiene algún cliente de la
  // organización; cualquier otro valor de la URL se ignora (brief-17.1, D-9).
  const provinces = options.ok ? options.provinces : [];
  const segments = options.ok ? options.segments : [];
  const kinds = options.ok ? options.kinds : [];
  const sanitized = {
    ...parsed,
    tagId: tags.some((tag) => tag.id === parsed.tagId) ? parsed.tagId : null,
    province: provinces.find((code) => code === parsed.province) ?? null,
    segment: segments.includes(parsed.segment ?? "") ? parsed.segment : null,
    kind: kinds.find((kind) => kind === parsed.kind) ?? null,
  };
  const data = await readClientList(context, sanitized, new Date());
  if (data === null) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const { result, views, openWork, balancesOf } = data;
  const filters = { ...sanitized, view: data.view };

  const filtered = hasActiveFilters(filters);
  const isAdmin = context.role === "admin";
  const viewItems = (["all", "with_balance", "with_repairs"] as const)
    .filter((view) => view === "all" || views[view])
    .map((view) => ({
      href: clientFiltersHref({ ...filters, view, page: 1 }),
      label: VIEW_LABEL[view],
      current: filters.view === view,
      count:
        view === "all" ? result.scopeTotal : (result.viewCounts[view] ?? 0),
    }));
  // «Más filtros» queda abierto si alguno de los suyos está aplicado (D-6).
  const moreFiltersOpen =
    filters.activity !== DEFAULT_FILTERS.activity ||
    Boolean(filters.kind) ||
    Boolean(filters.province) ||
    Boolean(filters.segment) ||
    filters.sort !== DEFAULT_FILTERS.sort;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={pageTitleClass}>{TITLE}</h1>
          <p className={pageSubtitleClass}>
            Contacto, operaciones y seguimiento en un solo lugar.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/clientes/etiquetas" className={secondaryLinkClass}>
            <Icon name="tag" className="size-4" />
            Gestionar etiquetas
          </Link>
          {isAdmin ? (
            <Link href="/clientes/nuevo" className={primaryLinkClass}>
              <Icon name="plus" className="size-4" />
              Nuevo cliente
            </Link>
          ) : null}
        </div>
      </div>

      <SubNav label="Vistas de clientes" items={viewItems} scroll />

      <form
        key={clientFiltersHref(filters)}
        method="get"
        action="/clientes"
        className="mt-6 flex flex-col gap-3"
      >
        {filters.view !== "all" ? (
          <input type="hidden" name="vista" value={viewParam(filters.view)} />
        ) : null}
        {filters.pageSize !== DEFAULT_FILTERS.pageSize ? (
          <input type="hidden" name="filas" value={filters.pageSize} />
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 grow flex-col gap-1 sm:max-w-md">
            <label htmlFor="q" className={labelClass}>
              Buscar
            </label>
            <div className="relative">
              {/* Sugerencias de nombres mientras se escribe, nunca teléfonos; elegir una abre el
                  cliente (brief-15.2, D-6). Por nombre o teléfono, no por documento (H-6). */}
              <SuggestInput
                id="q"
                name="q"
                type="search"
                defaultValue={filters.text}
                placeholder="Buscar por nombre o teléfono completo"
                className={`${inputClass} w-full pl-9`}
                load={suggestClientsAction}
                skipPhones
              >
                <SearchIcon />
              </SuggestInput>
            </div>
          </div>
          {tags.length > 0 ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="etiqueta" className={labelClass}>
                Etiquetas
              </label>
              <select
                id="etiqueta"
                name="etiqueta"
                defaultValue={filters.tagId ?? ""}
                className={selectClass}
              >
                <option value="">Todas</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="interaccion" className={labelClass}>
              Última interacción
            </label>
            <select
              id="interaccion"
              name="interaccion"
              defaultValue={
                filters.interaction ? interactionParam(filters.interaction) : ""
              }
              className={selectClass}
            >
              <option value="">Todas</option>
              {Object.entries(INTERACTION_PARAM).map(([param, period]) => (
                <option key={param} value={param}>
                  {INTERACTION_LABEL[period]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={inlineButtonClass}>
            <Icon name="filter" className="size-4" />
            Buscar
          </button>
          {filtered ? (
            <Link
              href={clientFiltersHref({
                ...DEFAULT_FILTERS,
                view: filters.view,
              })}
              className={`${linkClass} py-2`}
            >
              Limpiar filtros
            </Link>
          ) : null}
        </div>

        {/* Los demás filtros y el orden, plegados (D-6): un <details> funciona sin JavaScript. */}
        <details open={moreFiltersOpen} className="group">
          <summary
            className={`${secondaryLinkClass} w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
          >
            <Icon name="filter" className="size-4" />
            Más filtros
            <Icon
              name="chevronDown"
              className="size-4 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="actividad" className={labelClass}>
                Actividad
              </label>
              <select
                id="actividad"
                name="actividad"
                defaultValue={activityParam(filters.activity)}
                className={selectClass}
              >
                <option value="activos">Solo activos</option>
                <option value="inactivos">Solo inactivos</option>
                <option value="todos">Todos</option>
              </select>
            </div>
            {kinds.length > 0 ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="tipo" className={labelClass}>
                  Tipo
                </label>
                <select
                  id="tipo"
                  name="tipo"
                  defaultValue={filters.kind ? kindParam(filters.kind) : ""}
                  className={selectClass}
                >
                  <option value="">Todos</option>
                  {kinds.map((kind) => (
                    <option key={kind} value={kindParam(kind)}>
                      {KIND_LABEL[kind]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {provinces.length > 0 ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="provincia" className={labelClass}>
                  Provincia
                </label>
                <select
                  id="provincia"
                  name="provincia"
                  defaultValue={filters.province ?? ""}
                  className={selectClass}
                >
                  <option value="">Todas</option>
                  {provinces.map((code) => (
                    <option key={code} value={code}>
                      {PROVINCES[code]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {segments.length > 0 ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="segmento" className={labelClass}>
                  Segmento
                </label>
                <select
                  id="segmento"
                  name="segmento"
                  defaultValue={filters.segment ?? ""}
                  className={selectClass}
                >
                  <option value="">Todos</option>
                  {segments.map((segment) => (
                    <option key={segment} value={segment}>
                      {segment}
                    </option>
                  ))}
                </select>
              </div>
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
          </div>
        </details>
      </form>

      {result.total === 0 ? (
        // Tres vacíos (panel 04 de 08): sin coincidencias con los filtros, una vista sin clientes
        // con la organización que sí los tiene (revisión de la 24.4.2, H-2), y sin ningún cliente.
        <EmptyState
          icon={filtered || result.scopeTotal > 0 ? "search" : "users"}
          title={
            filtered
              ? NO_CLIENT_RESULTS_MESSAGE
              : result.scopeTotal > 0
                ? NO_CLIENTS_IN_VIEW_MESSAGE
                : NO_CLIENTS_MESSAGE
          }
          description={
            filtered
              ? "Probá con otros términos o ajustá los filtros de búsqueda."
              : result.scopeTotal > 0
                ? "Probá con «Todos» o con otra vista."
                : "Comenzá agregando tu primer cliente para verlo acá."
          }
          actions={
            filtered
              ? [
                  {
                    href: clientFiltersHref({
                      ...DEFAULT_FILTERS,
                      view: filters.view,
                    }),
                    label: "Limpiar filtros",
                    variant: "outline",
                  },
                ]
              : result.scopeTotal > 0
                ? [
                    {
                      href: "/clientes",
                      label: "Ver todos",
                      variant: "outline",
                    },
                  ]
                : isAdmin
                  ? [
                      {
                        href: "/clientes/nuevo",
                        label: "Nuevo cliente",
                        variant: "primary",
                      },
                    ]
                  : []
          }
        />
      ) : (
        <>
          <div className={`mt-6 hidden overflow-x-auto md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">Clientes de la organización</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Cliente
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Contacto
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Etiquetas
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    En curso
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Saldo
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Última interacción
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.clients.map((client) => (
                  <tr key={client.id}>
                    <td className={`${tableCellClass} font-semibold`}>
                      <span className="flex items-center gap-3">
                        <Avatar name={client.displayName} />
                        <span className="flex flex-col items-start gap-1">
                          <Link
                            id={`cliente-${client.id}`}
                            href={`/clientes/${client.id}`}
                            className={`${linkClass} whitespace-nowrap`}
                          >
                            {client.displayName}
                          </Link>
                          {client.isActive ? null : (
                            <span className={inactiveBadgeClass}>Inactivo</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      <PhoneText phone={client.phone} emptyText="—" />
                    </td>
                    <td className={tableCellClass}>
                      <RowTags tags={client.tags} />
                    </td>
                    <td className={tableCellClass}>
                      <OpenWorkCell work={openWork(client.id)} />
                    </td>
                    <td className={tableCellClass}>
                      <BalanceCell balances={balancesOf(client.id)} />
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {client.lastInteractionAt
                        ? formatShortDateTime(
                            client.lastInteractionAt,
                            result.timezone,
                          )
                        : NO_INTERACTIONS_TEXT}
                    </td>
                    <td className={tableCellClass}>
                      <RowActions
                        clientId={client.id}
                        name={client.displayName}
                        isAdmin={isAdmin}
                        idPrefix="acciones-fila"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Clientes de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.clients.map((client) => (
              <li key={client.id} className={`${cardClass} p-4`}>
                <div className="flex items-start gap-3">
                  <Avatar name={client.displayName} />
                  <div className="min-w-0 grow">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">
                        <Link
                          href={`/clientes/${client.id}`}
                          className={linkClass}
                        >
                          {client.displayName}
                        </Link>
                        {client.isActive ? null : (
                          <span className={`ml-2 ${inactiveBadgeClass}`}>
                            Inactivo
                          </span>
                        )}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-sm text-muted">
                          {client.lastInteractionAt
                            ? formatShortDateTime(
                                client.lastInteractionAt,
                                result.timezone,
                              )
                            : NO_INTERACTIONS_TEXT}
                        </span>
                        <RowActions
                          clientId={client.id}
                          name={client.displayName}
                          isAdmin={isAdmin}
                          idPrefix="acciones-tarjeta"
                        />
                      </div>
                    </div>
                    <p className="text-sm">
                      <PhoneText
                        phone={client.phone}
                        emptyText="Sin teléfono"
                      />
                    </p>
                    {client.tags.length > 0 ? (
                      <div className="mt-2">
                        <RowTags tags={client.tags} />
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <OpenWorkCell work={openWork(client.id)} />
                      <BalanceBox balances={balancesOf(client.id)} />
                    </div>
                  </div>
                </div>
              </li>
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
            shown: result.clients.length,
            total: result.total,
            singular: "cliente",
            plural: "clientes",
          })}
          hrefFor={(page) => clientFiltersHref({ ...filters, page })}
          pageSize={{
            current: filters.pageSize,
            hrefFor: (pageSize) =>
              clientFiltersHref({ ...filters, pageSize, page: 1 }),
          }}
        />
      ) : null}

      {result.total > 0 ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Icon name="info" className="size-4 shrink-0" />
          Los saldos se muestran por moneda. Ordenados por{" "}
          {SORT_CAPTION[filters.sort]} · Fechas en {result.timezone}.
        </p>
      ) : null}
    </main>
  );
}
