// La regla de la garantía (ADR 0024, punto 11; brief-29.9, D-2): una función pura, que usan la unidad
// vendida (inventory) y la reparación entregada (service). La garantía se deriva y no se guarda: el
// inicio y los días los pasa quien lee, y el vencimiento es la fecha local del inicio, en la zona de la
// organización, más los días. Cubre todo ese día: con cero días, vence el mismo día del inicio.

export type WarrantySource = "unit" | "settings";

export type Warranty =
  | {
      status: "in_warranty" | "expired";
      startedAt: Date;
      days: number;
      // De dónde salen los días: los propios de la unidad o los de la organización.
      source: WarrantySource;
      // La fecha local del inicio y la del último día cubierto, AAAA-MM-DD.
      startsOn: string;
      endsOn: string;
    }
  // El equipo volvió al local: hay una unidad posterior con su IMEI (U-4).
  | { status: "returned" }
  // La organización no tiene días configurados: nunca se inventa un valor.
  | { status: "not_configured" };

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

// La fecha local de un instante en una zona, AAAA-MM-DD. en-CA da ese formato.
export function localDate(instant: Date, timezone: string): string {
  let formatter = dateFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatters.set(timezone, formatter);
  }
  return formatter.format(instant);
}

// Suma días a una fecha de calendario, sin horas: no la mueve un cambio de horario.
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year!, month! - 1, day! + days));
  return result.toISOString().slice(0, 10);
}

export function deriveWarranty(input: {
  startedAt: Date;
  days: number | null;
  source: WarrantySource;
  timezone: string;
  now: Date;
}): Warranty {
  const { startedAt, days, source, timezone, now } = input;
  if (days === null) return { status: "not_configured" };
  const startsOn = localDate(startedAt, timezone);
  const endsOn = addDays(startsOn, days);
  // Las fechas AAAA-MM-DD se comparan como texto.
  const status = localDate(now, timezone) <= endsOn ? "in_warranty" : "expired";
  return { status, startedAt, days, source, startsOn, endsOn };
}
