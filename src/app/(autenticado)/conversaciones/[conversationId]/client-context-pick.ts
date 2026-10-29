import { formatDayDate } from "@/app/(autenticado)/informacion/horario/messages";

// Qué reparación y qué turno muestra el contexto del cliente (brief-24.3, D-6). Puro: la página
// compone las lecturas de service y appointments, sin JOIN entre módulos.

const CLOSED_ORDER_STATUSES: readonly string[] = ["delivered", "cancelled"];
const PENDING_APPOINTMENT_STATUSES: readonly string[] = [
  "requested",
  "confirmed",
];

// La orden más reciente que no esté entregada ni cancelada. Las órdenes llegan de la más nueva a
// la más vieja, como en la ficha del cliente.
export function pickOpenServiceOrder<T extends { status: string }>(
  orders: readonly T[],
): T | null {
  return (
    orders.find((order) => !CLOSED_ORDER_STATUSES.includes(order.status)) ??
    null
  );
}

// El próximo turno pedido o confirmado desde hoy, en días de la organización. Fechas YYYY-MM-DD y
// horas HH:MM, que se comparan como texto.
export function pickNextAppointment<
  T extends { date: string; start: string; status: string },
>(appointments: readonly T[], today: string): T | null {
  let next: T | null = null;
  for (const item of appointments) {
    if (!PENDING_APPOINTMENT_STATUSES.includes(item.status)) continue;
    if (item.date < today) continue;
    if (
      next === null ||
      item.date < next.date ||
      (item.date === next.date && item.start < next.start)
    ) {
      next = item;
    }
  }
  return next;
}

// El día de un turno en el contexto: «Hoy» y «Mañana», o el día de la semana con la fecha, como el
// mockup 02 (brief-24.3.1). Fechas YYYY-MM-DD.
export function appointmentDayText(date: string, today: string): string {
  if (date === today) return "Hoy";
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  if (date === next.toISOString().slice(0, 10)) return "Mañana";
  return formatDayDate(date);
}
