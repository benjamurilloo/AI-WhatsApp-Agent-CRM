import { pickNextAppointment } from "@/app/(autenticado)/conversaciones/[conversationId]/client-context-pick";

// «Próxima atención» del Resumen (brief-24.4.3, D-6), pura: el próximo turno pedido o confirmado desde
// hoy y, sin turno, la reparación lista para retirar, la más vieja primero. No une un turno con una
// reparación (H-6). more: hay más de una atención pendiente, y la tarjeta ofrece «Ver todas».

export type NextAttention<A, O> =
  | { kind: "appointment"; appointment: A; more: boolean }
  | { kind: "repair"; order: O; more: boolean }
  | null;

const PENDING_APPOINTMENT_STATUSES: readonly string[] = [
  "requested",
  "confirmed",
];

export function pickNextAttention<
  A extends { date: string; start: string; status: string },
  O extends { status: string; createdAt: Date },
>(
  appointments: readonly A[],
  openOrders: readonly O[],
  today: string,
): NextAttention<A, O> {
  const ready = openOrders
    .filter((order) => order.status === "repaired")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const upcoming = appointments.filter(
    (item) =>
      PENDING_APPOINTMENT_STATUSES.includes(item.status) && item.date >= today,
  ).length;
  const more = upcoming + ready.length > 1;
  const appointment = pickNextAppointment(appointments, today);
  if (appointment) return { kind: "appointment", appointment, more };
  const order = ready[0];
  return order ? { kind: "repair", order, more } : null;
}
