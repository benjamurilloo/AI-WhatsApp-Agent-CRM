import type {
  AppointmentField,
  AppointmentRule,
  AppointmentSettingsField,
  AppointmentStatus,
  AppointmentTarget,
  ChangeAppointmentResult,
  CreateAppointmentResult,
  ReasonWriteResult,
} from "@/modules/appointments";
import type { NamedAuditLogEntry } from "@/modules/audit";
import type { ErrorCode } from "@/shared/errors";

// Textos de las pantallas de turnos (brief-29.10, D-5).

export const CALENDAR_TITLE = "Turnos";
export const NEW_APPOINTMENT_TITLE = "Nuevo turno";
export const SETTINGS_TITLE = "Configuración de los turnos";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede dar turnos y configurarlos.";
export const NO_HOURS_MESSAGE =
  "Todavía no hay un horario del local: sin horario no hay franjas. Cargalo en Información → Horario.";
export const NO_SETTINGS_MESSAGE =
  "Todavía no están la duración ni el cupo de los turnos. Cargalos en Configuración.";
export const NO_REASONS_MESSAGE =
  "No hay motivos activos. Agregá uno en Configuración.";
export const NO_FREE_SLOTS_MESSAGE =
  "No hay franjas libres ese día. Probá con otra fecha.";
export const EXAMPLE_VALUES_TEXT =
  "Usa valores de ejemplo del perfil. Cambialos y guardalos para confirmarlos.";

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  requested: "Pedido",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  attended: "Atendido",
  no_show: "Ausente",
};

// El botón de cada cambio de estado.
export const TARGET_LABEL: Record<AppointmentTarget, string> = {
  confirmed: "Confirmar",
  cancelled: "Cancelar el turno",
  attended: "Marcar atendido",
  no_show: "Marcar ausente",
};

// El turno que pidió el agente (brief-29.10.2, D-5): en la lista del día, y su origen en el detalle con
// el emisor de la credencial, como el pedido de la 19.4.
export const AGENT_REQUEST_LABEL = "Pedido por el agente";
export const AGENT_ORIGIN_LABEL = "Agente";
export const TEAM_ORIGIN_LABEL = "Equipo";

export function appointmentOriginLabel(
  createdByCredentialId: string | null,
  sources: ReadonlyMap<string, string> = new Map(),
): string {
  if (createdByCredentialId === null) return TEAM_ORIGIN_LABEL;
  const source = sources.get(createdByCredentialId);
  return source ? `${AGENT_ORIGIN_LABEL} · ${source}` : AGENT_ORIGIN_LABEL;
}

// "10:00" y "10:30" → "10:00 a 10:30".
export function formatRange(start: string, end: string): string {
  return `${start} a ${end}`;
}

// El estado de un formulario: el campo con error, o null para el mensaje general.
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: string | null;
      message: string;
      values: Record<string, string>;
    };

export type ChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function changeMessage(code: ErrorCode, requestId: string): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return "Lo que querías cambiar ya no existe.";
    default:
      return unexpectedErrorMessage(requestId);
  }
}

const FIELD_MESSAGE: Record<AppointmentField, string> = {
  client: "Elegí un cliente de la lista.",
  reason: "Elegí un motivo de la lista.",
  date: "Elegí una fecha.",
  start: "Elegí una franja libre.",
  note: "La nota puede tener hasta 500 caracteres.",
  reference: "El equipo o el producto del turno ya no está disponible.",
};

const RULE_MESSAGE: Record<AppointmentRule, string> = {
  not_configured:
    "Todavía no están la duración ni el cupo de los turnos. Cargalos en Configuración.",
  client_inactive:
    "Ese cliente está desactivado: reactivalo para darle un turno.",
  outside_hours:
    "Esa franja ya no está en el horario del local. Elegí otra de la lista.",
  slot_full: "Esa franja se llenó recién. Elegí otra de la lista.",
  in_the_past: "Esa franja ya empezó. Elegí otra de la lista.",
  too_far: "Esa fecha está más allá de los 90 días en que se dan turnos.",
};

