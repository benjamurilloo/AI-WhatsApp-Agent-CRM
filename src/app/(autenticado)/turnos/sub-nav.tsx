import type { AppointmentStatus } from "@/modules/appointments";
import { SubNav } from "@/app/_components/sub-nav";
import { STATUS_LABEL } from "./messages";

// Las pantallas de Turnos (brief-29.10, D-5): el calendario y, para un admin, el alta y la
// configuración, como la navegación interna de Usados.
export function AppointmentsSubNav({
  current,
  isAdmin,
}: {
  current: "calendario" | "nuevo" | "configuracion";
  isAdmin: boolean;
}) {
  return (
    <SubNav
      label="Secciones de turnos"
      items={[
        {
          href: "/turnos",
          label: "Calendario",
          icon: "calendar",
          current: current === "calendario",
        },
        ...(isAdmin
          ? [
              {
                href: "/turnos/nuevo",
                label: "Nuevo turno",
                icon: "plus" as const,
                current: current === "nuevo",
              },
              {
                href: "/turnos/configuracion",
                label: "Configuración",
                icon: "wrench" as const,
                current: current === "configuracion",
              },
            ]
          : []),
      ]}
    />
  );
}

// El estado de un turno nunca depende solo del color: lleva ícono y texto, como el de una orden de
// servicio. El ícono es decorativo.
const ICON: Record<AppointmentStatus, string> = {
  requested: "●",
  confirmed: "✓",
  cancelled: "✕",
  attended: "✓",
  no_show: "✕",
};

const TONE: Record<AppointmentStatus, string> = {
  requested: "bg-warning-soft text-on-warning-soft",
  confirmed: "bg-primary-soft text-on-primary-soft",
  cancelled: "bg-surface-muted text-muted",
  attended: "bg-success-soft text-on-success-soft",
  no_show: "bg-surface-muted text-muted",
};

export function AppointmentStatusBadge({
  status,
}: {
  status: AppointmentStatus;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap ${TONE[status]}`}
    >
      <span aria-hidden="true">{ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
