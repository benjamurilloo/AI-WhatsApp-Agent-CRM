// La antigüedad de una cotización (ADR 0025, punto 4, H-7; brief-29.4, D-4): nada se bloquea, pero
// cada pantalla que la usa avisa si tiene más de 24 horas sin contar sábados ni domingos, en la zona
// horaria de la organización. Un feriado puede dar un aviso de más, y eso se acepta.

export const STALE_AFTER_HOURS = 24;

const STEP_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// Cuatro días corridos tienen al menos 48 horas hábiles: más que eso ya es viejo, sin contar.
const SURELY_STALE_MS = 4 * 24 * HOUR_MS;

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

function isWeekend(instant: Date, timezone: string): boolean {
  let formatter = weekdayFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    weekdayFormatters.set(timezone, formatter);
  }
  const weekday = formatter.format(instant);
  return weekday === "Sat" || weekday === "Sun";
}

// Milisegundos de lunes a viernes entre dos instantes, en tramos de cinco minutos: el error es a lo
// sumo un tramo, que no cambia un aviso de 24 horas.
export function weekdayMillisecondsBetween(
  from: Date,
  to: Date,
  timezone: string,
): number {
  let elapsed = 0;
  for (let at = from.getTime(); at < to.getTime(); at += STEP_MS) {
    const step = Math.min(STEP_MS, to.getTime() - at);
    if (!isWeekend(new Date(at + step / 2), timezone)) elapsed += step;
  }
  return elapsed;
}

export function isStale(since: Date, now: Date, timezone: string): boolean {
  if (now.getTime() - since.getTime() > SURELY_STALE_MS) return true;
  return (
    weekdayMillisecondsBetween(since, now, timezone) >
    STALE_AFTER_HOURS * HOUR_MS
  );
}
