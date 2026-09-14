import { describe, expect, it } from "vitest";
import {
  clientIpFromForwardedFor,
  isSecureEnvironment,
  sessionCookieName,
  sessionCookieOptions,
} from "./session-cookie";

describe("cookie de sesión", () => {
  it("con TLS es Secure y usa el prefijo __Host-", () => {
    const expiresAt = new Date("2026-09-20T00:00:00Z");
    expect(sessionCookieName(true)).toBe("__Host-crm_session");
    expect(sessionCookieOptions(expiresAt, true)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      expires: expiresAt,
    });
  });

  it("sin TLS no es Secure ni lleva el prefijo", () => {
    const expiresAt = new Date("2026-09-20T00:00:00Z");
    expect(sessionCookieName(false)).toBe("crm_session");
    expect(sessionCookieOptions(expiresAt, false).secure).toBe(false);
  });

  it("nunca fija Domain", () => {
    expect(sessionCookieOptions(new Date(), true)).not.toHaveProperty("domain");
  });

  it("solo production se considera con TLS", () => {
    expect(isSecureEnvironment({ NODE_ENV: "production" })).toBe(true);
    expect(isSecureEnvironment({ NODE_ENV: "development" })).toBe(false);
    expect(isSecureEnvironment({})).toBe(false);
  });
});

describe("IP del cliente", () => {
  it("sin proxy de confianza ignora x-forwarded-for", () => {
    expect(clientIpFromForwardedFor("203.0.113.9", {})).toBeNull();
    expect(
      clientIpFromForwardedFor("203.0.113.9", { TRUSTED_PROXY: "false" }),
    ).toBeNull();
  });

  it("con proxy de confianza toma la última entrada, no la que envía el cliente", () => {
    expect(
      clientIpFromForwardedFor("1.2.3.4, 203.0.113.9", {
        TRUSTED_PROXY: "true",
      }),
    ).toBe("203.0.113.9");
  });

  it("sin cabecera devuelve null", () => {
    expect(
      clientIpFromForwardedFor(null, { TRUSTED_PROXY: "true" }),
    ).toBeNull();
    expect(
      clientIpFromForwardedFor(" , ", { TRUSTED_PROXY: "true" }),
    ).toBeNull();
  });
});
