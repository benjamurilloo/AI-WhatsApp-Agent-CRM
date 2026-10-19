import { getMainCurrency } from "@/modules/organizations";
import { requireSession } from "@/app/_auth/session";
import { SubNav } from "@/app/_components/sub-nav";

// Las pantallas de la caja (brief-21.2, D-10): el estado de hoy, las sesiones, los medios de pago
// y, desde la 21.3, los cobros (brief-21.3, D-8); desde la 21.5, las devoluciones (brief-21.5, D-9), y
// desde la 21.6, los deudores (brief-21.6, D-6). Desde la 29.4, la cotización, solo en una
// organización con moneda principal (brief-29.4, D-4): sin ella, la sección no existe.
export async function CashSubNav({
  current,
}: {
  current:
    | "caja"
    | "sesiones"
    | "cobros"
    | "devoluciones"
    | "deudores"
    | "cotizacion"
    | "medios";
}) {
  const context = await requireSession();
  const mainCurrency = await getMainCurrency(context.organizationId);
  return (
    <SubNav
      label="Secciones de la caja"
      items={[
        {
          href: "/caja",
          label: "Caja de hoy",
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
        {
          href: "/caja/deudores",
          label: "Deudores",
          icon: "users",
          current: current === "deudores",
        },
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
