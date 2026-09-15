import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE, type Theme } from "./theme";

// Lectura en el servidor: el HTML sale con el tema correcto, sin script en línea (brief-4.0, D-4).
export async function readTheme(): Promise<Theme> {
  const store = await cookies();
  return parseTheme(store.get(THEME_COOKIE)?.value);
}
