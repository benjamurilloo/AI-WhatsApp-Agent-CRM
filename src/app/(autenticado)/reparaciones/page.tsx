import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationTimezone } from "@/modules/organizations";
import { listServiceOrders, SERVICE_ORDERS_PAGE_SIZE } from "@/modules/service";
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
  hasActiveServiceOrderFilters,
  KIND_PARAMS,
  kindParam,
  parseServiceOrderFilters,
  serviceOrderFiltersHref,
  statusParam,
  STATUS_PARAMS,
  type SearchParams,
} from "./filters";
import {
  FORBIDDEN_ACTION_MESSAGE,
  KIND_LABEL,
  NO_OPEN_SERVICE_ORDERS_MESSAGE,
  NO_SERVICE_ORDER_RESULTS_MESSAGE,
  noticeMessage,
  SERVICE_ORDERS_TITLE,
  STATUS_LABEL,
  OWN_UNIT_TEXT,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_MODEL_TEXT,
  UNKNOWN_UNIT_TEXT,
} from "./messages";
import { RepairsSubNav, ServiceOrderStatusBadge } from "./sub-nav";

export const metadata: Metadata = {
  title: "Reparaciones — AI WhatsApp Agent CRM",
};

const FILTER_LABEL: Record<string, string> = {
  "en-curso": "En curso",
  todas: "Todas",
};

const KIND_FILTER_LABEL: Record<string, string> = {
  todos: "Todos",
  clientes: KIND_LABEL.customer_device,
  "unidades-propias": KIND_LABEL.own_unit,
  reclamos: KIND_LABEL.warranty_claim,
};

