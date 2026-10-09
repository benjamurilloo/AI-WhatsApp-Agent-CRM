import type {
  ExceptionField,
  Slot,
  Weekday,
  WeekField,
} from "@/modules/knowledge";
import type { NamedAuditLogEntry } from "@/modules/audit";
import type { ErrorCode } from "@/shared/errors";
import { formatCalendarDate } from "../messages";

// Textos de la pantalla del horario de atención (brief-17.4, D-4).

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const NO_HOURS_MESSAGE = "Todavía no hay un horario cargado.";
export const NO_EXCEPTIONS_MESSAGE = "No hay días especiales próximos.";
export const DATE_TAKEN_MESSAGE = "Ya hay un día especial para esa fecha.";
export const EXCEPTION_NOT_FOUND_MESSAGE = "Ese día especial ya no existe.";

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

// "2026-10-12" → "Lunes 12/10/2026". Es una fecha de calendario: el día de la semana sale del
// calendario, sin zona horaria.
export function formatDayDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  const iso = (weekday === 0 ? 7 : weekday) as Weekday;
  return `${WEEKDAY_LABEL[iso]} ${formatCalendarDate(date)}`;
}

// [{09:00, 13:00}, {16:00, 20:00}] → "09:00 a 13:00 y 16:00 a 20:00"; sin tramos, "Cerrado".
export function formatSlots(slots: Slot[]): string {
  if (slots.length === 0) return "Cerrado";
  return slots.map((slot) => `${slot.opens} a ${slot.closes}`).join(" y ");
}

// El valor de la auditoría: "09:00-13:00,16:00-20:00", vacío si cerrado, null si no estaba cargado.
export function formatAuditSlots(value: unknown): string {
  if (value === null || value === undefined) return "sin cargar";
  if (value === "") return "cerrado";
  return String(value)
    .split(",")
    .map((slot) => slot.replace("-", " a "))
    .join(" y ");
}

// Formulario de la semana: un mensaje por día inválido.
export function dayErrorMessage(weekday: Weekday): string {
  return `Revisá el ${WEEKDAY_LABEL[weekday].toLowerCase()}: cada tramo con apertura y cierre, la apertura antes del cierre y el segundo tramo después del primero.`;
}

export type WeekFormValues = Record<string, string>;

export type WeekFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      fields: WeekField[];
      message: string | null;
      values: WeekFormValues;
    };

// Formulario de un día especial.
const EXCEPTION_FIELD_MESSAGES: Record<ExceptionField, string> = {
  date: "Ingresá una fecha válida, de hoy en adelante.",
  slots:
    "Revisá los tramos: cada uno con apertura y cierre, la apertura antes del cierre y el segundo después del primero. Vacío: cerrado todo el día.",
  reason: "El motivo tiene hasta 100 caracteres.",
};

export const EXCEPTION_FIELD_ORDER: ExceptionField[] = [
  "date",
  "slots",
  "reason",
];

export function exceptionFieldError(fields: ExceptionField[]): {
  field: ExceptionField;
  message: string;
} {
  const field =
    EXCEPTION_FIELD_ORDER.find((candidate) => fields.includes(candidate)) ??
    "date";
  return { field, message: EXCEPTION_FIELD_MESSAGES[field] };
}

export type ExceptionFormValues = {
  date: string;
  opens1: string;
  closes1: string;
  opens2: string;
  closes2: string;
  reason: string;
};

export type ExceptionFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: ExceptionField | null;
      message: string;
      values: ExceptionFormValues;
    };

export type HoursChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function hoursChangeMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
): string {
  switch (code) {
    case "FORBIDDEN":
      return "No tenés permiso para hacer esta acción.";
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return EXCEPTION_NOT_FOUND_MESSAGE;
    case "CONFLICT":
      return DATE_TAKEN_MESSAGE;
    default:
      return unexpectedErrorMessage(requestId);
  }
}

const NOTICES: Record<string, string> = {
  guardado: "Horario guardado.",
  agregado: "Día especial agregado.",
  quitado: "Día especial quitado.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}

// El historial del horario (brief-17.4, AC-5): cada cambio en castellano.
export function describeHoursAudit(entry: NamedAuditLogEntry): {
  action: string;
  change: string;
} {
  const before = (entry.diff.before ?? {}) as Record<string, unknown>;
  const after = (entry.diff.after ?? {}) as Record<string, unknown>;
  if ("exception" in after || "exception" in before) {
    const added = after.exception !== null && after.exception !== undefined;
    const side = added ? after : before;
    const reason = side.exceptionReason
      ? ` (${String(side.exceptionReason)})`
      : "";
    return {
      action: added ? "Día especial agregado" : "Día especial quitado",
      change: `${formatDayDate(String(side.exception))}: ${formatAuditSlots(side.exceptionHours)}${reason}`,
    };
  }
  const changes = Object.keys(after)
    .filter((key) => /^day[1-7]$/.test(key))
    .sort()
    .map((key) => {
      const weekday = Number(key.slice(3)) as Weekday;
      return `${WEEKDAY_LABEL[weekday]}: ${formatAuditSlots(before[key])} → ${formatAuditSlots(after[key])}`;
    });
  return { action: "Horario semanal", change: changes.join("; ") };
}
