import type { Metadata } from "next";
import Link from "next/link";
import { getSalesStanding, type SaleStandingSummary } from "@/modules/cash";
import { getClientsByIds } from "@/modules/crm";
import { getOrganizationTimezone } from "@/modules/organizations";
import {
  countSalesByStatus,
  listSales,
  SALES_PAGE_SIZE,
  type SaleStatusFilter,
  type SaleSummary,
} from "@/modules/sales";
import { getSaleOrigins, type SaleOrigin } from "@/modules/service";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  outlineButtonClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { StatusBadge } from "@/app/_components/status-badge";
import { SubNav } from "@/app/_components/sub-nav";
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
  COUNTER_ORIGIN_TEXT,
  FORBIDDEN_PAGE_MESSAGE,
  INVALID_PERIOD_MESSAGE,
  issuedSalesNotice,
  NO_SALE_RESULTS_MESSAGE,
  NO_SALES_MESSAGE,
  ORDER_ORIGIN_TEXT,
  SALE_PAYMENT_LABEL,
  SALES_FOOTER_NOTE,
  SALES_PERIOD_NOTE,
  SALES_STATUS_NAV_LABEL,
  SALES_STATUS_TAB_LABEL,
  SALES_SUBTITLE,
  UNKNOWN_CLIENT_TEXT,
  type SalePaymentState,
} from "./messages";

export const metadata: Metadata = {
  title: "Ventas — AI WhatsApp Agent CRM",
};

const TITLE = "Ventas";

const STATUS_TABS = [
  "all",
  "current",
  "voided",
] as const satisfies readonly SaleStatusFilter[];

