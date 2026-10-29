import type { ConversationTimelineEntry } from "@/modules/conversations";
import {
  calendarDayIn,
  formatDate,
  formatTime,
  shiftDays,
} from "@/app/_format/date-time";
import {
  DIRECTION_LABEL,
  FORMER_MEMBER_TEXT,
  kindLabel,
  senderLabel,
  type MessageTimelineItem,
  type TimelineItem,
} from "../messages";

// El hilo del servicio a lo que muestra el timeline, con la zona de la organización: mensajes y,
// desde la 24.3, notas intercaladas (brief-24.3, D-5). El cuerpo viaja tal cual: lo escapa React
// al renderizarlo como texto (Screens §9). Desde la 24.3.1, cada entrada lleva su conversación,
// para los separadores del hilo unido, y la píldora del día dice «Hoy · 27 oct» (brief-24.3.1).

// «27 oct», con el año si no es el actual: la píldora de los mockups 02 y 04.
export function dayLabel(
  value: Date,
  timeZone: string,
  now = new Date(),
): string {
  const day = calendarDayIn(timeZone, value);
  const today = calendarDayIn(timeZone, now);
  const short = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "numeric",
    month: "short",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  })
    .format(value)
    .replace(/\./g, "")
    .replace(/ de /g, " ");
  if (day === today) return `Hoy · ${short}`;
  if (day === shiftDays(today, -1)) return `Ayer · ${short}`;
  return short;
}

function avatarOf(
  entry: Extract<ConversationTimelineEntry, { type: "message" }>,
): MessageTimelineItem["avatar"] {
  if (entry.direction === "inbound") return "client";
  return entry.sentBy ?? "business";
}

export function toTimelineItems(
  entries: ConversationTimelineEntry[],
  timeZone: string,
  now = new Date(),
): TimelineItem[] {
  return entries.map((entry) =>
    entry.type === "message"
      ? {
          type: "message",
          id: entry.id,
          conversationId: entry.conversationId,
          avatar: avatarOf(entry),
          direction: entry.direction,
          directionLabel: DIRECTION_LABEL[entry.direction],
          kindLabel: kindLabel(entry.kind),
          senderLabel: senderLabel(entry.sentBy),
          day: formatDate(entry.sentAt, timeZone),
          dayLabel: dayLabel(entry.sentAt, timeZone, now),
          time: formatTime(entry.sentAt, timeZone),
          body: entry.body,
        }
      : {
          type: "note",
          id: entry.id,
          conversationId: entry.conversationId,
          author: entry.author.name || FORMER_MEMBER_TEXT,
          day: formatDate(entry.createdAt, timeZone),
          dayLabel: dayLabel(entry.createdAt, timeZone, now),
          time: formatTime(entry.createdAt, timeZone),
          body: entry.body,
        },
  );
}
