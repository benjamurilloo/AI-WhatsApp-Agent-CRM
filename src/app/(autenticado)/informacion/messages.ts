import type { KnowledgeField, KnowledgeStatus } from "@/modules/knowledge";
import type { ErrorCode } from "@/shared/errors";

// Textos de las pantallas 11 y 12 (brief-11.2, D-7), derivados de la taxonomía de errores.

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const ENTRY_NOT_FOUND_MESSAGE = "Esta entrada no existe.";
export const TITLE_TAKEN_MESSAGE = "Ya existe una entrada con ese título.";
export const NO_ENTRIES_MESSAGE = "Todavía no hay información del negocio.";
export const NO_ENTRY_RESULTS_MESSAGE =
  "Ninguna entrada coincide con estos filtros.";

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

// Estado de vigencia (FR-INFO-03), como se lee en pantalla.
export const STATUS_LABEL: Record<KnowledgeStatus, string> = {
  current: "Vigente",
  scheduled: "Programada",
  expired: "Vencida",
  inactive: "Inactiva",
};

// "2026-12-24" → "24/12/2026". Es una fecha de calendario, no un instante: no pasa por ninguna
// zona horaria.
export function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function formatValidity(
  validFrom: string | null,
  validUntil: string | null,
): string {
  if (validFrom && validUntil) {
    return validFrom === validUntil
      ? `Solo el ${formatCalendarDate(validFrom)}`
      : `Del ${formatCalendarDate(validFrom)} al ${formatCalendarDate(validUntil)}`;
  }
  if (validFrom) return `Desde el ${formatCalendarDate(validFrom)}`;
  if (validUntil) return `Hasta el ${formatCalendarDate(validUntil)}`;
  return "Sin límite";
}

// Formulario de alta y edición.

const FIELD_MESSAGES: Record<KnowledgeField, string> = {
  title: "Ingresá un título de hasta 200 caracteres.",
  category: "Ingresá una categoría de hasta 100 caracteres.",
  content: "Escribí el contenido, de hasta 4000 caracteres.",
  validFrom: "Ingresá una fecha válida o dejala vacía.",
  validUntil:
    "Ingresá una fecha válida, igual o posterior a la de inicio, o dejala vacía.",
};

// El orden es el del formulario y el del foco al primer error.
export const FIELD_ORDER: KnowledgeField[] = [
  "title",
  "category",
  "content",
  "validFrom",
  "validUntil",
];

export function knowledgeFieldError(fields: KnowledgeField[]): {
  field: KnowledgeField;
  message: string;
} {
  const field =
    FIELD_ORDER.find((candidate) => fields.includes(candidate)) ?? "title";
  return { field, message: FIELD_MESSAGES[field] };
}

export type KnowledgeFormValues = {
  title: string;
  category: string;
  content: string;
  validFrom: string;
  validUntil: string;
};

export type KnowledgeFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: KnowledgeField | null;
      message: string;
      values: KnowledgeFormValues;
    };

// Desactivar y reactivar.

export type KnowledgeChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function knowledgeChangeMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return ENTRY_NOT_FOUND_MESSAGE;
    case "CONFLICT":
      return TITLE_TAKEN_MESSAGE;
    default:
      return unexpectedErrorMessage(requestId);
  }
}

// Avisos tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  creada: "Entrada creada.",
  editada: "Entrada actualizada.",
  desactivada: "Entrada desactivada.",
  reactivada: "Entrada reactivada.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