// Pantalla 17: la lista de ventas (brief-20.2, D-6), para admin y viewer. Filtros y página en la
// URL; tabla en escritorio y tarjetas en móvil. Desde el detalle de una venta llega filtrada por su
// cliente. Desde la 20.3, una venta sin cliente dice «Consumidor final» (brief-20.3, D-7), y admin
// ve «Nueva venta». Desde la 20.4 (brief-20.4, D-8): la marca «Anulada», el filtro por estado y la
// búsqueda por el número de una anulación, que trae la venta que anula.
//
// Desde la 24.6.2-b (lámina 01 de V2-09): la vigencia se elige en una barra de pestañas **con el
// contador de cada una**, en vez de un `<select>`, y la tabla suma dos columnas nuevas, **Origen**
// y **Cobros**. Las dos las **compone esta página**, porque `sales` no depende de `cash` ni conoce
// `service` (ADR 0021, punto 9; `DataModel.md:1441`):
//
// - **Cobros** sale de `getSalesStanding` de `cash`, **una sola llamada con las 25 filas**. La forma
//   obvia —`getSaleReceipts` por fila— cuesta 252 sentencias en una página de 25; esta cuesta entre
//   2 y 5, y no crece con la cantidad de filas (brief-24.6.2-b, AC-10, medido).
// - **Origen** sale de `getSaleOrigins` de `service`, también en una sola llamada, y **solo** si la
//   organización tiene la capacidad `repairs`: sin ella no se ejecuta ninguna consulta y el origen
//   distingue mostrador y pedido, como antes (AC-11).
//
// Los contadores y el listado se piden en paralelo: no dependen uno del otro. Las dos lecturas de
// arriba sí dependen del listado —necesitan sus filas—, así que van después, juntas.
//
// Los importes **no se suman entre monedas**: cada fila lleva la suya (ADR 0019; V-2 del brief).
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const filters = parseSaleFilters(query);
  // El aviso de una emisión de mostrador que produjo más de un comprobante (brief-24.6.2-c, D-5).
  // `parseSaleFilters` ignora los parámetros que no conoce, así que `aviso` y `numeros` no mueven
  // ningún filtro.
  const notice = issuedSalesNotice(query.aviso, query.numeros);
  const scope = {
    clientId: filters.clientId || null,
    number: filters.number,
    from: filters.from,
    to: filters.to,
  };
  const [result, counts] = await Promise.all([
    listSales(context, {
      ...scope,
      status: filters.status,
      page: filters.page,
    }),
    countSalesByStatus(context, scope),
  ]);
  if (!result.ok && result.code === "FORBIDDEN") {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  if (!counts.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const invalidPeriod = !result.ok;
  const sales = result.ok ? result.sales : [];
  const timeZone = await getOrganizationTimezone(context);
  // Las dos lecturas nuevas, una sola vez cada una, con las filas de esta página.
  const [standing, origins] = await Promise.all([
    getSalesStanding(
      context,
      sales.map((sale) => ({
        id: sale.id,
        clientId: sale.clientId,
        orderId: sale.orderId,
        currency: sale.currency,
        total: sale.total,
        voided: sale.voidDisplayNumber !== null,
      })),
    ),
    getSaleOrigins(
      context,
      sales.map((sale) => sale.id),
    ),
  ]);
  const standingOf = standing.ok
    ? standing.standing
    : new Map<string, SaleStandingSummary>();
  const filteredClient = filters.clientId
    ? await getClientsByIds(context, [filters.clientId])
    : null;
  const clientName = filteredClient?.ok
    ? filteredClient.clients[0]?.displayName
    : undefined;

  const filtered = hasActiveSaleFilters(filters);
  const clientText = (sale: SaleSummary) =>
    sale.clientId === null
      ? CONSUMER_TEXT
      : (sale.clientName ?? UNKNOWN_CLIENT_TEXT);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle={SALES_SUBTITLE}
        action={
          context.role === "admin"
            ? { href: "/ventas/nueva", label: "+ Nueva venta" }
            : null
        }
      />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <form
        key={saleFiltersHref(filters)}
        method="get"
        action="/ventas"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="numero" className={labelClass}>
            Número de venta
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
            aria-describedby="periodo-ayuda"
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
            aria-describedby="periodo-ayuda"
            className={inputClass}
          />
        </div>
        {/* La vigencia se elige en la barra de abajo, así que el formulario la conserva. */}
        {filters.status !== "all" ? (
          <input
            type="hidden"
            name="estado"
            value={statusParam(filters.status)}
          />
        ) : null}
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

      <p id="periodo-ayuda" className="mt-2 text-sm text-muted">
        {SALES_PERIOD_NOTE}
      </p>

      {/* La barra de vigencia de la lámina 01, con el contador de cada una. Cada contador cuenta
          dentro del ámbito de cliente, número y período que esté puesto, y **no** de la vigencia
          elegida: por eso «Anuladas (2)» sigue diciendo 2 mientras mirás «Vigentes». */}
      <SubNav
        label={SALES_STATUS_NAV_LABEL}
        scroll
        items={STATUS_TABS.map((status) => ({
          href: saleFiltersHref({ ...filters, status, page: 1 }),
          label: SALES_STATUS_TAB_LABEL[status],
          current: filters.status === status,
          count: counts.counts[status],
        }))}
      />

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
          <div className={`mt-6 hidden overflow-x-auto md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Ventas de la organización</caption>
              <thead>
                <tr>
                  <th scope="col" className={tableHeadCellClass}>
                    Venta
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Cliente
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Origen
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Total
                  </th>
                  {/* Una sola columna de estado, donde estaba «Cobros» (D-1 de la 24.6.2-e).
                      El sistema v2 separaba vigencia de cobro a propósito; el usuario decidió
                      unificarlas al recorrer la pantalla en producción, sabiendo que contradice
                      ese principio. Está escrito en H-1 de ese brief. */}
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      <Link
                        href={`/ventas/${sale.id}`}
                        className={`${linkClass} font-mono font-semibold`}
                      >
                        {sale.displayNumber}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatShortDateTime(sale.createdAt, timeZone)}
                      </p>
                    </td>
                    <td className={tableCellClass}>{clientText(sale)}</td>
                    <td className={tableCellClass}>
                      <Origin sale={sale} origin={origins.get(sale.id)} />
                    </td>
                    <td
                      className={`${tableCellClass} text-right font-semibold whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(sale.total, sale.currency)}
                    </td>
                    <td className={tableCellClass}>
                      <Payment row={standingOf.get(sale.id)} />
                    </td>
                    <td className={tableCellClass}>
                      {/* El mismo botón «Ver» que `/pedidos`, y **el que dibujan las dos láminas**:
                          `outlineButtonClass`, el secundario del sistema v2, cuya propia
                          definición dice que «cada pantalla decide en la Fase 24 qué botón pasa a
                          esta clase» (brief-23.1, D-3). El enlace de texto se confundía con el
                          número de venta (D-1 de la 24.6.2-e).

                          *Corregido el 2026-11-03*, por la comparación visual de AC-11: esto
                          quedó primero con `inlineButtonClass`, el sólido, copiando lo que
                          `/pedidos` ya tenía. Las dos láminas lo dibujan **con borde**, así que
                          el sólido desviaba de las dos; el usuario autorizó cambiar también
                          pedidos para no romper la igualdad que pidió. Ver D-5. */}
                      <Link
                        href={`/ventas/${sale.id}`}
                        className={outlineButtonClass}
                      >
                        Ver
                        <span className="sr-only">
                          {" "}
                          la venta {sale.displayNumber}
                        </span>
                      </Link>
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
            {sales.map((sale) => (
              <li key={sale.id} className={`${cardClass} p-4`}>
                {/* Sin insignia al lado del número: el estado vive una sola vez, abajo, en la
                    misma insignia de `Payment` que la tabla (D-1 de la 24.6.2-e). La tarjeta no
                    lleva el botón sólido: su número es el enlace y no tiene columna «Acción»
                    (V-3). */}
                <p>
                  <Link
                    href={`/ventas/${sale.id}`}
                    className={`${linkClass} font-mono font-semibold`}
                  >
                    {sale.displayNumber}
                  </Link>
                </p>
                <p className="mt-1 font-semibold">{clientText(sale)}</p>
                <p className="mt-1 text-sm text-muted">
                  {formatShortDateTime(sale.createdAt, timeZone)} ·{" "}
                  <Origin sale={sale} origin={origins.get(sale.id)} />
                </p>
                <p className="mt-2 font-semibold tabular-nums">
                  {formatMoney(sale.total, sale.currency)}
                </p>
                <p className="mt-2">
                  <Payment row={standingOf.get(sale.id)} />
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
              shown: sales.length,
              total: result.total,
              singular: "venta",
              plural: "ventas",
            })}
            hrefFor={(target) => saleFiltersHref({ ...filters, page: target })}
          />
        </>
      )}

      <p className="mt-6 text-sm text-muted">
        {SALES_FOOTER_NOTE} Fechas en {timeZone}.
      </p>
    </main>
  );
}

