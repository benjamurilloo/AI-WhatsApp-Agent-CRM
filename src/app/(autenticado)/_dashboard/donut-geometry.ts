// Geometría de la dona de la métrica 13 (brief-15.3, D-1 y D-4): un SVG propio, sin librería, como
// el gráfico diario. Función pura: el cálculo se prueba sin renderizar.

export const DONUT_SIZE = 120;
const CENTER = DONUT_SIZE / 2;
export const OUTER_RADIUS = 56;
export const INNER_RADIUS = 36;

export type DonutSegment = {
  // Posición del grupo en la lista de entrada: los grupos en 0 no tienen segmento, pero el índice
  // sigue apuntando al grupo, para la lectura y el color.
  index: number;
  path: string;
};

const round = (value: number) => Math.round(value * 1000) / 1000;

// Punto del círculo de radio r en el ángulo dado, en grados, con 0 arriba y en sentido horario.
function point(radius: number, degrees: number): string {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return `${round(CENTER + radius * Math.cos(radians))} ${round(CENTER + radius * Math.sin(radians))}`;
}

// Un sector de corona entre dos ángulos. Con 360° el arco no tiene principio ni fin, así que la
// corona entera se dibuja como dos mitades.
function sector(start: number, end: number): string {
  if (end - start >= 360) {
    return `${sector(start, start + 180)} ${sector(start + 180, start + 360)}`;
  }
  const large = end - start > 180 ? 1 : 0;
  return [
    `M ${point(OUTER_RADIUS, start)}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${large} 1 ${point(OUTER_RADIUS, end)}`,
    `L ${point(INNER_RADIUS, end)}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${large} 0 ${point(INNER_RADIUS, start)}`,
    "Z",
  ].join(" ");
}

export function donutSegments(counts: readonly number[]): DonutSegment[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return [];
  const segments: DonutSegment[] = [];
  let start = 0;
  counts.forEach((count, index) => {
    if (count === 0) return;
    const end = start + (count / total) * 360;
    segments.push({ index, path: sector(start, end) });
    start = end;
  });
  return segments;
}
