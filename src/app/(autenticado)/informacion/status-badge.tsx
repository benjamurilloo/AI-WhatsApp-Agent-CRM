import type { KnowledgeStatus } from "@/modules/knowledge";
import type { IconName } from "@/app/_components/icons";
import { StatusBadge, type StatusTone } from "@/app/_components/status-badge";
import { STATUS_LABEL } from "./messages";

// El estado de vigencia nunca depende solo del color: lleva ícono y texto, como el estado de stock
// (FR-INFO-03), con la insignia compartida (brief-24.1, D-6).

const ICON: Record<KnowledgeStatus, IconName> = {
  current: "circleCheck",
  scheduled: "calendar",
  expired: "alert",
  inactive: "circleMinus",
};

const TONE: Record<KnowledgeStatus, StatusTone> = {
  current: "success",
  scheduled: "primary",
  expired: "warning",
  inactive: "neutral",
};

export function KnowledgeStatusBadge({ status }: { status: KnowledgeStatus }) {
  return (
    <StatusBadge tone={TONE[status]} icon={ICON[status]}>
      {STATUS_LABEL[status]}
    </StatusBadge>
  );
}
