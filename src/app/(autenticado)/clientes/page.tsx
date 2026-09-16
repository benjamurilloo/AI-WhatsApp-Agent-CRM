import type { Metadata } from "next";
import Link from "next/link";
import { searchClientsByLastInteraction } from "@/modules/conversations";
import { requireSession } from "@/app/_auth/session";
import {
  activeBadgeClass,
  cardClass,
  inactiveBadgeClass,
  inputClass,
  labelClass,
  linkClass,
  pageTitleClass,
  primaryLinkClass,
  secondaryButtonClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageNotice } from "@/app/_components/page-notice";
import { formatShortDateTime } from "@/app/_format/date-time";
import { NO_INTERACTIONS_TEXT } from "@/app/(autenticado)/conversaciones/messages";
import {
  activityParam,
  clientFiltersHref,
  hasActiveFilters,
  parseClientFilters,
  type SearchParams,
} from "./filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  NO_CLIENT_RESULTS_MESSAGE,
  NO_CLIENTS_MESSAGE,
} from "./messages";
import { PhoneText } from "./phone-text";

export const metadata: Metadata = {
  title: "Clientes — AI WhatsApp Agent CRM",
};

const TITLE = "Clientes";

// Pantalla 6 (wireframe 06): búsqueda, actividad y página en la URL. Tabla en escritorio y
// tarjetas en móvil; la versión oculta no entra al árbol de accesibilidad. Orden por última
// interacción, compuesto por conversations (brief-6.4). El teléfono llega de crm ya enmascarado
// para viewer.
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseClientFilters(await searchParams);
  const result = await searchClientsByLastInteraction(context, filters);
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }

  const filtered = hasActiveFilters(filters);
  const isAdmin = context.role === "admin";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className={pageTitleClass}>{TITLE}</h1>
        {isAdmin ? (
          <Link href="/clientes/nuevo" className={primaryLinkClass}>
            + Nuevo cliente
          </Link>
        ) : null}
      </div>

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
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.text}
            placeholder="Nombre o teléfono completo"
            className={`${inputClass} w-64`}
          />
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
        <button type="submit" className={secondaryButtonClass}>
          Buscar
        </button>
        {filtered ? (
          <Link href="/clientes" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {result.total === 0 ? (
        <div className={`mt-8 ${cardClass} p-6`}>
          <p>{filtered ? NO_CLIENT_RESULTS_MESSAGE : NO_CLIENTS_MESSAGE}</p>
          {filtered ? (
            <p className="mt-3">
              <Link href="/clientes" className={linkClass}>
                Limpiar filtros
              </Link>
            </p>
          ) : isAdmin ? (
            <p className="mt-3">
              <Link href="/clientes/nuevo" className={linkClass}>
                Crear el primero
              </Link>
            </p>
          ) : null}
        </div>
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
                    Última interacción
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Activo
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.clients.map((client) => (
                  <tr key={client.id}>
                    <td className={`${tableCellClass} font-semibold`}>
                      <Link
                        href={`/clientes/${client.id}`}
                        className={linkClass}
                      >
                        {client.displayName}
                      </Link>
                    </td>
                    <td className={tableCellClass}>
                      <PhoneText phone={client.phone} emptyText="—" />
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

      {result.pageCount > 1 ? (
        <nav
          aria-label="Paginación"
          className="mt-6 flex flex-wrap items-center justify-center gap-4"
        >
          {result.page > 1 ? (
            <Link
              href={clientFiltersHref({ ...filters, page: result.page - 1 })}
              className={linkClass}
            >
              Página anterior
            </Link>
          ) : null}
          <p className="text-sm text-muted tabular-nums">
            Página {result.page} de {result.pageCount} · {result.total}{" "}
            {result.total === 1 ? "cliente" : "clientes"}
          </p>
          {result.page < result.pageCount ? (
            <Link
              href={clientFiltersHref({ ...filters, page: result.page + 1 })}
              className={linkClass}
            >
              Página siguiente
            </Link>
          ) : null}
        </nav>
      ) : null}

      {result.total > 0 ? (
        <p className="mt-6 text-sm text-muted">
          Ordenados por última interacción · Fechas en {result.timezone}.
        </p>
      ) : null}
    </main>
  );
}
