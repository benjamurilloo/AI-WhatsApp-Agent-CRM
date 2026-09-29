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
import { login, validateSession } from "@/modules/auth";
import {
  createOrganizationWithAdmin,
  DEFAULT_ORGANIZATION_TIMEZONE,
} from "@/modules/organizations";
import { createDb, getDb } from "@/shared/db";
import { seedBasic } from "../../seeds/basic";
import { seedConversations } from "../../seeds/conversations";
import { seedPilot } from "../../seeds/pilot";
import { seedVolume, seedVolumeDistribution } from "../../seeds/volume";
import { resetDatabase } from "./reset-database";
import { maintenanceUrl } from "./test-database";

// Alta de la primera organización de un entorno sin seeds (brief-13.1, D-9, AC-4) y rechazo de
// todo seed contra la base productiva, probado por efecto (AC-5).

const PASSWORD = "contraseña-correcta-larga";
// El nombre de la base productiva (deploy/production/README.md).
const PRODUCTION_DATABASE = "crm_production";

let consoleCalls: unknown[][] = [];

async function count(table: string): Promise<number> {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

async function counts() {
  return {
    organizations: await count("organizations"),
    users: await count("users"),
    members: await count("organization_members"),
    audit: await count("audit_logs"),
  };
}

const operator = {
  organizationName: "Vixora",
  adminName: "Operadora",
  adminEmail: "Operadora@Example.com",
};

beforeEach(async () => {
  await resetDatabase(getDb());
  consoleCalls = [];
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleCalls.push(args);
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("createOrganizationWithAdmin", () => {
  it("crea la organización, su admin con cambio obligatorio y la auditoría del alta", async () => {
    const result = await createOrganizationWithAdmin(operator);
    if (!result.ok) throw new Error(`alta rechazada: ${result.code}`);

    const organization = await getDb().execute<{
      name: string;
      timezone: string;
    }>(
      sql`select name, timezone from organizations where id = ${result.organizationId}`,
    );
    expect(organization.rows).toEqual([
      { name: "Vixora", timezone: DEFAULT_ORGANIZATION_TIMEZONE },
    ]);

    const user = await getDb().execute<{
      email: string;
      must_change_password: boolean;
      is_active: boolean;
      role: string;
      organization_id: string;
    }>(
      sql`select u.email, u.must_change_password, u.is_active, m.role, m.organization_id
          from users u join organization_members m on m.user_id = u.id
          where u.id = ${result.userId}`,
    );
    expect(user.rows).toEqual([
      {
        email: "operadora@example.com",
        must_change_password: true,
        is_active: true,
        role: "admin",
        organization_id: result.organizationId,
      },
    ]);

    const audit = await getDb().execute<{
      actor_user_id: string;
      entity_type: string;
      entity_id: string;
      action: string;
    }>(
      sql`select actor_user_id, entity_type, entity_id, action from audit_logs
          where organization_id = ${result.organizationId}`,
    );
    expect(audit.rows).toEqual([
      {
        actor_user_id: result.userId,
        entity_type: "organization_member",
        entity_id: result.memberId,
        action: "create",
      },
    ]);

    // La contraseña inicial sirve para entrar, y el ingreso exige cambiarla.
    const logged = await login({
      email: operator.adminEmail,
      password: result.initialPassword,
      ip: null,
    });
    if (!logged.ok) throw new Error(`login rechazado: ${logged.code}`);
    await expect(validateSession(logged.token)).resolves.toMatchObject({
      userId: result.userId,
      mustChangePassword: true,
    });
  });

  it("acepta una zona horaria explícita", async () => {
    const result = await createOrganizationWithAdmin({
      ...operator,
      timezone: "America/Montevideo",
    });
    if (!result.ok) throw new Error(`alta rechazada: ${result.code}`);
    const organization = await getDb().execute<{ timezone: string }>(
      sql`select timezone from organizations where id = ${result.organizationId}`,
    );
    expect(organization.rows[0]!.timezone).toBe("America/Montevideo");
  });

  it("con un correo ya tomado responde CONFLICT y no deja una organización sin admin", async () => {
    const first = await createOrganizationWithAdmin(operator);
    expect(first.ok).toBe(true);
    const before = await counts();

    const second = await createOrganizationWithAdmin({
      ...operator,
      organizationName: "Otra organización",
      adminEmail: "operadora@example.com",
    });

    expect(second).toEqual({ ok: false, code: "CONFLICT" });
    expect(await counts()).toEqual(before);
    const orphans = await count(
      "organizations o where not exists (select 1 from organization_members m where m.organization_id = o.id)",
    );
    expect(orphans).toBe(0);
  });

  it("rechaza datos inválidos con sus campos, sin escribir nada", async () => {
    const before = await counts();
    await expect(
      createOrganizationWithAdmin({
        organizationName: "   ",
        timezone: "Marte/Olympus_Mons",
        adminName: "",
        adminEmail: "no-es-un-correo",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["organizationName", "timezone", "adminName", "adminEmail"],
    });
    await expect(
      createOrganizationWithAdmin({
        ...operator,
        organizationName: "x".repeat(201),
      }),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["organizationName"],
    });
    expect(await counts()).toEqual(before);
  });

  it("no escribe la contraseña inicial en ningún log", async () => {
    const result = await createOrganizationWithAdmin(operator);
    if (!result.ok) throw new Error(`alta rechazada: ${result.code}`);
    expect(JSON.stringify(consoleCalls)).not.toContain(result.initialPassword);
    const audit = await getDb().execute<{ diff: unknown }>(
      sql`select diff from audit_logs`,
    );
    expect(JSON.stringify(audit.rows)).not.toContain(result.initialPassword);
  });
});

// AC-5: los seeds se niegan a correr contra una base con el nombre productivo. Se prueba por
// efecto, sobre una base real con ese nombre en el servidor de test, no leyendo el patrón.
describe("seeds contra la base productiva", () => {
  it("todos los seeds rechazan la base productiva sin crear nada", async () => {
    const maintenance = createDb(maintenanceUrl(process.env.DATABASE_URL!));
    await maintenance.execute(
      sql.raw(`drop database if exists ${PRODUCTION_DATABASE}`),
    );
    await maintenance.execute(
      sql.raw(`create database ${PRODUCTION_DATABASE}`),
    );
    const url = new URL(maintenanceUrl(process.env.DATABASE_URL!));
    url.pathname = `/${PRODUCTION_DATABASE}`;
    const production = createDb(url.toString());
    try {
      const expected = `no contra "${PRODUCTION_DATABASE}"`;
      await expect(seedBasic(production, PASSWORD)).rejects.toThrow(expected);
      await expect(seedConversations(production)).rejects.toThrow(expected);
      await expect(seedPilot(production, PASSWORD)).rejects.toThrow(expected);
      await expect(seedVolume(production, PASSWORD)).rejects.toThrow(expected);
      await expect(
        seedVolumeDistribution(production, PASSWORD),
      ).rejects.toThrow(expected);

      const tables = await production.execute<{ count: number }>(
        sql`select count(*)::int as count from pg_tables where schemaname = 'public'`,
      );
      expect(tables.rows[0]!.count).toBe(0);
    } finally {
      await production.$client.end();
      await maintenance.execute(
        sql.raw(`drop database if exists ${PRODUCTION_DATABASE}`),
      );
      await maintenance.$client.end();
    }
  });
});
