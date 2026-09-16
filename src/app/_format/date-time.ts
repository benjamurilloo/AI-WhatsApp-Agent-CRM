// Fechas en la zona de la organización, formateadas en el servidor (brief-4.4, D-3).
// La zona es la que devuelve el servicio, nunca la del navegador (DataModel, regla 3).

const CACHE = new Map<string, Intl.DateTimeFormat>();

// Intl puede devolver "9/9" aunque se pidan dos dígitos, según cómo combine las opciones
// del locale: el relleno se hace acá para que el formato no dependa de esa decisión.
const pad = (value: string) => value.padStart(2, "0");

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let found = CACHE.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat("es-AR", { timeZone, ...options });
    CACHE.set(key, found);
  }
  return found;
}

// "10/09 14:02": lo que muestra la tabla del historial.
export function formatShortDateTime(value: Date, timeZone: string): string {
  const parts = formatter(timeZone, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const of = (type: Intl.DateTimeFormatPartTypes) =>
    pad(parts.find((part) => part.type === type)?.value ?? "");
  return `${of("day")}/${of("month")} ${of("hour")}:${of("minute")}`;
}

// "10/09/2026 14:02": texto accesible completo, para el title y el detalle.
export function formatFullDateTime(value: Date, timeZone: string): string {
  const parts = formatter(timeZone, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const of = (type: Intl.DateTimeFormatPartTypes) =>
    pad(parts.find((part) => part.type === type)?.value ?? "");
  return `${of("day")}/${of("month")}/${of("year")} ${of("hour")}:${of("minute")}`;
}

// Día de calendario en la zona de la organización, como lo espera el filtro: YYYY-MM-DD.
export function calendarDayIn(timeZone: string, value = new Date()): string {
  const parts = formatter(timeZone, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(value);
  const of = (type: Intl.DateTimeFormatPartTypes) =>
    pad(parts.find((part) => part.type === type)?.value ?? "");
  return `${of("year")}-${of("month")}-${of("day")}`;
}

// Corre un día de calendario, sin pasar por husos: "2026-03-01" menos 1 es "2026-02-28".
export function shiftDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}
