import { cookies, headers } from "next/headers";

// Adaptador de la cookie de sesión (ADR 0012). set y delete solo funcionan en
// Server Functions y Route Handlers; las lecturas, también en Server Components.

type Env = Record<string, string | undefined>;

// Con TLS la cookie es Secure y puede llevar el prefijo __Host-, que lo exige.
export function isSecureEnvironment(env: Env = process.env): boolean {
  return env.NODE_ENV === "production";
}

export function sessionCookieName(secure: boolean): string {
  return secure ? "__Host-crm_session" : "crm_session";
}

export function sessionCookieOptions(expiresAt: Date, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    expires: expiresAt,
  };
}

// Solo con un proxy de confianza: la última entrada de x-forwarded-for es la que agregó
// ese proxy. Sin proxy devuelve null y todas las requests comparten la clave de IP (brief-3.3, D-4).
export function clientIpFromForwardedFor(
  forwardedFor: string | null,
  env: Env = process.env,
): string | null {
  if (env.TRUSTED_PROXY !== "true" || !forwardedFor) return null;
  const entries = forwardedFor
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.at(-1) ?? null;
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(sessionCookieName(isSecureEnvironment()))?.value;
}

export async function writeSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const secure = isSecureEnvironment();
  const store = await cookies();
  store.set(
    sessionCookieName(secure),
    token,
    sessionCookieOptions(expiresAt, secure),
  );
}

export async function deleteSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(sessionCookieName(isSecureEnvironment()));
}

export async function requestClientIp(): Promise<string | null> {
  const list = await headers();
  return clientIpFromForwardedFor(list.get("x-forwarded-for"));
}
