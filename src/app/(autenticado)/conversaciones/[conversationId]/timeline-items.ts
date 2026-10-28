import type { ConversationTimelineEntry } from "@/modules/conversations";
import { formatDate, formatTime } from "@/app/_format/date-time";
import {
  DIRECTION_LABEL,
  FORMER_MEMBER_TEXT,
  kindLabel,
  senderLabel,
  type TimelineItem,
} from "../messages";

// El hilo del servicio a lo que muestra el timeline, con la zona de la organización: mensajes y,
// desde la 24.3, notas intercaladas (brief-24.3, D-5). El cuerpo viaja tal cual: lo escapa React
// al renderizarlo como texto (Screens §9).
export function toTimelineItems(
  entries: ConversationTimelineEntry[],
  timeZone: string,
): TimelineItem[] {
  return entries.map((entry) =>
    entry.type === "message"
      ? {
          type: "message",
          id: entry.id,
          direction: entry.direction,
          directionLabel: DIRECTION_LABEL[entry.direction],
          kindLabel: kindLabel(entry.kind),
          senderLabel: senderLabel(entry.sentBy),
          day: formatDate(entry.sentAt, timeZone),
          time: formatTime(entry.sentAt, timeZone),
          body: entry.body,
        }
      : {
          type: "note",
          id: entry.id,
          author: entry.author.name || FORMER_MEMBER_TEXT,
          day: formatDate(entry.createdAt, timeZone),
          time: formatTime(entry.createdAt, timeZone),
          body: entry.body,
        },
  );
}
