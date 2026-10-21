import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listTradeInsToPay } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { listTradeIns, TRADE_INS_PAGE_SIZE } from "@/modules/tradeins";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import {
  cardClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import {
  DESTINATION_PARAMS,
  destinationParam,
  hasActiveTradeInFilters,
  parseTradeInFilters,
  STATUS_PARAMS,
  statusParam,
  tradeInFiltersHref,
  type SearchParams,
} from "./filters";
import {
  DESTINATION_SHORT_LABEL,
  FORBIDDEN_ACTION_MESSAGE,
  NO_TRADE_IN_RESULTS_MESSAGE,
  NO_TRADE_INS_MESSAGE,
  noticeMessage,
  TRADE_INS_TITLE,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_PRODUCT_TEXT,
} from "./messages";
import { TradeInsSubNav, TradeInStatusBadge } from "./sub-nav";

export const metadata: Metadata = {
  title: "Usados — AI WhatsApp Agent CRM",
};

// La lista de usados recibidos (brief-29.7, D-7): la más nueva primero, con los filtros de estado y de
// destino y la búsqueda por número o IMEI, en la URL. Tabla en escritorio y tarjetas en móvil, como
// Reparaciones. Los dos roles; el valor, solo un admin (D-8), y «Recibir un usado», solo admin. Sin la
// capacidad trade_ins, 404. Desde la 29.7.2, «Falta pagar» solo para un admin, que lo lee de cash
// (brief-29.7.2, D-6): para un viewer, ese estado no existe y se lista todo.
export default async function TradeInsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const isAdmin = context.role === "admin";
  const parsed = parseTradeInFilters(query);
  const filters =
    parsed.status === "to_pay" && !isAdmin
      ? { ...parsed, status: "all" as const }
      : parsed;
  const result =
    filters.status === "to_pay"
      ? await listTradeInsToPay(context, filters)
      : await listTradeIns(context, { ...filters, status: filters.status });
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return (
      <PageNotice title={TRADE_INS_TITLE} message={FORBIDDEN_ACTION_MESSAGE} />
    );
  }
  const timeZone = await getOrganizationTimezone(context);
  const filtered = hasActiveTradeInFilters(filters);
  const notice = noticeMessage(query.aviso);
  type Row = (typeof result.tradeIns)[number];
  const value = (row: Row) =>
    row.value ? formatMoney(row.value.amount, row.value.currency) : "";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TRADE_INS_TITLE}
        subtitle="Los equipos que entregaron los clientes. Cada uno entra al stock como una unidad en revisión."
        action={
          isAdmin
            ? { href: "/usados/nuevo", label: "+ Recibir un usado" }
            : undefined
        }
      />
      <TradeInsSubNav current="recepciones" isAdmin={isAdmin} />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <form
        key={tradeInFiltersHref(filters)}
        method="get"
        action="/usados"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="buscar" className={labelClass}>
            Número o IMEI
          </label>
          <div className="relative">
            <input
              id="buscar"
              name="buscar"
              type="search"
              defaultValue={filters.search}
              placeholder="PU-000123 o IMEI"
              autoComplete="off"
              className={`${inputClass} w-56 pl-9`}
            />
            <SearchIcon />
          </div>
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
            {STATUS_PARAMS.filter(
              ([, status]) => isAdmin || status !== "to_pay",
            ).map(([param, , label]) => (
              <option key={param} value={param}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="destino" className={labelClass}>
            Destino
          </label>
          <select
            id="destino"
            name="destino"
            defaultValue={destinationParam(filters.destination)}
            className={selectClass}
          >
            {DESTINATION_PARAMS.map(([param, , label]) => (
              <option key={param} value={param}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Aplicar filtros
        </button>
        {filtered ? (
          <Link href="/usados" className={`${linkClass} py-2`}>
            Ver todas
          </Link>
        ) : null}
      </form>

      {result.total === 0 ? (
        <EmptyState
          icon="smartphone"
          title={filtered ? NO_TRADE_IN_RESULTS_MESSAGE : NO_TRADE_INS_MESSAGE}
          description={
            filtered
              ? "Probá con otro número, otro IMEI, otro estado u otro destino."
              : "Cuando un cliente entrega un equipo usado, se revisa con el checklist y entra al stock como una unidad en revisión."
          }
          actions={
            isAdmin && !filtered
              ? [
                  {
                    href: "/usados/nuevo",
                    label: "Recibir un usado",
                    variant: "primary" as const,
                  },
                ]
              : []
          }
        />
      ) : (
        <>
          <div className={`mt-8 hidden overflow-x-auto md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Usados recibidos por la organización
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Número
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Fecha
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Cliente
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Producto
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    IMEI
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Destino
                  </th>
                  {isAdmin ? (
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Valor
                    </th>
                  ) : null}
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.tradeIns.map((row) => (
                  <tr key={row.id}>
                    <td
                      className={`${tableCellClass} font-mono whitespace-nowrap`}
                    >
                      <Link href={`/usados/${row.id}`} className={linkClass}>
                        {row.displayNumber}
                      </Link>
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(row.createdAt, timeZone)}
                    </td>
                    <td className={tableCellClass}>
                      {row.clientName ?? UNKNOWN_CLIENT_TEXT}
                    </td>
                    <td className={tableCellClass}>
                      {row.productName ?? UNKNOWN_PRODUCT_TEXT}
                    </td>
                    <td className={`${tableCellClass} font-mono`}>
                      {row.serial}
                    </td>
                    <td className={tableCellClass}>
                      {DESTINATION_SHORT_LABEL[row.destination]}
                    </td>
                    {isAdmin ? (
                      <td
                        className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                      >
                        {value(row)}
                      </td>
                    ) : null}
                    <td className={tableCellClass}>
                      <TradeInStatusBadge
                        voided={row.voidDisplayNumber !== null}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Usados recibidos por la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.tradeIns.map((row) => (
              <li key={row.id} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/usados/${row.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {row.displayNumber}
                  </Link>
                  <TradeInStatusBadge voided={row.voidDisplayNumber !== null} />
                </p>
                <p className="mt-1 font-semibold">
                  {row.clientName ?? UNKNOWN_CLIENT_TEXT}
                </p>
                <p className="mt-1 text-sm break-words text-muted">
                  {row.productName ?? UNKNOWN_PRODUCT_TEXT} ·{" "}
                  <span className="font-mono">{row.serial}</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {DESTINATION_SHORT_LABEL[row.destination]} ·{" "}
                  {formatShortDateTime(row.createdAt, timeZone)}
                  {isAdmin ? (
                    <>
                      {" "}
                      · <span className="tabular-nums">{value(row)}</span>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            rangeText={shownRangeText({
              page: result.page,
              pageSize: TRADE_INS_PAGE_SIZE,
              shown: result.tradeIns.length,
              total: result.total,
              singular: "recepción",
              plural: "recepciones",
            })}
            hrefFor={(target) =>
              tradeInFiltersHref({ ...filters, page: target })
            }
          />
        </>
      )}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
