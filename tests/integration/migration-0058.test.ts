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

// La 0058 sobre una base que ya está en la 0057, como en producción (brief-29.6, D-12). La 0058 agrega
// repairs a capability, service_order a document_kind y tres valores a audit_entity_type, que ya
// existían: si un CHECK, un índice, un trigger o un dato de la 0058 los usara, el despliegue fallaría
// con la 0057 ya confirmada. Este test reproduce producción, como migration-0057.test.ts: una base
// propia, migrada hasta la 0057 y confirmada, con un producto, un proveedor, un cliente y una venta de
// antes, y después la 0058 sola.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0058`;
const URL_0058 = (() => {
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

// Una copia de drizzle/ con las migraciones hasta la 0057.
function folderUpTo0057(): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0058-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 57);
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
  const pool = new Pool({ connectionString: URL_0058 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0058 });
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
  folder = folderUpTo0057();
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0058 sobre una base en la 0057 (D-12)", () => {
  it("migra en su propia transacción con datos de antes, y lo nuevo funciona después", async () => {
    await migrateWith(folder);

    const ids = await withClient(async (client) => {
      const org = await client.query<{ id: string }>(
        `insert into organizations (name, main_currency) values ('iPhone Demo', 'USD') returning id`,
      );
      const user = await client.query<{ id: string }>(
        `insert into users (email, password_hash, name)
         values ('admin@example.com', 'x', 'Admin') returning id`,
      );
      const organizationId = org.rows[0]!.id;
      const product = await client.query<{ id: string }>(
        `insert into products (organization_id, sku, name) values ($1, 'IP13', 'iPhone 13') returning id`,
        [organizationId],
      );
      const supplier = await client.query<{ id: string }>(
        `insert into suppliers (organization_id, name) values ($1, 'Técnico') returning id`,
        [organizationId],
      );
      const model = await client.query<{ id: string }>(
        `insert into product_models (organization_id, name) values ($1, 'iPhone 13') returning id`,
        [organizationId],
      );
      const clientRow = await client.query<{ id: string }>(
        `insert into clients (organization_id, display_name) values ($1, 'Ana') returning id`,
        [organizationId],
      );
      return {
        organizationId,
        userId: user.rows[0]!.id,
        productId: product.rows[0]!.id,
        supplierId: supplier.rows[0]!.id,
        modelId: model.rows[0]!.id,
        clientId: clientRow.rows[0]!.id,
      };
    });

    // La 0058, sola, sobre la base confirmada.
    await migrateWith("drizzle");

    await withClient(async (client) => {
      // Lo de antes queda como estaba: ni producto de servicio ni técnico.
      const before = await client.query<{
        is_service: boolean;
        is_technician: boolean;
      }>(
        `select (select is_service from products where id = $1) as is_service,
                (select is_technician from suppliers where id = $2) as is_technician`,
        [ids.productId, ids.supplierId],
      );
      expect(before.rows).toEqual([
        { is_service: false, is_technician: false },
      ]);

      // Los valores nuevos de los enums se usan en la transacción siguiente.
      await client.query(
        `insert into organization_capabilities (organization_id, capability, activated_by)
         values ($1, 'repairs', $2)`,
        [ids.organizationId, ids.userId],
      );
      await client.query(
        `insert into document_counters (organization_id, kind, last_number)
         values ($1, 'service_order', 0)`,
        [ids.organizationId],
      );
      await client.query(
        `update suppliers set is_technician = true where id = $1`,
        [ids.supplierId],
      );
      const type = await client.query<{ id: string }>(
        `insert into repair_types (organization_id, name) values ($1, 'Cambio de batería') returning id`,
        [ids.organizationId],
      );
      await client.query(
        `insert into audit_logs (organization_id, actor_user_id, entity_type, entity_id, action, diff)
         values ($1, $2, 'repair_type', $3, 'create', '{}'::jsonb)`,
        [ids.organizationId, ids.userId, type.rows[0]!.id],
      );
      const order = await client.query<{ id: string }>(
        `insert into service_orders (organization_id, number, client_id, model_id, reported_issue, created_by)
         values ($1, 1, $2, $3, 'No carga', $4) returning id`,
        [ids.organizationId, ids.clientId, ids.modelId, ids.userId],
      );
      await client.query(
        `update service_orders set status = 'sent', technician_id = $2, sent_at = now() where id = $1`,
        [order.rows[0]!.id, ids.supplierId],
      );
      await expect(
        client.query(
          `update service_orders set status = 'repaired', repaired_at = now() where id = $1`,
          [order.rows[0]!.id],
        ),
      ).rejects.toThrow(/transición sent -> repaired no permitida/);
      // Un producto de servicio, y uno solo.
      await client.query(
        `insert into products (organization_id, sku, name, is_service) values ($1, 'REPARACION', 'Reparación', true)`,
        [ids.organizationId],
      );
      await expect(
        client.query(
          `insert into products (organization_id, sku, name, is_service) values ($1, 'OTRA', 'Otra', true)`,
          [ids.organizationId],
        ),
      ).rejects.toThrow(/products_organization_service_unique/);
    });
  }, 180_000);
});
