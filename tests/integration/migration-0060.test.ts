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

// La 0060 sobre una base que ya está en la 0059, como en producción (brief-29.7, D-9). La 0060 agrega
// valores a capability, document_kind, stock_unit_origin, inventory_movement_type y audit_entity_type,
// que ya existían: si un CHECK, un índice, un trigger o un dato de la 0060 los usara, el despliegue
// fallaría con la 0059 ya confirmada. Además recrea el índice único del IMEI con otro predicado, que
// tiene que valer para las unidades que ya existen (U-2). Una base propia, migrada hasta la 0059 y
// confirmada, con unidades en todos los estados, y después la 0060 sola.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0060`;
const URL_0060 = (() => {
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

// Una copia de drizzle/ con las migraciones hasta la 0059.
function folderUpTo0059(): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0060-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 59);
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
  const pool = new Pool({ connectionString: URL_0060 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0060 });
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
  folder = folderUpTo0059();
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0060 sobre una base en la 0059 (D-9)", () => {
  it("migra en su propia transacción con unidades en todos los estados, y lo nuevo funciona después", async () => {
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
      const productId = await one(
        `insert into products (organization_id, sku, name, tracking, condition)
         values ($1, 'IP13U', 'iPhone 13 usado', 'unit', 'used') returning id`,
        [organizationId],
      );
      const gradeId = await one(
        `insert into unit_grades (organization_id, name) values ($1, 'A') returning id`,
        [organizationId],
      );
      const clientId = await one(
        `insert into clients (organization_id, display_name) values ($1, 'Ana') returning id`,
        [organizationId],
      );
      const unit = (serial: string) =>
        one(
          `insert into stock_units (organization_id, product_id, serial, cost, cost_currency, origin_type, created_by)
           values ($1, $2, $3, 400, 'USD', 'manual', $4) returning id`,
          [organizationId, productId, serial, userId],
        );
      const status = (id: string, value: string) =>
        client.query(`update stock_units set status = $2 where id = $1`, [
          id,
          value,
        ]);
      // Una unidad en cada estado. IMEI-BAJA tiene una dada de baja y otra disponible, que el índice
      // viejo ya admitía.
      await unit("IMEI-DISP");
      await status(await unit("IMEI-BAJA"), "written_off");
      await unit("IMEI-BAJA");
      await status(await unit("IMEI-RES"), "reserved");
      const sold = await unit("IMEI-VEND");
      await status(sold, "sold");
      await status(await unit("IMEI-REP"), "in_repair");
      const review = await unit("IMEI-REV");
      await status(review, "in_repair");
      await status(review, "in_review");
      return { organizationId, userId, productId, gradeId, clientId };
    });

    // La 0060, sola, sobre la base confirmada.
    await migrateWith("drizzle");

    await withClient(async (client) => {
      // Las unidades de antes siguen igual.
      const units = await client.query<{ serial: string; status: string }>(
        `select serial, status from stock_units order by serial, status`,
      );
      expect(units.rows).toEqual([
        { serial: "IMEI-BAJA", status: "available" },
        { serial: "IMEI-BAJA", status: "written_off" },
        { serial: "IMEI-DISP", status: "available" },
        { serial: "IMEI-REP", status: "in_repair" },
        { serial: "IMEI-RES", status: "reserved" },
        { serial: "IMEI-REV", status: "in_review" },
        { serial: "IMEI-VEND", status: "sold" },
      ]);
      // Dos unidades en el local con el mismo IMEI siguen rechazadas.
      await expect(
        client.query(
          `insert into stock_units (organization_id, product_id, serial, cost, cost_currency, origin_type, created_by)
           values ($1, $2, 'imei-disp', 400, 'USD', 'manual', $3)`,
          [ids.organizationId, ids.productId, ids.userId],
        ),
      ).rejects.toThrow(/stock_units_organization_serial_lower_unique/);

      // Los valores nuevos se usan en la transacción siguiente: el equipo vendido vuelve como usado,
      // en revisión, con su comprobante (U-2).
      const tradeInId = "11111111-1111-4111-8111-111111111111";
      const unitId = (
        await client.query<{ id: string }>(
          `insert into stock_units (organization_id, product_id, serial, cost, cost_currency, origin_type,
             origin_id, status, grade_id, battery_health, created_by)
           values ($1, $2, 'IMEI-VEND', 250, 'USD', 'trade_in', $3, 'in_review', $4, 88, $5) returning id`,
          [
            ids.organizationId,
            ids.productId,
            tradeInId,
            ids.gradeId,
            ids.userId,
          ],
        )
      ).rows[0]!.id;
      await client.query(
        `insert into trade_ins (id, organization_id, number, client_id, product_id, unit_id, serial,
           battery_health, grade_id, value, currency, destination, created_by)
         values ($1, $2, 1, $3, $4, $5, 'IMEI-VEND', 88, $6, 250, 'USD', 'purchase', $7)`,
        [
          tradeInId,
          ids.organizationId,
          ids.clientId,
          ids.productId,
          unitId,
          ids.gradeId,
          ids.userId,
        ],
      );
      const back = await client.query<{ status: string }>(
        `select status from stock_units where serial = 'IMEI-VEND' order by status`,
      );
      expect(back.rows.map((row) => row.status)).toEqual(["sold", "in_review"]);
      const values = await client.query<{ value: string }>(
        `select unnest(enum_range(null::capability))::text as value`,
      );
      expect(values.rows.map((row) => row.value)).toContain("trade_ins");
    });
  }, 180_000);
});
