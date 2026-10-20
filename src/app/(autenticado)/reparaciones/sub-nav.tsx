import { SubNav } from "@/app/_components/sub-nav";
import type { ServiceOrderStatus } from "@/modules/service";
import { STATUS_LABEL } from "./messages";

// Las pantallas de Reparaciones (brief-29.6, D-10): las órdenes de servicio y la lista de reparaciones
// por modelo, como la navegación interna de Compras.
export function RepairsSubNav({ current }: { current: "ordenes" | "lista" }) {
  return (
    <SubNav
      label="Secciones de reparaciones"
      items={[
        {
          href: "/reparaciones",
          label: "Órdenes de servicio",
          icon: "wrench",
          current: current === "ordenes",
        },
        {
          href: "/reparaciones/lista",
          label: "Lista de reparaciones",
          icon: "list",
          current: current === "lista",
        },
      ]}
    />
  );
}

// El estado de una orden nunca depende solo del color: lleva ícono y texto, como el del pedido
// (Screens.md §3). El ícono es decorativo.
const ICON: Record<ServiceOrderStatus, string> = {
  received: "●",
  sent: "→",
  quoted: "$",
  approved: "✓",
  rejected: "✕",
  repaired: "✓",
  delivered: "✓",
  cancelled: "✕",
};

const TONE: Record<ServiceOrderStatus, string> = {
  received: "bg-warning-soft text-on-warning-soft",
  sent: "bg-warning-soft text-on-warning-soft",
  quoted: "bg-primary-soft text-on-primary-soft",
  approved: "bg-primary-soft text-on-primary-soft",
  rejected: "bg-surface-muted text-muted",
  repaired: "bg-success-soft text-on-success-soft",
  delivered: "bg-success-soft text-on-success-soft",
  cancelled: "bg-surface-muted text-muted",
};

export function ServiceOrderStatusBadge({
  status,
}: {
  status: ServiceOrderStatus;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap ${TONE[status]}`}
    >
      <span aria-hidden="true">{ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
