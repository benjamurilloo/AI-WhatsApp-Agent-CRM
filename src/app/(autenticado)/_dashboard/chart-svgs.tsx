"use client";

// Los SVG de los gráficos del dashboard (brief-15.3), como componentes que reciben solo números y
// textos. El servidor calcula la geometría (chart-geometry.ts, donut-geometry.ts) y este módulo la
// dibuja entera de una vez.
//
// Por qué del lado del cliente: un árbol de elementos del servidor dentro de un <svg> se puede
// recibir en partes, y si React corta ahí inserta la parte con un contenedor
// <svg> con estilo en línea (display:none), que la CSP bloquea (style-src-attr 'none'). Con la lectura de la 15.3
// el contenido creció y pasó en 7 de 12 cargas (medido en la 15.3.3). Un componente que dibuja el
// SVG desde sus props no se corta adentro: si hay que esperar, se espera afuera del <svg>, donde
// React usa el atributo hidden. Se sigue dibujando en el servidor (SSR).
//
// La regla: ningún <svg> con formas de datos se arma con elementos del servidor. Los íconos
// (icons.tsx) son <svg> del servidor, pero chicos y de una pieza; la guarda de CSP los cubre.

export type BarShape = {
  x: number;
  y: number;
  width: number;
  height: number;
  // El texto de la línea de lectura (chart-interactions.tsx).
  readout: string;
  // El rótulo debajo de la barra, si lleva.
  label?: string;
};

export function BarChartSvg({
  width,
  height,
  fixedSize,
  className,
  axisLeft,
  gridTop,
  gridHeight,
  maxLabel,
  labelY,
  labelClass,
  bars,
}: {
  width: number;
  height: number;
  // Con el ancho fijo, el gráfico conserva su tamaño y el contenedor se desplaza.
  fixedSize: boolean;
  className: string;
  axisLeft: number;
  gridTop: number;
  gridHeight: number;
  maxLabel: string;
  labelY: number;
  labelClass: string;
  bars: readonly BarShape[];
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={fixedSize ? width : undefined}
      height={fixedSize ? height : undefined}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      {[0, 0.5, 1].map((share) => (
        <line
          key={share}
          x1={axisLeft}
          x2={width}
          y1={gridTop + gridHeight * share}
          y2={gridTop + gridHeight * share}
          strokeWidth={share === 1 ? 1 : 0.5}
          className={share === 1 ? "stroke-border-strong" : "stroke-border"}
        />
      ))}
      <text
        x={axisLeft - 6}
        y={gridTop + 4}
        textAnchor="end"
        className="fill-muted text-[10px]"
      >
        {maxLabel}
      </text>
      <text
        x={axisLeft - 6}
        y={gridTop + gridHeight + 3}
        textAnchor="end"
        className="fill-muted text-[10px]"
      >
        0
      </text>
      {bars.map((bar, index) => (
        <g key={index}>
          <rect
            data-index={index}
            data-readout={bar.readout}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            rx={Math.min(2, bar.height / 2)}
            className="fill-action transition-opacity"
          />
          {bar.label === undefined ? null : (
            <text
              x={bar.x + bar.width / 2}
              y={labelY}
              textAnchor="middle"
              className={labelClass}
            >
              {bar.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export type DonutShape = {
  path: string;
  // Una clase fill-chart-*, escrita entera donde se elige para que Tailwind la encuentre.
  fillClass: string;
  readout: string;
};

export function DonutSvg({
  size,
  innerRadius,
  segments,
  total,
  unit,
}: {
  size: number;
  innerRadius: number;
  segments: readonly DonutShape[];
  total: string;
  unit: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${size} ${size}`}
      className="block size-36 shrink-0"
    >
      {segments.map((segment, index) => (
        <path
          key={index}
          data-index={index}
          data-readout={segment.readout}
          d={segment.path}
          fillRule="evenodd"
          strokeWidth={1.5}
          className={`${segment.fillClass} stroke-surface transition-opacity`}
        />
      ))}
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        className="pointer-events-none fill-foreground text-[22px] font-extrabold"
      >
        {total}
      </text>
      <text
        x={size / 2}
        y={size / 2 + innerRadius / 2}
        textAnchor="middle"
        className="pointer-events-none fill-muted text-[10px]"
      >
        {unit}
      </text>
    </svg>
  );
}
