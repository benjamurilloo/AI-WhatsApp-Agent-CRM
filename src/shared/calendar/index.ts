import { z } from "zod";

// Fechas de calendario YYYY-MM-DD de los filtros de período (brief-4.3.3, D-3; compartidas desde
// brief-6.3, D-5). Se interpretan como días de la zona de la organización en la consulta.

// Fecha de calendario real con año de cuatro cifras: descarta "2026-02-30" y el año 0.
export function isCalendarDate(value: string): boolean {
  const match = /^([1-9]\d{3})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Filtro de URL: vacío no limita y queda en null.
export const optionalCalendarDate = z
  .string()
  .trim()
  .refine((value) => value === "" || isCalendarDate(value))
  .transform((value) => (value === "" ? null : value));
