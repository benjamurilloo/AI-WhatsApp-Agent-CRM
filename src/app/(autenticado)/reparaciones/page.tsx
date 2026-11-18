import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listTechnicians } from "@/modules/purchasing";
import {
  getServiceOrderCounts,
  listServiceOrders,
  SERVICE_ORDERS_PAGE_SIZE,
} from "@/modules/service";
import { requireSession } from "@/app/_auth/session";
import { ActionNotice } from "@/app/_components/action-notice";
import { EmptyState } from "@/app/_components/empty-state";
import {
  cardClass,
  iconTileClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  mutedTextClass,
  pageSubtitleClass,
  pageTitleClass,
  primaryLinkClass,
  secondaryLinkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon, type IconName } from "@/app/_components/icons";
import { SearchIcon } from "@/app/_components/page-header";
import { PageNotice } from "@/app/_components/page-notice";
import { Pagination, shownRangeText } from "@/app/_components/pagination";
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
  AMOUNTS_NOT_SUMMED_NOTE,
  CUSTOMER_AMOUNT_HEADING,
  FORBIDDEN_ACTION_MESSAGE,
  KIND_LABEL,
  NO_CHARGE_TEXT,
  NO_NEXT_STEP_TEXT,
  NO_OPEN_SERVICE_ORDERS_MESSAGE,
  NO_QUOTE_TEXT,
  NO_SERVICE_ORDER_RESULTS_MESSAGE,
  noticeMessage,
  NOT_APPLICABLE_TEXT,
  SERVICE_ORDER_COUNTERS,
  SERVICE_ORDERS_SUBTITLE,
  SERVICE_ORDERS_TITLE,
  STATUS_LABEL,
  UNKNOWN_CLIENT_TEXT,
  UNKNOWN_MODEL_TEXT,
  UNKNOWN_UNIT_TEXT,
} from "./messages";
import { nextServiceOrderStep } from "./next-step";
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

// Tipado por las claves reales de las tarjetas: si mañana se agrega una, el ícono falta en
// compilación en lugar de salir undefined en la pantalla.
const COUNTER_ICON: Record<
  (typeof SERVICE_ORDER_COUNTERS)[number]["key"],
  IconName
> = {
  open: "wrench",
  toQuote: "fileText",
  readyToDeliver: "package",
  openClaims: "shield",
};

