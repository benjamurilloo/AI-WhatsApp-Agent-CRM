import { SubNav } from "@/app/_components/sub-nav";

// Las pantallas de Usados (brief-29.7, D-7): las recepciones y, para un admin, el checklist, como la
// navegación interna de Reparaciones.
export function TradeInsSubNav({
  current,
  isAdmin,
}: {
  current: "recepciones" | "checklist";
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
