import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { login } from "@/modules/auth";
import { createDb, getDb } from "@/shared/db";
import {
  isSeedableDatabase,
  mensajeBaseNoSeedeable,
  SEED_ORGANIZATION_ID,
  SEED_USERS,
  seedBasic,
} from "../../seeds/basic";
import { resetDatabase } from "./reset-database";
import { maintenanceUrl } from "./test-database";

// Seed básico contra PostgreSQL real (brief-3.5, D-7).

const PASSWORD = "contraseña-del-seed-larga";

async function count(table: string): Promise<number> {
  const result = await getDb().execute<{ count: number }>(
    sql.raw(`select count(*)::int as count from ${table}`),
  );
  return result.rows[0]!.count;
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("seed básico", () => {
  it("crea una organización, un admin, un viewer y un usuario con cambio pendiente", async () => {
    await seedBasic(getDb(), PASSWORD);
    const rows = await getDb().execute<{
      email: string;
      role: string;
      must_change_password: boolean;
      organization_id: string;
    }>(
      sql`select u.email, m.role, u.must_change_password, m.organization_id
          from users u join organization_members m on m.user_id = u.id
          order by u.email`,
    );
    expect(rows.rows).toEqual([
      {
        email: "admin@example.com",
        role: "admin",
        must_change_password: false,
        organization_id: SEED_ORGANIZATION_ID,
      },
      {
        email: "lectura@example.com",
        role: "viewer",
        must_change_password: false,
        organization_id: SEED_ORGANIZATION_ID,
      },
      {
        email: "nuevo@example.com",
        role: "viewer",
        must_change_password: true,
        organization_id: SEED_ORGANIZATION_ID,
      },
    ]);
    await expect(
      login({ email: SEED_USERS[0].email, password: PASSWORD, ip: null }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("es idempotente y repone los datos modificados", async () => {
    await seedBasic(getDb(), PASSWORD);
    await getDb().execute(
      sql`update users set must_change_password = false, is_active = false, password_hash = 'x'`,
    );
    await getDb().execute(sql`update organization_members set role = 'admin'`);

    await seedBasic(getDb(), PASSWORD);

    expect(await count("organizations")).toBe(1);
    expect(await count("users")).toBe(3);
    expect(await count("organization_members")).toBe(3);
    const pending = await getDb().execute<{ email: string }>(
      sql`select email from users where must_change_password and is_active`,
    );
    expect(pending.rows).toEqual([{ email: "nuevo@example.com" }]);
    const viewers = await count("organization_members where role = 'viewer'");
    expect(viewers).toBe(2);
    await expect(
      login({ email: SEED_USERS[1].email, password: PASSWORD, ip: null }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("se niega a correr contra una base que no es _dev, _test ni _e2e", async () => {
    const maintenance = createDb(maintenanceUrl(process.env.DATABASE_URL!));
    try {
      await expect(seedBasic(maintenance, PASSWORD)).rejects.toThrow(
        'no contra "postgres"',
      );
      const tables = await maintenance.execute<{ count: number }>(
        sql`select count(*)::int as count from pg_tables where schemaname = 'public' and tablename = 'users'`,
      );
      expect(tables.rows[0]!.count).toBe(0);
    } finally {
      await maintenance.$client.end();
    }
  });

  it("solo admite nombres de base con sufijo _dev, _test, _e2e o _staging", () => {
    for (const name of [
      "crm_dev",
      "crm_dev_test",
      "crm_ci_e2e",
      "crm_staging",
    ]) {
      expect(isSeedableDatabase(name)).toBe(true);
    }
    // El sufijo sigue anclado al final del nombre: agregar _staging en la 9.1 no abre la
    // puerta a una base de producción ni a una copia con un sufijo posterior.
    for (const name of [
      "crm",
      "crm_prod",
      "postgres",
      "crm_dev_backup",
      "crm_staging_backup",
    ]) {
      expect(isSeedableDatabase(name)).toBe(false);
    }
  });

  // N-10 de la segunda revisión independiente: el patrón admitía `_staging` y el mensaje de
  // `conversations.ts` seguía diciendo «_dev, _test o _e2e». Ahora los dos salen de la misma
  // lista, y este caso falla si vuelven a separarse.
  it("el mensaje de rechazo nombra exactamente los sufijos que el patrón admite", () => {
    const mensaje = mensajeBaseNoSeedeable("crm_prod");
    for (const sufijo of ["_dev", "_test", "_e2e", "_staging"]) {
      expect(mensaje).toContain(sufijo);
      expect(isSeedableDatabase(`crm${sufijo}`)).toBe(true);
    }
    expect(mensaje).toContain('"crm_prod"');
  });

  it("rechaza una contraseña más corta que la política sin escribir nada", async () => {
    await expect(seedBasic(getDb(), "corta")).rejects.toThrow(
      "al menos 12 caracteres",
    );
    expect(await count("users")).toBe(0);
  });
});
