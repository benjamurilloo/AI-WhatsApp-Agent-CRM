import type { Metadata } from "next";
import Link from "next/link";
import { getClientsByIds, suggestClients } from "@/modules/crm";
import {
  countOrdersByStatus,
  listOrders,
  ORDERS_PAGE_SIZE,
} from "@/modules/orders";
import { getOrganizationTimezone } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import {
  cardClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { EmptyState } from "@/app/_components/empty-state";
import { Icon } from "@/app/_components/icons";
import { PageHeader, SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
import { SubNav } from "@/app/_components/sub-nav";
import { normalizeForSuggest } from "@/app/_components/suggest-filter";
import { ClientFilter } from "./client-filter";
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
  clientFilterProblemMessage,
  EMPTY_ORDER_SUMMARY,
  FORBIDDEN_PAGE_MESSAGE,
  NO_ORDER_RESULTS_MESSAGE,
  NO_ORDERS_MESSAGE,
  orderOriginLabel,
  orderSummaryText,
  ORDERS_STATUS_LEGEND,
  ORDERS_SUBTITLE,
  STATUS_TAB_LABEL,
  STATUS_TABS,
  UNKNOWN_CLIENT_TEXT,
} from "./messages";
import { OrderStatusBadge } from "./status-badge";

export const metadata: Metadata = {
  title: "Pedidos — AI WhatsApp Agent CRM",
};

const TITLE = "Pedidos";

// Qué cliente filtra, a partir de los dos parámetros del buscador (brief-24.6.1, D-11). El id
// manda, porque es exacto. Sin él —el recorrido sin JavaScript— se resuelve el nombre escrito, y
// **solo** si hay una coincidencia exacta: con cero o con varias no se filtra por un cliente
// elegido a dedo, se dice qué pasó. La lectura de clientes se hace nada más cuando hay texto y no
// hay id, así que el caso común no la paga.
async function resolveClientFilter(
  context: Awaited<ReturnType<typeof requireSession>>,
  filters: { clientId: string; clientText: string },
): Promise<{ clientId: string; problem: "none" | "not-found" | "ambiguous" }> {
  if (filters.clientId) return { clientId: filters.clientId, problem: "none" };
  if (!filters.clientText) return { clientId: "", problem: "none" };
  const found = await suggestClients(context, filters.clientText);
  if (!found.ok) return { clientId: "", problem: "not-found" };
  const needle = normalizeForSuggest(filters.clientText);
  const exact = found.clients.filter(
    (client) => normalizeForSuggest(client.name) === needle,
  );
  if (exact.length === 1) return { clientId: exact[0]!.id, problem: "none" };
  return {
    clientId: "",
    problem: exact.length === 0 ? "not-found" : "ambiguous",
  };
}

// Pantalla 14: la lista de pedidos (brief-19.2, D-10), para admin y viewer. Filtros y página en la
// URL; tabla en escritorio y tarjetas en móvil. Desde la ficha de un cliente llega filtrada por él.
// Desde la 24.6.1 (brief-24.6.1; lámina 01 de la v2), el estado se elige en una barra de pestañas
// con el contador de cada uno, en vez de un `<select>`, y la tabla dice qué se pidió en la columna
// «Resumen». Los contadores y el listado se piden en paralelo: no dependen uno del otro.
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const filters = parseOrderFilters(await searchParams);
  const client = await resolveClientFilter(context, filters);
  // Un nombre que no resuelve no filtra por un cliente cualquiera: deja la lista vacía y lo dice.
  // Se consigue con un id imposible, que `listOrders` ya convierte en página vacía, en vez de con
  // una rama aparte que habría que acordarse de replicar en los contadores.
  const scopeId =
    client.problem === "none" ? client.clientId || null : "sin-cliente";
  const [result, counts] = await Promise.all([
    listOrders(context, {
      status: filters.status,
      clientId: scopeId,
      number: filters.number,
      page: filters.page,
    }),
    countOrdersByStatus(context, {
      clientId: scopeId,
      number: filters.number,
    }),
  ]);
  if (!result.ok || !counts.ok) {
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
        subtitle={ORDERS_SUBTITLE}
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
        {/* El estado ya no es un campo del formulario: es la barra de pestañas de abajo, que son
            enlaces. El que esté elegido viaja igual al enviar el buscador, para que buscar un
            número dentro de «Pendientes» no te devuelva a «Todos». */}
        {filters.status !== "all" ? (
          <input
            type="hidden"
            name="estado"
            value={statusParam(filters.status)}
          />
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="clienteNombre" className={labelClass}>
            Cliente
          </label>
          <ClientFilter
            id="clienteNombre"
            className={`${inputClass} w-full sm:w-64`}
            initialId={filters.clientId}
            initialText={clientName ?? filters.clientText}
          />
        </div>
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Buscar
        </button>
        {filtered ? (
          <Link href="/pedidos" className={`${linkClass} py-2`}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {/* La barra de estados de la lámina 01, con el contador de cada uno. Cada contador cuenta
          dentro del ámbito de cliente y número que esté puesto, y **no** del estado elegido: por
          eso «Pendientes (3)» sigue diciendo 3 mientras mirás «Entregados». */}
      <SubNav
        label="Estado de los pedidos"
        scroll
        items={STATUS_TABS.map((status) => ({
          href: orderFiltersHref({ ...filters, status, page: 1 }),
          label: STATUS_TAB_LABEL[status],
          current: filters.status === status,
          count: counts.counts[status],
        }))}
      />

      {client.problem !== "none" ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-danger">
          {clientFilterProblemMessage(client.problem, filters.clientText)}
        </p>
      ) : filters.clientId ? (
        <p className="mt-4 text-sm">
          Pedidos de{" "}
          <span className="font-semibold">
            {clientName ?? UNKNOWN_CLIENT_TEXT}
          </span>
          .{" "}
          <Link
            href={orderFiltersHref({
              ...filters,
              clientId: "",
              clientText: "",
              page: 1,
            })}
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
                    Pedido
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Cliente
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Resumen
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
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
                  <th scope="col" className={tableHeadCellClass}>
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.orders.map((order) => (
                  <tr key={order.id}>
                    {/* El número y la fecha en la misma celda, como la lámina: son la identidad
                        del pedido y juntos liberan una columna. */}
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      <Link
                        href={`/pedidos/${order.id}`}
                        className={`${linkClass} font-mono`}
                      >
                        {order.displayNumber}
                      </Link>
                      <span className="block text-xs text-muted">
                        {formatShortDateTime(order.createdAt, timeZone)}
                      </span>
                    </td>
                    <td className={tableCellClass}>
                      {clientText(order.clientName)}
                    </td>
                    <td className={tableCellClass}>
                      {order.lineCount === 0
                        ? EMPTY_ORDER_SUMMARY
                        : orderSummaryText(order)}
                    </td>
                    <td className={tableCellClass}>
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className={tableCellClass}>
                      {orderOriginLabel(order.createdByCredentialId)}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {formatMoney(order.total, order.currency)}
                    </td>
                    <td className={tableCellClass}>
                      <Link
                        href={`/pedidos/${order.id}`}
                        className={inlineButtonClass}
                      >
                        Ver
                        <span className="sr-only">
                          {" "}
                          el pedido {order.displayNumber}
                        </span>
                      </Link>
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
                <p className="mt-1 text-sm">
                  {order.lineCount === 0
                    ? EMPTY_ORDER_SUMMARY
                    : orderSummaryText(order)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {formatShortDateTime(order.createdAt, timeZone)} ·{" "}
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

      {/* La leyenda de la lámina: qué compromete cada estado. La columna «Estado» dice el nombre;
          esto dice la consecuencia, que es lo que el usuario necesita antes de confirmar o
          entregar. */}
      <p className="mt-6 flex items-start gap-2 text-sm text-muted">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" />
        <span>
          {ORDERS_STATUS_LEGEND} Fechas en {timeZone}.
        </span>
      </p>
    </main>
  );
}
