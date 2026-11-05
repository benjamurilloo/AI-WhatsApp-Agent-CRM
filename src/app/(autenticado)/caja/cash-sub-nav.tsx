import { SubNav } from "@/app/_components/sub-nav";

// Las pantallas de la caja (brief-21.2, D-10): el estado de hoy, las sesiones, los medios de pago
// y, desde la 21.3, los cobros (brief-21.3, D-8), y desde la 21.5, las devoluciones (brief-21.5,
// D-9).
//
// **El tipo de cambio ya no está acá** (brief-24.7.3, D-1), por el mismo motivo por el que se
// fueron los deudores: la navegación lo nombra «Tipo de cambio», ítem de Finanzas hermano de Caja,
// y su lámina lo dibuja como una pantalla propia. Esto enmienda la D-4 de la 29.4, que lo había
// puesto en esta barra, y la D-3 de la 24.7.1, que lo dejó entre los destinos secundarios. **La
// ruta sigue siendo `/caja/cotizacion`**: las cuatro revalidaciones de `/caja` la cubren, y
// mudarla es el defecto que la revisión de la 24.7.2 encontró en `/cuentas`.
//
// **Los deudores ya no están acá** (brief-24.7.2, D-2). Hasta la 24.7.1 eran una sección de la
// caja, por historia: la 21.6 los puso ahí. Las láminas del lote V2-10 los dibujan como «Cuentas
// de clientes», un ítem propio de Finanzas y hermano de Caja, y tienen razón: la cuenta de un
// cliente no es caja. La caja es el efectivo de una sesión; la cuenta existe aunque la caja esté
// cerrada. Esto enmienda la D-3 de la 24.7.1, que los había devuelto a esta barra.
// Desde la 24.7.3 **no lee nada**: pedía la moneda principal para decidir si ofrecía el tipo de
// cambio, y el tipo de cambio se fue de acá. El `requireSession()` que quedó colgado —sin usar su
// resultado— lo sacó la revisión independiente (N-6); la sesión la exige cada página antes de
// dibujar la barra, y el layout de `(autenticado)` antes que ellas.
export function CashSubNav({
  current,
}: {
  current: "caja" | "sesiones" | "cobros" | "devoluciones" | "medios";
}) {
  return (
    <SubNav
      label="Secciones de la caja"
      items={[
        {
          href: "/caja",
          label: "Caja actual",
          icon: "banknote",
          current: current === "caja",
        },
        {
          href: "/caja/sesiones",
          label: "Sesiones",
          icon: "history",
          current: current === "sesiones",
        },
        {
          href: "/caja/cobros",
          label: "Cobros",
          icon: "receipt",
          current: current === "cobros",
        },
        {
          href: "/caja/devoluciones",
          label: "Devoluciones",
          icon: "undo",
          current: current === "devoluciones",
        },
      ]}
      // Los destinos secundarios de la lámina 01 (brief-24.7.1, D-3): se consultan y se configuran,
      // no son el trabajo del día. Si estás parado en uno, la barra lo muestra igual.
      more={[
        {
          href: "/caja/medios-de-pago",
          label: "Medios de pago",
          icon: "creditCard",
          current: current === "medios",
        },
      ]}
    />
  );
}
