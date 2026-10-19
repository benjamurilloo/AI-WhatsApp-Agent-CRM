import type { Metadata } from "next";
import Link from "next/link";
import { CASH_REFUNDS_PAGE_SIZE, listRefunds } from "@/modules/cash";
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
import { EmptyState } from "@/app/_components/empty-state";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { tenderNote } from "@/app/(autenticado)/caja/exchange";
import {
  CONSUMER_TEXT,
  NO_REFUND_RESULTS_MESSAGE,
  NO_REFUNDS_MESSAGE,
  UNKNOWN_CLIENT_TEXT,
} from "@/app/(autenticado)/devoluciones/messages";
import { CashSubNav } from "../cash-sub-nav";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";

export const metadata: Metadata = {
  title: "Devoluciones — AI WhatsApp Agent CRM",
};

const TITLE = "Devoluciones";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function hrefFor(number: string, page: number): string {
  const params = new URLSearchParams();
  if (number) params.set("numero", number);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/caja/devoluciones?${query}` : "/caja/devoluciones";
}

// Pantalla 34 (brief-21.5, D-9): las devoluciones, de la más nueva a la más vieja, con su origen (la
// cuenta del cliente o la venta), su cliente, su medio y su monto, y la marca de las anuladas;
// búsqueda por número («D-000007» o «7», ADR 0022, punto 11). Para los dos roles, sin el contacto del
// cliente. Como /caja/cobros.
export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const number = single(query.numero).slice(0, 40);
  const pageParam = single(query.pagina);
  const page = /^[1-9][0-9]{0,5}$/.test(pageParam) ? Number(pageParam) : 1;
  const result = await listRefunds(context, { number, page });
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const timeZone = await getOrganizationTimezone(context);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title="Caja"
        subtitle="Cada devolución de plata a un cliente, con su comprobante."
      />
      <CashSubNav current="devoluciones" />

      <form
        key={number}
        method="get"
        action="/caja/devoluciones"
        className="mt-6 flex flex-wrap items-end gap-3"
        role="search"
        aria-label="Buscar devoluciones"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="devoluciones-numero" className={labelClass}>
            Número
          </label>
          <div className="relative">
            <input
              id="devoluciones-numero"
              name="numero"
              type="search"
              defaultValue={number}
              placeholder="D-000007"
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
          icon="undo"
          title={number ? NO_REFUND_RESULTS_MESSAGE : NO_REFUNDS_MESSAGE}
          description={
            number
              ? "Revisá el número: se busca completo, con su serie."
              : "Las devoluciones se registran desde la cuenta de un cliente o desde una venta anulada."
          }
          actions={
            number
              ? [
                  {
                    href: "/caja/devoluciones",
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
                    Devolución
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Fecha
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Desde
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
                {result.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      <Link
                        href={`/devoluciones/${refund.id}`}
                        className={`${linkClass} font-mono`}
                      >
                        {refund.displayNumber}
                      </Link>
                      {refund.voided ? (
                        <span
                          className={`${inactiveBadgeClass} ml-2 font-sans`}
                          title={`Anulada por ${refund.voided.displayNumber}`}
                        >
                          Anulada
                        </span>
                      ) : null}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(refund.createdAt, timeZone)}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {refund.sale ? (
                        <>
                          Venta{" "}
                          <Link
                            href={`/ventas/${refund.sale.id}`}
                            className={`${linkClass} font-mono`}
                          >
                            {refund.sale.displayNumber}
                          </Link>
                        </>
                      ) : (
                        "Saldo a favor"
                      )}
                    </td>
                    <td className={tableCellClass}>
                      {refund.client === null
                        ? CONSUMER_TEXT
                        : (refund.client.displayName ?? UNKNOWN_CLIENT_TEXT)}
                    </td>
                    <td className={tableCellClass}>
                      {refund.paymentMethodName}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(refund.amount, refund.currency)}
                      {refund.tender ? (
                        <span className="block text-xs font-normal text-muted">
                          {tenderNote(refund.tender, true)}
                        </span>
                      ) : null}
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
              pageSize: CASH_REFUNDS_PAGE_SIZE,
              shown: result.refunds.length,
              total: result.total,
              singular: "devolución",
              plural: "devoluciones",
            })}
            hrefFor={(target) => hrefFor(number, target)}
          />
        </>
      )}
      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
