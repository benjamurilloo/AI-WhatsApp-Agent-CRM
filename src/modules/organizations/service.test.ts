import { describe, expect, it } from "vitest";
import { authorize, type AuthContext } from "./service";

function context(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    organizationId: "00000000-0000-4000-8000-000000000002",
    role: "admin",
    mustChangePassword: false,
    sessionExpiresAt: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  };
}

describe("authorize", () => {
  it("un admin sin contraseña pendiente pasa con o sin requisito de rol", () => {
    expect(authorize(context(), { role: "admin" })).toEqual({ ok: true });
    expect(authorize(context())).toEqual({ ok: true });
  });

  it("un viewer pasa sin requisito de rol y recibe FORBIDDEN en una acción de admin", () => {
    const viewer = context({ role: "viewer" });
    expect(authorize(viewer)).toEqual({ ok: true });
    expect(authorize(viewer, { role: "admin" })).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("la contraseña pendiente da FORBIDDEN antes de mirar el rol", () => {
    expect(authorize(context({ mustChangePassword: true }))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      authorize(context({ mustChangePassword: true }), { role: "admin" }),
    ).toEqual({ ok: false, code: "FORBIDDEN" });
  });
});
