import { SubNav } from "@/app/_components/sub-nav";
import type { IconName } from "@/app/_components/icons";
import { StatusBadge, type StatusTone } from "@/app/_components/status-badge";
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
// (Screens.md §3), con la insignia compartida (brief-24.1, D-6).
const ICON: Record<ServiceOrderStatus, IconName> = {
  received: "clock",
  sent: "send",
  quoted: "fileText",
  approved: "check",
  rejected: "circleX",
  repaired: "wrench",
  delivered: "circleCheck",
  cancelled: "circleX",
};

const TONE: Record<ServiceOrderStatus, StatusTone> = {
  received: "warning",
  sent: "warning",
  quoted: "primary",
  approved: "primary",
  rejected: "neutral",
  repaired: "success",
  delivered: "success",
  cancelled: "neutral",
};

export function ServiceOrderStatusBadge({
  status,
}: {
  status: ServiceOrderStatus;
}) {
  return (
    <StatusBadge tone={TONE[status]} icon={ICON[status]}>
      {STATUS_LABEL[status]}
    </StatusBadge>
  );
}
