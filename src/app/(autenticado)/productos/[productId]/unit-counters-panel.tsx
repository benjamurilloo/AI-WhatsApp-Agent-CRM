import type { UnitStatusCounts } from "@/modules/inventory";
import { StatTile } from "@/app/_components/stat-tile";
import { outsideBalance, physicalUnits, unitCounters } from "./unit-counts";

// Los contadores de unidades del Resumen (brief-24.5.1, D-6). Van arriba de todo, debajo de la
// barra de pestañas, como la fila de tarjetas de la lámina 09. «Ver unidades» no está acá: es la
// acción principal del encabezado, donde la pone la v2.
//
// No se dibuja un total que los sume: sumar disponibles, reservadas y en revisión no da ningún
// número del sistema (I-3). La línea de abajo explica por qué las físicas no son el saldo.
//
// Diferencia declarada con la v2: la lámina 09 dice que «cada contador abre la lista filtrada», y
// acá los contadores no son enlaces. La pantalla de Unidades todavía no tiene filtro por estado, y
// además mete reparación y revisión en el mismo grupo; las dos cosas las arregla la 24.5.2
// (brief-24.5.1, H-3 y D-6).
const ICONS = {
  available: "circleCheck",
  reserved: "lock",
  in_review: "clock",
} as const;

export function UnitCountersPanel({ counts }: { counts: UnitStatusCounts }) {
  const counters = unitCounters(counts);
  const physical = physicalUnits(counts);
  const outside = outsideBalance(counts);
  return (
    <section aria-labelledby="unidades-titulo" className="mt-6">
      <h2 id="unidades-titulo" className="sr-only">
        Unidades del producto
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {counters.map((counter) => (
          <StatTile
            key={counter.key}
            icon={ICONS[counter.key]}
            value={String(counter.total)}
            label={counter.label}
          />
        ))}
      </div>
      {/* AC-5 pide la explicación **sin condición**: antes solo aparecía si había algo en
          reparación o en revisión, y entonces un producto con todo disponible no explicaba qué
          cuenta el saldo (hallazgo N-5 de la revisión independiente del 2026-10-31). Ahora la
          regla se dice siempre, y el recuento de lo que está fuera del saldo se agrega solo
          cuando hay algo fuera, que es lo que sí depende del dato. */}
      <p className="mt-3 text-sm text-muted">
        {physical === 1 ? "1 unidad física" : `${physical} unidades físicas`} en
        el local. El saldo cuenta las disponibles y las reservadas: lo que está
        en reparación o en revisión queda fuera.
        {outside > 0 ? (
          <>
            {" "}
            {outside === 1
              ? "Hoy hay una fuera del saldo."
              : `Hoy hay ${outside} fuera del saldo.`}
          </>
        ) : null}
      </p>
    </section>
  );
}
