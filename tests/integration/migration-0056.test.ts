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

// La 0056 sobre una base que ya está en la 0055, como en producción (brief-29.5, D-2 y H-10).
//
// La base de test se migra entera en una transacción: ahí los enums capability, product_condition y
// audit_entity_type nacen en la misma transacción que la 0056, y PostgreSQL dejaría usar sus valores
// nuevos. En producción las migraciones anteriores ya están confirmadas: si la 0056 nombrara
// serialized_units, used, stock_unit o unit_grade en un CHECK, un trigger o un dato, el despliegue
// fallaría. Este test reproduce producción: una base propia, migrada hasta la 0055 y confirmada, con
// datos de la 29.4, y después la 0056 sola. Es el mismo arreglo que migration-0054.test.ts.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0056`;
const URL_0056 = (() => {
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

// Una copia de drizzle/ con las migraciones hasta la 0055.
function folderUpTo0055(): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0056-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 55);
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
  const pool = new Pool({ connectionString: URL_0056 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0056 });
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
  folder = folderUpTo0055();
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0056 sobre una base en la 0055 (H-10)", () => {
  it("migra en su propia transacción con datos de la 29.4, y las unidades funcionan después", async () => {
    await migrateWith(folder);

    // Lo que hay en producción: una organización con variants, un producto y su saldo.
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
      await client.query(
        `insert into organization_capabilities (organization_id, capability, activated_by)
         values ($1, 'variants', $2)`,
        [organizationId, userId],
      );
      const product = await client.query<{ id: string }>(
        `insert into products (organization_id, sku, name, condition)
         values ($1, 'IP13', 'iPhone 13', 'refurbished') returning id`,
        [organizationId],
      );
      return { organizationId, userId, productId: product.rows[0]!.id };
    });

    // El control: con la 0055 confirmada, usar un valor recién agregado al enum en la misma
    // transacción falla. Es lo que la 0056 no puede hacer (H-10).
    await withClient(async (client) => {
      await client.query("begin");
      await client.query(`alter type capability add value 'valor_de_prueba'`);
      await expect(
        client.query(
          `alter table organization_capabilities add constraint prueba
             check (capability <> 'valor_de_prueba')`,
        ),
      ).rejects.toThrow(/unsafe use of new value/);
      await client.query("rollback");
    });

    // La 0056, sola, sobre la base confirmada.
    await migrateWith("drizzle");

    await withClient(async (client) => {
      const product = await client.query<{ tracking: string }>(
        `select tracking from products where id = $1`,
        [ids.productId],
      );
      expect(product.rows).toEqual([{ tracking: "quantity" }]);

      // Los valores nuevos se usan en la transacción siguiente.
      await client.query(
        `insert into organization_capabilities (organization_id, capability, activated_by)
         values ($1, 'serialized_units', $2)`,
        [ids.organizationId, ids.userId],
      );
      await client.query(
        `update products set tracking = 'unit', condition = 'used' where id = $1`,
        [ids.productId],
      );
      const unit = await client.query<{ id: string }>(
        `insert into stock_units (organization_id, product_id, serial, cost, cost_currency,
           origin_type, created_by)
         values ($1, $2, '356938035643809', 450, 'USD', 'manual', $3) returning id`,
        [ids.organizationId, ids.productId, ids.userId],
      );
      await client.query(
        `insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
         values ($1, $2, 'stock_unit', $3, 'create', '{"before": null, "after": {"serial": "x"}}')`,
        [ids.organizationId, ids.userId, unit.rows[0]!.id],
      );
      const counts = await client.query<{
        units: number;
        capabilities: number;
      }>(
        `select (select count(*)::int from stock_units) as units,
                (select count(*)::int from organization_capabilities) as capabilities`,
      );
      expect(counts.rows).toEqual([{ units: 1, capabilities: 2 }]);
    });
    // Dos migraciones enteras, desde cero.
  }, 180_000);
});
