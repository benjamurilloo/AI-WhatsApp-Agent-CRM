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

// La 0064 sobre una base que ya está en la 0063, como en producción (brief-29.9.2, D-3 y AC-1). La 0064
// agrega warranty_claim a service_order_kind y not_covered a service_order_cancel_reason, que ya
// existían: si un CHECK, un índice o un trigger los usara como enum, el despliegue fallaría con la 0063
// ya confirmada. Además reescribe los CHECK y el trigger de service_orders, que valen para las órdenes
// que ya existen. Una base propia, migrada hasta la 0063 y confirmada, con órdenes de los dos tipos en
// varios estados, y después la 0064 sola: ninguna orden cambia, y lo nuevo funciona en la transacción
// siguiente.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0064`;
const URL_0064 = (() => {
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

// Una copia de drizzle/ con las migraciones hasta la 0063.
function folderUpTo0063(): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0064-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 63);
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
  const pool = new Pool({ connectionString: URL_0064 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0064 });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

// Las órdenes como filas completas, sin las columnas que agrega la 0064, para comparar antes y después.
const ORDERS = `select to_jsonb(o) - 'claim_unit_id' - 'claim_service_order_id' as row
  from service_orders o order by number`;

beforeAll(async () => {
  if (!/^[a-z0-9_]+$/.test(NAME)) throw new Error("nombre de base inválido");
  await maintenance(`drop database if exists "${NAME}" with (force)`);
  // template0: una conexión abierta a template1 haría fallar el CREATE DATABASE.
  await maintenance(`create database "${NAME}" template template0`);
  folder = folderUpTo0063();
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0064 sobre una base en la 0063 (D-3, AC-1)", () => {
  it("migra en su propia transacción sin tocar las órdenes de antes, y lo nuevo funciona después", async () => {
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
      const unit = (serial: string) =>
        one(
          `insert into stock_units (organization_id, product_id, serial, cost, cost_currency, origin_type, created_by)
           values ($1, $2, $3, 400, 'USD', 'manual', $4) returning id`,
          [organizationId, productId, serial, userId],
        );
      const ownSent = await unit("IMEI1");
      const ownRepaired = await unit("IMEI2");
      const claimed = await unit("IMEI3");

      // Órdenes de cliente: recibida, mandada, rechazada y entregada sin reparar, reparada sin
      // entregar, y cancelada.
      const order = (number: number) =>
        one(
          `insert into service_orders (organization_id, number, client_id, model_id, device_serial,
             reported_issue, created_by)
           values ($1, $2, $3, $4, 'IMEI9', 'No carga', $5) returning id`,
          [organizationId, number, clientId, modelId, userId],
        );
      await order(1);
      const sent = await order(2);
      const rejected = await order(3);
      const repaired = await order(4);
      const cancelled = await order(5);
      for (const id of [sent, rejected, repaired]) {
        await client.query(
          `update service_orders set status = 'sent', technician_id = $2, sent_at = now() where id = $1`,
          [id, supplierId],
        );
      }
      for (const id of [rejected, repaired]) {
        await client.query(
          `update service_orders set status = 'quoted', customer_currency = 'USD', customer_total = 50,
             technician_currency = 'USD', technician_total = 20, quoted_at = now() where id = $1`,
          [id],
        );
      }
      await client.query(
        `update service_orders set status = 'rejected', rejected_at = now() where id = $1`,
        [rejected],
      );
      await client.query(
        `update service_orders set status = 'delivered', delivered_at = now() where id = $1`,
        [rejected],
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
        `update service_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'other'
         where id = $1`,
        [cancelled],
      );
      // Una presupuestada, una aprobada y una entregada reparada con su venta: la fila más común en
      // producción, y la única en que service_orders_sale_delivered vale por el lado de la venta.
      const quoted = await order(11);
      const approved = await order(12);
      const sold = await order(13);
      for (const id of [quoted, approved, sold]) {
        await client.query(
          `update service_orders set status = 'sent', technician_id = $2, sent_at = now() where id = $1`,
          [id, supplierId],
        );
        await client.query(
          `update service_orders set status = 'quoted', customer_currency = 'USD', customer_total = 80,
             technician_currency = 'USD', technician_total = 35, quoted_at = now() where id = $1`,
          [id],
        );
      }
      for (const id of [approved, sold]) {
        await client.query(
          `update service_orders set status = 'approved', approved_at = now() where id = $1`,
          [id],
        );
      }
      await client.query(
        `update service_orders set status = 'repaired', repaired_at = now() where id = $1`,
        [sold],
      );
      const saleId = await one(
        `insert into sales (organization_id, number, client_id, currency, total, created_by)
         values ($1, 1, $2, 'USD', 80, $3) returning id`,
        [organizationId, clientId, userId],
      );
      await client.query(
        `update service_orders set status = 'delivered', delivered_at = now(), sale_id = $2
         where id = $1`,
        [sold, saleId],
      );
      // Órdenes de unidades propias: una mandada y una reparada.
      const own = async (number: number, unitId: string) => {
        await client.query(
          `update stock_units set status = 'in_repair' where id = $1`,
          [unitId],
        );
        return one(
          `insert into service_orders (organization_id, number, kind, unit_id, model_id, reported_issue,
             technician_id, status, sent_at, created_by)
           values ($1, $2, 'own_unit', $3, $4, 'Batería', $5, 'sent', now(), $6) returning id`,
          [organizationId, number, unitId, modelId, supplierId, userId],
        );
      };
      await own(6, ownSent);
      const ownDone = await own(7, ownRepaired);
      await client.query(
        `update service_orders set status = 'repaired', repaired_at = now(), technician_currency = 'USD',
           technician_total = 30 where id = $1`,
        [ownDone],
      );
      const before = (await client.query<{ row: unknown }>(ORDERS)).rows;
      return { organizationId, userId, modelId, clientId, claimed, before };
    });

    // La 0064, sola, sobre la base confirmada.
    await migrateWith("drizzle");

    await withClient(async (client) => {
      // Las órdenes de antes no cambian, y siguen valiendo con los CHECK nuevos.
      const after = (await client.query<{ row: unknown }>(ORDERS)).rows;
      expect(after).toEqual(ids.before);
      expect(after).toHaveLength(10);
      const states = await client.query<{ status: string }>(
        `select status::text as status from service_orders where kind = 'customer_device'
         order by number`,
      );
      expect(states.rows.map((row) => row.status)).toEqual([
        "received",
        "sent",
        "delivered",
        "repaired",
        "cancelled",
        "quoted",
        "approved",
        "delivered",
      ]);
      const claims = await client.query(
        `select id from service_orders
         where claim_unit_id is not null or claim_service_order_id is not null`,
      );
      expect(claims.rows).toEqual([]);

      // Los valores nuevos de los enums se usan en la transacción siguiente: un reclamo de una unidad
      // nace recibido, se manda, se repara sin cargo, se cancela otro con not_covered.
      const claim = await client.query<{ id: string }>(
        `insert into service_orders (organization_id, number, kind, client_id, claim_unit_id, model_id,
           device_serial, reported_issue, created_by)
         values ($1, 8, 'warranty_claim', $2, $3, $4, 'IMEI3', 'No carga', $5) returning id`,
        [
          ids.organizationId,
          ids.clientId,
          ids.claimed,
          ids.modelId,
          ids.userId,
        ],
      );
      const claimId = claim.rows[0]!.id;
      await expect(
        client.query(
          `insert into service_orders (organization_id, number, kind, client_id, claim_unit_id, model_id,
             reported_issue, created_by)
           values ($1, 9, 'warranty_claim', $2, $3, $4, 'Otra vez', $5)`,
          [
            ids.organizationId,
            ids.clientId,
            ids.claimed,
            ids.modelId,
            ids.userId,
          ],
        ),
      ).rejects.toThrow(/service_orders_claim_unit_open_unique/);
      await client.query(
        `update service_orders set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'not_covered' where id = $1`,
        [claimId],
      );
      const kinds = await client.query<{ value: string }>(
        `select unnest(enum_range(null::service_order_kind))::text as value`,
      );
      expect(kinds.rows.map((row) => row.value)).toEqual([
        "customer_device",
        "own_unit",
        "warranty_claim",
      ]);
      const done = await client.query<{ status: string; reason: string }>(
        `select status::text as status, cancel_reason::text as reason from service_orders
         where id = $1`,
        [claimId],
      );
      expect(done.rows).toEqual([
        { status: "cancelled", reason: "not_covered" },
      ]);
    });
  }, 180_000);
});
