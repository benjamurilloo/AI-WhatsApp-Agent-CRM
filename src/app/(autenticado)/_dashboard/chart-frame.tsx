import { CHART_READOUT_HINT } from "./messages";

// Lo que el servidor dibuja para que un gráfico del dashboard se pueda leer (brief-15.3, D-6): la
// línea de lectura, el contenedor enfocable y, en cada forma, data-index y data-readout con su
// texto. ChartInteractions (chart-interactions.tsx), montado una sola vez en la página, escucha
// esos contenedores y escribe la línea.
//
// Los SVG en sí los dibujan los componentes de chart-svgs.tsx, desde datos: ahí está por qué ningún
// gráfico se arma con elementos del servidor dentro del <svg> (la CSP y el streaming, 15.3.3).

export const readoutId = (frameId: string) => `${frameId}-lectura`;

// Clave del bloque de un gráfico: cambia con el período y la serie. ChartInteractions escribe la
// línea y las clases de atenuado fuera de React; si al navegar React reusara esos nodos, quedarían
// la lectura y el atenuado de antes. Con otra clave, el bloque se monta de nuevo, limpio.
export const chartKey = (
  input: { from: string; to: string },
  ...parts: string[]
) => [input.from, input.to, ...parts].join(":");

// Atributos del contenedor enfocable que va alrededor del SVG.
export function chartFrameProps(id: string, label: string) {
  return {
    id,
    "data-chart-frame": "",
    tabIndex: 0,
    role: "group",
    "aria-label": label,
    className:
      "mt-2 overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  } as const;
}

// La línea que dice qué hacer y, con una forma activa, su valor. Es una región aria-live cortés.
export function ReadoutLine({ frameId }: { frameId: string }) {
  return (
    <p
      id={readoutId(frameId)}
      aria-live="polite"
      data-hint={CHART_READOUT_HINT}
      className="min-h-5 text-sm font-semibold text-foreground"
    >
      {CHART_READOUT_HINT}
    </p>
  );
}
