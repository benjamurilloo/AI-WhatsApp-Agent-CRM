import type { Metadata } from "next";
import Link from "next/link";
import { DEBTORS_PAGE_SIZE, listDebtors } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  labelClass,
  linkClass,
  secondaryButtonClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatDate } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { UNNAMED_CLIENT_TEXT } from "@/app/(autenticado)/clientes/[clientId]/cuenta/messages";
import { CashSubNav } from "../cash-sub-nav";
import { FORBIDDEN_PAGE_MESSAGE } from "../messages";

export const metadata: Metadata = {
  title: "Deudores — AI WhatsApp Agent CRM",
};

const TITLE = "Deudores";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function hrefFor(currency: string | null, page: number): string {
  const params = new URLSearchParams();
  if (currency) params.set("moneda", currency);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/caja/deudores?${query}` : "/caja/deudores";
}

// Pantalla 39 (brief-21.6, D-6; ADR 0022, punto 9): los clientes con saldo deudor, una fila por
// cliente y moneda, de la deuda mayor a la menor, con la venta con saldo más vieja y cuántas tienen
// saldo; filtro por moneda. Para los dos roles, sin el contacto del cliente. Cada fila lleva al estado
// de cuenta. La deuda sale de la misma regla que el estado de cuenta.
export default async function DebtorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const currencyParam = single(query.moneda).toUpperCase();
  const currency = /^[A-Z]{3}$/.test(currencyParam) ? currencyParam : null;
  const pageParam = single(query.pagina);
  const page = /^[1-9][0-9]{0,5}$/.test(pageParam) ? Number(pageParam) : 1;
  const result = await listDebtors(context, { currency, page });
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const { debtors } = result;
  const timeZone = await getOrganizationTimezone(context);
  const pageCount = Math.max(1, Math.ceil(debtors.total / debtors.pageSize));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title="Caja"
        subtitle="Los clientes que deben, de la deuda mayor a la menor."
      />
      <CashSubNav current="deudores" />

      {debtors.currencies.length > 1 || currency ? (
        <form
          key={currency ?? ""}
          method="get"
          action="/caja/deudores"
          className="mt-6 flex flex-wrap items-end gap-3"
          aria-label="Filtrar deudores"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="deudores-moneda" className={labelClass}>
              Moneda
            </label>
            <select
              id="deudores-moneda"
              name="moneda"
              defaultValue={currency ?? ""}
              className={selectClass}
            >
              <option value="">Todas</option>
              {[
                ...new Set([
                  ...debtors.currencies,
                  ...(currency ? [currency] : []),
                ]),
              ]
                .sort()
                .map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
            </select>
          </div>
          <button type="submit" className={secondaryButtonClass}>
            Filtrar
          </button>
        </form>
      ) : null}

      {debtors.total === 0 ? (
        <EmptyState
          icon="circleCheck"
          title={
            currency
              ? `Nadie debe en ${currency}.`
              : "Ningún cliente debe nada."
          }
          description="Acá aparecen los clientes con ventas que todavía falta cobrar."
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
                    Cliente
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Moneda
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Debe
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Desde
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Ventas con saldo
                  </th>
                </tr>
              </thead>
              <tbody>
                {debtors.rows.map((row) => (
                  <tr key={`${row.clientId}-${row.currency}`}>
                    <td className={tableCellClass}>
                      <Link
                        href={`/clientes/${row.clientId}/cuenta`}
                        className={linkClass}
                      >
                        {row.displayName ?? UNNAMED_CLIENT_TEXT}
                      </Link>
                    </td>
                    <td className={`${tableCellClass} font-mono`}>
                      {row.currency}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap font-semibold tabular-nums`}
                    >
                      {formatMoney(row.owed, row.currency)}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatDate(row.oldestOutstandingAt, timeZone)}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {row.salesWithBalance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={debtors.page}
            pageCount={pageCount}
            rangeText={shownRangeText({
              page: debtors.page,
              pageSize: DEBTORS_PAGE_SIZE,
              shown: debtors.rows.length,
              total: debtors.total,
              singular: "deudor",
              plural: "deudores",
            })}
            hrefFor={(target) => hrefFor(currency, target)}
          />
        </>
      )}
      <p className="mt-6 text-sm text-muted">
        «Desde» es la fecha de la venta con saldo más vieja. Fechas en{" "}
        {timeZone}.
      </p>
    </main>
  );
}
