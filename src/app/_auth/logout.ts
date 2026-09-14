"use server";

import { redirect } from "next/navigation";
import { deleteSessionCookie, logout, readSessionToken } from "@/modules/auth";
import { logEvent, newRequestId } from "@/shared/log";

// Cierre de sesión (pantalla 1). La sesión se borra en la base; la cookie se borra
// aunque la base falle, y el error queda registrado.
export async function logoutAction(): Promise<void> {
  const requestId = newRequestId();
  try {
    await logout(await readSessionToken());
    logEvent({ level: "info", requestId, route: "logout", code: "OK" });
  } catch (error) {
    logEvent({
      level: "error",
      requestId,
      route: "logout",
      code: "INTERNAL",
      error,
    });
  }
  await deleteSessionCookie();
  redirect("/login");
}
