import type { ConversationMessage } from "@/modules/conversations";
import { formatDate, formatTime } from "@/app/_format/date-time";
import { DIRECTION_LABEL, type TimelineItem } from "../messages";

// Mensajes del servicio a lo que muestra el timeline, con la zona de la organización. El cuerpo
// viaja tal cual: lo escapa React al renderizarlo como texto (Screens §9).
export function toTimelineItems(
  messages: ConversationMessage[],
  timeZone: string,
): TimelineItem[] {
  return messages.map((message) => ({
    id: message.id,
    direction: message.direction,
    directionLabel: DIRECTION_LABEL[message.direction],
    day: formatDate(message.sentAt, timeZone),
    time: formatTime(message.sentAt, timeZone),
    body: message.body,
  }));
}
