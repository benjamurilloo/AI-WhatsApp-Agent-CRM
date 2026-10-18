import type { Metadata } from "next";
import Link from "next/link";
import { searchClientsByLastInteraction } from "@/modules/conversations";
import {
  listActiveClientTags,
  listClientFilterOptions,
  PROVINCES,
  type ClientTag,
} from "@/modules/crm";
import { requireSession } from "@/app/_auth/session";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  secondaryLinkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Avatar } from "@/app/_components/avatar";
import { Icon } from "@/app/_components/icons";
import {
  EditLink,
  PageHeader,
  SearchIcon,
} from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { SuggestInput } from "@/app/_components/suggest-input";
import { TagChip } from "@/app/_components/tag-chip";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatShortDateTime } from "@/app/_format/date-time";
import { NO_INTERACTIONS_TEXT } from "@/app/(autenticado)/conversaciones/messages";
import {
  activityParam,
  clientFiltersHref,
  DEFAULT_FILTERS,
  hasActiveFilters,
  KIND_LABEL,
  kindParam,
  parseClientFilters,
  SORT_CAPTION,
  SORT_LABEL,
  SORT_PARAM,
  sortParam,
  type SearchParams,
} from "./filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NO_CLIENT_RESULTS_MESSAGE,
  NO_CLIENTS_MESSAGE,
} from "./messages";
import { suggestClientsAction } from "./actions";
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
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const parsed = parseClientFilters(await searchParams);
  const activeTags = await listActiveClientTags(context);
  const tags = activeTags.ok ? activeTags.tags : [];
  // Una etiqueta ajena, inexistente o inactiva se ignora, también en la URL y en el formulario
  // (brief-16.1, D-8 y D-9).
  // El tipo, la provincia y el segmento, como la etiqueta: solo los que tiene algún cliente de la
  // organización; cualquier otro valor de la URL se ignora (brief-17.1, D-9).
  const options = await listClientFilterOptions(context);
  const provinces = options.ok ? options.provinces : [];
  const segments = options.ok ? options.segments : [];
  const kinds = options.ok ? options.kinds : [];
  const filters = {
    ...parsed,
    tagId: tags.some((tag) => tag.id === parsed.tagId) ? parsed.tagId : null,
    province: provinces.find((code) => code === parsed.province) ?? null,
    segment: segments.includes(parsed.segment ?? "") ? parsed.segment : null,
    kind: kinds.find((kind) => kind === parsed.kind) ?? null,
  };
  const result = await searchClientsByLastInteraction(context, filters);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  const filtered = hasActiveFilters(filters);
  const isAdmin = context.role === "admin";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Gestioná tu base de clientes y su información."
        action={
          isAdmin ? { href: "/clientes/nuevo", label: "+ Nuevo cliente" } : null
        }
      />
      <p className="mt-4">
        <Link href="/clientes/etiquetas" className={secondaryLinkClass}>
          <Icon name="tag" className="size-4" />
          Etiquetas
        </Link>
      </p>

      <form
        key={clientFiltersHref(filters)}
        method="get"
        action="/clientes"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className={labelClass}>
            Buscar
          </label>
          <div className="relative">
            {/* Sugerencias de nombres mientras se escribe, nunca teléfonos; elegir una abre el
                cliente (brief-15.2, D-6). */}
            <SuggestInput
              id="q"
              name="q"
              type="search"
              defaultValue={filters.text}
              placeholder="Nombre o teléfono completo"
              className={`${inputClass} w-72 pl-9`}
              load={suggestClientsAction}
              skipPhones
            >
              <SearchIcon />
            </SuggestInput>
          </div>
        </div>
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
        {tags.length > 0 ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="etiqueta" className={labelClass}>
              Etiqueta
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
        {filters.pageSize !== DEFAULT_FILTERS.pageSize ? (
          <input type="hidden" name="filas" value={filters.pageSize} />
        ) : null}
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Buscar
        </button>
        {filtered ? (
          <Link href="/clientes" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {result.total === 0 ? (
        <EmptyState
          icon="users"
          title={filtered ? NO_CLIENT_RESULTS_MESSAGE : NO_CLIENTS_MESSAGE}
          description={
            filtered
              ? "Probá con otras palabras o quitá algún filtro."
              : "Cada cliente que cargues o que escriba por WhatsApp aparece acá, con su última interacción."
          }
          actions={
            filtered
              ? [
                  {
                    href: "/clientes",
                    label: "Limpiar filtros",
                    variant: "outline",
                  },
                ]
              : isAdmin
                ? [
                    {
                      href: "/clientes/nuevo",
                      label: "Crear el primero",
                      variant: "primary",
                    },
                  ]
                : []
          }
        />
      ) : (
        <>
          <div className={`mt-8 hidden overflow-hidden md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">Clientes de la organización</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Nombre
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Teléfono
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Etiquetas
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Última interacción
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Activo
                  </th>
                  {isAdmin ? (
                    <th scope="col" className={tableHeadCellClass}>
                      Acciones
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {result.clients.map((client) => (
                  <tr key={client.id}>
                    <td className={`${tableCellClass} font-semibold`}>
                      <span className="flex items-center gap-3">
                        <Avatar name={client.displayName} />
                        <Link
                          id={`cliente-${client.id}`}
                          href={`/clientes/${client.id}`}
                          className={linkClass}
                        >
                          {client.displayName}
                        </Link>
                      </span>
                    </td>
                    <td className={tableCellClass}>
                      <PhoneText phone={client.phone} emptyText="—" />
                    </td>
                    <td className={tableCellClass}>
                      <RowTags tags={client.tags} />
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
                      <span
                        className={
                          client.isActive
                            ? activeBadgeClass
                            : inactiveBadgeClass
                        }
                      >
                        {client.isActive ? "Sí" : "No"}
                      </span>
                    </td>
                    {isAdmin ? (
                      <td className={tableCellClass}>
                        <EditLink
                          href={`/clientes/${client.id}?editar=1`}
                          describedBy={`cliente-${client.id}`}
                        />
                      </td>
                    ) : null}
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
                <p className="font-semibold">
                  <Link href={`/clientes/${client.id}`} className={linkClass}>
                    {client.displayName}
                  </Link>
                  {client.isActive ? null : (
                    <span className="ml-2 text-sm font-normal text-muted">
                      · Inactivo
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm">
                  <PhoneText phone={client.phone} emptyText="Sin teléfono" />
                </p>
                {client.tags.length > 0 ? (
                  <div className="mt-2">
                    <RowTags tags={client.tags} />
                  </div>
                ) : null}
                <p className="mt-1 text-sm text-muted">
                  Última interacción:{" "}
                  {client.lastInteractionAt
                    ? formatShortDateTime(
                        client.lastInteractionAt,
                        result.timezone,
                      )
                    : NO_INTERACTIONS_TEXT}
                </p>
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
        <p className="mt-6 text-sm text-muted">
          Ordenados por {SORT_CAPTION[filters.sort]} · Fechas en{" "}
          {result.timezone}.
        </p>
      ) : null}
    </main>
  );
}

// Hasta tres etiquetas por fila y «+N» con las demás (brief-16.1, D-9). El «+N» dice en texto
// cuántas faltan; la lista completa está en la ficha.
const ROW_TAG_LIMIT = 3;

function RowTags({ tags }: { tags: ClientTag[] }) {
  if (tags.length === 0) return <span className="text-muted">—</span>;
  const hidden = tags.length - ROW_TAG_LIMIT;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.slice(0, ROW_TAG_LIMIT).map((tag) => (
        <li key={tag.id}>
          <TagChip name={tag.name} color={tag.color} isActive={tag.isActive} />
        </li>
      ))}
      {hidden > 0 ? (
        <li className="text-sm text-muted">
          +{hidden}
          <span className="sr-only"> etiquetas más</span>
        </li>
      ) : null}
    </ul>
  );
}