// La lista de órdenes de servicio (brief-29.6, D-10): la más nueva primero, con el filtro de estado,
// que arranca en las que están en curso, y la búsqueda por número, en la URL. Tabla en escritorio y
// tarjetas en móvil, como Compras. Los dos roles; «Nueva orden», solo admin. Sin la capacidad
// repairs, 404. Desde la 29.6.2 (brief-29.6.2, D-7), el filtro por tipo, y una orden de una unidad
// propia dice «Unidad propia» con el producto y el IMEI en lugar del cliente; nace desde las unidades del producto.
export default async function ServiceOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const filters = parseServiceOrderFilters(query);
  const result = await listServiceOrders(context, filters);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return (
      <PageNotice
        title={SERVICE_ORDERS_TITLE}
        message={FORBIDDEN_ACTION_MESSAGE}
      />
    );
  }
  const timeZone = await getOrganizationTimezone(context);
  const isAdmin = context.role === "admin";
  const filtered = hasActiveServiceOrderFilters(filters);
  const notice = noticeMessage(query.aviso);
  type Row = (typeof result.orders)[number];
  // Desde la 29.9.2, un reclamo de garantía tampoco se cobra (brief-29.9.2, D-2).
  const total = (order: Row) =>
    order.kind !== "customer_device"
      ? "No se cobra"
      : order.customerTotal !== null && order.customerCurrency !== null
        ? formatMoney(order.customerTotal, order.customerCurrency)
        : "Sin presupuesto";
  const subject = (order: Row) =>
    order.kind === "own_unit"
      ? [
          OWN_UNIT_TEXT,
          order.unitProductName,
          order.unitSerial ?? UNKNOWN_UNIT_TEXT,
        ]
          .filter(Boolean)
          .join(" · ")
      : order.kind === "warranty_claim"
        ? `${KIND_LABEL.warranty_claim} · ${order.clientName ?? UNKNOWN_CLIENT_TEXT}`
        : (order.clientName ?? UNKNOWN_CLIENT_TEXT);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title={SERVICE_ORDERS_TITLE}
        subtitle="Los equipos de los clientes y las unidades propias que pasan por el técnico."
        action={
          isAdmin
            ? { href: "/reparaciones/nueva", label: "+ Nueva orden" }
            : undefined
        }
      />
      <RepairsSubNav current="ordenes" />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      <form
        key={serviceOrderFiltersHref(filters)}
        method="get"
        action="/reparaciones"
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
              placeholder="OS-000123"
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
            {STATUS_PARAMS.map(([param, status]) => (
              <option key={param} value={param}>
                {FILTER_LABEL[param] ??
                  STATUS_LABEL[status as keyof typeof STATUS_LABEL]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="tipo" className={labelClass}>
            Tipo
          </label>
          <select
            id="tipo"
            name="tipo"
            defaultValue={kindParam(filters.kind)}
            className={selectClass}
          >
            {KIND_PARAMS.map(([param]) => (
              <option key={param} value={param}>
                {KIND_FILTER_LABEL[param]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={inlineButtonClass}>
          <Icon name="filter" className="size-4" />
          Aplicar filtros
        </button>
        {filtered ? (
          <Link href="/reparaciones" className={`${linkClass} py-2`}>
            Volver a las en curso
          </Link>
        ) : null}
      </form>

      {result.total === 0 ? (
        <EmptyState
          icon="wrench"
          title={
            filtered
              ? NO_SERVICE_ORDER_RESULTS_MESSAGE
              : NO_OPEN_SERVICE_ORDERS_MESSAGE
          }
          description={
            filtered
              ? "Probá con otro número, otro estado u otro tipo."
              : "Una orden de servicio registra el equipo de un cliente, o una unidad propia, que pasa por el técnico. Las terminadas y las canceladas están en «Todas»."
          }
          actions={[
            {
              href: "/reparaciones?estado=todas",
              label: "Ver todas",
              variant: "outline",
            },
            ...(isAdmin && !filtered
              ? [
                  {
                    href: "/reparaciones/nueva",
                    label: "Cargar una orden",
                    variant: "primary" as const,
                  },
                ]
              : []),
          ]}
        />
      ) : (
        <>
          <div className={`mt-8 hidden overflow-x-auto md:block ${cardClass}`}>
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Órdenes de servicio de la organización
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
                    Cliente o unidad
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Modelo
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    Presupuesto
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
                      <Link
                        href={`/reparaciones/${order.id}`}
                        className={linkClass}
                      >
                        {order.displayNumber}
                      </Link>
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      {formatShortDateTime(order.createdAt, timeZone)}
                    </td>
                    <td className={tableCellClass}>{subject(order)}</td>
                    <td className={tableCellClass}>
                      {order.modelName ?? UNKNOWN_MODEL_TEXT}
                    </td>
                    <td
                      className={`${tableCellClass} text-right whitespace-nowrap tabular-nums`}
                    >
                      {total(order)}
                    </td>
                    <td className={tableCellClass}>
                      <ServiceOrderStatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Órdenes de servicio de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.orders.map((order) => (
              <li key={order.id} className={`${cardClass} p-4`}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/reparaciones/${order.id}`}
                    className={`${linkClass} font-mono`}
                  >
                    {order.displayNumber}
                  </Link>
                  <ServiceOrderStatusBadge status={order.status} />
                </p>
                <p className="mt-1 font-semibold">{subject(order)}</p>
                <p className="mt-1 text-sm text-muted">
                  {order.modelName ?? UNKNOWN_MODEL_TEXT} ·{" "}
                  {formatShortDateTime(order.createdAt, timeZone)} ·{" "}
                  <span className="tabular-nums">{total(order)}</span>
                </p>
              </li>
            ))}
          </ul>

          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            rangeText={shownRangeText({
              page: result.page,
              pageSize: SERVICE_ORDERS_PAGE_SIZE,
              shown: result.orders.length,
              total: result.total,
              singular: "orden",
              plural: "órdenes",
            })}
            hrefFor={(target) =>
              serviceOrderFiltersHref({ ...filters, page: target })
            }
          />
        </>
      )}

      <p className="mt-6 text-sm text-muted">Fechas en {timeZone}.</p>
    </main>
  );
}
