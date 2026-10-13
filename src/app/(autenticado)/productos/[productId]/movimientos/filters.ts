import type { MovementHistoryFilters } from "@/modules/inventory";
import { calendarDayIn, shiftDays } from "@/app/_format/date-time";

// Filtros del historial en la URL (brief-4.4, D-4): ?tipo=&periodo=&desde=&hasta=&pagina=.
// El parseo es puro; los atajos se traducen a fechas con la zona de la organización, que
// solo conoce la página. Por defecto, "todo": FR-PROD-09 pide el historial completo.

export type SearchParams = Record<string, string | string[] | undefined>;

// entrega, desde la 19.3: la salida de un pedido entregado (brief-19.3, D-7). venta, desde la
// 20.3: la salida de una venta sin pedido (brief-20.3, H-2). anulacion, desde la 20.4: la
// reposición de su anulación (brief-20.4, D-7).
export type MovementTypeKey =
  "todos" | "positivo" | "negativo" | "entrega" | "venta" | "anulacion";
export type PeriodKey = "todo" | "7d" | "30d" | "90d" | "personalizado";

const TYPE_PARAM: Record<MovementTypeKey, string> = {
  todos: "all",
  positivo: "adjustment_positive",
  negativo: "adjustment_negative",
  entrega: "order_delivery",
  venta: "sale",
  anulacion: "sale_void",
};

// Días que abarca cada atajo, incluido hoy.
const PERIOD_DAYS: Record<"7d" | "30d" | "90d", number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  todo: "Todo el historial",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  personalizado: "Personalizado",
};

export type MovementView = {
  type: MovementTypeKey;
  period: PeriodKey;
  // Solo se usan con period "personalizado"; llegan tal como se escribieron y los valida el servicio.
  from: string;
  to: string;
  page: number;
};

export const DEFAULT_VIEW: MovementView = {
  type: "todos",
  period: "todo",
  from: "",
  to: "",
  page: 1,
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function keyOf<T extends string>(
  candidate: string | undefined,
  keys: readonly T[],
  fallback: T,
): T {
  return candidate && (keys as readonly string[]).includes(candidate)
    ? (candidate as T)
    : fallback;
}

export function parseMovementView(params: SearchParams): MovementView {
  const page = single(params.pagina);
  const period = keyOf(
    single(params.periodo),
    ["todo", "7d", "30d", "90d", "personalizado"] as const,
    DEFAULT_VIEW.period,
  );
  const custom = period === "personalizado";
  return {
    type: keyOf(
      single(params.tipo),
      [
        "todos",
        "positivo",
        "negativo",
        "entrega",
        "venta",
        "anulacion",
      ] as const,
      DEFAULT_VIEW.type,
    ),
    period,
    from: custom ? (single(params.desde)?.trim() ?? "") : "",
    to: custom ? (single(params.hasta)?.trim() ?? "") : "",
    page: page && /^[1-9][0-9]{0,5}$/.test(page) ? Number(page) : 1,
  };
}

// Traduce la vista a lo que espera el servicio, con los atajos resueltos en días de la
// zona de la organización (brief-4.3.3, D-3).
export function toHistoryFilters(
  view: MovementView,
  timeZone: string,
  now = new Date(),
): MovementHistoryFilters {
  const base = { type: TYPE_PARAM[view.type], page: view.page };
  if (view.period === "personalizado") {
    return { ...base, from: view.from, to: view.to };
  }
  if (view.period === "todo") return { ...base, from: "", to: "" };
  const today = calendarDayIn(timeZone, now);
  return {
    ...base,
    from: shiftDays(today, 1 - PERIOD_DAYS[view.period]),
    to: today,
  };
}

export function movementFiltersHref(
  productId: string,
  view: MovementView,
): string {
  const query = new URLSearchParams();
  if (view.type !== DEFAULT_VIEW.type) query.set("tipo", view.type);
  if (view.period !== DEFAULT_VIEW.period) {
    query.set("periodo", view.period);
    if (view.period === "personalizado") {
      if (view.from) query.set("desde", view.from);
      if (view.to) query.set("hasta", view.to);
    }
  }
  if (view.page > 1) query.set("pagina", String(view.page));
  const text = query.toString();
  const base = `/productos/${productId}/movimientos`;
  return text ? `${base}?${text}` : base;
}

export function hasActiveMovementFilters(view: MovementView): boolean {
  return view.type !== DEFAULT_VIEW.type || view.period !== DEFAULT_VIEW.period;
}
