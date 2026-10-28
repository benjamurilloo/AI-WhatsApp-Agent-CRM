import type { OrderStatus } from "@/modules/orders";
import type { IconName } from "@/app/_components/icons";
import { StatusBadge, type StatusTone } from "@/app/_components/status-badge";
import { STATUS_LABEL } from "./messages";

// El estado de un pedido nunca depende solo del color: lleva ícono y texto, como el estado de
// stock (Screens.md §3), con la insignia compartida (brief-24.1, D-6).

const ICON: Record<OrderStatus, IconName> = {
  pending: "clock",
  confirmed: "check",
  delivered: "circleCheck",
  cancelled: "circleX",
};

const TONE: Record<OrderStatus, StatusTone> = {
  pending: "warning",
  confirmed: "primary",
  delivered: "success",
  cancelled: "neutral",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <StatusBadge tone={TONE[status]} icon={ICON[status]}>
      {STATUS_LABEL[status]}
    </StatusBadge>
  );
}
