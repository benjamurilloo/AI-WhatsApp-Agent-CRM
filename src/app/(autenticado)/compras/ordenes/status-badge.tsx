import type { PurchaseOrderStatus } from "@/modules/purchasing";
import type { IconName } from "@/app/_components/icons";
import { StatusBadge, type StatusTone } from "@/app/_components/status-badge";
import { STATUS_LABEL } from "./messages";

// El estado de una orden nunca depende solo del color: lleva ícono y texto, como el del pedido
// (Screens.md §3), con la insignia compartida (brief-24.1, D-6).

const ICON: Record<PurchaseOrderStatus, IconName> = {
  open: "clock",
  closed: "circleCheck",
  cancelled: "circleX",
};

const TONE: Record<PurchaseOrderStatus, StatusTone> = {
  open: "warning",
  closed: "success",
  cancelled: "neutral",
};

export function PurchaseOrderStatusBadge({
  status,
}: {
  status: PurchaseOrderStatus;
}) {
  return (
    <StatusBadge tone={TONE[status]} icon={ICON[status]}>
      {STATUS_LABEL[status]}
    </StatusBadge>
  );
}
