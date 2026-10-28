import type { AppointmentStatus } from "@/modules/appointments";
import { SubNav } from "@/app/_components/sub-nav";
import type { IconName } from "@/app/_components/icons";
import { StatusBadge, type StatusTone } from "@/app/_components/status-badge";
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
// servicio, con la insignia compartida (brief-24.1, D-6).
const ICON: Record<AppointmentStatus, IconName> = {
  requested: "clock",
  confirmed: "calendar",
  cancelled: "circleX",
  attended: "circleCheck",
  no_show: "circleMinus",
};

const TONE: Record<AppointmentStatus, StatusTone> = {
  requested: "warning",
  confirmed: "primary",
  cancelled: "neutral",
  attended: "success",
  no_show: "neutral",
};

export function AppointmentStatusBadge({
  status,
}: {
  status: AppointmentStatus;
}) {
  return (
    <StatusBadge tone={TONE[status]} icon={ICON[status]}>
      {STATUS_LABEL[status]}
    </StatusBadge>
  );
}
