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

// La 0057 sobre una base que ya está en la 0056, como en producción (brief-29.5.2, D-4; invariante 8).
// La 0057 agrega reserved y sold a stock_unit_status, que nació en la 0056: si un CHECK, un índice, un
// trigger o un dato de la 0057 los usara como enum, el despliegue fallaría con la 0056 ya confirmada.
// Este test reproduce producción, como migration-0056.test.ts: una base propia, migrada hasta la 0056
// y confirmada, con una unidad, un pedido y una venta de la 29.5, y después la 0057 sola.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0057`;
const URL_0057 = (() => {
  const url = new URL(BASE_URL);
  url.pathname = `/${NAME}`;
  return url.toString();
})();

let folder: string;
let folder0057: string;

async function maintenance(query: string) {
  const client = new Client({ connectionString: maintenanceUrl(BASE_URL) });
  await client.connect();
  try {
    await client.query(query);
  } finally {
    await client.end();
  }
}

// Una copia de drizzle/ con las migraciones hasta la indicada. La 0057 se aplica desde una copia hasta
// la 0057 y no desde drizzle/: drizzle aplica las pendientes en una sola transacción, y la 0060 usa en
// el índice del IMEI el valor 'sold' que la 0057 agrega (brief-29.7, U-2).
function folderUpTo(last: number): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0057-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= last);
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
  const pool = new Pool({ connectionString: URL_0057 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0057 });
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
  folder = folderUpTo(56);
  folder0057 = folderUpTo(57);
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  rmSync(folder0057, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0057 sobre una base en la 0056 (invariante 8)", () => {
  it("migra en su propia transacción con datos de la 29.5, y los estados nuevos funcionan después", async () => {
    await migrateWith(folder);

    // Lo que hay en producción después de la 29.5: una unidad disponible de un producto por unidad, y
    // un pedido pendiente con una línea, escrito con SQL como lo dejaría un pedido de la 29.5.
    const ids = await withClient(async (client) => {
      const org = await client.query<{ id: string }>(
        `insert into organizations (name, main_currency) values ('iPhone Demo', 'USD') returning id`,
      );
      const user = await client.query<{ id: string }>(
        `insert into users (email, password_hash, name)
         values ('admin@example.com', 'x', 'Admin') returning id`,
      );
      const organizationId = org.rows[0]!.id;
      const userId = user.rows[0]!.id;
      const product = await client.query<{ id: string }>(
        `insert into products (organization_id, sku, name, tracking)
         values ($1, 'IP13', 'iPhone 13', 'unit') returning id`,
        [organizationId],
      );
      const productId = product.rows[0]!.id;
      const unit = await client.query<{ id: string }>(
        `insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
           origin_type, created_by)
         values ($1, $2, '356938035643809', 450, 'USD', 'manual', $3) returning id`,
        [organizationId, productId, userId],
      );
      const clientRow = await client.query<{ id: string }>(
        `insert into clients (organization_id, display_name) values ($1, 'Ana') returning id`,
        [organizationId],
      );
      const order = await client.query<{ id: string }>(
        `insert into orders (organization_id, number, client_id, currency, total, created_by)
         values ($1, 1, $2, 'USD', 900, $3) returning id`,
        [organizationId, clientRow.rows[0]!.id, userId],
      );
      const line = await client.query<{ id: string }>(
        `insert into order_lines (organization_id, order_id, product_id, position, quantity,
           unit_price, currency, line_total)
         values ($1, $2, $3, 1, 1, 900, 'USD', 900) returning id`,
        [organizationId, order.rows[0]!.id, productId],
      );
      return {
        organizationId,
        productId,
        unitId: unit.rows[0]!.id,
        lineId: line.rows[0]!.id,
      };
    });

    // El control: con la 0056 confirmada, usar en la misma transacción un valor recién agregado a
    // stock_unit_status falla. Es lo que la 0057 no puede hacer.
    await withClient(async (client) => {
      await client.query("begin");
      await client.query(
        `alter type stock_unit_status add value 'valor_de_prueba'`,
      );
      await expect(
        client.query(
          `alter table stock_units add constraint prueba
             check (status <> 'valor_de_prueba')`,
        ),
      ).rejects.toThrow(/unsafe use of new value/);
      await client.query("rollback");
    });

    // La 0057, sola, sobre la base confirmada.
    await migrateWith(folder0057);

    await withClient(async (client) => {
      // Los valores nuevos se usan en la transacción siguiente, con las transiciones del trigger.
      await client.query(
        `insert into order_line_units (organization_id, order_line_id, product_id, unit_id, unit_price)
         values ($1, $2, $3, $4, 900)`,
        [ids.organizationId, ids.lineId, ids.productId, ids.unitId],
      );
      await client.query(
        `update stock_units set status = 'reserved' where id = $1`,
        [ids.unitId],
      );
      await client.query(
        `update stock_units set status = 'sold' where id = $1`,
        [ids.unitId],
      );
      await expect(
        client.query(
          `update stock_units set status = 'written_off' where id = $1`,
          [ids.unitId],
        ),
      ).rejects.toThrow(/transición sold -> written_off no permitida/);
      await client.query(
        `update stock_units set price = 850, price_currency = 'USD' where id = $1`,
        [ids.unitId],
      );
      const rows = await client.query<{ status: string; price: string }>(
        `select status::text as status, price::text as price from stock_units where id = $1`,
        [ids.unitId],
      );
      expect(rows.rows).toEqual([{ status: "sold", price: "850.00" }]);
      const counts = await client.query<{ units: number }>(
        `select count(*)::int as units from order_line_units`,
      );
      expect(counts.rows).toEqual([{ units: 1 }]);
    });
  }, 180_000);
});
