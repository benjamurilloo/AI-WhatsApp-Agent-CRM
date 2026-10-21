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

// La 0059 sobre una base que ya está en la 0058, como en producción (brief-29.6.2, D-9). La 0059 agrega
// valores a stock_unit_status, inventory_movement_type y service_order_kind, que ya existían: si un
// CHECK, un índice, un trigger o un dato de la 0059 los usara, el despliegue fallaría con la 0058 ya
// confirmada. Además reescribe los CHECK de service_orders, que valen para las órdenes que ya existen.
// Una base propia, migrada hasta la 0058 y confirmada, con órdenes de cliente en varios estados y una
// unidad, y después la 0059 sola.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0059`;
const URL_0059 = (() => {
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

// Una copia de drizzle/ con las migraciones hasta la 0058.
function folderUpTo0058(): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0059-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 58);
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
  const pool = new Pool({ connectionString: URL_0059 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0059 });
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
  folder = folderUpTo0058();
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0059 sobre una base en la 0058 (D-9)", () => {
  it("migra en su propia transacción con órdenes de antes, y lo nuevo funciona después", async () => {
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
      const modelId = await one(
        `insert into product_models (organization_id, name) values ($1, 'iPhone 13') returning id`,
        [organizationId],
      );
      const productId = await one(
        `insert into products (organization_id, sku, name, model_id, tracking)
         values ($1, 'IP13', 'iPhone 13', $2, 'unit') returning id`,
        [organizationId, modelId],
      );
      const supplierId = await one(
        `insert into suppliers (organization_id, name, is_technician) values ($1, 'Técnico', true) returning id`,
        [organizationId],
      );
      const clientId = await one(
        `insert into clients (organization_id, display_name) values ($1, 'Ana') returning id`,
        [organizationId],
      );
      const unitId = await one(
        `insert into stock_units (organization_id, product_id, serial, cost, cost_currency, origin_type, created_by)
         values ($1, $2, 'IMEI1', 400, 'USD', 'manual', $3) returning id`,
        [organizationId, productId, userId],
      );
      // Órdenes de cliente de antes: recibida, mandada, reparada y cancelada.
      const order = (number: number) =>
        one(
          `insert into service_orders (organization_id, number, client_id, model_id, reported_issue, created_by)
           values ($1, $2, $3, $4, 'No carga', $5) returning id`,
          [organizationId, number, clientId, modelId, userId],
        );
      await order(1);
      const sent = await order(2);
      const repaired = await order(3);
      const cancelled = await order(4);
      for (const id of [sent, repaired]) {
        await client.query(
          `update service_orders set status = 'sent', technician_id = $2, sent_at = now() where id = $1`,
          [id, supplierId],
        );
      }
      await client.query(
        `update service_orders set status = 'quoted', customer_currency = 'USD', customer_total = 50,
           technician_currency = 'USD', technician_total = 20, quoted_at = now() where id = $1`,
        [repaired],
      );
      await client.query(
        `update service_orders set status = 'approved', approved_at = now() where id = $1`,
        [repaired],
      );
      await client.query(
        `update service_orders set status = 'repaired', repaired_at = now() where id = $1`,
        [repaired],
      );
      await client.query(
        `update service_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'other' where id = $1`,
        [cancelled],
      );
      return { organizationId, userId, modelId, supplierId, unitId, sent };
    });

    // La 0059, sola, sobre la base confirmada.
    await migrateWith("drizzle");

    await withClient(async (client) => {
      // Las órdenes de antes siguen valiendo con los CHECK nuevos, y su ciclo no cambia.
      const statuses = await client.query<{ status: string; kind: string }>(
        `select status, kind from service_orders order by number`,
      );
      expect(statuses.rows).toEqual([
        { status: "received", kind: "customer_device" },
        { status: "sent", kind: "customer_device" },
        { status: "repaired", kind: "customer_device" },
        { status: "cancelled", kind: "customer_device" },
      ]);
      await expect(
        client.query(
          `update service_orders set status = 'repaired', repaired_at = now() where id = $1`,
          [ids.sent],
        ),
      ).rejects.toThrow(/transición sent -> repaired no permitida/);

      // Los valores nuevos de los enums se usan en la transacción siguiente: la unidad va a reparar,
      // con su orden propia, y vuelve con el costo sumado.
      await client.query(
        `update stock_units set status = 'in_repair' where id = $1`,
        [ids.unitId],
      );
      const own = await client.query<{ id: string }>(
        `insert into service_orders (organization_id, number, kind, unit_id, model_id, reported_issue,
           technician_id, status, sent_at, created_by)
         values ($1, 5, 'own_unit', $2, $3, 'Batería', $4, 'sent', now(), $5) returning id`,
        [
          ids.organizationId,
          ids.unitId,
          ids.modelId,
          ids.supplierId,
          ids.userId,
        ],
      );
      await client.query(
        `update service_orders set status = 'repaired', repaired_at = now(), technician_currency = 'USD',
           technician_total = 30 where id = $1`,
        [own.rows[0]!.id],
      );
      await client.query(
        `update stock_units set status = 'in_review', cost = 430 where id = $1`,
        [ids.unitId],
      );
      const unit = await client.query<{ status: string; cost: string }>(
        `select status, cost from stock_units where id = $1`,
        [ids.unitId],
      );
      expect(unit.rows).toEqual([{ status: "in_review", cost: "430.00" }]);
      const types = await client.query<{ value: string }>(
        `select unnest(enum_range(null::inventory_movement_type))::text as value`,
      );
      expect(types.rows.map((row) => row.value)).toEqual(
        expect.arrayContaining(["unit_to_repair", "unit_released"]),
      );
    });
  }, 180_000);
});
