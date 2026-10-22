import { SubNav } from "@/app/_components/sub-nav";

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

// El estado de una recepción nunca depende solo del color: lleva ícono y texto. El ícono es decorativo.
export function TradeInStatusBadge({ voided }: { voided: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap ${
        voided
          ? "bg-surface-muted text-muted"
          : "bg-success-soft text-on-success-soft"
      }`}
    >
      <span aria-hidden="true">{voided ? "✕" : "✓"}</span>
      {voided ? "Anulada" : "Vigente"}
    </span>
  );
}
