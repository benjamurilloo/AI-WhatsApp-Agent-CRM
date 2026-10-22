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

// La 0062 sobre una base que ya está en la 0061, como en producción (brief-29.7.3, D-6 y AC-11). La 0062
// agrega trade_in_settings y trade_in_margin a audit_entity_type, que ya existía: si un CHECK, un índice
// o un trigger los usara, el despliegue fallaría con la 0061 ya confirmada. Además suma una columna a
// trade_in_checklist_items, que tiene que valer para los puntos que ya existen. Una base propia, migrada
// hasta la 0061 y confirmada, con su checklist, sus tipos de reparación y un modelo, y después la 0062
// sola.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0062`;
const URL_0062 = (() => {
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

// Una copia de drizzle/ con las migraciones hasta la 0061.
function folderUpTo0061(): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0062-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 61);
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
  const pool = new Pool({ connectionString: URL_0062 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0062 });
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
  folder = folderUpTo0061();
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0062 sobre una base en la 0061 (D-6, AC-11)", () => {
  it("migra en su propia transacción con el checklist existente, y lo nuevo funciona después", async () => {
    await migrateWith(folder);

    const ids = await withClient(async (client) => {
      const one = async (query: string, values: unknown[] = []) =>
        (await client.query<{ id: string }>(query, values)).rows[0]!.id;
      const organizationId = await one(
        `insert into organizations (name, main_currency) values ('iPhone Demo', 'USD') returning id`,
      );
      const otherId = await one(
        `insert into organizations (name) values ('Otra') returning id`,
      );
      const itemId = await one(
        `insert into trade_in_checklist_items (organization_id, name, is_example)
         values ($1, 'Cámara trasera', true) returning id`,
        [organizationId],
      );
      const typeId = await one(
        `insert into repair_types (organization_id, name) values ($1, 'Cámara trasera') returning id`,
        [organizationId],
      );
      const otherTypeId = await one(
        `insert into repair_types (organization_id, name) values ($1, 'Cámara trasera') returning id`,
        [otherId],
      );
      const modelId = await one(
        `insert into product_models (organization_id, name) values ($1, 'iPhone 13') returning id`,
        [organizationId],
      );
      return { organizationId, itemId, typeId, otherTypeId, modelId };
    });

    // La 0062, sola, sobre la base confirmada.
    await migrateWith("drizzle");

    await withClient(async (client) => {
      // El punto de antes sigue igual, sin reparación.
      const before = await client.query<{ repair_type_id: string | null }>(
        `select repair_type_id from trade_in_checklist_items`,
      );
      expect(before.rows).toEqual([{ repair_type_id: null }]);
      // Recibe una de su organización, y no una de otra.
      await client.query(
        `update trade_in_checklist_items set repair_type_id = $1 where id = $2`,
        [ids.typeId, ids.itemId],
      );
      await expect(
        client.query(
          `update trade_in_checklist_items set repair_type_id = $1 where id = $2`,
          [ids.otherTypeId, ids.itemId],
        ),
      ).rejects.toThrow(/trade_in_checklist_items_repair_type_fk/);

      // Los valores sueltos: uno por organización, con sus CHECK.
      await client.query(
        `insert into trade_in_settings (organization_id, battery_threshold, range_percent, rounding_step,
           rounding_currency, battery_repair_type_id, is_example)
         values ($1, 80, 10, 10, 'USD', $2, true)`,
        [ids.organizationId, ids.typeId],
      );
      await expect(
        client.query(
          `insert into trade_in_settings (organization_id, battery_threshold, range_percent, rounding_step,
             rounding_currency)
           values ($1, 80, 10, 10, 'USD')`,
          [ids.organizationId],
        ),
      ).rejects.toThrow(/trade_in_settings_organization_unique/);
      await expect(
        client.query(
          `update trade_in_settings set range_percent = 51 where organization_id = $1`,
          [ids.organizationId],
        ),
      ).rejects.toThrow(/trade_in_settings_range_percent_range/);
      await expect(
        client.query(
          `update trade_in_settings set battery_threshold = 0 where organization_id = $1`,
          [ids.organizationId],
        ),
      ).rejects.toThrow(/trade_in_settings_battery_threshold_range/);
      await expect(
        client.query(
          `update trade_in_settings set rounding_step = 0 where organization_id = $1`,
          [ids.organizationId],
        ),
      ).rejects.toThrow(/trade_in_settings_rounding_step_positive/);
      await expect(
        client.query(
          `update trade_in_settings set battery_repair_type_id = $1 where organization_id = $2`,
          [ids.otherTypeId, ids.organizationId],
        ),
      ).rejects.toThrow(/trade_in_settings_battery_repair_type_fk/);

      // Los márgenes: uno por modelo, cero permitido, negativo no.
      await client.query(
        `insert into trade_in_margins (organization_id, model_id, amount, currency) values ($1, $2, 0, 'USD')`,
        [ids.organizationId, ids.modelId],
      );
      await expect(
        client.query(
          `update trade_in_margins set amount = -1 where model_id = $1`,
          [ids.modelId],
        ),
      ).rejects.toThrow(/trade_in_margins_amount_not_negative/);
      await expect(
        client.query(
          `insert into trade_in_margins (organization_id, model_id, amount, currency) values ($1, $2, 5, 'USD')`,
          [ids.organizationId, ids.modelId],
        ),
      ).rejects.toThrow(/trade_in_margins_organization_model_unique/);

      // Los valores nuevos del enum se usan en la transacción siguiente.
      const audit = await client.query<{ value: string }>(
        `select unnest(enum_range(null::audit_entity_type))::text as value`,
      );
      expect(audit.rows.map((row) => row.value)).toEqual(
        expect.arrayContaining(["trade_in_settings", "trade_in_margin"]),
      );
      // crm_app edita, nunca borra.
      const grants = await client.query<{
        table_name: string;
        privilege_type: string;
      }>(
        `select table_name, privilege_type from information_schema.role_table_grants
         where grantee = 'crm_app' and table_name in ('trade_in_settings', 'trade_in_margins')
         order by table_name, privilege_type`,
      );
      expect(grants.rows).toEqual([
        { table_name: "trade_in_margins", privilege_type: "INSERT" },
        { table_name: "trade_in_margins", privilege_type: "SELECT" },
        { table_name: "trade_in_margins", privilege_type: "UPDATE" },
        { table_name: "trade_in_settings", privilege_type: "INSERT" },
        { table_name: "trade_in_settings", privilege_type: "SELECT" },
        { table_name: "trade_in_settings", privilege_type: "UPDATE" },
      ]);
    });
  }, 180_000);
});
