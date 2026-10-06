import {
  getFirstResponseDistribution,
  getInboundMessageKinds,
  type FirstResponseDistribution,
  type MessageKindCount,
} from "@/modules/analytics";
import {
  mutedTextClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Card, type CardContext } from "./cards";
import { CHART_HEIGHT, chartGeometry } from "./chart-geometry";
import { chartFrameProps, ReadoutLine } from "./chart-frame";
import { BarChartSvg, DonutSvg } from "./chart-svgs";
import { DONUT_SIZE, INNER_RADIUS, donutSegments } from "./donut-geometry";
import { formatCount } from "./format";
import { MetricState } from "./metric-card";
import {
  bucketLabel,
  bucketReadout,
  kindLabel,
  kindReadout,
  share,
} from "./readouts";

// Métricas 13 y 14 (brief-15.3, D-4 a D-6): la dona de tipos de mensaje y el histograma del tiempo a
// primera respuesta, en SVG propio. Son distribuciones: no se comparan con el período anterior. Cada
// una tiene su alternativa con los valores exactos, visible sin JavaScript.

// Un tono por tipo (tokens de la brief-15.3), escrito entero para que Tailwind lo encuentre.
const KIND_FILL: Record<string, string> = {
  text: "fill-chart-text",
  audio: "fill-chart-audio",
  image: "fill-chart-image",
  video: "fill-chart-video",
  document: "fill-chart-document",
  other: "fill-chart-other",
  none: "fill-chart-none",
};
const KIND_SWATCH: Record<string, string> = {
  text: "bg-chart-text",
  audio: "bg-chart-audio",
  image: "bg-chart-image",
  video: "bg-chart-video",
  document: "bg-chart-document",
  other: "bg-chart-other",
  none: "bg-chart-none",
};
const colorKey = (kind: MessageKindCount["kind"]) => kind ?? "none";

export function MessageKindsCard(cards: CardContext) {
  return (
    <Card
      metric={13}
      cards={cards}
      load={getInboundMessageKinds}
      render={(value) => {
        if (value.status !== "value") {
          return <MetricState status={value.status} />;
        }
        // Los seis tipos siempre, y «Sin dato» solo si tiene mensajes (MetricsCatalog, métrica 13).
        const groups = value.groups.filter(
          (group) => group.kind !== null || group.count > 0,
        );
        const segments = donutSegments(groups.map((group) => group.count));
        return (
          <div className="w-full">
            <ReadoutLine frameId="grafico-tipos" />
            <div
              {...chartFrameProps(
                "grafico-tipos",
                "Dona de tipos de mensaje: con el foco, las flechas recorren los tipos. Los valores exactos están en la lista",
              )}
            >
              <div className="flex flex-wrap items-center gap-5">
                <DonutSvg
                  size={DONUT_SIZE}
                  innerRadius={INNER_RADIUS}
                  segments={segments.map((segment) => ({
                    path: segment.path,
                    fillClass:
                      KIND_FILL[colorKey(groups[segment.index]!.kind)]!,
                    readout: kindReadout(groups[segment.index]!, value.total),
                  }))}
                  total={formatCount(value.total)}
                  unit={value.total === 1 ? "mensaje" : "mensajes"}
                />
                <ul className="min-w-44 grow space-y-1 text-sm">
                  {groups.map((group) => (
                    <li
                      key={colorKey(group.kind)}
                      className="flex items-center gap-2"
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2.5 shrink-0 rounded-full ${KIND_SWATCH[colorKey(group.kind)]}`}
                      />
                      <span className="grow">{kindLabel(group.kind)}</span>
                      <span className="font-semibold tabular-nums">
                        {formatCount(group.count)}
                      </span>
                      <span className="w-14 text-right text-muted tabular-nums">
                        {share(group.count, value.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}

// Lienzo del histograma: el eje con el máximo a la izquierda y los rangos debajo.
const AXIS_LEFT = 26;
const AXIS_TOP = 6;
const AXIS_BOTTOM = 22;
const HISTOGRAM_WIDTH = 360;

function FirstResponseHistogram({
  value,
}: {
  value: FirstResponseDistribution;
}) {
  const without = `${formatCount(value.withoutResponse)} sin primera respuesta, de ${formatCount(value.population)}`;
  if (value.buckets.status !== "value") {
    return (
      <>
        <MetricState status={value.buckets.status} />
        <p className={mutedTextClass}>{without}</p>
      </>
    );
  }
  const ranges = value.buckets.ranges;
  const geometry = chartGeometry(
    ranges.map((range, index) => ({ day: String(index), value: range.count })),
  );
  const slot = (HISTOGRAM_WIDTH - AXIS_LEFT - 2) / ranges.length;
  const barWidth = Math.min(40, slot * 0.6);
  const height = AXIS_TOP + CHART_HEIGHT + AXIS_BOTTOM;
  return (
    <>
      <div>
        <ReadoutLine frameId="grafico-primera-respuesta" />
        <div
          {...chartFrameProps(
            "grafico-primera-respuesta",
            "Histograma del tiempo a primera respuesta: con el foco, las flechas recorren los rangos. Los valores exactos están en la tabla de datos",
          )}
        >
          <BarChartSvg
            width={HISTOGRAM_WIDTH}
            height={height}
            fixedSize={false}
            className="block h-auto w-full min-w-72"
            axisLeft={AXIS_LEFT}
            gridTop={AXIS_TOP}
            gridHeight={CHART_HEIGHT}
            maxLabel={formatCount(geometry.max)}
            labelY={AXIS_TOP + CHART_HEIGHT + 15}
            labelClass="fill-muted text-[9px]"
            bars={geometry.bars.map((bar, index) => ({
              x: AXIS_LEFT + index * slot + (slot - barWidth) / 2,
              y: AXIS_TOP + bar.y,
              width: barWidth,
              height: bar.height,
              readout: bucketReadout(ranges[index]!),
              label: bucketLabel(ranges[index]!),
            }))}
          />
        </div>
      </div>
      <p className={`mt-2 ${mutedTextClass}`}>{without}</p>
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer rounded-sm font-semibold text-primary underline decoration-1 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          Ver tabla de datos
        </summary>
        <table className="mt-2 w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Conversaciones con primera respuesta, por rango de tiempo
          </caption>
          <thead>
            <tr>
              <th scope="col" className={tableHeadCellClass}>
                Rango
              </th>
              <th scope="col" className={tableHeadCellClass}>
                Conversaciones
              </th>
            </tr>
          </thead>
          <tbody>
            {ranges.map((range) => (
              <tr key={range.fromMinutes}>
                <th scope="row" className={`${tableCellClass} font-semibold`}>
                  {bucketLabel(range)}
                </th>
                <td className={`${tableCellClass} tabular-nums`}>
                  {formatCount(range.count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

export function FirstResponseBucketsCard(cards: CardContext) {
  return (
    <Card
      metric={14}
      cards={cards}
      load={getFirstResponseDistribution}
      render={(value) => <FirstResponseHistogram value={value} />}
    />
  );
}
