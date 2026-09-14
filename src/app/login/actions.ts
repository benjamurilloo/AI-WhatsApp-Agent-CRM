"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  login,
  logout,
  requestClientIp,
  writeSessionCookie,
} from "@/modules/auth";
import { getAuthContext } from "@/modules/organizations";
import {
  errorState,
  INVALID_EMAIL_MESSAGE,
  loginFailureState,
  unexpectedErrorMessage,
  type FormState,
} from "@/app/_auth/messages";
import { logEvent, newRequestId } from "@/shared/log";

const emailSchema = z.email().max(254);

// Ingreso de la pantalla 1 (brief-3.5). Server Action: Next.js compara Origin con Host.
export async function loginAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const requestId = newRequestId();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!emailSchema.safeParse(email).success) {
    return errorState(requestId, INVALID_EMAIL_MESSAGE, {
      field: "email",
      email,
    });
  }

  let destination: string;
  try {
    const result = await login({
      email,
      password,
      ip: await requestClientIp(),
    });
    if (!result.ok) {
      logEvent({ level: "warn", requestId, route: "login", code: result.code });
      return loginFailureState(result, requestId, email);
    }

    const auth = await getAuthContext(result.token);
    if (!auth.ok) {
      // Credenciales válidas sin membresía: se cierra esa sesión y la respuesta es la genérica.
      await logout(result.token);
      logEvent({ level: "warn", requestId, route: "login", code: auth.code });
      return loginFailureState(auth, requestId, email);
    }

    await writeSessionCookie(result.token, result.cookieExpiresAt);
    logEvent({
      level: "info",
      requestId,
      route: "login",
      code: "OK",
      userId: auth.context.userId,
    });
    destination = auth.context.mustChangePassword ? "/cambiar-contrasena" : "/";
  } catch (error) {
    logEvent({
      level: "error",
      requestId,
      route: "login",
      code: "INTERNAL",
      error,
    });
    return errorState(
      requestId,
      unexpectedErrorMessage("iniciar sesión", requestId),
      { email },
    );
  }

  // redirect lanza: queda fuera del try para no confundirse con un error inesperado.
  redirect(destination);
}
