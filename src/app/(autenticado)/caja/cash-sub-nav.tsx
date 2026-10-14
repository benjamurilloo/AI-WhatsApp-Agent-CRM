import { SubNav } from "@/app/_components/sub-nav";

// Las tres pantallas de la caja (brief-21.2, D-10): el estado de hoy, las sesiones y los medios de
// pago.
export function CashSubNav({
  current,
}: {
  current: "caja" | "sesiones" | "medios";
}) {
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
          href: "/caja/medios-de-pago",
          label: "Medios de pago",
          icon: "creditCard",
          current: current === "medios",
        },
      ]}
    />
  );
}
