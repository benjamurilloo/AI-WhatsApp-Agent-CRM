import type { KnowledgeStatus } from "@/modules/knowledge";
import { STATUS_LABEL } from "./messages";

// El estado de vigencia nunca depende solo del color: lleva ícono y texto, como el estado de stock
// (FR-INFO-03). El ícono es decorativo; el texto es el que leen los lectores de pantalla.

const ICON: Record<KnowledgeStatus, string> = {
  current: "✓",
  scheduled: "◷",
  expired: "▲",
  inactive: "–",
};

const TONE: Record<KnowledgeStatus, string> = {
  current: "bg-success-soft text-on-success-soft",
  scheduled: "bg-primary-soft text-on-primary-soft",
  expired: "bg-warning-soft text-on-warning-soft",
  inactive: "bg-surface-muted text-muted",
};

export function KnowledgeStatusBadge({ status }: { status: KnowledgeStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap ${TONE[status]}`}
    >
      <span aria-hidden="true">{ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
