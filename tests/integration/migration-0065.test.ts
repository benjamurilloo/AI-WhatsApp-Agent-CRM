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

// La 0065 sobre una base que ya está en la 0064, como en producción (brief-29.10, D-2 y AC-1). La 0065
// agrega appointments a capability y tres valores a audit_entity_type, que ya existían: si un CHECK, un
// índice o un trigger los usara como enum, el despliegue fallaría con la 0064 ya confirmada. Una base
// propia, migrada hasta la 0064 y confirmada, con una organización con capacidades, un cliente y su
// auditoría, y después la 0065 sola: nada de lo anterior cambia, y lo nuevo funciona en la transacción
// siguiente.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0065`;
const URL_0065 = (() => {
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

// Una copia de drizzle/ con las migraciones hasta la 0064.
function folderUpTo0064(): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0065-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 64);
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
  const pool = new Pool({ connectionString: URL_0065 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0065 });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

// Lo que existía antes, para comparar antes y después.
const BEFORE = `select
    (select jsonb_agg(to_jsonb(c) order by capability) from organization_capabilities c) as capabilities,
    (select jsonb_agg(to_jsonb(c) order by id) from clients c) as clients,
    (select jsonb_agg(to_jsonb(a) order by id) from audit_logs a) as audit,
    (select jsonb_agg(to_jsonb(h) order by weekday) from business_hours h) as hours`;

beforeAll(async () => {
  if (!/^[a-z0-9_]+$/.test(NAME)) throw new Error("nombre de base inválido");
  await maintenance(`drop database if exists "${NAME}" with (force)`);
  // template0: una conexión abierta a template1 haría fallar el CREATE DATABASE.
  await maintenance(`create database "${NAME}" template template0`);
  folder = folderUpTo0064();
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0065 sobre una base en la 0064 (D-2, AC-1)", () => {
  it("migra en su propia transacción sin tocar lo de antes, y lo nuevo funciona después", async () => {
    await migrateWith(folder);

    const ids = await withClient(async (client) => {
      const one = async (query: string, values: unknown[] = []) =>
        (await client.query<{ id: string }>(query, values)).rows[0]!.id;
      const organizationId = await one(
        `insert into organizations (name, main_currency) values ('iPhone Demo', 'USD') returning id`,
      );
      const userId = await one(
        `insert into users (email, password_hash, name)
         values ('admin@example.com', 'x', 'Admin') returning id`,
      );
      for (const capability of [
        "variants",
        "serialized_units",
        "repairs",
        "trade_ins",
      ]) {
        await client.query(
          `insert into organization_capabilities (organization_id, capability, activated_by)
           values ($1, $2, $3)`,
          [organizationId, capability, userId],
        );
      }
      const clientId = await one(
        `insert into clients (organization_id, display_name) values ($1, 'Ana') returning id`,
        [organizationId],
      );
      await client.query(
        `insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
         values ($1, $2, 'client', $3, 'create', '{"before": null, "after": {}}')`,
        [organizationId, userId, clientId],
      );
      await client.query(
        `insert into business_hours (organization_id, weekday, opens_1, closes_1)
         select $1, weekday, '10:00', '18:00' from generate_series(1, 7) as weekday`,
        [organizationId],
      );
      const before = (await client.query(BEFORE)).rows[0];
      return { organizationId, userId, clientId, before };
    });

    // La 0065, sola, sobre la base confirmada.
    await migrateWith("drizzle");

    await withClient(async (client) => {
      expect((await client.query(BEFORE)).rows[0]).toEqual(ids.before);
      for (const table of [
        "appointments",
        "appointment_reasons",
        "appointment_settings",
      ]) {
        const count = await client.query<{ n: number }>(
          `select count(*)::int as n from ${table}`,
        );
        expect(count.rows[0]!.n).toBe(0);
      }

      // Los valores nuevos de los enums se usan en la transacción siguiente: la capacidad, los valores,
      // un motivo, un turno y su auditoría.
      await client.query(
        `insert into organization_capabilities (organization_id, capability, activated_by)
         values ($1, 'appointments', $2)`,
        [ids.organizationId, ids.userId],
      );
      await client.query(
        `insert into appointment_settings (organization_id, slot_minutes, capacity, is_example)
         values ($1, 30, 1, true)`,
        [ids.organizationId],
      );
      const reason = await client.query<{ id: string }>(
        `insert into appointment_reasons (organization_id, name) values ($1, 'Otro') returning id`,
        [ids.organizationId],
      );
      const appointment = await client.query<{ id: string }>(
        `insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
           created_by, confirmed_at)
         values ($1, $2, $3, now() + interval '1 day', now() + interval '1 day 30 minutes',
           'confirmed', $4, now())
         returning id`,
        [ids.organizationId, ids.clientId, reason.rows[0]!.id, ids.userId],
      );
      for (const entityType of [
        "appointment",
        "appointment_reason",
        "appointment_settings",
      ]) {
        await client.query(
          `insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
           values ($1, $2, $3, $4, 'create', '{"before": null, "after": {}}')`,
          [ids.organizationId, ids.userId, entityType, appointment.rows[0]!.id],
        );
      }
      const capabilities = await client.query<{ value: string }>(
        `select unnest(enum_range(null::capability))::text as value`,
      );
      expect(capabilities.rows.map((row) => row.value)).toEqual([
        "variants",
        "serialized_units",
        "repairs",
        "trade_ins",
        "appointments",
      ]);
      // El rol de la aplicación escribe las tablas nuevas y no las borra.
      const grants = await client.query<{ table: string; privileges: string }>(
        `select table_name as table, string_agg(privilege_type, ',' order by privilege_type) as privileges
         from information_schema.role_table_grants
         where grantee = 'crm_app' and table_name like 'appointment%'
         group by table_name order by table_name`,
      );
      expect(grants.rows).toEqual([
        { table: "appointment_reasons", privileges: "INSERT,SELECT,UPDATE" },
        { table: "appointment_settings", privileges: "INSERT,SELECT,UPDATE" },
        { table: "appointments", privileges: "INSERT,SELECT,UPDATE" },
      ]);
    });
  }, 180_000);
});
