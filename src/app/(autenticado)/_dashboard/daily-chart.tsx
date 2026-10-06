import Link from "next/link";
import { getDailyActivity, type DailyActivity } from "@/modules/analytics";
import { logEvent, newRequestId } from "@/shared/log";
import {
  cardClass,
  mutedTextClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import type { CardContext } from "./cards";
import { CHART_HEIGHT, chartGeometry, type ChartBar } from "./chart-geometry";
import { METRIC_INFO } from "./definitions";
import { formatCount } from "./format";
import { CHART_SERIES_LABEL, DAILY_NOT_ADDITIVE_NOTE } from "./messages";
import { chartFrameProps, chartKey, ReadoutLine } from "./chart-frame";
import { BarChartSvg } from "./chart-svgs";
import { dailyReadout } from "./readouts";
import { MetricError } from "./metric-card";
import { formatCalendarDay } from "./period";

// Métrica 10 (brief-7.4, D-4): barras en un SVG generado en el servidor, con la tabla de datos
// siempre disponible, que es la alternativa accesible del gráfico (Screens.md §2). La serie activa
// viaja en la URL, así que no hace falta estado de cliente. Desde la brief-15.1 lleva líneas de
// guía, el máximo y el cero en el eje, algunas fechas debajo y un selector de serie segmentado;
// la geometría de las barras no cambió.

export type SeriesKey = keyof typeof CHART_SERIES_LABEL;

export const SERIES_KEYS: readonly SeriesKey[] = ["conversaciones", "mensajes"];

const pointsOf = (rows: DailyActivity[], series: SeriesKey) =>
  rows.map((row) => ({
    day: row.day,
    value:
      series === "conversaciones" ? row.started : row.inbound + row.outbound,
  }));

export async function DailyActivitySection({
  cards,
  series,
  seriesHref,
}: {
  cards: CardContext;
  series: SeriesKey;
  seriesHref: (series: SeriesKey) => string;
}) {
  let rows: DailyActivity[];
  try {
    const result = await getDailyActivity(cards.context, cards.input);
    if (!result.ok) throw new Error(`métrica 10: ${result.code}`);
    rows = result.value;
  } catch (error) {
    const requestId = newRequestId();
    logEvent({
      level: "error",
      requestId,
      route: "/",
      code: "INTERNAL",
      userId: cards.context.userId,
      organizationId: cards.context.organizationId,
      error,
    });
    return (
      <section className={`${cardClass} p-4`} aria-labelledby="metrica-10">
        <h2 id="metrica-10" className={sectionTitleClass}>
          {METRIC_INFO[10].name}
        </h2>
        <div className="mt-3">
          <MetricError requestId={requestId} retryHref={cards.retryHref} />
        </div>
      </section>
    );
  }

  const points = pointsOf(rows, series);
  const geometry = chartGeometry(points);
  const label = CHART_SERIES_LABEL[series];
  const frame = chartFrame(geometry.bars);

  return (
    <section className={`${cardClass} p-5`} aria-labelledby="metrica-10">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="metrica-10" className={sectionTitleClass}>
          {METRIC_INFO[10].name}
        </h2>
        <nav aria-label="Serie del gráfico" className="sm:ml-auto">
          <ul className="flex gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5">
            {SERIES_KEYS.map((key) => (
              <li key={key}>
                <Link
                  href={seriesHref(key)}
                  aria-current={key === series ? "true" : undefined}
                  className={`block rounded-md px-3 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                    key === series
                      ? "bg-action text-on-action shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {CHART_SERIES_LABEL[key]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* El dato exacto está en la tabla de datos de abajo. Desde la brief-15.3 (D-6), pasar
          el mouse por una barra, o recorrerlas con las flechas, muestra el día en la línea de
          lectura; enfocado, el gráfico se sigue desplazando en pantallas chicas. */}
      <div className="mt-4" key={chartKey(cards.input, series)}>
        <ReadoutLine frameId="grafico-diario" />
        <div
          {...chartFrameProps(
            "grafico-diario",
            "Gráfico de barras por día: con el foco, las flechas recorren los días. Los valores exactos están en la tabla de datos",
          )}
        >
          <BarChartSvg
            width={frame.width}
            height={frame.height}
            fixedSize={!frame.fill}
            className={frame.fill ? "block h-auto w-full min-w-xl" : "block"}
            axisLeft={AXIS_LEFT}
            gridTop={AXIS_TOP}
            gridHeight={CHART_HEIGHT}
            maxLabel={formatCount(geometry.max)}
            labelY={AXIS_TOP + CHART_HEIGHT + 14}
            labelClass="fill-muted text-[9px]"
            bars={frame.bars.map((bar, index) => ({
              x: bar.x,
              y: AXIS_TOP + bar.y,
              width: bar.width,
              height: bar.height,
              readout: dailyReadout(rows[index]!, series),
              label:
                index % frame.labelEvery === 0 ? shortDay(bar.day) : undefined,
            }))}
          />
        </div>
      </div>
      <p className={`mt-2 ${mutedTextClass}`}>
        {formatCalendarDay(rows[0]?.day ?? "")} –{" "}
        {formatCalendarDay(rows.at(-1)?.day ?? "")} · máximo{" "}
        {formatCount(geometry.max)} por día
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer rounded-sm text-sm font-semibold text-primary underline decoration-1 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Ver tabla de datos
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-md border-collapse text-left text-sm">
            <caption className="sr-only">
              {label} por día del período, con 0 en los días sin actividad
            </caption>
            <thead>
              <tr>
                <th scope="col" className={tableHeadCellClass}>
                  Día
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Iniciadas
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Con actividad
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Entrantes
                </th>
                <th scope="col" className={tableHeadCellClass}>
                  Salientes
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.day}>
                  <th scope="row" className={`${tableCellClass} font-semibold`}>
                    {formatCalendarDay(row.day)}
                  </th>
                  <td className={`${tableCellClass} tabular-nums`}>
                    {formatCount(row.started)}
                  </td>
                  <td className={`${tableCellClass} tabular-nums`}>
                    {formatCount(row.active)}
                  </td>
                  <td className={`${tableCellClass} tabular-nums`}>
                    {formatCount(row.inbound)}
                  </td>
                  <td className={`${tableCellClass} tabular-nums`}>
                    {formatCount(row.outbound)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className={`mt-2 ${mutedTextClass}`}>{DAILY_NOT_ADDITIVE_NOTE}</p>
    </section>
  );
}

// Márgenes del gráfico dentro del SVG: el eje con el máximo a la izquierda y las fechas debajo.
const AXIS_LEFT = 26;
const AXIS_TOP = 6;
const AXIS_BOTTOM = 20;
// Hasta dos meses, las barras se reparten en un lienzo fijo que se estira al ancho de la tarjeta
// (en pantallas chicas, con un mínimo y desplazamiento). Con más días conservan su ancho y la
// tarjeta se desplaza, como antes (brief-7.4, D-4). La altura de cada barra no cambia.
const FILL_UP_TO_DAYS = 62;
const FILL_WIDTH = 720;
const MAX_BAR_WIDTH = 24;
const MAX_DATE_LABELS = 12;

function chartFrame(bars: readonly ChartBar[]) {
  const height = AXIS_TOP + CHART_HEIGHT + AXIS_BOTTOM;
  const labelEvery = Math.max(1, Math.ceil(bars.length / MAX_DATE_LABELS));
  if (bars.length > FILL_UP_TO_DAYS) {
    const last = bars.at(-1);
    return {
      fill: false,
      width: AXIS_LEFT + (last ? last.x + last.width : 0) + 2,
      height,
      labelEvery,
      bars: bars.map((bar) => ({ ...bar, x: AXIS_LEFT + bar.x })),
    };
  }
  const slot = (FILL_WIDTH - AXIS_LEFT - 2) / Math.max(1, bars.length);
  const width = Math.min(MAX_BAR_WIDTH, slot * 0.68);
  return {
    fill: true,
    width: FILL_WIDTH,
    height,
    labelEvery,
    bars: bars.map((bar, index) => ({
      ...bar,
      x: AXIS_LEFT + index * slot + (slot - width) / 2,
      width,
    })),
  };
}
// «5/10»: día y mes del día de calendario, sin zona horaria de por medio.
function shortDay(day: string) {
  const [, month, date] = day.split("-");
  return `${Number(date)}/${Number(month)}`;
}
