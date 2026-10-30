import Link from "next/link";
import type { AuthContext } from "@/modules/organizations";
import { EmptyState } from "@/app/_components/empty-state";
import {
  cardClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  secondaryLinkClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon, type IconName } from "@/app/_components/icons";
import { moreActionItemClass } from "@/app/_components/more-action-styles";
import { MoreActions } from "@/app/_components/more-actions";
import { SearchIcon } from "@/app/_components/page-header";
import { Pagination } from "@/app/_components/pagination";
import { StatusBadge } from "@/app/_components/status-badge";
import { calendarDayIn } from "@/app/_format/date-time";
import { formatMoney } from "@/shared/money";
import { OrderStatusBadge } from "@/app/(autenticado)/pedidos/status-badge";
import { ServiceOrderStatusBadge } from "@/app/(autenticado)/reparaciones/sub-nav";
import { AppointmentStatusBadge } from "@/app/(autenticado)/turnos/sub-nav";
import { TradeInStatusBadge } from "@/app/(autenticado)/usados/sub-nav";
import type { SearchParams } from "../filters";
import { ClientUnits } from "./client-units";
import { readClientOperations } from "./operations-data";
import {
  buildOperationsView,
  hasActiveOperationFilters,
  OPERATION_LABEL,
  OPERATION_PLURAL,
  OPERATION_TYPES,
  operationDateText,
  operationFiltersHref,
  operationsEmptyTitle,
  operationsRangeText,
  parseOperationFilters,
  toOperationRows,
  type OperationRow,
  type OperationType,
} from "./operations-rows";
import { clientTabHref } from "./tabs";

// La pestaña Operaciones de la ficha (brief-24.4.3, D-1 a D-4; mockup 04): las cinco fuentes en una
// tabla, con chips, búsqueda y filtros por la URL, sin JavaScript. Tarjetas en el teléfono. «Equipos»
// sigue debajo, porque de ahí sale el reclamo de garantía (H-10).

const OPERATION_ICON: Record<OperationType, IconName> = {
  venta: "receipt",
  pedido: "list",
  reparacion: "wrench",
  turno: "calendar",
  usado: "smartphone",
};

const NEW_OPERATION: Record<OperationType, { href: string; label: string }> = {
  venta: { href: "/ventas/nueva", label: "Venta" },
  pedido: { href: "/pedidos/nuevo", label: "Pedido" },
  reparacion: { href: "/reparaciones/nueva", label: "Reparación" },
  turno: { href: "/turnos/nuevo", label: "Turno" },
  usado: { href: "/usados/nuevo", label: "Usado" },
};

// Las listas de los módulos que se filtran por cliente, para el aviso del tope (D-2).
const LIST_BY_CLIENT: Partial<Record<OperationType, string>> = {
  venta: "/ventas",
  pedido: "/pedidos",
};

const chipClass =
  "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function OperationStatusBadge({ row }: { row: OperationRow }) {
  const { status } = row;
  switch (status.type) {
    case "venta":
      return (
        <StatusBadge
          tone={status.voided ? "neutral" : "success"}
          icon={status.voided ? "circleX" : "circleCheck"}
        >
          {status.voided ? "Anulada" : "Completada"}
        </StatusBadge>
      );
    case "usado":
      return <TradeInStatusBadge voided={status.voided} />;
    case "pedido":
      return <OrderStatusBadge status={status.status} />;
    case "reparacion":
      return <ServiceOrderStatusBadge status={status.status} />;
    case "turno":
      return <AppointmentStatusBadge status={status.status} />;
  }
}

function amountText(row: OperationRow): string {
  return row.amount ? formatMoney(row.amount.amount, row.amount.currency) : "—";
}

function TypeCell({ type }: { type: OperationType }) {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"
      >
        <Icon name={OPERATION_ICON[type]} className="size-5" />
      </span>
      {OPERATION_LABEL[type]}
    </span>
  );
}

function DetailLink({ row }: { row: OperationRow }) {
  return (
    <Link href={row.href} className={secondaryLinkClass}>
      Ver detalle
      <span className="sr-only">
        {" "}
        de {OPERATION_LABEL[row.type].toLowerCase()} {row.title}
      </span>
      <Icon name="chevronRight" className="size-4" />
    </Link>
  );
}

