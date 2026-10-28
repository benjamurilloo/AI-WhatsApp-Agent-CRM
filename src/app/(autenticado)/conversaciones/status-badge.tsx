import type { ConversationStatus } from "@/modules/conversations";
import type { IconName } from "@/app/_components/icons";
import {
  StatusBadge as Badge,
  type StatusTone,
} from "@/app/_components/status-badge";
import { STATUS_LABEL } from "./messages";

// Estado de una conversación como texto (Screens §8): el color acompaña, no informa solo. Lleva
// ícono, con la insignia compartida (brief-24.1, D-6), y conserva sus tonos.
const ICON: Record<ConversationStatus, IconName> = {
  open: "circleCheck",
  pending: "clock",
  closed: "circleMinus",
};

const TONE: Record<ConversationStatus, StatusTone> = {
  open: "success",
  pending: "primary",
  closed: "neutral",
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return (
    <Badge tone={TONE[status]} icon={ICON[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
