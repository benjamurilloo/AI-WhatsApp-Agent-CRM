"use server";

import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE, themeCookieOptions } from "./theme";

// Guarda la preferencia de tema (brief-4.0, D-4). No lee ni escribe datos del CRM, así que no
// resuelve la sesión: cualquiera solo puede cambiar su propia cookie. "Sistema" la borra.
export async function setThemeAction(formData: FormData): Promise<void> {
  const theme = parseTheme(formData.get("theme"));
  const options = themeCookieOptions(process.env.NODE_ENV === "production");
  const store = await cookies();
  if (theme === "system") {
    const { httpOnly, sameSite, path, secure } = options;
    store.delete({ name: THEME_COOKIE, httpOnly, sameSite, path, secure });
    return;
  }
  store.set(THEME_COOKIE, theme, options);
}