export async function OperationsTab({
  context,
  clientId,
  clientName,
  clientActive,
  timeZone,
  query,
}: {
  context: AuthContext;
  clientId: string;
  clientName: string;
  clientActive: boolean;
  timeZone: string;
  query: SearchParams;
}) {
  const data = await readClientOperations(context, clientId);
  const today = calendarDayIn(timeZone);
  const parsed = parseOperationFilters(query);
  // Un tipo sin capacidad o que no se pudo leer, en la URL, vale «Todas».
  const filters =
    parsed.type !== "todas" && data.totals[parsed.type] === undefined
      ? { ...parsed, type: "todas" as const }
      : parsed;
  const rows = toOperationRows(data.sources, timeZone, today);
  const view = buildOperationsView(rows, filters, data.totals, today);

  const offered = OPERATION_TYPES.filter(
    (type) => data.totals[type] !== undefined,
  );
  const capped = OPERATION_TYPES.filter((type) => {
    const total = data.totals[type];
    if (total === undefined) return false;
    return total > rows.filter((row) => row.type === type).length;
  });
  const newOperations = OPERATION_TYPES.filter(
    (type) =>
      type === "venta" ||
      type === "pedido" ||
      (type === "reparacion" && data.capabilities.repairs) ||
      (type === "turno" && data.capabilities.appointments) ||
      (type === "usado" && data.capabilities.tradeIns),
  );
  const firstName = clientName.split(/\s+/)[0] ?? clientName;
  const filtered = hasActiveOperationFilters(filters);
  const clearHref = operationFiltersHref(clientId, {
    type: filters.type,
    search: "",
    state: "todos",
    date: "todas",
    page: 1,
  });

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section
        aria-labelledby="operaciones-titulo"
        className={`${cardClass} min-w-0 p-4 sm:p-6`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="operaciones-titulo"
            className="min-w-0 text-xl font-bold tracking-tight"
          >
            Operaciones de {firstName}
          </h2>
          {context.role === "admin" && clientActive ? (
            // A la derecha aunque baje de línea en el teléfono: la lista se alinea a ese borde y, a la
            // izquierda, se saldría de la pantalla.
            <div className="ml-auto">
              <MoreActions
                id="nueva-operacion"
                label="Nueva operación"
                primaryText="Nueva operación"
              >
                {newOperations.map((type) => (
                  <li key={type}>
                    <Link
                      href={`${NEW_OPERATION[type].href}?cliente=${clientId}`}
                      className={moreActionItemClass}
                    >
                      <Icon name={OPERATION_ICON[type]} className="size-4" />
                      {NEW_OPERATION[type].label}
                    </Link>
                  </li>
                ))}
              </MoreActions>
            </div>
          ) : null}
        </div>

        <nav aria-label="Tipos de operación" className="mt-4">
          <ul className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {(["todas", ...offered] as const).map((type) => {
              const current = filters.type === type;
              return (
                <li key={type}>
                  <Link
                    href={operationFiltersHref(clientId, {
                      ...filters,
                      type,
                      page: 1,
                    })}
                    aria-current={current ? "page" : undefined}
                    className={`${chipClass} ${current ? "border-primary bg-primary-soft text-on-primary-soft" : "border-border bg-surface text-foreground hover:bg-surface-muted"}`}
                  >
                    <Icon
                      name={type === "todas" ? "package" : OPERATION_ICON[type]}
                      className="size-4"
                    />
                    {type === "todas" ? "Todas" : OPERATION_PLURAL[type]}{" "}
                    {/* Con un módulo sin leer, «Todas» no tiene una cantidad que decir. */}
                    {type === "todas" && data.failed.length > 0 ? null : (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-foreground tabular-nums">
                        {type === "todas" ? view.countAll : view.counts[type]}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <form
          key={operationFiltersHref(clientId, filters)}
          method="get"
          action={`/clientes/${clientId}`}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="pestana" value="operaciones" />
          {filters.type !== "todas" ? (
            <input type="hidden" name="tipo" value={filters.type} />
          ) : null}
          <div className="flex min-w-0 grow basis-64 flex-col gap-1">
            <label htmlFor="operaciones-buscar" className={labelClass}>
              Buscar
            </label>
            <div className="relative">
              <SearchIcon />
              <input
                id="operaciones-buscar"
                type="search"
                name="buscar"
                defaultValue={filters.search}
                placeholder="Buscar número o equipo"
                className={`${inputClass} w-full pl-9`}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="operaciones-estado" className={labelClass}>
              Estado
            </label>
            <select
              id="operaciones-estado"
              name="estado"
              defaultValue={filters.state}
              className={selectClass}
            >
              <option value="todos">Todos</option>
              <option value="en_curso">En curso</option>
              <option value="cerradas">Cerradas</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="operaciones-fecha" className={labelClass}>
              Fecha
            </label>
            <select
              id="operaciones-fecha"
              name="fecha"
              defaultValue={filters.date}
              className={selectClass}
            >
              <option value="todas">Todas</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
            </select>
          </div>
          <button type="submit" className={inlineButtonClass}>
            <Icon name="filter" className="size-4" />
            Filtrar
          </button>
          {filtered ? (
            <Link href={clearHref} className={`${linkClass} py-2`}>
              Limpiar filtros
            </Link>
          ) : null}
        </form>

        {data.failed.length > 0 ? (
          <p
            role="status"
            className="mt-4 flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-on-warning-soft"
          >
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            <span>
              No se pudieron leer:{" "}
              {data.failed
                .map((type) => OPERATION_PLURAL[type].toLowerCase())
                .join(", ")}
              . Las demás operaciones se muestran igual.
            </span>
          </p>
        ) : null}
        {capped.length > 0 ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-border px-4 py-3 text-sm">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            <span>
              Se muestran las 200 más recientes de cada tipo.
              {capped.flatMap((type) => {
                const list = LIST_BY_CLIENT[type];
                return list
                  ? [
                      <span key={type}>
                        {" "}
                        <Link
                          href={`${list}?cliente=${clientId}`}
                          className={linkClass}
                        >
                          Ver {OPERATION_PLURAL[type].toLowerCase()}
                        </Link>
                      </span>,
                    ]
                  : [];
              })}
            </span>
          </p>
        ) : null}

        {view.rows.length === 0 ? (
          <EmptyState
            icon={filtered ? "search" : "package"}
            title={operationsEmptyTitle(filters, data.failed)}
            description={
              filtered
                ? "Probá con otros términos o ajustá los filtros."
                : undefined
            }
            actions={
              filtered
                ? [
                    {
                      href: clearHref,
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
            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full border-collapse text-left text-[0.9375rem]">
                <caption className="sr-only">
                  Operaciones de {clientName}, de la más nueva a la más vieja.
                  Los importes no se suman.
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Tipo
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Referencia y detalle
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Fecha
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Estado
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      Importe
                    </th>
                    <th scope="col" className={tableHeadCellClass}>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={`${row.type}-${row.id}`}>
                      <td className={`${tableCellClass} whitespace-nowrap`}>
                        <TypeCell type={row.type} />
                      </td>
                      <td className={tableCellClass}>
                        <p
                          className={`font-semibold ${row.reference ? "font-mono" : ""}`}
                        >
                          {row.title}
                        </p>
                        <p className="text-sm text-muted">{row.detail}</p>
                      </td>
                      <td className={`${tableCellClass} whitespace-nowrap`}>
                        {operationDateText(row.dateKey)}
                      </td>
                      <td className={tableCellClass}>
                        <OperationStatusBadge row={row} />
                      </td>
                      <td
                        className={`${tableCellClass} whitespace-nowrap tabular-nums`}
                      >
                        {amountText(row)}
                      </td>
                      <td className={`${tableCellClass} text-right`}>
                        <DetailLink row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul
              aria-label={`Operaciones de ${clientName}`}
              className="mt-4 flex flex-col gap-3 md:hidden"
            >
              {view.rows.map((row) => (
                <li
                  key={`${row.type}-${row.id}`}
                  className="rounded-xl border border-border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <TypeCell type={row.type} />
                    <OperationStatusBadge row={row} />
                  </div>
                  <p
                    className={`mt-3 font-semibold break-words ${row.reference ? "font-mono" : ""}`}
                  >
                    {row.title}
                  </p>
                  <p className="text-sm break-words text-muted">{row.detail}</p>
                  <p className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                    <span>{operationDateText(row.dateKey)}</span>
                    <span className="font-semibold tabular-nums">
                      {amountText(row)}
                    </span>
                  </p>
                  <div className="mt-3 [&>a]:w-full">
                    <DetailLink row={row} />
                  </div>
                </li>
              ))}
            </ul>

            <Pagination
              page={view.page}
              pageCount={view.pageCount}
              rangeText={operationsRangeText(view)}
              hrefFor={(page) =>
                operationFiltersHref(clientId, { ...filters, page })
              }
              label="Paginación de las operaciones"
              className="mt-4"
            />
          </>
        )}

        <p className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-primary-soft/40 px-4 py-3 text-sm">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          <span>
            Los importes corresponden a cada operación. Consultá pagos y saldos
            en{" "}
            <Link
              href={clientTabHref(clientId, "cuenta")}
              className="font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Cuenta corriente
            </Link>
            .
          </span>
        </p>
      </section>

      {/* Los equipos que compró, con la capacidad serialized_units (brief-29.9, D-3). */}
      <div className="empty:hidden">
        <ClientUnits context={context} clientId={clientId} />
      </div>
    </div>
  );
}
