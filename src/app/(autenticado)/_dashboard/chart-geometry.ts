// Geometría del gráfico diario (brief-7.4, D-4): un SVG de barras generado en el servidor, sin
// dependencias. Es una función pura, así que el cálculo se prueba sin renderizar nada.

export const BAR_WIDTH = 10;
export const BAR_GAP = 4;
export const CHART_HEIGHT = 120;
// Alto mínimo de una barra con valor: un 1 no puede quedar invisible.
const MIN_VALUE_HEIGHT = 2;

export type ChartBar = {
  day: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChartGeometry = {
  width: number;
  height: number;
  max: number;
  bars: ChartBar[];
};

// Con 366 días las barras no entran en la pantalla: el ancho crece con los días y el contenedor
// desplaza horizontalmente, en vez de comprimir las barras hasta hacerlas ilegibles.
export function chartGeometry(
  points: readonly { day: string; value: number }[],
): ChartGeometry {
  const max = points.reduce((top, point) => Math.max(top, point.value), 0);
  const bars = points.map((point, index) => {
    const height =
      max === 0 || point.value === 0
        ? 0
        : Math.max(
            MIN_VALUE_HEIGHT,
            Math.round((point.value / max) * CHART_HEIGHT),
          );
    return {
      day: point.day,
      value: point.value,
      x: index * (BAR_WIDTH + BAR_GAP),
      y: CHART_HEIGHT - height,
      width: BAR_WIDTH,
      height,
    };
  });
  return {
    width: Math.max(BAR_WIDTH, points.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP),
    height: CHART_HEIGHT,
    max,
    bars,
  };
}
