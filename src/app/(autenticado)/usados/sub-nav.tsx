import { SubNav } from "@/app/_components/sub-nav";
import { StatusBadge } from "@/app/_components/status-badge";

// Las pantallas de Usados (brief-29.7, D-7): las recepciones y, para un admin, el checklist, como la
// navegación interna de Reparaciones. Desde la 29.7.3 (brief-29.7.3, D-5), también para un admin, la
// cotización y su configuración.
export function TradeInsSubNav({
  current,
  isAdmin,
}: {
  current: "recepciones" | "checklist" | "cotizar" | "configuracion";
  isAdmin: boolean;
}) {
  return (
    <SubNav
      label="Secciones de usados"
      items={[
        {
          href: "/usados",
          label: "Recepciones",
          icon: "smartphone",
          current: current === "recepciones",
        },
        ...(isAdmin
          ? [
              {
                href: "/usados/checklist",
                label: "Checklist",
                icon: "list" as const,
                current: current === "checklist",
              },
              {
                href: "/usados/cotizar",
                label: "Cotizar",
                icon: "tag" as const,
                current: current === "cotizar",
              },
              {
                href: "/usados/configuracion",
                label: "Configuración",
                icon: "wrench" as const,
                current: current === "configuracion",
              },
            ]
          : []),
      ]}
    />
  );
}

// El estado de una recepción nunca depende solo del color: lleva ícono y texto, con la insignia
// compartida (brief-24.1, D-6).
export function TradeInStatusBadge({ voided }: { voided: boolean }) {
  return (
    <StatusBadge
      tone={voided ? "neutral" : "success"}
      icon={voided ? "circleX" : "circleCheck"}
    >
      {voided ? "Anulada" : "Vigente"}
    </StatusBadge>
  );
}
