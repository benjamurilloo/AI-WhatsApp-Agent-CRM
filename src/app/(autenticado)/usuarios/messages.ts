import type { ErrorCode } from "@/shared/errors";

// Textos de la pantalla 10 (wireframe 10), derivados de la taxonomía de errores (brief-3.7).

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const FORBIDDEN_ACTION_MESSAGE =
  "No tenés permiso para hacer esta acción.";
export const MEMBER_NOT_FOUND_MESSAGE = "No encontramos ese usuario.";
export const EMAIL_TAKEN_MESSAGE = "Ya existe un usuario con ese email.";
export const INVALID_EMAIL_MESSAGE = "Ingresá un email válido.";
export const NAME_REQUIRED_MESSAGE =
  "Ingresá un nombre de hasta 200 caracteres.";
export const ROLE_REQUIRED_MESSAGE = "Elegí un rol.";
export const LAST_ADMIN_MESSAGE =
  "No podés quitar ni desactivar al último admin de la organización.";
export const NO_RESULTS_MESSAGE = "Ningún usuario coincide con estos filtros.";

export function unexpectedMemberErrorMessage(requestId: string): string {
  return `No pudimos guardar el cambio. Código: ${requestId}`;
}

export type NewMemberField = "name" | "email" | "role";

export type NewMemberValues = { name: string; email: string; role: string };

// Estado del alta. "created" es la única respuesta que lleva la contraseña inicial (D-5):
// vive solo en memoria del navegador hasta salir de la página.
export type NewMemberState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: NewMemberField | null;
      message: string;
      values: NewMemberValues;
    }
  | {
      status: "created";
      requestId: string;
      name: string;
      initialPassword: string;
    };

// Primer campo inválido en el orden del formulario, con su mensaje.
export function newMemberFieldError(fields: NewMemberField[]): {
  field: NewMemberField;
  message: string;
} {
  if (fields.includes("name")) {
    return { field: "name", message: NAME_REQUIRED_MESSAGE };
  }
  if (fields.includes("email")) {
    return { field: "email", message: INVALID_EMAIL_MESSAGE };
  }
  return { field: "role", message: ROLE_REQUIRED_MESSAGE };
}

// Estado de los formularios de edición: rol, desactivar y reactivar.
export type MemberChangeState =
  { status: "idle" } | { status: "error"; requestId: string; message: string };

export function memberChangeMessage(
  code: Exclude<ErrorCode, "UNAUTHENTICATED">,
  requestId: string,
): string {
  switch (code) {
    case "BUSINESS_RULE_VIOLATION":
      return LAST_ADMIN_MESSAGE;
    case "FORBIDDEN":
      return FORBIDDEN_ACTION_MESSAGE;
    case "NOT_FOUND":
      return MEMBER_NOT_FOUND_MESSAGE;
    case "VALIDATION_ERROR":
      return ROLE_REQUIRED_MESSAGE;
    default:
      return unexpectedMemberErrorMessage(requestId);
  }
}

// Aviso tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  rol: "Rol actualizado.",
  desactivado: "Usuario desactivado.",
  reactivado: "Usuario reactivado.",
};

export function noticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
