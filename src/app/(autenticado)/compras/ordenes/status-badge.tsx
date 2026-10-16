import type { PurchaseOrderStatus } from "@/modules/purchasing";
import { STATUS_LABEL } from "./messages";

// El estado de una orden nunca depende solo del color: lleva ícono y texto, como el del pedido
// (Screens.md §3). El ícono es decorativo.

const ICON: Record<PurchaseOrderStatus, string> = {
  open: "●",
  closed: "✓",
  cancelled: "✕",
};

const TONE: Record<PurchaseOrderStatus, string> = {
  open: "bg-warning-soft text-on-warning-soft",
  closed: "bg-success-soft text-on-success-soft",
  cancelled: "bg-surface-muted text-muted",
};

export function PurchaseOrderStatusBadge({
  status,
}: {
  status: PurchaseOrderStatus;
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
