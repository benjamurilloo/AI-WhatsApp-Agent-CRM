import { getMainCurrency } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { SubNav } from "@/app/_components/sub-nav";

// Las pantallas de la caja (brief-21.2, D-10): el estado de hoy, las sesiones, los medios de pago
// y, desde la 21.3, los cobros (brief-21.3, D-8), y desde la 21.5, las devoluciones (brief-21.5,
// D-9). Desde la 29.4, la cotización, solo en una organización con moneda principal (brief-29.4, D-4):
// sin ella, la sección no existe.
//
// **Los deudores ya no están acá** (brief-24.7.2, D-2). Hasta la 24.7.1 eran una sección de la
// caja, por historia: la 21.6 los puso ahí. Las láminas del lote V2-10 los dibujan como «Cuentas
// de clientes», un ítem propio de Finanzas y hermano de Caja, y tienen razón: la cuenta de un
// cliente no es caja. La caja es el efectivo de una sesión; la cuenta existe aunque la caja esté
// cerrada. Esto enmienda la D-3 de la 24.7.1, que los había devuelto a esta barra.
export async function CashSubNav({
  current,
}: {
  current:
    "caja" | "sesiones" | "cobros" | "devoluciones" | "cotizacion" | "medios";
}) {
  const context = await requireSession();
  const mainCurrency = await getMainCurrency(context.organizationId);
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
        ...(mainCurrency
          ? [
              {
                href: "/caja/cotizacion",
                label: "Cotización",
                icon: "trendingUp" as const,
                current: current === "cotizacion",
              },
            ]
          : []),
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
