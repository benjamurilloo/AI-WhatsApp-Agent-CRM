import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { checkDatabase, createDb, getDb } from "@/shared/db";

// Contra el PostgreSQL local de docker-compose.yml. Solo lecturas: no crea ni modifica datos.
describe("conectividad con PostgreSQL", () => {
  afterAll(async () => {
    await getDb().$client.end();
  });

  it("Drizzle ejecuta una consulta con pg", async () => {
    const result = await getDb().execute<{ one: number }>(sql`select 1 as one`);
    expect(result.rows[0]?.one).toBe(1);
  });

  it("el servidor es PostgreSQL 18", async () => {
    const result = await getDb().execute<{ version: number }>(
      sql`select current_setting('server_version_num')::int as version`,
    );
    const version = result.rows[0]?.version ?? 0;
    expect(version).toBeGreaterThanOrEqual(180000);
    expect(version).toBeLessThan(190000);
  });

  it("el health check informa disponible", async () => {
    await expect(checkDatabase()).resolves.toBe(true);
  });
});

describe("conexión cortada por el servidor", () => {
  it("una conexión inactiva terminada no tira el proceso y el pool se recupera", async () => {
    const db = createDb(process.env.DATABASE_URL ?? "");
    const admin = createDb(process.env.DATABASE_URL ?? "");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await db.execute<{ pid: number }>(
        sql`select pg_backend_pid() as pid`,
      );
      const pid = result.rows[0]?.pid;
      expect(pid).toBeTypeOf("number");

      // Simula un reinicio de la base: el servidor corta la conexión que quedó inactiva en el pool.
      await admin.execute(sql`select pg_terminate_backend(${pid})`);
      await new Promise((resolve) => setTimeout(resolve, 300));

      await expect(checkDatabase({ db })).resolves.toBe(true);
    } finally {
      logged.mockRestore();
      await Promise.all([db.$client.end(), admin.$client.end()]);
    }
  });
});

describe("health check sin servidor", () => {
  it("devuelve no disponible a tiempo, sin lanzar ni exponer credenciales", async () => {
    const password = "contrasena-que-no-debe-aparecer";
    const db = createDb(`postgresql://crm:${password}@127.0.0.1:1/crm`);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const started = Date.now();
    try {
      await expect(checkDatabase({ db })).resolves.toBe(false);
      expect(Date.now() - started).toBeLessThan(3000);
      expect(logged).toHaveBeenCalled();
      expect(JSON.stringify(logged.mock.calls)).not.toContain(password);
      expect(JSON.stringify(logged.mock.calls)).not.toContain("127.0.0.1");
    } finally {
      logged.mockRestore();
      await db.$client.end();
    }
  });
});