// La lista de órdenes de servicio (brief-29.6, D-10): la más nueva primero, con el filtro de estado,
// que arranca en las que están en curso, y la búsqueda, en la URL. Tabla en escritorio y tarjetas en
// móvil, como Compras. Los dos roles; «Nueva orden», solo admin. Sin la capacidad repairs, 404.
// Desde la 29.6.2 (brief-29.6.2, D-7), el filtro por tipo, y una orden de una unidad propia dice
// «Unidad propia» con su IMEI en lugar del cliente; nace desde las unidades del producto.
//
// Rediseñada en la 24.9.1 con la lámina 01:
//   - **Cuatro tarjetas de contadores** (D-2), que responden a los filtros **menos el estado** y se
//     cuentan sobre toda la organización, nunca sobre la página.
//   - **«Próximo paso»** (V-3), derivado del tipo y del estado, sin ninguna lectura nueva.
//   - El **buscador** encuentra por número **o** por modelo del equipo (D-3). No busca por nombre de
//     cliente: la guarda module-boundary no deja que service lea la tabla de clientes, y el buscador
//     global ya los encuentra desde la 24.2.
//   - La columna **«Importe al cliente»**, con un texto distinto por tipo cuando no hay importe, que
//     nunca se dibuja como cero (I-7).
//   - **Sale la columna «Fecha»** (V-1): queda en la ficha y en la actividad.
//   - **No** entran el filtro «Fecha» (D-4), el menú «⋯» (D-5) ni la entrada «Técnicos» de la
//     navegación (V-4), que se descartó con la 24.8.2-c.
export default async function ServiceOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireSession();
  const query = await searchParams;
  const filters = parseServiceOrderFilters(query);
  // Lo que la tabla y los contadores comparten. El estado y la página quedan afuera a propósito:
  // es lo que hace que las cuatro tarjetas no cambien al pasar de página ni al cambiar el estado.
  const shared = {
    kind: filters.kind,
    number: filters.text,
    technicianId: filters.technicianId,
    searchModels: true,
  };
  const [result, counted] = await Promise.all([
    listServiceOrders(context, {
      ...shared,
      status: filters.status,
      page: filters.page,
    }),
    getServiceOrderCounts(context, shared),
  ]);
  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return (
      <PageNotice
        title={SERVICE_ORDERS_TITLE}
        message={FORBIDDEN_ACTION_MESSAGE}
      />
    );
  }
  const counts = counted.ok ? counted.counts : null;
  const isAdmin = context.role === "admin";
  // El filtro por técnico (brief-24.8.2-b, D-5): la lista de técnicos es de purchasing y es solo de
  // admin, así que a un vendedor no se le dibuja el control. El filtro de la URL sigue valiendo para
  // los dos, en un campo oculto, como el «Tipo» del listado de proveedores.
  const technicians = isAdmin ? await listTechnicians(context) : null;
  const technicianOptions = technicians?.ok ? technicians.technicians : [];
  const filtered = hasActiveServiceOrderFilters(filters);
  const notice = noticeMessage(query.aviso);
  type Row = (typeof result.orders)[number];
  // Lo que se le cobra al cliente. Los tres tipos dicen cosas distintas cuando no hay importe, y
  // ninguna es un cero: una unidad propia no se cobra nunca, un reclamo tampoco (brief-29.9.2, D-2)
  // y un equipo de cliente todavía no tiene presupuesto.
  const amount = (order: Row): { text: string; muted: boolean } =>
    order.kind === "own_unit"
      ? { text: NOT_APPLICABLE_TEXT, muted: true }
      : order.kind === "warranty_claim"
        ? { text: NO_CHARGE_TEXT, muted: true }
        : order.customerTotal !== null && order.customerCurrency !== null
          ? {
              text: formatMoney(order.customerTotal, order.customerCurrency),
              muted: false,
            }
          : { text: NO_QUOTE_TEXT, muted: true };
  // La segunda línea de «Tipo y cliente»: el cliente, o el IMEI de la unidad propia, que no tiene.
  const detail = (order: Row) =>
    order.kind === "own_unit"
      ? (order.unitSerial ?? order.unitProductName ?? UNKNOWN_UNIT_TEXT)
      : (order.clientName ?? UNKNOWN_CLIENT_TEXT);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* El encabezado lleva dos acciones y `PageHeader` acepta una sola. Es un componente
          compartido y está fuera de la lista cerrada de archivos de esta subfase, así que el bloque
          se arma acá con sus mismas clases en vez de cambiarlo para todas las pantallas. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={pageTitleClass}>{SERVICE_ORDERS_TITLE}</h1>
          <p className={pageSubtitleClass}>{SERVICE_ORDERS_SUBTITLE}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <Link href="/reparaciones/nueva" className={primaryLinkClass}>
              + Nueva orden
            </Link>
          ) : null}
          <Link href="/reparaciones/lista" className={secondaryLinkClass}>
            <Icon name="list" className="size-4" />
            Lista de reparaciones
          </Link>
        </div>
      </div>
      <RepairsSubNav current="ordenes" />

      <div role="status" className="mt-4 empty:hidden">
        {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      </div>

      {counts ? (
        <section aria-labelledby="contadores-titulo" className="mt-6">
          <h2 id="contadores-titulo" className="sr-only">
            Resumen en números
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICE_ORDER_COUNTERS.map((counter) => (
              <div key={counter.key} className={`${cardClass} p-4`}>
                <div className="flex items-center gap-3">
                  <span className={iconTileClass}>
                    <Icon name={COUNTER_ICON[counter.key]} />
                  </span>
                  <p className="min-w-0">
                    <span className="block text-sm text-muted">
                      {counter.label}
                    </span>
                    <span className="block text-2xl font-extrabold tracking-tight tabular-nums">
                      {counts[counter.key]}
                    </span>
                  </p>
                </div>
                <p className="mt-3 text-sm text-muted">{counter.note}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <form
        key={serviceOrderFiltersHref(filters)}
        method="get"
        action="/reparaciones"
        className={`${cardClass} mt-6 flex flex-wrap items-end gap-3 p-4`}
      >
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <label htmlFor="buscar" className={labelClass}>
            Buscar
          </label>
          <div className="relative">
            <input
              id="buscar"
              name="buscar"
              type="search"
              defaultValue={filters.text}
              placeholder="Buscar orden o equipo…"
              autoComplete="off"
              className={`${inputClass} pl-9`}
            />
            <SearchIcon />
          </div>
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
        {technicianOptions.length > 0 ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="tecnico" className={labelClass}>
              Técnico
            </label>
            <select
              id="tecnico"
              name="tecnico"
              defaultValue={filters.technicianId}
              className={selectClass}
            >
              <option value="">Todos</option>
              {technicianOptions.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.name}
                </option>
              ))}
            </select>
          </div>
        ) : filters.technicianId !== "" ? (
          <input type="hidden" name="tecnico" value={filters.technicianId} />
        ) : null}
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
              ? "Probá con otro número, otro equipo, otro estado u otro tipo."
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
                    Orden
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Tipo y cliente
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Equipo
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Estado
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    Próximo paso
                  </th>
                  <th
                    scope="col"
                    className={`${tableHeadCellClass} text-right`}
                  >
                    {CUSTOMER_AMOUNT_HEADING}
                  </th>
                  <th scope="col" className={tableHeadCellClass}>
                    <span className="sr-only">Ver la orden</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.orders.map((order) => {
                  const step = nextServiceOrderStep(order);
                  const money = amount(order);
                  return (
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
                      <td className={tableCellClass}>
                        <span className="block">{KIND_LABEL[order.kind]}</span>
                        <span className="block text-sm text-muted">
                          {detail(order)}
                        </span>
                      </td>
                      <td className={tableCellClass}>
                        {order.modelName ?? UNKNOWN_MODEL_TEXT}
                      </td>
                      <td className={tableCellClass}>
                        <ServiceOrderStatusBadge status={order.status} />
                      </td>
                      <td className={tableCellClass}>
                        {step ?? (
                          <span className="text-muted">
                            {NO_NEXT_STEP_TEXT}
                          </span>
                        )}
                      </td>
                      <td
                        className={`${tableCellClass} text-right whitespace-nowrap tabular-nums ${money.muted ? "text-muted" : ""}`}
                      >
                        {money.text}
                      </td>
                      <td className={`${tableCellClass} w-px`}>
                        <Link
                          href={`/reparaciones/${order.id}`}
                          className="grid size-9 place-items-center rounded-xl text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          <Icon name="chevronRight" className="size-4" />
                          <span className="sr-only">
                            Ver la orden {order.displayNumber}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul
            aria-label="Órdenes de servicio de la organización"
            className="mt-6 flex flex-col gap-3 md:hidden"
          >
            {result.orders.map((order) => {
              const step = nextServiceOrderStep(order);
              const money = amount(order);
              return (
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
                  <p className="mt-1 font-semibold">{KIND_LABEL[order.kind]}</p>
                  <p className="text-sm text-muted">{detail(order)}</p>
                  <p className="mt-2 text-sm">
                    {order.modelName ?? UNKNOWN_MODEL_TEXT} ·{" "}
                    <span
                      className={`tabular-nums ${money.muted ? "text-muted" : ""}`}
                    >
                      {money.text}
                    </span>
                  </p>
                  {step ? (
                    <p className="mt-2 text-sm font-semibold">
                      Próximo paso: {step}
                    </p>
                  ) : null}
                </li>
              );
            })}
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

      <p className={`mt-6 ${mutedTextClass}`}>{AMOUNTS_NOT_SUMMED_NOTE}</p>
    </main>
  );
}
