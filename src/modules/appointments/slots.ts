// Las franjas de un día y su ocupación (brief-29.10, D-3 y U-5), en la hora local de la organización,
// como texto HH:MM. Funciones puras: el horario lo lee knowledge, y la conversión a un instante la hace
// PostgreSQL en la zona de la organización.

export type OpeningSpan = { opens: string; closes: string };
export type BookingSlot = { start: string; end: string };

export type AppointmentStatus =
  "requested" | "confirmed" | "cancelled" | "attended" | "no_show";

// Ocupan su franja: el pedido, porque una persona todavía lo puede confirmar (ADR 0024, punto 12), y el
// confirmado.
export const OCCUPYING_STATUSES: readonly AppointmentStatus[] = [
  "requested",
  "confirmed",
];

// AAAA-MM-DD más días, en el calendario (sin zona: es una fecha, no un instante).
export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function fromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// Las franjas (BookingSlot): desde la apertura de cada tramo del horario (OpeningSpan), una cada
// slotMinutes, mientras termine antes del cierre o justo en él. Un tramo más corto que una franja no da
// ninguna.
export function buildBookingSlots(
  spans: OpeningSpan[],
  slotMinutes: number,
): BookingSlot[] {
  const slots: BookingSlot[] = [];
  for (const span of spans) {
    const closes = toMinutes(span.closes);
    for (
      let start = toMinutes(span.opens);
      start + slotMinutes <= closes;
      start += slotMinutes
    ) {
      slots.push({
        start: fromMinutes(start),
        end: fromMinutes(start + slotMinutes),
      });
    }
  }
  return slots;
}

// [a, b) y [c, d) se superponen si cada uno empieza antes de que termine el otro.
export function overlaps(a: BookingSlot, b: BookingSlot): boolean {
  return (
    toMinutes(a.start) < toMinutes(b.end) &&
    toMinutes(b.start) < toMinutes(a.end)
  );
}

export function isInsideHours(
  slot: BookingSlot,
  spans: OpeningSpan[],
): boolean {
  return spans.some(
    (span) =>
      toMinutes(span.opens) <= toMinutes(slot.start) &&
      toMinutes(slot.end) <= toMinutes(span.closes),
  );
}

export type OccupiedSlot = BookingSlot & { occupied: number };

// Cuántos turnos que ocupan se superponen a cada franja.
export function occupancy(
  slots: BookingSlot[],
  taken: (BookingSlot & { status: AppointmentStatus })[],
): OccupiedSlot[] {
  const occupying = taken.filter((item) =>
    OCCUPYING_STATUSES.includes(item.status),
  );
  return slots.map((slot) => ({
    ...slot,
    occupied: occupying.filter((item) => overlaps(slot, item)).length,
  }));
}

// Las transiciones de un turno (D-2): el trigger appointments_guard_change (0065) exige las mismas.
const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "attended", "no_show"],
  cancelled: [],
  attended: [],
  no_show: [],
};

export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

// Atendido y ausente, solo después de que el turno empezó.
export function needsStarted(to: AppointmentStatus): boolean {
  return to === "attended" || to === "no_show";
}
