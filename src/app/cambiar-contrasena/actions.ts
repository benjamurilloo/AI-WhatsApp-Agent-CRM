"use server";

import { redirect } from "next/navigation";
import {
  completeRequiredPasswordChange,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  readSessionToken,
  writeSessionCookie,
} from "@/modules/auth";
import {
  errorState,
  passwordChangeInputError,
  passwordPolicyMessage,
  unexpectedErrorMessage,
  type FormState,
} from "@/app/_auth/messages";
import { logEvent, newRequestId } from "@/shared/log";

const policy = { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH };

// Cambio obligatorio de contraseña del primer ingreso (brief-3.5, D-4).
export async function changePasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const requestId = newRequestId();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  const invalid = passwordChangeInputError(newPassword, confirmation, policy);
  if (invalid) {
    return errorState(requestId, invalid.message, { field: invalid.field });
  }

  let destination: string;
  try {
    // auth valida la sesión y el flag contra la base.
    const result = await completeRequiredPasswordChange({
      token: await readSessionToken(),
      newPassword,
    });
    if (result.ok) {
      await writeSessionCookie(result.token, result.cookieExpiresAt);
      logEvent({
        level: "info",
        requestId,
        route: "cambiar-contrasena",
        code: "OK",
      });
      destination = "/";
    } else if (result.code === "VALIDATION_ERROR") {
      return errorState(
        requestId,
        passwordPolicyMessage(policy.min, policy.max),
        { field: "newPassword" },
      );
    } else {
      logEvent({
        level: "warn",
        requestId,
        route: "cambiar-contrasena",
        code: result.code,
      });
      destination = result.code === "FORBIDDEN" ? "/" : "/login";
    }
  } catch (error) {
    logEvent({
      level: "error",
      requestId,
      route: "cambiar-contrasena",
      code: "INTERNAL",
      error,
    });
    return errorState(
      requestId,
      unexpectedErrorMessage("guardar la contraseña", requestId),
    );
  }

  redirect(destination);
}
