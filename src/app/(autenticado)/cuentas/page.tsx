import type { Metadata } from "next";
import Link from "next/link";
import { DEBTORS_PAGE_SIZE, listDebtors } from "@/modules/cash";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inputClass,
  labelClass,
  outlineButtonClass,
  secondaryButtonClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { SubNav } from "@/app/_components/sub-nav";
import { formatDate } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { UNNAMED_CLIENT_TEXT } from "@/app/(autenticado)/clientes/[clientId]/cuenta/messages";
import { referenceText } from "@/app/(autenticado)/caja/exchange";
import { FORBIDDEN_PAGE_MESSAGE } from "@/app/(autenticado)/caja/messages";

export const metadata: Metadata = {
  title: "Cuentas de clientes — AI WhatsApp Agent CRM",
};

const TITLE = "Cuentas de clientes";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function hrefFor(currency: string | null, text: string, page: number): string {
  const params = new URLSearchParams();
  if (currency) params.set("moneda", currency);
  if (text !== "") params.set("cliente", text);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/cuentas?${query}` : "/cuentas";
}

// Pantalla 39, rediseñada (brief-24.7.2, lámina 01 del lote V2-10): los clientes con saldo deudor,
// una fila por cliente y moneda, de la deuda mayor a la menor, con la venta con saldo más vieja —su
// número y su fecha—, cuántas ventas tienen saldo y el acceso a la cuenta. Filtro por moneda y
// búsqueda por nombre. Para los dos roles, **sin el contacto del cliente**. La deuda sale de la
// misma regla que el estado de cuenta: acá no se recalcula nada.
//
// **Ya no vive bajo la caja** (D-2): la cuenta de un cliente no es caja, y existe aunque la caja
// esté cerrada. `/caja/deudores` redirige acá.
export default async function ClientAccountsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const currencyParam = single(query.moneda).toUpperCase();
  const currency = /^[A-Z]{3}$/.test(currencyParam) ? currencyParam : null;
  const text = single(query.cliente).trim().slice(0, 80);
  const pageParam = single(query.pagina);
  const page = /^[1-9][0-9]{0,5}$/.test(pageParam) ? Number(pageParam) : 1;
  const result = await listDebtors(context, { currency, page, text });
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const { debtors } = result;
  const timeZone = await getOrganizationTimezone(context);
  const pageCount = Math.max(1, Math.ceil(debtors.total / debtors.pageSize));
  const clientCount = new Set(debtors.rows.map((row) => row.clientId)).size;
  const reference = debtors.reference
    ? referenceText(debtors.reference, timeZone)
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <PageHeader
        title={TITLE}
        subtitle="Los clientes que deben, de la deuda mayor a la menor."
      />
      {/* «Con deudas» es esta pantalla; «Buscar cliente» lleva al buscador de Clientes, que es
          donde se consulta la cuenta de alguien que no debe nada (D-6). No es un segundo listado:
          la lista de clientes con su saldo por moneda ya la hizo la 24.4.2. */}
      <SubNav
        label="Secciones de las cuentas"
        items={[
          {
            href: "/cuentas",
            label: "Con deudas",
            icon: "users",
            current: true,
          },
          {
            href: "/clientes#q",
            label: "Buscar cliente",
            icon: "search",
            current: false,
          },
        ]}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        {/* `min-w-0`: un ítem de grilla trae `min-width: auto` y **no se encoge por debajo de su
            contenido**, así que sin esto el `overflow-x-auto` de la tabla no alcanza y la página
            entera desborda. Lo midió el barrido de anchos: 338 px de más a 320. Es la misma
            trampa que la 24.7.1 documentó con el selector de moneda. */}
        <div className="min-w-0">
          <form
            key={`${currency ?? ""}-${text}`}
            method="get"
            action="/cuentas"
            className={`${cardClass} flex flex-wrap items-end gap-3 p-4 sm:p-5`}
            aria-label="Filtrar cuentas"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="cuentas-moneda" className={labelClass}>
                Moneda
              </label>
              <select
                id="cuentas-moneda"
                name="moneda"
                defaultValue={currency ?? ""}
                className={`${selectClass} w-full min-w-0`}
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
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="cuentas-cliente" className={labelClass}>
                Buscar cliente (opcional)
              </label>
              <input
                id="cuentas-cliente"
                name="cliente"
                type="search"
                defaultValue={text}
                maxLength={80}
                placeholder="Nombre del cliente…"
                className={`${inputClass} w-full min-w-0`}
              />
            </div>
            <button type="submit" className={secondaryButtonClass}>
              Filtrar
            </button>
          </form>

          {debtors.total === 0 ? (
            <EmptyState
              icon="circleCheck"
              title={emptyTitle(currency, text)}
              description="Acá aparecen los clientes con ventas que todavía falta cobrar."
              className="mt-6"
            />
          ) : (
            <>
              <p className="mt-4 text-sm text-muted">
                {shownRangeText({
                  page: debtors.page,
                  pageSize: DEBTORS_PAGE_SIZE,
                  shown: debtors.rows.length,
                  total: debtors.total,
                  singular: "saldo",
                  plural: "saldos",
                })}
                {" · "}
                {clientCount === 1
                  ? "1 cliente en esta página"
                  : `${clientCount} clientes en esta página`}
              </p>
              <div
                className={`mt-3 overflow-x-auto ${cardClass}`}
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
                      <th
                        scope="col"
                        className={`${tableHeadCellClass} text-right`}
                      >
                        Ventas con saldo
                      </th>
                      <th scope="col" className={tableHeadCellClass}>
                        Más antigua
                      </th>
                      <th scope="col" className={tableHeadCellClass}>
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtors.rows.map((row) => (
                      <tr key={`${row.clientId}-${row.currency}`}>
                        {/* Sin partir: la tabla ya desplaza en horizontal si hace falta, y un
                            nombre cortado en dos renglones no se parece a la lámina. */}
                        <td
                          className={`${tableCellClass} font-medium whitespace-nowrap`}
                        >
                          {row.displayName ?? UNNAMED_CLIENT_TEXT}
                        </td>
                        <td className={`${tableCellClass} font-mono`}>
                          {row.currency}
                        </td>
                        <td
                          className={`${tableCellClass} text-right whitespace-nowrap font-semibold tabular-nums`}
                        >
                          {formatMoney(row.owed, row.currency)}
                        </td>
                        {/* Con la palabra, como la lámina: «1 venta», «2 ventas». Un número solo,
                            bajo un encabezado que se parte en dos renglones, no se lee. */}
                        <td
                          className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                        >
                          {row.salesWithBalance === 1
                            ? "1 venta"
                            : `${row.salesWithBalance} ventas`}
                        </td>
                        {/* El número y la fecha, como la lámina (AC-1). El número ya venía en la
                            imputación y hasta la 24.7.2 se tiraba: no cuesta una consulta. */}
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          <span className="font-mono">
                            {row.oldestOutstandingNumber}
                          </span>
                          <span className="block text-sm text-muted">
                            {formatDate(row.oldestOutstandingAt, timeZone)}
                          </span>
                        </td>
                        <td className={`${tableCellClass} whitespace-nowrap`}>
                          <Link
                            href={`/cuentas/${row.clientId}`}
                            className={outlineButtonClass}
                          >
                            Ver cuenta
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={debtors.page}
                pageCount={pageCount}
                rangeText=""
                hrefFor={(target) => hrefFor(currency, text, target)}
              />
            </>
          )}
        </div>

        {/* El resumen de la lámina: lo que se debe en cada moneda **sobre el filtro entero**, no
            sobre esta página, y el equivalente orientativo del total. Las deudas conservan su
            moneda: el equivalente no convierte la cuenta ni compensa una con otra. */}
        <aside className={`${cardClass} h-fit p-5 text-sm sm:p-6`}>
          <h2 className="text-base font-semibold">
            {reference
              ? `Resumen orientativo en ${debtors.reference!.currency}`
              : "Resumen"}
          </h2>
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            <span>
              Las deudas conservan su moneda. El equivalente no convierte la
              cuenta.
            </span>
          </p>
          {/* Una sola lista de definición, con **un `div` por par** y el total adentro. Un `dt` o
              un `dd` fuera de su `dl` rompe la regla `dlitem` de axe, y no se ve a ojo: lo encontró
              el barrido de accesibilidad, igual que en la 24.7.1. */}
          <dl className="mt-4 flex flex-col gap-2">
            {debtors.totals.map((total) => (
              <div
                key={total.currency}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="text-muted">Deuda en {total.currency}</dt>
                <dd className="font-semibold tabular-nums">
                  {formatMoney(total.owed, total.currency)}
                </dd>
              </div>
            ))}
            {reference ? (
              <div className="mt-2 flex items-baseline justify-between gap-3 rounded-xl bg-primary-soft px-3 py-2 text-on-primary-soft">
                <dt className="font-medium">
                  Total (equivalente en {debtors.reference!.currency})
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {reference.total}
                </dd>
              </div>
            ) : null}
          </dl>
          {reference ? (
            <p className="mt-3 text-sm text-muted">{reference.detail}.</p>
          ) : null}
        </aside>
      </div>

      <p className="mt-6 text-sm text-muted">
        «Más antigua» es la venta con saldo más vieja de esa moneda. Fechas en{" "}
        {timeZone}.
      </p>
    </main>
  );
}

function emptyTitle(currency: string | null, text: string): string {
  if (text !== "" && currency)
    return `Nadie con ese nombre debe en ${currency}.`;
  if (text !== "") return "Ningún cliente con ese nombre debe nada.";
  if (currency) return `Nadie debe en ${currency}.`;
  return "Ningún cliente debe nada.";
}
