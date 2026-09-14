import type { AuthFailure } from "@/modules/auth";

// Textos de la pantalla 1 (wireframe 01), derivados de la taxonomía de errores (brief-3.5).
// Solo lo importan las acciones del servidor: los formularios reciben el estado ya resuelto.

export const CREDENTIALS_MESSAGE = "Email o contraseña incorrectos.";
export const INVALID_EMAIL_MESSAGE = "Ingresá un email válido.";
export const PASSWORD_MISMATCH_MESSAGE = "Las contraseñas no coinciden.";

export function rateLimitedMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Demasiados intentos. Probá de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
}

export function passwordPolicyMessage(min: number, max: number): string {
  return `La contraseña debe tener entre ${min} y ${max} caracteres.`;
}

export function unexpectedErrorMessage(
  action: "iniciar sesión" | "guardar la contraseña",
  requestId: string,
): string {
  return `No pudimos ${action}. Código: ${requestId}`;
}

// Estado de un formulario de la pantalla. Nunca lleva contraseñas: solo vuelve el email tipeado.
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      field: string | null;
      message: string;
      email: string;
      retryAfterSeconds: number | null;
    };

export function errorState(
  requestId: string,
  message: string,
  options: {
    field?: string | null;
    email?: string;
    retryAfterSeconds?: number | null;
  } = {},
): FormState {
  return {
    status: "error",
    requestId,
    message,
    field: options.field ?? null,
    email: options.email ?? "",
    retryAfterSeconds: options.retryAfterSeconds ?? null,
  };
}

// UNAUTHENTICATED y el VALIDATION_ERROR de la política de contraseña dan el mismo mensaje:
// el ingreso no revela si la cuenta existe ni qué campo falló.
export function loginFailureState(
  failure: AuthFailure,
  requestId: string,
  email: string,
): FormState {
  if (failure.code === "RATE_LIMITED") {
    return errorState(
      requestId,
      rateLimitedMessage(failure.retryAfterSeconds),
      {
        email,
        retryAfterSeconds: failure.retryAfterSeconds,
      },
    );
  }
  return errorState(requestId, CREDENTIALS_MESSAGE, { email });
}

// Validación de la pantalla antes de llamar a auth, para asociar el mensaje al campo.
export function passwordChangeInputError(
  newPassword: string,
  confirmation: string,
  policy: { min: number; max: number },
): { field: "newPassword" | "confirmation"; message: string } | null {
  if (newPassword.length < policy.min || newPassword.length > policy.max) {
    return {
      field: "newPassword",
      message: passwordPolicyMessage(policy.min, policy.max),
    };
  }
  if (newPassword !== confirmation) {
    return { field: "confirmation", message: PASSWORD_MISMATCH_MESSAGE };
  }
  return null;
}
