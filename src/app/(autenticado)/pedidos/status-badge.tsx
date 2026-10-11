import type { OrderStatus } from "@/modules/orders";
import { STATUS_LABEL } from "./messages";

// El estado de un pedido nunca depende solo del color: lleva ícono y texto, como el estado de
// stock (Screens.md §3). El ícono es decorativo.

const ICON: Record<OrderStatus, string> = {
  pending: "●",
  confirmed: "✓",
  delivered: "✓✓",
  cancelled: "✕",
};

const TONE: Record<OrderStatus, string> = {
  pending: "bg-warning-soft text-on-warning-soft",
  confirmed: "bg-primary-soft text-on-primary-soft",
  delivered: "bg-success-soft text-on-success-soft",
  cancelled: "bg-surface-muted text-muted",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap ${TONE[status]}`}
    >
      <span aria-hidden="true">{ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
