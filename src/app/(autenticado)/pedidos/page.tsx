import type { Metadata } from "next";
import Link from "next/link";
import { getClientsByIds } from "@/modules/crm";
import { listOrders, ORDERS_PAGE_SIZE } from "@/modules/orders";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
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
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { formatShortDateTime } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import {
  hasActiveOrderFilters,
  orderFiltersHref,
  parseOrderFilters,
  statusParam,
  type SearchParams,
} from "./filters";
import {
  AGENT_ORIGIN_LABEL,
  FORBIDDEN_PAGE_MESSAGE,
  NO_ORDER_RESULTS_MESSAGE,
  NO_ORDERS_MESSAGE,
  orderOriginLabel,
  UNKNOWN_CLIENT_TEXT,
} from "./messages";
import { OrderStatusBadge } from "./status-badge";

export const metadata: Metadata = {
  title: "Pedidos — AI WhatsApp Agent CRM",
};

const TITLE = "Pedidos";

// Pantalla 14: la lista de pedidos (brief-19.2, D-10), para admin y viewer. Filtros y página en la
// URL; tabla en escritorio y tarjetas en móvil. Desde la ficha de un cliente llega filtrada por él.
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseOrderFilters(await searchParams);
  const result = await listOrders(context, {
    status: filters.status,
    clientId: filters.clientId || null,
    number: filters.number,
    page: filters.page,
  });
  if (!result.ok) {
    return <PageNotice title={TITLE} message={FORBIDDEN_PAGE_MESSAGE} />;
  }
  const timeZone = await getOrganizationTimezone(context);
  const filteredClient = filters.clientId
    ? await getClientsByIds(context, [filters.clientId])
    : null;
  const clientName = filteredClient?.ok
    ? filteredClient.clients[0]?.displayName
    : undefined;

  const filtered = hasActiveOrderFilters(filters);
  const isAdmin = context.role === "admin";
  const clientText = (name: string | null) => name ?? UNKNOWN_CLIENT_TEXT;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={TITLE}
        subtitle="Los pedidos de tus clientes, con su número, su total y su estado."
        action={
          isAdmin ? { href: "/pedidos/nuevo", label: "+ Nuevo pedido" } : null
        }
      />

      <form
        key={orderFiltersHref(filters)}
        method="get"
        action="/pedidos"
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
              placeholder="P-000123"
              autoComplete="off"
              className={`${inputClass} w-48 pl-9`}
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
            <option value="todos">Todos</option>
            <option value="pendientes">Pendientes</option>
            <option value="confirmados">Confirmados</option>
            <option value="entregados">Entregados</option>
            <option value="cancelados">Cancelados</option>
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
          <Link href="/pedidos" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {filters.clientId ? (
        <p className="mt-4 text-sm">
          Pedidos de{" "}
          <span className="font-semibold">
            {clientName ?? UNKNOWN_CLIENT_TEXT}
          </span>
          .{" "}
          <Link
            href={orderFiltersHref({ ...filters, clientId: "", page: 1 })}
            className={linkClass}
          >
            Ver los de todos los clientes
          </Link>
        </p>
      ) : null}

      {result.total === 0 ? (
        <EmptyState
          icon="list"
          title={filtered ? NO_ORDER_RESULTS_MESSAGE : NO_ORDERS_MESSAGE}
          description={
            filtered
              ? "Probá con otras palabras o quitá algún filtro."
              : "Los pedidos que cargues o que deje el agente aparecen acá, con su estado."
          }
          actions={
            filtered
              ? [
                  {
                    href: "/pedidos",
                    label: "Limpiar filtros",
                    variant: "outline",
                  },
                ]
              : isAdmin
                ? [
                    {
                      href: "/pedidos/nuevo",
                      label: "Crear el primero",
                      variant: "primary",
                    },
                  ]
                : []
          }
        />
      ) : (
        <>
          <div className={`mt-8 hidden overflow-x-auto md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Pedidos de la organización</caption>
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
                  <th scope="col" className={tableHeadCellClass}>
                    Origen
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.orders.map((order) => (
                  <tr key={order.id}>
                    <td
                      className={`${tableCellClass} font-mono whitespace-nowrap`}
                    >
                      <Link href={`/pedidos/${order.id}`} className={linkClass}>
                        {order.displayNumber}
                      </Link>
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(order.createdAt, timeZone)}
                    </td>
                    <td className={tableCellClass}>
                      {clientText(order.clientName)}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>
                      {order.lineCount}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(order.total, order.currency)}
                    </td>
                    <td className={tableCellClass}>
                      {orderOriginLabel(order.createdByCredentialId)}
                    </td>
                    <td className={tableCellClass}>
                      <OrderStatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Pedidos de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.orders.map((order) => (
              <li key={order.id} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/pedidos/${order.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {order.displayNumber}
                  </Link>
                  <OrderStatusBadge status={order.status} />
                </p>
                <p className="mt-1 font-semibold">
                  {clientText(order.clientName)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {formatShortDateTime(order.createdAt, timeZone)} ·{" "}
                  {order.lineCount} {order.lineCount === 1 ? "línea" : "líneas"}{" "}
                  ·{" "}
                  <span className="tabular-nums">
                    {formatMoney(order.total, order.currency)}
                  </span>
                  {order.createdByCredentialId !== null
                    ? ` · ${AGENT_ORIGIN_LABEL}`
                    : null}
                </p>
              </li>
            ))}
          </ul>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            rangeText={shownRangeText({
              page: result.page,
              pageSize: ORDERS_PAGE_SIZE,
              shown: result.orders.length,
              total: result.total,
              singular: "pedido",
              plural: "pedidos",
            })}
            hrefFor={(target) => orderFiltersHref({ ...filters, page: target })}
          />
        </>
      )}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
