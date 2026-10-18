import type { Metadata } from "next";
import Link from "next/link";
import { getClientsByIds } from "@/modules/crm";
import { getOrganizationTimezone } from "@/modules/organizations";
import { listSales, SALES_PAGE_SIZE } from "@/modules/sales";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  formMessageClass,
  inactiveBadgeClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import {
  hasActiveSaleFilters,
  parseSaleFilters,
  saleFiltersHref,
  statusParam,
  type SearchParams,
} from "./filters";
import {
  CONSUMER_TEXT,
  FORBIDDEN_PAGE_MESSAGE,
  INVALID_PERIOD_MESSAGE,
  NO_ORDER_TEXT,
  NO_SALE_RESULTS_MESSAGE,
  NO_SALES_MESSAGE,
  UNKNOWN_CLIENT_TEXT,
  VOIDED_BADGE_TEXT,
} from "./messages";

export const metadata: Metadata = {
  title: "Ventas — AI WhatsApp Agent CRM",
};

const TITLE = "Ventas";

// Pantalla 17: la lista de ventas (brief-20.2, D-6), para admin y viewer. Filtros y página en la
// URL; tabla en escritorio y tarjetas en móvil. Desde el detalle de una venta llega filtrada por su
// cliente. El número del pedido no se lee de orders: la columna enlaza al pedido. Desde la 20.3, una
// venta sin cliente dice «Consumidor final» y una sin pedido no enlaza ninguno (brief-20.3, D-7), y
// admin ve «Nueva venta». Desde la 20.4 (brief-20.4, D-8): la marca «Anulada», el filtro por estado
// y la búsqueda por el número de una anulación, que trae la venta que anula.
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseSaleFilters(await searchParams);
  const result = await listSales(context, {
    clientId: filters.clientId || null,
    number: filters.number,
    status: filters.status,
    from: filters.from,
    to: filters.to,
    page: filters.page,
  });
  if (!result.ok && result.code === "FORBIDDEN") {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const invalidPeriod = !result.ok;
  const timeZone = await getOrganizationTimezone(context);
  const filteredClient = filters.clientId
    ? await getClientsByIds(context, [filters.clientId])
    : null;
  const clientName = filteredClient?.ok
    ? filteredClient.clients[0]?.displayName
    : undefined;

  const filtered = hasActiveSaleFilters(filters);
  const clientText = (sale: {
    clientId: string | null;
    clientName: string | null;
  }) =>
    sale.clientId === null
      ? CONSUMER_TEXT
      : (sale.clientName ?? UNKNOWN_CLIENT_TEXT);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Las ventas emitidas, de un pedido entregado o de mostrador, con su número y su total."
        action={
          context.role === "admin"
            ? { href: "/ventas/nueva", label: "+ Nueva venta" }
            : null
        }
      />

      <form
        key={saleFiltersHref(filters)}
        method="get"
        action="/ventas"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="numero" className={labelClass}>
            Número
          </label>
          <div className="relative">
            <input
              id="numero"
              name="numero"
              type="search"
              defaultValue={filters.number}
              placeholder="V-000123 o A-000045"
              autoComplete="off"
              className={`${inputClass} w-48 pl-9`}
            />
            <SearchIcon />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="desde" className={labelClass}>
            Desde
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            defaultValue={filters.from}
            aria-invalid={invalidPeriod || undefined}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hasta" className={labelClass}>
            Hasta
          </label>
          <input
            id="hasta"
            name="hasta"
            type="date"
            defaultValue={filters.to}
            aria-invalid={invalidPeriod || undefined}
            className={inputClass}
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
            <option value="vigente">Vigentes</option>
            <option value="anulada">Anuladas</option>
          </select>
        </div>
        {filters.clientId ? (
          <input type="hidden" name="cliente" value={filters.clientId} />
        ) : null}
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Aplicar filtros
        </button>
        {filtered ? (
          <Link href="/ventas" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {filters.clientId ? (
        <p className="mt-4 text-sm">
          Ventas de{" "}
          <span className="font-semibold">
            {clientName ?? UNKNOWN_CLIENT_TEXT}
          </span>
          .{" "}
          <Link
            href={saleFiltersHref({ ...filters, clientId: "", page: 1 })}
            className={linkClass}
          >
            Ver las de todos los clientes
          </Link>
        </p>
      ) : null}

      {!result.ok ? (
        <div role="alert" className={`mt-8 ${formMessageClass}`}>
          <p>{INVALID_PERIOD_MESSAGE}</p>
        </div>
      ) : result.total === 0 ? (
        <EmptyState
          icon="receipt"
          title={filtered ? NO_SALE_RESULTS_MESSAGE : NO_SALES_MESSAGE}
          description={
            filtered
              ? "Probá con otras palabras o quitá algún filtro."
              : "Cada venta emitida, de un pedido o sin pedido, aparece acá con su número."
          }
          actions={
            filtered
              ? [
                  {
                    href: "/ventas",
                    label: "Limpiar filtros",
                    variant: "outline",
                  },
                ]
              : []
          }
        />
      ) : (
        <>
          <div className={`mt-8 hidden overflow-x-auto md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Ventas de la organización</caption>
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
                    Pedido
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Líneas
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.sales.map((sale) => (
                  <tr key={sale.id}>
                    <td
                      className={`${tableCellClass} font-mono whitespace-nowrap`}
                    >
                      <Link href={`/ventas/${sale.id}`} className={linkClass}>
                        {sale.displayNumber}
                      </Link>
                      {sale.voidDisplayNumber ? (
                        <span
                          className={`${inactiveBadgeClass} ml-2 font-sans`}
                          title={`Anulada por ${sale.voidDisplayNumber}`}
                        >
                          {VOIDED_BADGE_TEXT}
                        </span>
                      ) : null}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(sale.createdAt, timeZone)}
                    </td>
                    <td className={tableCellClass}>{clientText(sale)}</td>
                    <td className={tableCellClass}>
                      {sale.orderId === null ? (
                        <span className="text-muted">{NO_ORDER_TEXT}</span>
                      ) : (
                        <Link
                          href={`/pedidos/${sale.orderId}`}
                          className={linkClass}
                          aria-label={`Ver el pedido de la venta ${sale.displayNumber}`}
                        >
                          Ver pedido
                        </Link>
                      )}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {sale.lineCount}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(sale.total, sale.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Ventas de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.sales.map((sale) => (
              <li key={sale.id} className={`${cardClass} p-4`}>
                <p>
                  <Link
                    href={`/ventas/${sale.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {sale.displayNumber}
                  </Link>
                  {sale.voidDisplayNumber ? (
                    <span className={`${inactiveBadgeClass} ml-2`}>
                      {VOIDED_BADGE_TEXT}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 font-semibold">{clientText(sale)}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatShortDateTime(sale.createdAt, timeZone)} ·{" "}
                  {sale.lineCount} {sale.lineCount === 1 ? "línea" : "líneas"} ·{" "}
                  <span className="tabular-nums">
                    {formatMoney(sale.total, sale.currency)}
                  </span>
                </p>
              </li>
            ))}
          </ul>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            rangeText={shownRangeText({
              page: result.page,
              pageSize: SALES_PAGE_SIZE,
              shown: result.sales.length,
              total: result.total,
              singular: "venta",
              plural: "ventas",
            })}
            hrefFor={(target) => saleFiltersHref({ ...filters, page: target })}
          />
        </>
      )}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
