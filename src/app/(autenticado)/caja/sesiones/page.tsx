import type { Metadata } from "next";
import Link from "next/link";
import { CASH_SESSIONS_PAGE_SIZE, listCashSessions } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inputClass,
  labelClass,
  linkClass,
  secondaryButtonClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatShortDateTime } from "@/app/_format/date-time";
import { CashSubNav } from "../cash-sub-nav";
import {
  differenceText,
  FORBIDDEN_PAGE_MESSAGE,
  NO_SESSION_RESULTS_MESSAGE,
  NO_SESSIONS_MESSAGE,
  UNKNOWN_MEMBER_TEXT,
} from "../messages";

export const metadata: Metadata = {
  title: "Sesiones de caja — AI WhatsApp Agent CRM",
};

const TITLE = "Sesiones de caja";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function hrefFor(number: string, page: number): string {
  const params = new URLSearchParams();
  if (number) params.set("numero", number);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/caja/sesiones?${query}` : "/caja/sesiones";
}

// Pantalla 25 (brief-21.2, D-10): las sesiones, de la más nueva a la más vieja, con quién abrió y
// cerró y la diferencia de cada moneda; búsqueda por número. Para los dos roles.
export default async function CashSessionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const number = single(query.numero).slice(0, 40);
  const pageParam = single(query.pagina);
  const page = /^[1-9][0-9]{0,5}$/.test(pageParam) ? Number(pageParam) : 1;
  const result = await listCashSessions(context, { number, page });
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const timeZone = await getOrganizationTimezone(context);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title="Caja"
        subtitle="Cada sesión de caja, con su apertura, su cierre y su arqueo."
      />
      <CashSubNav current="sesiones" />

      <form
        key={number}
        method="get"
        action="/caja/sesiones"
        className="mt-6 flex flex-wrap items-end gap-3"
        role="search"
        aria-label="Buscar sesiones"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="sesiones-numero" className={labelClass}>
            Número
          </label>
          <div className="relative">
            <input
              id="sesiones-numero"
              name="numero"
              type="search"
              defaultValue={number}
              placeholder="C-000045"
              className={`${inputClass} pl-9`}
            />
            <SearchIcon />
          </div>
        </div>
        <button type="submit" className={secondaryButtonClass}>
          Buscar
        </button>
      </form>

      {result.total === 0 ? (
        <EmptyState
          icon="banknote"
          title={number ? NO_SESSION_RESULTS_MESSAGE : NO_SESSIONS_MESSAGE}
          description={
            number
              ? "Revisá el número: se busca completo, con su serie."
              : "Cada vez que se abre y se cierra la caja queda una sesión con su arqueo."
          }
          actions={
            number
              ? [
                  {
                    href: "/caja/sesiones",
                    label: "Limpiar filtros",
                    variant: "outline",
                  },
                ]
              : []
          }
          className="mt-6"
        />
      ) : (
        <>
          <div
            className={`mt-6 overflow-x-auto ${cardClass}`}
            tabIndex={0}
            role="region"
            aria-label={TITLE}
          >
            <table className="w-full border-collapse text-left text-[0.9375rem]">
              <caption className="sr-only">{TITLE}</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Sesión
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Apertura
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Cierre
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Diferencia
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.sessions.map((session) => (
                  <tr key={session.id}>
                    <td className={tableCellClass}>
                      <Link
                        href={`/caja/sesiones/${session.id}`}
                        className={`${linkClass} font-mono`}
                      >
                        {session.displayNumber}
                      </Link>
                    </td>
                    <td className={tableCellClass}>
                      {formatShortDateTime(session.openedAt, timeZone)}
                      <span className="block text-sm text-muted">
                        {session.openedByName ?? UNKNOWN_MEMBER_TEXT}
                      </span>
                    </td>
                    <td className={tableCellClass}>
                      {session.closedAt ? (
                        <>
                          {formatShortDateTime(session.closedAt, timeZone)}
                          <span className="block text-sm text-muted">
                            {session.closedByName ?? UNKNOWN_MEMBER_TEXT}
                          </span>
                        </>
                      ) : (
                        <span className="font-semibold">Abierta</span>
                      )}
                    </td>
                    <td className={tableCellClass}>
                      {session.differences.length === 0 ? (
                        "—"
                      ) : (
                        <ul>
                          {session.differences.map((row) => (
                            <li key={row.currency}>
                              <span className="font-mono">{row.currency}</span>:{" "}
                              {differenceText(row, row.currency)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            rangeText={shownRangeText({
              page: result.page,
              pageSize: CASH_SESSIONS_PAGE_SIZE,
              shown: result.sessions.length,
              total: result.total,
              singular: "sesión",
              plural: "sesiones",
            })}
            hrefFor={(target) => hrefFor(number, target)}
          />
        </>
      )}
      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
