import Link from "next/link";
import { getDailyActivity, type DailyActivity } from "@/modules/analytics";
import { logEvent, newRequestId } from "@/shared/log";
import {
  cardClass,
  mutedTextClass,
  navLinkClass,
  sectionTitleClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import type { CardContext } from "./cards";
import { chartGeometry } from "./chart-geometry";
import { METRIC_INFO } from "./definitions";
import { formatCount } from "./format";
import { CHART_SERIES_LABEL, DAILY_NOT_ADDITIVE_NOTE } from "./messages";
import { MetricError } from "./metric-card";
import { formatCalendarDay } from "./period";

// Métrica 10 (brief-7.4, D-4): barras en un SVG generado en el servidor, con la tabla de datos
// siempre disponible, que es la alternativa accesible del gráfico (Screens.md §2). La serie activa
// viaja en la URL, así que no hace falta estado de cliente.

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
          10. {METRIC_INFO[10].name}
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

  return (
    <section className={`${cardClass} p-4`} aria-labelledby="metrica-10">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="metrica-10" className={sectionTitleClass}>
          10. {METRIC_INFO[10].name}
        </h2>
        <nav aria-label="Serie del gráfico" className="sm:ml-auto">
          <ul className="flex gap-1">
            {SERIES_KEYS.map((key) => (
              <li key={key}>
                <Link
                  href={seriesHref(key)}
                  aria-current={key === series ? "true" : undefined}
                  className={`${navLinkClass} ${
                    key === series
                      ? "bg-primary-soft text-on-primary-soft"
                      : "text-muted hover:bg-surface-muted hover:text-foreground"
                  }`}
                >
                  {CHART_SERIES_LABEL[key]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* El gráfico es decorativo: el dato exacto está en la tabla de abajo, que no se oculta. */}
      <div className="mt-3 overflow-x-auto">
        <svg
          role="presentation"
          width={geometry.width}
          height={geometry.height}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          className="block"
        >
          {geometry.bars.map((bar) => (
            <rect
              key={bar.day}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              className="fill-primary"
            />
          ))}
        </svg>
      </div>
      <p className={`mt-2 ${mutedTextClass}`}>
        {formatCalendarDay(rows[0]?.day ?? "")} –{" "}
        {formatCalendarDay(rows.at(-1)?.day ?? "")} · máximo{" "}
        {formatCount(geometry.max)} por día
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary underline decoration-1 underline-offset-4">
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
