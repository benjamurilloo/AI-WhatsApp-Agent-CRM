import type { MetricsPeriodInput } from "@/modules/analytics";
import { shiftDays } from "@/app/_format/date-time";

// Período del dashboard en la URL (brief-7.4, D-5): ?periodo=&desde=&hasta=.
// El parseo es puro y un valor desconocido vuelve al de defecto. A diferencia de las pantallas 5 y
// 8, acá no existe "todas las fechas": en métricas un campo vacío significa los últimos 30 días
// completos, no "sin límite" (MetricsCatalog, convenciones), y el máximo es de 366 días.

export type SearchParams = Record<string, string | string[] | undefined>;

export type PeriodKey = "7d" | "30d" | "90d" | "personalizado";

export const DEFAULT_PERIOD: PeriodKey = "30d";

export const PERIOD_KEYS: readonly PeriodKey[] = [
  "7d",
  "30d",
  "90d",
  "personalizado",
];

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7d": "Últimos 7 días completos",
  "30d": "Últimos 30 días completos",
  "90d": "Últimos 90 días completos",
  personalizado: "Personalizado",
};

// Días de cada atajo. El intervalo termina ayer: hoy es un día parcial y el valor por defecto del
// catálogo tampoco lo incluye (brief-7.1, D-2).
const PERIOD_DAYS: Record<"7d" | "30d" | "90d", number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export type DashboardView = {
  period: PeriodKey;
  // Solo con period "personalizado"; llegan tal como se escribieron y los valida el servicio.
  from: string;
  to: string;
};

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

export function parseDashboardView(params: SearchParams): DashboardView {
  const raw = single(params.periodo);
  const period = (PERIOD_KEYS as readonly string[]).includes(raw)
    ? (raw as PeriodKey)
    : DEFAULT_PERIOD;
  return {
    period,
    from: period === "personalizado" ? single(params.desde) : "",
    to: period === "personalizado" ? single(params.hasta) : "",
  };
}

// Entrada que recibe el servicio. El atajo por defecto viaja vacío a propósito: así el período lo
// calcula el módulo con el reloj de la base y no hay dos definiciones de "los últimos 30 días".
export function periodInputFor(
  view: DashboardView,
  today: string,
): MetricsPeriodInput {
  if (view.period === "personalizado") return { from: view.from, to: view.to };
  if (view.period === DEFAULT_PERIOD) return { from: "", to: "" };
  return {
    from: shiftDays(today, -PERIOD_DAYS[view.period]),
    to: shiftDays(today, -1),
  };
}

export function dashboardHref(view: DashboardView): string {
  if (view.period === DEFAULT_PERIOD) return "/";
  const params = new URLSearchParams({ periodo: view.period });
  if (view.period === "personalizado") {
    if (view.from !== "") params.set("desde", view.from);
    if (view.to !== "") params.set("hasta", view.to);
  }
  return `/?${params.toString()}`;
}

// "13/08/2026" desde un día de calendario, sin pasar por husos: el día ya está en la zona de la
// organización, así que construir un Date acá podría correrlo.
export function formatCalendarDay(day: string): string {
  const [year, month, date] = day.split("-");
  if (year === undefined || month === undefined || date === undefined) {
    return day;
  }
  return `${date}/${month}/${year}`;
}