export function createRejection(
  result: Exclude<CreateAppointmentResult, { ok: true }>,
  requestId: string,
): { field: string | null; message: string } {
  if (result.code === "VALIDATION_ERROR") {
    const field = result.fields[0]!;
    return { field, message: FIELD_MESSAGE[field] };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    const field =
      result.rule === "client_inactive"
        ? "client"
        : result.rule === "not_configured"
          ? null
          : "start";
    return { field, message: RULE_MESSAGE[result.rule] };
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

export function transitionRejection(
  result: Exclude<ChangeAppointmentResult, { ok: true }>,
  requestId: string,
): string {
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return result.rule === "not_started"
      ? "El turno todavía no empezó: se marca atendido o ausente desde su hora."
      : "El turno ya cambió de estado. Recargá la página.";
  }
  return changeMessage(result.code, requestId);
}

const SETTINGS_FIELD_MESSAGE: Record<AppointmentSettingsField, string> = {
  slotMinutes: "Elegí una duración de la lista.",
  capacity: "Ingresá un número entero de 1 a 20.",
};

export function settingsRejection(fields: AppointmentSettingsField[]): {
  field: string;
  message: string;
} {
  const field = fields[0]!;
  return { field, message: SETTINGS_FIELD_MESSAGE[field] };
}

export function reasonRejection(
  result: Exclude<ReasonWriteResult, { ok: true }>,
  requestId: string,
): { field: string | null; message: string } {
  if (result.code === "VALIDATION_ERROR" && "fields" in result) {
    return {
      field: "name",
      message: "Ingresá un nombre de hasta 60 caracteres.",
    };
  }
  if (result.code === "CONFLICT") {
    return { field: "name", message: "Ya existe un motivo con ese nombre." };
  }
  if (result.code === "BUSINESS_RULE_VIOLATION") {
    return {
      field: null,
      message: "Ya hay 20 motivos: desactivá o renombrá uno que no uses.",
    };
  }
  return { field: null, message: changeMessage(result.code, requestId) };
}

const NOTICES: Record<string, string> = {
  "turno-creado": "Turno dado.",
  "turno-confirmado": "Turno confirmado.",
  "turno-cancelado": "Turno cancelado.",
  "turno-atendido": "Turno marcado como atendido.",
  "turno-ausente": "Turno marcado como ausente.",
  "valores-guardados": "Duración y cupo guardados.",
  "motivo-creado": "Motivo agregado.",
  "motivo-guardado": "Motivo guardado.",
  "motivo-desactivado":
    "Motivo desactivado: ya no se ofrece en los turnos nuevos.",
  "motivo-reactivado": "Motivo reactivado.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key ? (NOTICES[key] ?? null) : null;
}

export const TARGET_NOTICE: Record<AppointmentTarget, string> = {
  confirmed: "turno-confirmado",
  cancelled: "turno-cancelado",
  attended: "turno-atendido",
  no_show: "turno-ausente",
};

// La historia de un turno.
export function auditActionLabel(entry: NamedAuditLogEntry): string {
  if (entry.action === "create") return "Alta";
  if (entry.action === "status_change") {
    const after = entry.diff.after as { status?: AppointmentStatus } | null;
    return after?.status ? STATUS_LABEL[after.status] : "Cambio de estado";
  }
  return "Cambio";
}

export function describeAuditDiff(entry: NamedAuditLogEntry): string {
  const after = (entry.diff.after ?? {}) as Record<string, unknown>;
  const before = (entry.diff.before ?? {}) as Record<string, unknown>;
  if (entry.action === "create") {
    return `${String(after.date ?? "")} ${formatRange(String(after.start ?? ""), String(after.end ?? ""))}`.trim();
  }
  if (entry.action === "status_change") {
    const from = before.status as AppointmentStatus | undefined;
    const to = after.status as AppointmentStatus | undefined;
    return from && to ? `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}` : "";
  }
  return "";
}
