import type { Metadata } from "next";
import Link from "next/link";
import { listKnowledgeEntries } from "@/modules/knowledge";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
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
import {
  hasActiveFilters,
  knowledgeFiltersHref,
  parseKnowledgeFilters,
  statusParam,
  type SearchParams,
} from "./filters";
import {
  FORBIDDEN_PAGE_MESSAGE,
  formatValidity,
  NO_ENTRIES_MESSAGE,
  NO_ENTRY_RESULTS_MESSAGE,
} from "./messages";
import { KnowledgeStatusBadge } from "./status-badge";

export const metadata: Metadata = {
  title: "Información del negocio — AI WhatsApp Agent CRM",
};

const TITLE = "Información del negocio";

// Pantalla 11 (brief-11.2, D-7): búsqueda por palabras, filtro de estado y página en la URL
// (FR-INFO-02). Cada entrada muestra su estado de vigencia (FR-INFO-03). Tabla en escritorio y
// tarjetas en móvil; la versión oculta no entra al árbol de accesibilidad.
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseKnowledgeFilters(await searchParams);
  const result = await listKnowledgeEntries(context, filters);
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
          <Link href="/informacion/nueva" className={primaryLinkClass}>
            + Nueva entrada
          </Link>
        ) : null}
      </div>
      <p className="mt-2 text-muted">
        Horarios, ubicación, medios de pago, envíos y todo lo que el negocio
        responde a diario.
      </p>

      <form
        key={knowledgeFiltersHref(filters)}
        method="get"
        action="/informacion"
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
            placeholder="Título, categoría o contenido"
            className={`${inputClass} w-72`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="estado" className={labelClass}>
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={statusParam(filters.status)}
            className={selectClass}
          >
            <option value="todas">Todas</option>
            <option value="vigentes">Vigentes</option>
            <option value="programadas">Programadas</option>
            <option value="vencidas">Vencidas</option>
            <option value="inactivas">Inactivas</option>
          </select>
        </div>
        <button type="submit" className={secondaryButtonClass}>
          Aplicar filtros
        </button>
        {filtered ? (
          <Link href="/informacion" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {result.total === 0 ? (
        <div className={`mt-8 ${cardClass} p-6`}>
          <p>{filtered ? NO_ENTRY_RESULTS_MESSAGE : NO_ENTRIES_MESSAGE}</p>
          {filtered ? (
            <p className="mt-3">
              <Link href="/informacion" className={linkClass}>
                Limpiar filtros
              </Link>
            </p>
          ) : isAdmin ? (
            <p className="mt-3">
              <Link href="/informacion/nueva" className={linkClass}>
                Crear la primera
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className={`mt-8 hidden overflow-hidden md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">
                Información del negocio de la organización
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Título
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Categoría
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Vigencia
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className={`${tableCellClass} font-semibold`}>
                      <Link
                        href={`/informacion/${entry.id}`}
                        className={linkClass}
                      >
                        {entry.title}
                      </Link>
                    </td>
                    <td className={tableCellClass}>{entry.category}</td>
                    <td className={tableCellClass}>
                      <KnowledgeStatusBadge status={entry.status} />
                    </td>
                    <td className={`${tableCellClass} text-muted`}>
                      {formatValidity(entry.validFrom, entry.validUntil)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Información del negocio de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.entries.map((entry) => (
              <li key={entry.id} className={`${cardClass} p-4`}>
                <p className="font-semibold">
                  <Link href={`/informacion/${entry.id}`} className={linkClass}>
                    {entry.title}
                  </Link>
                </p>
                <p className="mt-1 text-sm text-muted">{entry.category}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted">
                    {formatValidity(entry.validFrom, entry.validUntil)}
                  </p>
                  <KnowledgeStatusBadge status={entry.status} />
                </div>
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
              href={knowledgeFiltersHref({ ...filters, page: result.page - 1 })}
              className={linkClass}
            >
              Página anterior
            </Link>
          ) : null}
          <p className="text-sm text-muted tabular-nums">
            Página {result.page} de {result.pageCount} · {result.total}{" "}
            {result.total === 1 ? "entrada" : "entradas"}
          </p>
          {result.page < result.pageCount ? (
            <Link
              href={knowledgeFiltersHref({ ...filters, page: result.page + 1 })}
              className={linkClass}
            >
              Página siguiente
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
