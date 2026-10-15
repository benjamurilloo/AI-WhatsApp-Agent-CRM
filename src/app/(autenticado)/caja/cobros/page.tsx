import type { Metadata } from "next";
import Link from "next/link";
import { CASH_RECEIPTS_PAGE_SIZE, listReceipts } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inactiveBadgeClass,
  inputClass,
  labelClass,
  linkClass,
  secondaryButtonClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { CashSubNav } from "../cash-sub-nav";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";

export const metadata: Metadata = {
  title: "Cobros — AI WhatsApp Agent CRM",
};

const TITLE = "Cobros";
const NO_RECEIPTS_MESSAGE = "Todavía no se registró ningún cobro.";
const NO_RECEIPT_RESULTS_MESSAGE = "Ningún cobro coincide con ese número.";
const CONSUMER_TEXT = "Consumidor final";
const UNKNOWN_CLIENT_TEXT = "Cliente no disponible";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function hrefFor(number: string, page: number): string {
  const params = new URLSearchParams();
  if (number) params.set("numero", number);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/caja/cobros?${query}` : "/caja/cobros";
}

// Pantalla 30 (brief-21.3, D-8): los cobros, del más nuevo al más viejo, con su venta, su cliente,
// su medio y su monto; búsqueda por número («R-000123» o «123», ADR 0022, punto 11). Para los dos
// roles, sin el contacto del cliente. Desde la 21.4, la columna «Destino»: la venta de un cobro o el
// pedido de una seña (brief-21.4, D-8). Desde la 21.5, la marca «Anulado» (brief-21.5, D-9).
export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const number = single(query.numero).slice(0, 40);
  const pageParam = single(query.pagina);
  const page = /^[1-9][0-9]{0,5}$/.test(pageParam) ? Number(pageParam) : 1;
  const result = await listReceipts(context, { number, page });
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const timeZone = await getOrganizationTimezone(context);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title="Caja"
        subtitle="Cada cobro de una venta, con su recibo."
      />
      <CashSubNav current="cobros" />

      <form
        key={number}
        method="get"
        action="/caja/cobros"
        className="mt-6 flex flex-wrap items-end gap-3"
        role="search"
        aria-label="Buscar cobros"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="cobros-numero" className={labelClass}>
            Número
          </label>
          <div className="relative">
            <input
              id="cobros-numero"
              name="numero"
              type="search"
              defaultValue={number}
              placeholder="R-000123"
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
        <div className={`mt-6 ${cardClass} p-6`}>
          <p>{number ? NO_RECEIPT_RESULTS_MESSAGE : NO_RECEIPTS_MESSAGE}</p>
        </div>
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
                    Recibo
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Fecha
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Destino
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Cliente
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Medio
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td className={tableCellClass}>
                      <Link
                        href={`/cobros/${receipt.id}`}
                        className={`${linkClass} font-mono`}
                      >
                        {receipt.displayNumber}
                      </Link>
                      {receipt.voided ? (
                        <span
                          className={`${inactiveBadgeClass} ml-2 font-sans`}
                          title={`Anulado por ${receipt.voided.displayNumber}`}
                        >
                          Anulado
                        </span>
                      ) : null}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(receipt.createdAt, timeZone)}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {receipt.sale ? (
                        <>
                          Venta{" "}
                          <Link
                            href={`/ventas/${receipt.sale.id}`}
                            className={`${linkClass} font-mono`}
                          >
                            {receipt.sale.displayNumber}
                          </Link>
                        </>
                      ) : receipt.order ? (
                        <>
                          Pedido{" "}
                          <Link
                            href={`/pedidos/${receipt.order.id}`}
                            className={`${linkClass} font-mono`}
                          >
                            {receipt.order.displayNumber}
                          </Link>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={tableCellClass}>
                      {receipt.client === null
                        ? CONSUMER_TEXT
                        : (receipt.client.displayName ?? UNKNOWN_CLIENT_TEXT)}
                    </td>
                    <td className={tableCellClass}>
                      {receipt.paymentMethodName}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(receipt.amount, receipt.currency)}
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
              pageSize: CASH_RECEIPTS_PAGE_SIZE,
              shown: result.receipts.length,
              total: result.total,
              singular: "cobro",
              plural: "cobros",
            })}
            hrefFor={(target) => hrefFor(number, target)}
          />
        </>
      )}
      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
