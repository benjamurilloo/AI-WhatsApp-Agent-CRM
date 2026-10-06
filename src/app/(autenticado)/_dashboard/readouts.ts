import type {
  DailyActivity,
  FirstResponseBucket,
  MessageKindCount,
} from "@/modules/analytics";
import { formatCount, formatPercentage } from "./format";
import { formatCalendarDay } from "./period";

// Textos de los gráficos del dashboard (brief-15.3, D-4 a D-6): los nombres de los grupos y la línea
// de lectura de cada forma. Funciones puras, para probar los textos sin renderizar.

const weekday = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  timeZone: "UTC",
});

// «Sáb 12/09/2026». El día es de calendario en la zona de la organización: se lee como UTC para
// que la zona de la máquina no lo corra.
export function dayWithWeekday(day: string): string {
  const name = weekday.format(new Date(`${day}T00:00:00Z`)).replace(".", "");
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${formatCalendarDay(day)}`;
}

const plural = (count: number, one: string, many: string) =>
  `${formatCount(count)} ${count === 1 ? one : many}`;

export function dailyReadout(
  row: DailyActivity,
  series: "conversaciones" | "mensajes",
): string {
  if (series === "conversaciones") {
    return `${dayWithWeekday(row.day)}: ${plural(row.started, "conversación iniciada", "conversaciones iniciadas")}`;
  }
  const total = row.inbound + row.outbound;
  return `${dayWithWeekday(row.day)}: ${plural(total, "mensaje", "mensajes")} (${plural(row.inbound, "entrante", "entrantes")}, ${plural(row.outbound, "saliente", "salientes")})`;
}

// Métrica 13: el nombre de cada tipo, en el orden del dominio, y «Sin dato» para los nulos.
const KIND_LABEL: Record<NonNullable<MessageKindCount["kind"]>, string> = {
  text: "Texto",
  audio: "Audio",
  image: "Imagen",
  video: "Video",
  document: "Documento",
  other: "Otro",
};

export function kindLabel(kind: MessageKindCount["kind"]): string {
  return kind === null ? "Sin dato" : KIND_LABEL[kind];
}

export function share(count: number, total: number): string {
  return formatPercentage(total === 0 ? 0 : (count * 100) / total);
}

export function kindReadout(group: MessageKindCount, total: number): string {
  return `${kindLabel(group.kind)}: ${plural(group.count, "mensaje", "mensajes")} (${share(group.count, total)})`;
}

// Métrica 14: «Menos de 1 min», «30 a 60 min», «1 h o más». Solo el último rango, abierto, se nombra
// en horas, como en el boceto.
export function bucketLabel(bucket: FirstResponseBucket): string {
  if (bucket.toMinutes === null) {
    const from = bucket.fromMinutes;
    return from % 60 === 0 ? `${from / 60} h o más` : `${from} min o más`;
  }
  if (bucket.fromMinutes === 0) return `Menos de ${bucket.toMinutes} min`;
  return `${bucket.fromMinutes} a ${bucket.toMinutes} min`;
}

export function bucketReadout(bucket: FirstResponseBucket): string {
  return `${bucketLabel(bucket)}: ${plural(bucket.count, "conversación", "conversaciones")}`;
}
