import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { maintenanceUrl } from "./test-database";

// La 0054 sobre una base que ya está en la 0053, como en producción (brief-29.4.2, D-2 y AC-1;
// revisión independiente, M-1).
//
// La base de test se crea vacía y se migra entera en una transacción (global-setup.ts). Ahí el enum
// exchange_rate_source nace en la misma transacción que la 0054, y PostgreSQL deja usar un valor
// recién agregado a un enum creado en esa transacción: la suite pasaría aunque un CHECK nombrara
// 'dolarapi_blue'. En producción la 0053 ya está confirmada, y ese CHECK haría fallar el despliegue
// (H-1). Este test reproduce producción: una base propia, migrada hasta la 0053 y confirmada, con
// datos de la 29.4, y después la 0054 sola, en su transacción.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0054`;
const URL_0054 = (() => {
  const url = new URL(BASE_URL);
  url.pathname = `/${NAME}`;
  return url.toString();
})();

let folder: string;

async function maintenance(query: string) {
  const client = new Client({ connectionString: maintenanceUrl(BASE_URL) });
  await client.connect();
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}

// Una copia de drizzle/ con las migraciones hasta la 0053.
function folderUpTo0053(): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0054-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 53);
  writeFileSync(join(target, "meta", "_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) {
    copyFileSync(
      join("drizzle", `${entry.tag}.sql`),
      join(target, `${entry.tag}.sql`),
    );
  }
  return target;
}

async function migrateWith(migrationsFolder: string) {
  const pool = new Pool({ connectionString: URL_0054 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0054 });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  if (!/^[a-z0-9_]+$/.test(NAME)) throw new Error("nombre de base inválido");
  await maintenance(`drop database if exists "${NAME}" with (force)`);
  // template0: una conexión abierta a template1 haría fallar el CREATE DATABASE.
  await maintenance(`create database "${NAME}" template template0`);
  folder = folderUpTo0053();
  // Crear la base y copiar las migraciones, con la máquina cargada por la suite entera.
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0054 sobre una base en la 0053 (AC-1, M-1)", () => {
  it("migra en su propia transacción con datos de la 29.4, y la lectura funciona después", async () => {
    await migrateWith(folder);

    // Lo que dejó la 29.4 en producción: una organización con moneda principal, su configuración
    // manual y una cotización manual.
    const ids = await withClient(async (client) => {
      const org = await client.query<{ id: string }>(
        `insert into organizations (name, main_currency) values ('iPhone', 'USD') returning id`,
      );
      const user = await client.query<{ id: string }>(
        `insert into users (email, password_hash, name)
         values ('admin@example.com', 'x', 'Admin') returning id`,
      );
      const organizationId = org.rows[0]!.id;
      await client.query(
        `insert into exchange_rate_settings (organization_id, quote_currency) values ($1, 'ARS')`,
        [organizationId],
      );
      await client.query(
        `insert into exchange_rates (organization_id, base_currency, quote_currency, rate, source,
           recorded_by)
         values ($1, 'USD', 'ARS', 1565, 'manual', $2)`,
        [organizationId, user.rows[0]!.id],
      );
      return { organizationId };
    });

    // El control: con la 0053 confirmada, usar un valor recién agregado al enum en la misma
    // transacción falla. Es lo que la 0054 no puede hacer (H-1).
    await withClient(async (client) => {
      await client.query("begin");
      await client.query(
        `alter type exchange_rate_source add value 'valor_de_prueba'`,
      );
      await expect(
        client.query(
          `alter table exchange_rates add constraint prueba
             check (source <> 'valor_de_prueba')`,
        ),
      ).rejects.toThrow(/unsafe use of new value/);
      await client.query("rollback");
    });

    // La 0054, sola, sobre la base confirmada.
    await migrateWith("drizzle");

    await withClient(async (client) => {
      const settings = await client.query<{
        source: string;
        adjustment: string;
        last_confirmed_at: Date | null;
      }>(
        `select source, adjustment, last_confirmed_at from exchange_rate_settings
         where organization_id = $1`,
        [ids.organizationId],
      );
      expect(settings.rows).toEqual([
        { source: "manual", adjustment: "0.00", last_confirmed_at: null },
      ]);

      // El admin pasa a la automática con 10 de ajuste, y el lector guarda.
      await client.query(
        `update exchange_rate_settings set source = 'dolarapi_blue', adjustment = 10
         where organization_id = $1`,
        [ids.organizationId],
      );
      await client.query("set role crm_fx_reader");
      const targets = await client.query<{ organization_id: string }>(
        "select organization_id from fx_reader_targets()",
      );
      expect(targets.rows.map((row) => row.organization_id)).toEqual([
        ids.organizationId,
      ]);
      const reading = await client.query<{ result: string }>(
        "select fx_record_reading($1, '1555', now()) as result",
        [ids.organizationId],
      );
      expect(reading.rows[0]!.result).toBe("inserted");
      await client.query("reset role");
      const rates = await client.query<{ rate: string; source: string }>(
        `select rate, source from exchange_rates where organization_id = $1
         order by recorded_at`,
        [ids.organizationId],
      );
      expect(rates.rows).toEqual([
        { rate: "1565.000000", source: "manual" },
        { rate: "1565.000000", source: "dolarapi_blue" },
      ]);
    });
    // Dos migraciones enteras, desde cero.
  }, 180_000);
});
