import type { ConversationStatus } from "@/modules/conversations";
import {
  activeBadgeClass,
  inactiveBadgeClass,
  roleBadgeClass,
} from "@/app/_components/form-styles";
import { STATUS_LABEL } from "./messages";

// Estado de una conversación como texto (Screens §8): el color acompaña, no informa solo.
const STATUS_CLASS: Record<ConversationStatus, string> = {
  open: activeBadgeClass,
  pending: roleBadgeClass,
  closed: inactiveBadgeClass,
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  return <span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span>;
}