// El origen: la orden de servicio con su número, el pedido, o mostrador. El pedido **no** lleva su
// número, a diferencia de la lámina: leerlo pediría una lectura por lote en `orders` que la lista
// cerrada de esta subfase no incluye. Queda declarado en el brief.
function Origin({
  sale,
  origin,
}: {
  sale: SaleSummary;
  origin: SaleOrigin | undefined;
}) {
  if (origin) {
    return (
      <Link
        href={`/reparaciones/${origin.serviceOrderId}`}
        className={`${linkClass} font-mono`}
        aria-label={`Ver la orden de servicio ${origin.displayNumber} de la venta ${sale.displayNumber}`}
      >
        {origin.displayNumber}
      </Link>
    );
  }
  if (sale.orderId === null) {
    return <span>{COUNTER_ORIGIN_TEXT}</span>;
  }
  return (
    <Link
      href={`/pedidos/${sale.orderId}`}
      className={linkClass}
      aria-label={`Ver el pedido de la venta ${sale.displayNumber}`}
    >
      {ORDER_ORIGIN_TEXT}
    </Link>
  );
}

// Si el importe por cobrar **dice algo que la fila no dijo ya** (D-3 de la 24.6.2-e). Antes se
// mostraba en toda venta `pending` o `partial`, y en una pendiente ese número es **el mismo** que
// la columna TOTAL: el usuario lo leyó como una repetición al recorrer la pantalla en producción.
// Se pregunta por los importes y no por el estado, que es lo que se quiere decir y no depende de
// que los estados conserven hoy esa correspondencia. Una anulada no entra por el primer término:
// no debe nada, así que su pendiente es cero (ADR 0022, punto 6, y `standingOf` de `cash`).
function showsOutstanding(row: SaleStandingSummary) {
  const outstanding = Number(row.outstanding);
  return outstanding > 0 && outstanding !== Number(row.total);
}

// La situación de cobro, con su importe **en la moneda de la venta**: nunca se suma entre monedas.
// Una anulada dice «Anulada» y no muestra un pendiente: no es una deuda saldada (README del lote).
function Payment({ row }: { row: SaleStandingSummary | undefined }) {
  if (!row) return <span className="text-muted">—</span>;
  const state: SalePaymentState =
    row.status === "voided"
      ? "voided"
      : row.status === "collected"
        ? "collected"
        : Number(row.collected) > 0
          ? "partial"
          : "pending";
  const tone =
    state === "collected"
      ? "success"
      : state === "voided"
        ? "neutral"
        : state === "partial"
          ? "warning"
          : "info";
  const icon =
    state === "collected"
      ? "circleCheck"
      : state === "voided"
        ? "circleMinus"
        : "clock";
  return (
    <>
      <StatusBadge tone={tone} icon={icon}>
        {SALE_PAYMENT_LABEL[state]}
      </StatusBadge>
      {showsOutstanding(row) ? (
        <p className="mt-1 text-sm whitespace-nowrap tabular-nums">
          {formatMoney(row.outstanding, row.currency)} por cobrar
        </p>
      ) : null}
    </>
  );
}
