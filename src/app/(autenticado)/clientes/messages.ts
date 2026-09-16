import type { ClientField } from "@/modules/crm";
import type { ErrorCode } from "@/shared/errors";

// Textos de las pantallas 6 y 7 (wireframes 06 y 07), derivados de la taxonomía de errores
// (brief-5.3).

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const CLIENT_NOT_FOUND_MESSAGE = "Este cliente no existe.";
export const NO_CLIENTS_MESSAGE = "Todavía no hay clientes.";
export const NO_CLIENT_RESULTS_MESSAGE =
  "Ningún cliente coincide con esta búsqueda.";

// El duplicado puede ser un cliente desactivado, que la lista oculta por defecto (brief-5.3, D-2).
export const PHONE_TAKEN_MESSAGE =
  "Ya existe un cliente con ese teléfono. Si está desactivado, buscalo con el filtro «Solo inactivos» o «Todos» y reactivalo.";

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

// Formulario de cliente (alta y edición).

export const NAME_REQUIRED_MESSAGE =
  "Ingresá un nombre de hasta 200 caracteres.";
export const PHONE_FORMAT_MESSAGE =
  "Ingresá el teléfono en formato internacional, con + y código de país, por ejemplo +5491155551234.";
export const NOTES_TOO_LONG_MESSAGE =
  "Las notas no pueden superar los 1000 caracteres.";
export const PHONE_HINT = "Formato internacional, por ejemplo +5491155551234.";
export const NOTES_HINT = "No registres datos sensibles innecesarios.";

const CLIENT_FIELD_MESSAGES: Record<ClientField, string> = {
  displayName: NAME_REQUIRED_MESSAGE,
  phone: PHONE_FORMAT_MESSAGE,
  notes: NOTES_TOO_LONG_MESSAGE,
};

const CLIENT_FIELD_ORDER: ClientField[] = ["displayName", "phone", "notes"];

// Primer campo inválido en el orden del formulario, con su mensaje.
export function clientFieldError(fields: ClientField[]): {
  field: ClientField;
  message: string;
} {
  const field =
    CLIENT_FIELD_ORDER.find((candidate) => fields.includes(candidate)) ??
    "displayName";
  return { field, message: CLIENT_FIELD_MESSAGES[field] };
}

export type ClientFormValues = {
  displayName: string;
  phone: string;
  notes: string;
};

export type ClientFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: ClientField | null;
      message: string;
      values: ClientFormValues;
    };

// Desactivar y reactivar (pantalla 7).

export type ClientChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function clientChangeMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
): string {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return CLIENT_NOT_FOUND_MESSAGE;
    case "CONFLICT":
      return PHONE_TAKEN_MESSAGE;
    default:
      return unexpectedErrorMessage(requestId);
  }
}

// Avisos tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  creado: "Cliente creado.",
  editado: "Cliente actualizado.",
  desactivado: "Cliente desactivado.",
  reactivado: "Cliente reactivado.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
