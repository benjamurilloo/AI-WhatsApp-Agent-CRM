import { redirect } from "next/navigation";
import { cache } from "react";
import { readSessionToken } from "@/modules/auth";
import { getAuthContext, type AuthContext } from "@/modules/organizations";

// Cada página resuelve la sesión contra la base y redirige; no hay proxy (brief-3.5, D-6).
// Las acciones validan por su cuenta: estas funciones son para el render.

// Una sola resolución por request aunque la pidan el layout y la página (brief-3.7, D-7).
// Después de una escritura que cambia la sesión, usar getAuthContext directamente.
const currentContext = cache(async (): Promise<AuthContext | null> => {
  const result = await getAuthContext(await readSessionToken());
  return result.ok ? result.context : null;
});

// Ruta protegida: sin sesión va a /login (FR-ORG-03) y con la contraseña pendiente, a su cambio.
export async function requireSession(): Promise<AuthContext> {
  const context = await currentContext();
  if (!context) redirect("/login");
  if (context.mustChangePassword) redirect("/cambiar-contrasena");
  return context;
}

export async function requirePendingPasswordChange(): Promise<void> {
  const context = await currentContext();
  if (!context) redirect("/login");
  if (!context.mustChangePassword) redirect("/");
}

export async function redirectIfAuthenticated(): Promise<void> {
  const context = await currentContext();
  if (context) {
    redirect(context.mustChangePassword ? "/cambiar-contrasena" : "/");
  }
}
