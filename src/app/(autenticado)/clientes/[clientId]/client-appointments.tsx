import Link from "next/link";
import { listClientAppointments } from "@/modules/appointments";
import type { AuthContext } from "@/modules/organizations";
import { formatDayDate } from "@/app/(autenticado)/informacion/horario/messages";
import { formatRange } from "@/app/(autenticado)/turnos/messages";
import { AppointmentStatusBadge } from "@/app/(autenticado)/turnos/sub-nav";
import { linkClass, primaryLinkClass } from "@/app/_components/form-styles";
import { SectionCard } from "@/app/_components/section-card";

// Los turnos del cliente en su ficha (brief-29.10, D-5), como sus órdenes de servicio: fecha, horario,
// motivo y estado, y para un admin con el cliente activo, el alta con el cliente ya elegido. Sin la
// capacidad appointments, la sección no aparece.
export async function ClientAppointments({
  context,
  clientId,
  clientActive,
}: {
  context: AuthContext;
  clientId: string;
  clientActive: boolean;
}) {
  const result = await listClientAppointments(context, clientId);
  if (!result.ok) return null;
  const canCreate = context.role === "admin" && clientActive;
  return (
    <SectionCard id="turnos-titulo" title="Turnos" icon="calendar">
      <div className="flex flex-col gap-4">
        {result.appointments.length === 0 ? (
          <p className="text-sm text-muted">Este cliente no tiene turnos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {result.appointments.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <Link href={`/turnos/${item.id}`} className={linkClass}>
                    {formatDayDate(item.date)},{" "}
                    {formatRange(item.start, item.end)}
                  </Link>
                  <span className="block text-sm text-muted">
                    {item.reasonName}
                  </span>
                </span>
                <AppointmentStatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
        {canCreate ? (
          <p>
            <Link
              href={`/turnos/nuevo?cliente=${clientId}`}
              className={primaryLinkClass}
            >
              + Dar un turno
            </Link>
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
