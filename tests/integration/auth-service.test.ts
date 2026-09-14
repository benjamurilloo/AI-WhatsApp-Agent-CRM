import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  changePassword,
  completeRequiredPasswordChange,
  hashPassword,
  login,
  logout,
  revokeUserSessions,
  validateSession,
} from "@/modules/auth";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Servicio de auth contra PostgreSQL real (brief-3.3). Cada invariante se prueba intentando violarlo.

const PASSWORD = "contraseña-correcta-larga";
const OTHER_PASSWORD = "contraseña-incorrecta-larga";
const IP = "203.0.113.9";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

let storedHash: string;
let consoleCalls: unknown[][] = [];

async function createUser(
  email = "ana@example.com",
  options: { mustChangePassword?: boolean } = {},
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into users (email, password_hash, name, must_change_password)
        values (${email}, ${storedHash}, 'Ana', ${options.mustChangePassword ?? false})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function loginOk(email = "ana@example.com", password = PASSWORD) {
  const result = await login({ email, password, ip: IP });
  if (!result.ok) throw new Error(`login rechazado: ${result.code}`);
  return result;
}

async function count(query: ReturnType<typeof sql>) {
  const result = await getDb().execute<{ count: number }>(query);
  return result.rows[0]!.count;
}

beforeEach(async () => {
  await resetDatabase(getDb());
  storedHash ??= await hashPassword(PASSWORD);
  consoleCalls = [];
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  // Ningún secreto llega a la consola en ningún caso.
  const output = JSON.stringify(consoleCalls);
  expect(output).not.toContain(PASSWORD);
  expect(output).not.toContain(OTHER_PASSWORD);
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("login", () => {
  it("guarda solo el SHA-256 del token, nunca el token", async () => {
    await createUser();
    const { token } = await loginOk();
    const rows = await getDb().execute<{ id: string }>(
      sql`select id from sessions`,
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.id).toBe(sha256(token));
    expect(
      await count(
        sql`select count(*)::int as count from sessions where id = ${token}`,
      ),
    ).toBe(0);
  });

  it("acepta el email sin distinguir mayúsculas", async () => {
    await createUser();
    await expect(loginOk("Ana@Example.COM")).resolves.toMatchObject({
      ok: true,
    });
  });

  it("email inexistente, contraseña incorrecta y usuario inactivo dan el mismo resultado", async () => {
    await createUser();
    const inactive = await createUser("inactiva@example.com");
    await getDb().execute(
      sql`update users set is_active = false where id = ${inactive}`,
    );

    const results = [
      await login({ email: "nadie@example.com", password: PASSWORD, ip: IP }),
      await login({
        email: "ana@example.com",
        password: OTHER_PASSWORD,
        ip: IP,
      }),
      await login({
        email: "inactiva@example.com",
        password: PASSWORD,
        ip: IP,
      }),
    ];
    for (const result of results) {
      expect(result).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    }
  });

  it("cada ingreso crea una sesión nueva", async () => {
    await createUser();
    const first = await loginOk();
    const second = await loginOk();
    expect(first.token).not.toBe(second.token);
    expect(await count(sql`select count(*)::int as count from sessions`)).toBe(
      2,
    );
  });

  it("borra las sesiones expiradas del usuario al ingresar", async () => {
    const userId = await createUser();
    await getDb().execute(
      sql`insert into sessions (id, user_id, expires_at) values ('vencida', ${userId}, now() - interval '1 minute')`,
    );
    await getDb().execute(
      sql`insert into sessions (id, user_id, created_at, expires_at)
          values ('tope', ${userId}, now() - interval '31 days', now() + interval '1 day')`,
    );
    await loginOk();
    expect(await count(sql`select count(*)::int as count from sessions`)).toBe(
      1,
    );
  });

  it("rechaza entradas inválidas con VALIDATION_ERROR sin registrar intentos", async () => {
    await createUser();
    await expect(
      login({ email: "no-es-email", password: PASSWORD, ip: IP }),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    await expect(
      login({ email: "ana@example.com", password: "corta", ip: IP }),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
    });
    expect(
      await count(sql`select count(*)::int as count from login_attempts`),
    ).toBe(0);
  });
});

describe("validación de sesión", () => {
  it("devuelve el usuario de una sesión válida", async () => {
    const userId = await createUser("ana@example.com", {
      mustChangePassword: true,
    });
    const { token } = await loginOk();
    await expect(validateSession(token)).resolves.toMatchObject({
      userId,
      mustChangePassword: true,
    });
  });

  it("rechaza token ausente, inexistente, manipulado o con otro formato", async () => {
    await createUser();
    const { token } = await loginOk();
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    for (const candidate of [
      undefined,
      null,
      "",
      "abc",
      `${token}x`,
      tampered,
      "A".repeat(43),
    ]) {
      await expect(validateSession(candidate)).resolves.toBeNull();
    }
  });

  it("rechaza y borra una sesión expirada", async () => {
    await createUser();
    const { token } = await loginOk();
    await getDb().execute(
      sql`update sessions set expires_at = now() - interval '1 second'`,
    );
    await expect(validateSession(token)).resolves.toBeNull();
    expect(await count(sql`select count(*)::int as count from sessions`)).toBe(
      0,
    );
  });

  it("rechaza y borra una sesión con más de 30 días aunque no haya expirado", async () => {
    await createUser();
    const { token } = await loginOk();
    await getDb().execute(
      sql`update sessions set created_at = now() - interval '30 days 1 minute', expires_at = now() + interval '5 days'`,
    );
    await expect(validateSession(token)).resolves.toBeNull();
    expect(await count(sql`select count(*)::int as count from sessions`)).toBe(
      0,
    );
  });

  it("rechaza a un usuario desactivado sin revocación previa", async () => {
    const userId = await createUser();
    const { token } = await loginOk();
    await getDb().execute(
      sql`update users set is_active = false where id = ${userId}`,
    );
    await expect(validateSession(token)).resolves.toBeNull();
  });

  it("renueva a 7 días cuando queda menos de la mitad de la ventana", async () => {
    await createUser();
    const { token } = await loginOk();
    await getDb().execute(
      sql`update sessions set expires_at = now() + interval '3 days'`,
    );
    await validateSession(token);
    const renewed = await count(
      sql`select (expires_at > now() + interval '6 days 23 hours')::int as count from sessions`,
    );
    expect(renewed).toBe(1);
  });

  it("no renueva cuando queda más de la mitad de la ventana", async () => {
    await createUser();
    const { token } = await loginOk();
    await getDb().execute(
      sql`update sessions set expires_at = now() + interval '5 days'`,
    );
    await validateSession(token);
    const unchanged = await count(
      sql`select (expires_at < now() + interval '5 days 1 minute')::int as count from sessions`,
    );
    expect(unchanged).toBe(1);
  });

  it("la renovación no pasa el tope absoluto de 30 días", async () => {
    await createUser();
    const { token } = await loginOk();
    await getDb().execute(
      sql`update sessions set created_at = now() - interval '29 days', expires_at = now() + interval '1 day'`,
    );
    const user = await validateSession(token);
    expect(user).not.toBeNull();
    const capped = await count(
      sql`select (abs(extract(epoch from (expires_at - (created_at + interval '30 days')))) < 1)::int as count from sessions`,
    );
    expect(capped).toBe(1);
  });
});

describe("logout y revocación", () => {
  it("logout borra la sesión en el servidor y el token deja de validar", async () => {
    await createUser();
    const { token } = await loginOk();
    await logout(token);
    expect(await count(sql`select count(*)::int as count from sessions`)).toBe(
      0,
    );
    await expect(validateSession(token)).resolves.toBeNull();
  });

  it("revokeUserSessions borra todas las sesiones del usuario y no las de otros", async () => {
    const userId = await createUser();
    await createUser("otra@example.com");
    const first = await loginOk();
    const second = await loginOk();
    const other = await loginOk("otra@example.com");
    await revokeUserSessions(userId);
    await expect(validateSession(first.token)).resolves.toBeNull();
    await expect(validateSession(second.token)).resolves.toBeNull();
    await expect(validateSession(other.token)).resolves.not.toBeNull();
  });
});

describe("cambio de contraseña", () => {
  it("revoca las demás sesiones, devuelve una nueva y actualiza el usuario", async () => {
    const userId = await createUser("ana@example.com", {
      mustChangePassword: true,
    });
    const first = await loginOk();
    const second = await loginOk();
    await getDb().execute(
      sql`update users set updated_at = now() - interval '1 hour' where id = ${userId}`,
    );

    const result = await changePassword({
      userId,
      currentPassword: PASSWORD,
      newPassword: OTHER_PASSWORD,
    });
    if (!result.ok) throw new Error(`cambio rechazado: ${result.code}`);

    await expect(validateSession(first.token)).resolves.toBeNull();
    await expect(validateSession(second.token)).resolves.toBeNull();
    await expect(validateSession(result.token)).resolves.toMatchObject({
      userId,
      mustChangePassword: false,
    });
    expect(await count(sql`select count(*)::int as count from sessions`)).toBe(
      1,
    );
    // $onUpdate de Drizzle actualiza updated_at (pendiente de la 3.1).
    expect(
      await count(
        sql`select (updated_at > now() - interval '1 minute')::int as count from users where id = ${userId}`,
      ),
    ).toBe(1);

    await expect(
      login({ email: "ana@example.com", password: PASSWORD, ip: IP }),
    ).resolves.toEqual({
      ok: false,
      code: "UNAUTHENTICATED",
    });
    await expect(
      loginOk("ana@example.com", OTHER_PASSWORD),
    ).resolves.toMatchObject({ ok: true });
  });

  it("rechaza una contraseña actual incorrecta sin tocar nada", async () => {
    const userId = await createUser();
    const { token } = await loginOk();
    await expect(
      changePassword({
        userId,
        currentPassword: OTHER_PASSWORD,
        newPassword: "nueva-contraseña-larga",
      }),
    ).resolves.toEqual({ ok: false, code: "UNAUTHENTICATED" });
    await expect(validateSession(token)).resolves.not.toBeNull();
  });

  it("rechaza una contraseña nueva fuera de política", async () => {
    const userId = await createUser();
    await expect(
      changePassword({
        userId,
        currentPassword: PASSWORD,
        newPassword: "corta",
      }),
    ).resolves.toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });
});

describe("cambio obligatorio de contraseña (brief-3.5, D-4)", () => {
  it("cambia la contraseña, apaga el flag, revoca las demás sesiones y emite una nueva", async () => {
    const userId = await createUser("ana@example.com", {
      mustChangePassword: true,
    });
    const first = await loginOk();
    const second = await loginOk();

    const result = await completeRequiredPasswordChange({
      token: first.token,
      newPassword: OTHER_PASSWORD,
    });
    if (!result.ok) throw new Error(`cambio rechazado: ${result.code}`);

    await expect(validateSession(first.token)).resolves.toBeNull();
    await expect(validateSession(second.token)).resolves.toBeNull();
    await expect(validateSession(result.token)).resolves.toMatchObject({
      userId,
      mustChangePassword: false,
    });
    expect(await count(sql`select count(*)::int as count from sessions`)).toBe(
      1,
    );
  });

  it("la contraseña inicial deja de funcionar y la nueva sí", async () => {
    await createUser("ana@example.com", { mustChangePassword: true });
    const { token } = await loginOk();
    await completeRequiredPasswordChange({
      token,
      newPassword: OTHER_PASSWORD,
    });
    await expect(
      login({ email: "ana@example.com", password: PASSWORD, ip: IP }),
    ).resolves.toEqual({ ok: false, code: "UNAUTHENTICATED" });
    await expect(
      loginOk("ana@example.com", OTHER_PASSWORD),
    ).resolves.toMatchObject({ ok: true });
  });

  it("con el flag en false devuelve FORBIDDEN sin tocar nada", async () => {
    await createUser();
    const { token } = await loginOk();
    await expect(
      completeRequiredPasswordChange({ token, newPassword: OTHER_PASSWORD }),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    await expect(validateSession(token)).resolves.not.toBeNull();
    await expect(loginOk()).resolves.toMatchObject({ ok: true });
  });

  it("no se puede usar dos veces: la sesión nueva ya no tiene el cambio pendiente", async () => {
    await createUser("ana@example.com", { mustChangePassword: true });
    const { token } = await loginOk();
    const result = await completeRequiredPasswordChange({
      token,
      newPassword: OTHER_PASSWORD,
    });
    if (!result.ok) throw new Error(`cambio rechazado: ${result.code}`);
    await expect(
      completeRequiredPasswordChange({
        token: result.token,
        newPassword: "tercera-contraseña-larga",
      }),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    await expect(
      loginOk("ana@example.com", OTHER_PASSWORD),
    ).resolves.toMatchObject({ ok: true });
  });

  it("con una sesión inválida devuelve UNAUTHENTICATED", async () => {
    await createUser("ana@example.com", { mustChangePassword: true });
    const { token } = await loginOk();
    await logout(token);
    for (const candidate of [undefined, null, "abc", token]) {
      await expect(
        completeRequiredPasswordChange({
          token: candidate,
          newPassword: OTHER_PASSWORD,
        }),
      ).resolves.toEqual({ ok: false, code: "UNAUTHENTICATED" });
    }
    await expect(loginOk()).resolves.toMatchObject({ ok: true });
  });

  it("una contraseña fuera de política devuelve VALIDATION_ERROR y el flag sigue en true", async () => {
    await createUser("ana@example.com", { mustChangePassword: true });
    const { token } = await loginOk();
    await expect(
      completeRequiredPasswordChange({ token, newPassword: "corta" }),
    ).resolves.toEqual({ ok: false, code: "VALIDATION_ERROR" });
    await expect(validateSession(token)).resolves.toMatchObject({
      mustChangePassword: true,
    });
  });
});

describe("vencimiento de la cookie (brief-3.5, D-5)", () => {
  async function absoluteCapMs(token: string) {
    const result = await getDb().execute<{ cap: number }>(
      sql`select (extract(epoch from created_at + interval '30 days') * 1000)::float8 as cap
          from sessions where id = ${sha256(token)}`,
    );
    return result.rows[0]!.cap;
  }

  it("la cookie del ingreso vence en created_at + 30 días, después que la sesión", async () => {
    await createUser();
    const result = await loginOk();
    expect(result.cookieExpiresAt.getTime()).toBe(
      await absoluteCapMs(result.token),
    );
    expect(result.cookieExpiresAt.getTime()).toBeGreaterThan(
      result.expiresAt.getTime(),
    );
  });

  it("los cambios de contraseña emiten la cookie con el mismo tope", async () => {
    const userId = await createUser("ana@example.com", {
      mustChangePassword: true,
    });
    const { token } = await loginOk();
    const required = await completeRequiredPasswordChange({
      token,
      newPassword: OTHER_PASSWORD,
    });
    if (!required.ok) throw new Error(`cambio rechazado: ${required.code}`);
    expect(required.cookieExpiresAt.getTime()).toBe(
      await absoluteCapMs(required.token),
    );

    const voluntary = await changePassword({
      userId,
      currentPassword: OTHER_PASSWORD,
      newPassword: "tercera-contraseña-larga",
    });
    if (!voluntary.ok) throw new Error(`cambio rechazado: ${voluntary.code}`);
    expect(voluntary.cookieExpiresAt.getTime()).toBe(
      await absoluteCapMs(voluntary.token),
    );
  });
});

describe("límite de intentos", () => {
  it("5 fallos por cuenta bloquean aunque la contraseña sea correcta", async () => {
    await createUser();
    for (let i = 0; i < 5; i++) {
      await login({
        email: "ana@example.com",
        password: OTHER_PASSWORD,
        ip: `198.51.100.${i}`,
      });
    }
    const result = await login({
      email: "ana@example.com",
      password: PASSWORD,
      ip: IP,
    });
    expect(result).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    if (result.ok || result.code !== "RATE_LIMITED")
      throw new Error("se esperaba RATE_LIMITED");
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it("vencida la ventana vuelve a permitir el ingreso", async () => {
    await createUser();
    for (let i = 0; i < 5; i++) {
      await login({
        email: "ana@example.com",
        password: OTHER_PASSWORD,
        ip: IP,
      });
    }
    await getDb().execute(
      sql`update login_attempts set attempted_at = attempted_at - interval '16 minutes'`,
    );
    await expect(loginOk()).resolves.toMatchObject({ ok: true });
  });

  it("un email inexistente acumula igual que uno existente", async () => {
    for (let i = 0; i < 5; i++) {
      await login({
        email: "nadie@example.com",
        password: OTHER_PASSWORD,
        ip: `198.51.100.${i}`,
      });
    }
    await expect(
      login({ email: "nadie@example.com", password: OTHER_PASSWORD, ip: IP }),
    ).resolves.toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });

  it("un ingreso correcto limpia los fallos de la cuenta", async () => {
    await createUser();
    for (let i = 0; i < 4; i++) {
      await login({
        email: "ana@example.com",
        password: OTHER_PASSWORD,
        ip: IP,
      });
    }
    await loginOk();
    for (let i = 0; i < 4; i++) {
      await login({
        email: "ana@example.com",
        password: OTHER_PASSWORD,
        ip: IP,
      });
    }
    await expect(loginOk()).resolves.toMatchObject({ ok: true });
  });

  it(
    "20 fallos desde una IP bloquean también a otras cuentas",
    { timeout: 30000 },
    async () => {
      await createUser();
      for (let i = 0; i < 20; i++) {
        await login({
          email: `nadie${i}@example.com`,
          password: OTHER_PASSWORD,
          ip: IP,
        });
      }
      await expect(
        login({ email: "ana@example.com", password: PASSWORD, ip: IP }),
      ).resolves.toMatchObject({ ok: false, code: "RATE_LIMITED" });
      await expect(
        login({
          email: "ana@example.com",
          password: PASSWORD,
          ip: "198.51.100.77",
        }),
      ).resolves.toMatchObject({ ok: true });
    },
  );

  it("los intentos guardan hashes, no el email ni la IP", async () => {
    await login({
      email: "nadie@example.com",
      password: OTHER_PASSWORD,
      ip: IP,
    });
    const rows = await getDb().execute<{ key_hash: string }>(
      sql`select key_hash from login_attempts`,
    );
    expect(rows.rows.map((row) => row.key_hash).sort()).toEqual(
      [sha256("nadie@example.com"), sha256(IP)].sort(),
    );
  });
});
