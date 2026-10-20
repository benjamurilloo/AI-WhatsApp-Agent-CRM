import type { Metadata } from "next";
import Link from "next/link";
import { listSuppliersOwed, SUPPLIERS_OWED_PAGE_SIZE } from "@/modules/cash";
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
import { UNKNOWN_SUPPLIER_TEXT } from "../ordenes/messages";
import { SUPPLIER_ACCOUNT_ADMIN_ONLY_MESSAGE } from "../proveedores/[supplierId]/cuenta/messages";
import { PurchasingSubNav } from "../purchasing-sub-nav";
import { ReferenceTotal } from "@/app/(autenticado)/caja/reference-total";

export const metadata: Metadata = {
  title: "A pagar — AI WhatsApp Agent CRM",
};

const TITLE = "A pagar";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function hrefFor(currency: string | null, page: number): string {
  const params = new URLSearchParams();
  if (currency) params.set("moneda", currency);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/compras/a-pagar?${query}` : "/compras/a-pagar";
}

// Pantalla 56 (brief-22.7, D-7; ADR 0023, punto 9): los proveedores a los que se les debe, una fila
// por proveedor y moneda, de lo que se le debe más a lo que se le debe menos, con la recepción con
// saldo más vieja y cuántas tienen saldo; filtro por moneda. Un proveedor desactivado al que se le debe
// también está. Cada fila lleva al estado de cuenta. Lo que se le debe sale de la misma regla que el
// estado de cuenta y el tope del pago. Solo admin (punto 12).
export default async function SuppliersOwedPage({
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
  const result = await listSuppliersOwed(context, { currency, page });
  if (!result.ok) {
    return (
      <PageNotice title={TITLE} message={SUPPLIER_ACCOUNT_ADMIN_ONLY_MESSAGE} />
    );
  }
  const { suppliers } = result;
  const timeZone = await getOrganizationTimezone(context);
  const pageCount = Math.max(
    1,
    Math.ceil(suppliers.total / suppliers.pageSize),
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Los proveedores a los que se les debe, de la deuda mayor a la menor."
      />
      <PurchasingSubNav current="a-pagar" />

      {suppliers.currencies.length > 1 || currency ? (
        <form
          key={currency ?? ""}
          method="get"
          action="/compras/a-pagar"
          className="mt-6 flex flex-wrap items-end gap-3"
          aria-label="Filtrar lo que hay que pagar"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="a-pagar-moneda" className={labelClass}>
              Moneda
            </label>
            <select
              id="a-pagar-moneda"
              name="moneda"
              defaultValue={currency ?? ""}
              className={selectClass}
            >
              <option value="">Todas</option>
              {[
                ...new Set([
                  ...suppliers.currencies,
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

      {/* El total de referencia en la moneda principal (brief-29.4.3, D-6), como el de los deudores. */}
      <ReferenceTotal
        reference={suppliers.reference}
        label={
          currency
            ? `Se les debe en ${currency}, en total`
            : "Se les debe en total"
        }
        timeZone={timeZone}
        className="mt-4"
      />

      {suppliers.total === 0 ? (
        <EmptyState
          icon="circleCheck"
          title={
            currency
              ? `No se le debe nada a ningún proveedor en ${currency}.`
              : "No se le debe nada a ningún proveedor."
          }
          description="Acá aparecen los proveedores con recepciones que todavía falta pagar."
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
              <caption className="sr-only">
                Proveedores a los que se les debe
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Proveedor
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Moneda
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Se le debe
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Desde
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Comprobantes con saldo
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.rows.map((row) => (
                  <tr key={`${row.supplierId}-${row.currency}`}>
                    <td className={tableCellClass}>
                      <Link
                        href={`/compras/proveedores/${row.supplierId}/cuenta`}
                        className={linkClass}
                      >
                        {row.name ?? UNKNOWN_SUPPLIER_TEXT}
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
                      {row.receiptsWithBalance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={suppliers.page}
            pageCount={pageCount}
            rangeText={shownRangeText({
              page: suppliers.page,
              pageSize: SUPPLIERS_OWED_PAGE_SIZE,
              shown: suppliers.rows.length,
              total: suppliers.total,
              singular: "fila",
              plural: "filas",
            })}
            hrefFor={(target) => hrefFor(currency, target)}
          />
        </>
      )}
      <p className="mt-6 text-sm text-muted">
        «Desde» es la fecha de la recepción con saldo más vieja. Fechas en{" "}
        {timeZone}.
      </p>
    </main>
  );
}
