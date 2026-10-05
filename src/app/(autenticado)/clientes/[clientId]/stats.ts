// Estadísticas del detalle de un cliente (brief-15.4, D-6): solo lo que la página ya carga.

const DAY_MS = 24 * 60 * 60 * 1000;

// Días enteros transcurridos desde la última interacción: «Hoy», «1 día», «12 días». Una fecha
// futura, que solo puede venir de un reloj desfasado, cuenta como hoy.
export function daysSinceText(at: Date, now: Date): string {
  const days = Math.floor((now.getTime() - at.getTime()) / DAY_MS);
  if (days < 1) return "Hoy";
  return days === 1 ? "1 día" : `${days} días`;
}
