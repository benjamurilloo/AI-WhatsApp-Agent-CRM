import type { ClientOperationAppointment } from "@/modules/appointments";
import type { ClientOperationOrder } from "@/modules/orders";
import type { ClientOperationSale } from "@/modules/sales";
import type { ClientOperationServiceOrder } from "@/modules/service";
import type { ClientOperationTradeIn } from "@/modules/tradeins";
import { warrantyText } from "@/app/(autenticado)/_warranty/warranty-text";
import { formatRange } from "@/app/(autenticado)/turnos/messages";
import {
  KIND_LABEL,
  UNKNOWN_MODEL_TEXT,
} from "@/app/(autenticado)/reparaciones/messages";
import {
  DESTINATION_SHORT_LABEL,
  UNKNOWN_PRODUCT_TEXT,
} from "@/app/(autenticado)/usados/messages";
import type { SearchParams } from "../filters";

// La tabla de Operaciones de la ficha (brief-24.4.3, D-1 a D-3), pura: unir lo que da cada módulo en
// un solo orden, filtrar y paginar. No se suma ningún importe: cada fila conserva el suyo.

export const OPERATION_TYPES = [
  "venta",
  "pedido",
  "reparacion",
  "turno",
  "usado",
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

export const OPERATION_LABEL: Record<OperationType, string> = {
  venta: "Venta",
  pedido: "Pedido",
  reparacion: "Reparación",
  turno: "Turno",
  usado: "Usado",
};

export const OPERATION_PLURAL: Record<OperationType, string> = {
  venta: "Ventas",
  pedido: "Pedidos",
  reparacion: "Reparaciones",
  turno: "Turnos",
  usado: "Usados",
};

export type OperationStatus =
  | { type: "venta" | "usado"; voided: boolean }
  | { type: "pedido"; status: ClientOperationOrder["status"] }
  | { type: "reparacion"; status: ClientOperationServiceOrder["status"] }
  | { type: "turno"; status: ClientOperationAppointment["status"] };

export type OperationRow = {
  type: OperationType;
  id: string;
  href: string;
  // El número; un turno no tiene (H-6) y se identifica por su motivo.
  reference: string | null;
  title: string;
  detail: string;
  // Fecha y hora locales, «YYYY-MM-DD HH:MM», que se comparan como texto.
  dateKey: string;
  status: OperationStatus;
  // null: un turno, o lo que el rol no recibe o todavía no tiene. Se muestra «—».
  amount: { amount: string; currency: string } | null;
  // «En curso» (D-3).
  open: boolean;
};

export type OperationSources = {
  sales: ClientOperationSale[];
  orders: ClientOperationOrder[];
  serviceOrders: ClientOperationServiceOrder[];
  appointments: ClientOperationAppointment[];
  tradeIns: ClientOperationTradeIn[];
};

// «YYYY-MM-DD HH:MM» de un instante, en la zona de la organización.
export function localDateKey(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const of = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${of("year")}-${of("month")}-${of("day")} ${of("hour")}:${of("minute")}`;
}

// «27 oct 2026», como la v2. La hora de la clave no se muestra; el turno la dice en su detalle.
export function operationDateText(dateKey: string): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(new Date(`${dateKey.slice(0, 10)}T12:00:00Z`));
  const of = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${of("day")} ${of("month").replace(/\./g, "")} ${of("year")}`;
}

function productsText(count: number): string {
  return count === 1 ? "1 producto" : `${count} productos`;
}

const OPEN_ORDER_STATUSES: readonly string[] = ["pending", "confirmed"];
const PENDING_APPOINTMENT_STATUSES: readonly string[] = [
  "requested",
  "confirmed",
];

// Las cinco fuentes en un solo orden, por fecha descendente (D-3). A igual fecha, el id deja el orden
// estable entre cargas.
export function toOperationRows(
  sources: OperationSources,
  timeZone: string,
  today: string,
): OperationRow[] {
  const rows: OperationRow[] = [
    ...sources.sales.map((sale): OperationRow => ({
      type: "venta",
      id: sale.id,
      href: `/ventas/${sale.id}`,
      reference: sale.displayNumber,
      title: sale.displayNumber,
      detail: productsText(sale.lineCount),
      dateKey: localDateKey(sale.createdAt, timeZone),
      status: { type: "venta", voided: sale.voidDisplayNumber !== null },
      amount: { amount: sale.total, currency: sale.currency },
      open: false,
    })),
    ...sources.orders.map((order): OperationRow => ({
      type: "pedido",
      id: order.id,
      href: `/pedidos/${order.id}`,
      reference: order.displayNumber,
      title: order.displayNumber,
      detail: productsText(order.lineCount),
      dateKey: localDateKey(order.createdAt, timeZone),
      status: { type: "pedido", status: order.status },
      amount: { amount: order.total, currency: order.currency },
      open: OPEN_ORDER_STATUSES.includes(order.status),
    })),
    ...sources.serviceOrders.map((order): OperationRow => ({
      type: "reparacion",
      id: order.id,
      href: `/reparaciones/${order.id}`,
      reference: order.displayNumber,
      title: order.displayNumber,
      detail: [
        order.kind === "warranty_claim" ? KIND_LABEL.warranty_claim : null,
        order.modelName ?? UNKNOWN_MODEL_TEXT,
        order.warranty ? warrantyText(order.warranty) : null,
      ]
        .filter((part) => part !== null)
        .join(" · "),
      dateKey: localDateKey(order.createdAt, timeZone),
      status: { type: "reparacion", status: order.status },
      amount:
        order.customerTotal !== null && order.customerCurrency !== null
          ? { amount: order.customerTotal, currency: order.customerCurrency }
          : null,
      open: order.open,
    })),
    ...sources.appointments.map((item): OperationRow => ({
      type: "turno",
      id: item.id,
      href: `/turnos/${item.id}`,
      reference: null,
      title: item.reasonName || OPERATION_LABEL.turno,
      detail: formatRange(item.start, item.end),
      dateKey: `${item.date} ${item.start}`,
      status: { type: "turno", status: item.status },
      amount: null,
      open:
        PENDING_APPOINTMENT_STATUSES.includes(item.status) &&
        item.date >= today,
    })),
    ...sources.tradeIns.map((tradeIn): OperationRow => ({
      type: "usado",
      id: tradeIn.id,
      href: `/usados/${tradeIn.id}`,
      reference: tradeIn.displayNumber,
      title: tradeIn.displayNumber,
      detail: `${tradeIn.productName ?? UNKNOWN_PRODUCT_TEXT} · ${DESTINATION_SHORT_LABEL[tradeIn.destination]}`,
      dateKey: localDateKey(tradeIn.createdAt, timeZone),
      status: { type: "usado", voided: tradeIn.voidDisplayNumber !== null },
      amount: tradeIn.value,
      open: false,
    })),
  ];
  return rows.sort(
    (a, b) => b.dateKey.localeCompare(a.dateKey) || b.id.localeCompare(a.id),
  );
}

export type OperationStateFilter = "todos" | "en_curso" | "cerradas";
export type OperationDateFilter = "todas" | "30" | "90";

export type OperationFilters = {
  type: OperationType | "todas";
  search: string;
  state: OperationStateFilter;
  date: OperationDateFilter;
  page: number;
};

export const DEFAULT_OPERATION_FILTERS: OperationFilters = {
  type: "todas",
  search: "",
  state: "todos",
  date: "todas",
  page: 1,
};

export const OPERATIONS_PAGE_SIZE = 25;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Un valor que no se ofrece, en la URL, vale el predeterminado.
export function parseOperationFilters(params: SearchParams): OperationFilters {
  const type = first(params.tipo);
  const state = first(params.estado);
  const date = first(params.fecha);
  const page = Number(first(params.pagina));
  return {
    type: OPERATION_TYPES.find((item) => item === type) ?? "todas",
    search: first(params.buscar).trim().slice(0, 100),
    state: state === "en_curso" || state === "cerradas" ? state : "todos",
    date: date === "30" || date === "90" ? date : "todas",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function operationFiltersHref(
  clientId: string,
  filters: OperationFilters,
): string {
  const query = new URLSearchParams({ pestana: "operaciones" });
  if (filters.type !== "todas") query.set("tipo", filters.type);
  if (filters.search) query.set("buscar", filters.search);
  if (filters.state !== "todos") query.set("estado", filters.state);
  if (filters.date !== "todas") query.set("fecha", filters.date);
  if (filters.page > 1) query.set("pagina", String(filters.page));
  return `/clientes/${clientId}?${query.toString()}`;
}

// Sin distinguir mayúsculas ni acentos, como quien busca «reparacion».
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function daysBefore(today: string, days: number): string {
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - days);
  return day.toISOString().slice(0, 10);
}

// Todo menos el tipo: de esto salen las cantidades de los chips (D-3).
function matches(
  row: OperationRow,
  filters: OperationFilters,
  today: string,
): boolean {
  if (filters.state === "en_curso" && !row.open) return false;
  if (filters.state === "cerradas" && row.open) return false;
  if (
    filters.date !== "todas" &&
    row.dateKey.slice(0, 10) < daysBefore(today, Number(filters.date))
  ) {
    return false;
  }
  if (filters.search) {
    const text = normalize(`${row.reference ?? ""} ${row.title} ${row.detail}`);
    if (!text.includes(normalize(filters.search))) return false;
  }
  return true;
}

export function hasActiveOperationFilters(filters: OperationFilters): boolean {
  return (
    filters.search !== "" ||
    filters.state !== "todos" ||
    filters.date !== "todas"
  );
}

// El vacío de la tabla nunca afirma lo que no se sabe (brief-24.4.3, invariante): con un módulo sin
// leer no se dice «no tiene», y con un tipo elegido se habla de ese tipo.
export function operationsEmptyTitle(
  filters: OperationFilters,
  failed: readonly OperationType[],
): string {
  if (hasActiveOperationFilters(filters)) {
    return "No encontramos operaciones con esos filtros.";
  }
  if (failed.length > 0) {
    return "No hay operaciones para mostrar entre las que se pudieron leer.";
  }
  if (filters.type !== "todas") {
    return `Este cliente todavía no tiene ${OPERATION_PLURAL[filters.type].toLowerCase()}.`;
  }
  return "Este cliente todavía no tiene operaciones.";
}

export type OperationsView = {
  // La cantidad de cada tipo que se pudo leer. Sin otro filtro, la real, aunque pase del tope (D-2).
  counts: Partial<Record<OperationType, number>>;
  countAll: number;
  rows: OperationRow[];
  // Las filas que cumplen todos los filtros, de las que se leyeron.
  filteredTotal: number;
  page: number;
  pageCount: number;
};

export function buildOperationsView(
  rows: readonly OperationRow[],
  filters: OperationFilters,
  totals: Partial<Record<OperationType, number>>,
  today: string,
): OperationsView {
  const inScope = rows.filter((row) => matches(row, filters, today));
  const counted = hasActiveOperationFilters(filters);
  const counts: Partial<Record<OperationType, number>> = {};
  for (const type of OPERATION_TYPES) {
    const total = totals[type];
    if (total === undefined) continue;
    counts[type] = counted
      ? inScope.filter((row) => row.type === type).length
      : total;
  }
  const filtered =
    filters.type === "todas"
      ? inScope
      : inScope.filter((row) => row.type === filters.type);
  const pageCount = Math.max(
    1,
    Math.ceil(filtered.length / OPERATIONS_PAGE_SIZE),
  );
  const page = Math.min(filters.page, pageCount);
  const start = (page - 1) * OPERATIONS_PAGE_SIZE;
  return {
    counts,
    countAll: Object.values(counts).reduce((sum, value) => sum + value, 0),
    rows: filtered.slice(start, start + OPERATIONS_PAGE_SIZE),
    filteredTotal: filtered.length,
    page,
    pageCount,
  };
}

// «1 – 25 de 80 operaciones», como 04.
export function operationsRangeText(view: OperationsView): string {
  const firstRow = (view.page - 1) * OPERATIONS_PAGE_SIZE + 1;
  const lastRow = firstRow + view.rows.length - 1;
  return `${firstRow} – ${lastRow} de ${view.filteredTotal} ${view.filteredTotal === 1 ? "operación" : "operaciones"}`;
}
