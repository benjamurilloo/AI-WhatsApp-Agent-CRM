// Preferencia de tema (brief-4.0, D-4). Sin cookie, el CSS sigue prefers-color-scheme.
// Es solo visual: no tiene datos personales ni participa de la autorización.

export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Oscuro",
};

export const THEME_COOKIE = "crm_theme";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Un valor ausente o desconocido se trata como "Sistema".
export function parseTheme(value: unknown): Theme {
  return THEMES.find((theme) => theme === value) ?? "system";
}

export function themeCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    maxAge: ONE_YEAR_SECONDS,
  };
}
