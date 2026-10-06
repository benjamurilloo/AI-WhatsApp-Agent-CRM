import { formatDecimal } from "./format";

// Variación contra el período anterior (brief-15.3, D-2; MetricsCatalog, «Período anterior»). Es de
// la pantalla, no del catálogo: el servicio devuelve los dos valores y acá se comparan. Función
// pura, así los casos que engañan (anterior en 0, sin datos, hoy incompleto) quedan probados sin
// renderizar.

// Lo que se compara de cada métrica. null es "sin datos" y { kind: "unavailable" }, "no
// disponible": son estados distintos y la variación los nombra distinto (brief-15.3, invariantes).
export type Comparable =
  // Cantidades (1, 2, 3, 4, 5 y 7): en porcentaje.
  | { kind: "count"; value: number }
  // Tasas entre 0 y 100 (8 y 12): en puntos porcentuales.
  | { kind: "rate"; value: number }
  // Promedio y mediana (6 y 9): diferencia absoluta, con su unidad si tiene.
  | { kind: "amount"; value: number; unit?: string }
  | { kind: "unavailable" }
  | null;

export type Variation =
  | { status: "change"; direction: "up" | "down" | "same"; text: string }
  | { status: "none"; reason: string };

export const NO_PREVIOUS_DATA = "Sin datos del período anterior";
export const PREVIOUS_UNAVAILABLE = "Período anterior no disponible";
// Un 0 es un valor, no «sin datos»: se dice cuál fue (revisión de la 15.3, hallazgo 4).
export const PREVIOUS_ZERO = "Sin comparación: el período anterior fue 0";
export const NO_CURRENT_DATA = "Sin datos en este período";
export const TODAY_INCOMPLETE =
  "Sin comparación con el período anterior: el período incluye hoy, que está incompleto.";

const SUFFIX = "vs. período anterior";

// Un período que llega hasta hoy está incompleto: no se compara (D-2). Días de calendario
// «AAAA-MM-DD», que se comparan como texto.
export const includesToday = (periodTo: string, today: string) =>
  periodTo >= today;

// El signo va explícito y con el número en valor absoluto: «+25,0 %» y «−3,5 p. p.». Cero es «sin
// cambios», no «+0,0 %», que sugiere una subida.
function signed(delta: number, unit: string): Variation {
  // Se muestra con un decimal: lo que redondea a 0,0 es «sin cambios».
  if (Math.round(Math.abs(delta) * 10) === 0) {
    return {
      status: "change",
      direction: "same",
      text: `Sin cambios ${SUFFIX}`,
    };
  }
  const direction = delta > 0 ? "up" : "down";
  const sign = delta > 0 ? "+" : "−";
  const amount = `${formatDecimal(Math.abs(delta))}${unit}`;
  return { status: "change", direction, text: `${sign}${amount} ${SUFFIX}` };
}

export function variationOf(
  current: Comparable,
  previous: Comparable,
): Variation {
  // Sin valor actual, la tarjeta ya muestra su estado: no se agrega nada.
  if (current === null || current.kind === "unavailable") {
    return { status: "none", reason: NO_CURRENT_DATA };
  }
  if (previous?.kind === "unavailable") {
    return { status: "none", reason: PREVIOUS_UNAVAILABLE };
  }
  if (previous === null || previous.kind !== current.kind) {
    return { status: "none", reason: NO_PREVIOUS_DATA };
  }
  switch (current.kind) {
    case "count":
      // Con el anterior en 0 el porcentaje es infinito: no hay comparación (D-2). Las tasas y los
      // promedios con el anterior en 0 sí se comparan: la diferencia está definida.
      if (previous.value === 0) {
        return { status: "none", reason: PREVIOUS_ZERO };
      }
      return signed(
        ((current.value - previous.value) * 100) / previous.value,
        " %",
      );
    case "rate":
      return signed(current.value - previous.value, " p. p.");
    case "amount":
      return signed(
        current.value - previous.value,
        current.unit ? ` ${current.unit}` : "",
      );
  }
}
