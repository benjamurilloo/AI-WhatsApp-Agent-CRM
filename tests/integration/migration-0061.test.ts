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

// La 0061 sobre una base que ya está en la 0060, como en producción (brief-29.7.2, D-7 y AC-14). La 0061
// agrega trade_in_payment y trade_in_payment_void a document_kind y trade_in_payment a audit_entity_type,
// que ya existían: si un CHECK, un índice o un trigger los usara, el despliegue fallaría con la 0060 ya
// confirmada. Además suma columnas a payment_methods y a receipts, y reemplaza el trigger de los medios,
// que tiene que valer para los medios y los cobros que ya existen. Una base propia, migrada hasta la 0060
// y confirmada, con medios, un cobro, una sesión y usados, y después la 0061 sola.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0061`;
const URL_0061 = (() => {
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

// Una copia de drizzle/ con las migraciones hasta la 0060.
function folderUpTo0060(): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0061-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 60);
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
  const pool = new Pool({ connectionString: URL_0061 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0061 });
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
  folder = folderUpTo0060();
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0061 sobre una base en la 0060 (D-7, AC-14)", () => {
  it("migra en su propia transacción con medios, cobros y usados, y lo nuevo funciona después", async () => {
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
      const cash = await one(
        `insert into payment_methods (organization_id, name, is_cash) values ($1, 'Efectivo', true) returning id`,
        [organizationId],
      );
      const transfer = await one(
        `insert into payment_methods (organization_id, name, is_cash) values ($1, 'Transferencia', false) returning id`,
        [organizationId],
      );
      const clientId = await one(
        `insert into clients (organization_id, display_name) values ($1, 'Ana') returning id`,
        [organizationId],
      );
      // Un cobro a cuenta, de los de siempre.
      await client.query(
        `insert into receipts (organization_id, number, target, client_id, payment_method_id, currency, amount, created_by)
         values ($1, 1, 'account', $2, $3, 'USD', 10, $4)`,
        [organizationId, clientId, transfer, userId],
      );
      // Una sesión de caja abierta, con su inicial.
      const sessionId = await one(
        `insert into cash_sessions (organization_id, number, opened_by) values ($1, 1, $2) returning id`,
        [organizationId, userId],
      );
      await client.query(
        `insert into cash_session_opening_amounts (organization_id, session_id, currency, amount)
         values ($1, $2, 'USD', 500)`,
        [organizationId, sessionId],
      );
      // Un usado comprado y uno de permuta, con sus unidades en revisión.
      const productId = await one(
        `insert into products (organization_id, sku, name, tracking, condition)
         values ($1, 'IP13U', 'iPhone 13 usado', 'unit', 'used') returning id`,
        [organizationId],
      );
      const gradeId = await one(
        `insert into unit_grades (organization_id, name) values ($1, 'A') returning id`,
        [organizationId],
      );
      const tradeIn = async (
        id: string,
        number: number,
        serial: string,
        destination: string,
      ) => {
        const unitId = await one(
          `insert into stock_units (organization_id, product_id, serial, cost, cost_currency, origin_type,
             origin_id, status, grade_id, battery_health, created_by)
           values ($1, $2, $3, 300, 'USD', 'trade_in', $4, 'in_review', $5, 88, $6) returning id`,
          [organizationId, productId, serial, id, gradeId, userId],
        );
        await client.query(
          `insert into trade_ins (id, organization_id, number, client_id, product_id, unit_id, serial,
             battery_health, grade_id, value, currency, destination, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, 88, $8, 300, 'USD', $9, $10)`,
          [
            id,
            organizationId,
            number,
            clientId,
            productId,
            unitId,
            serial,
            gradeId,
            destination,
            userId,
          ],
        );
        return id;
      };
      const bought = await tradeIn(
        "22222222-2222-4222-8222-222222222222",
        1,
        "IMEI-COMPRA",
        "purchase",
      );
      const credit = await tradeIn(
        "33333333-3333-4333-8333-333333333333",
        2,
        "IMEI-PERMUTA",
        "sale_credit",
      );
      return {
        organizationId,
        userId,
        cash,
        transfer,
        clientId,
        sessionId,
        bought,
        credit,
      };
    });

    // La 0061, sola, sobre la base confirmada.
    await migrateWith("drizzle");

    await withClient(async (client) => {
      // Lo de antes sigue igual: los medios sin papel de sistema y el cobro sin usado.
      const methods = await client.query<{
        name: string;
        system_role: string | null;
      }>(
        `select name, system_role::text as system_role from payment_methods order by name`,
      );
      expect(methods.rows).toEqual([
        { name: "Efectivo", system_role: null },
        { name: "Transferencia", system_role: null },
      ]);
      const receipt = await client.query<{ trade_in_id: string | null }>(
        `select trade_in_id from receipts`,
      );
      expect(receipt.rows).toEqual([{ trade_in_id: null }]);
      // Un medio de los de siempre se sigue renombrando y desactivando.
      await client.query(
        `update payment_methods set name = 'Transferencia bancaria', is_active = false where id = $1`,
        [ids.transfer],
      );

      // Los valores nuevos se usan en la transacción siguiente: «Permuta», un cobro con el usado de
      // permuta y un pago en efectivo del usado comprado.
      const permuta = (
        await client.query<{ id: string }>(
          `insert into payment_methods (organization_id, name, is_cash, system_role)
           values ($1, 'Permuta', false, 'trade_in') returning id`,
          [ids.organizationId],
        )
      ).rows[0]!.id;
      await expect(
        client.query(
          `update payment_methods set name = 'Canje' where id = $1`,
          [permuta],
        ),
      ).rejects.toThrow(/no se renombra ni se desactiva/);
      await client.query(
        `insert into trade_in_payments (organization_id, number, trade_in_id, payment_method_id,
           session_id, currency, amount, created_by)
         values ($1, 1, $2, $3, $4, 'USD', 100, $5)`,
        [ids.organizationId, ids.bought, ids.cash, ids.sessionId, ids.userId],
      );
      const counters = await client.query<{ value: string }>(
        `select unnest(enum_range(null::document_kind))::text as value`,
      );
      expect(counters.rows.map((row) => row.value)).toEqual(
        expect.arrayContaining(["trade_in_payment", "trade_in_payment_void"]),
      );
      const audit = await client.query<{ value: string }>(
        `select unnest(enum_range(null::audit_entity_type))::text as value`,
      );
      expect(audit.rows.map((row) => row.value)).toContain("trade_in_payment");
      // El usado de permuta todavía no tiene cobros: el CHECK deja un cobro con usado solo contra una
      // venta.
      await expect(
        client.query(
          `insert into receipts (organization_id, number, target, client_id, payment_method_id, currency,
             amount, trade_in_id, created_by)
           values ($1, 3, 'account', $2, $3, 'USD', 5, $4, $5)`,
          [ids.organizationId, ids.clientId, permuta, ids.credit, ids.userId],
        ),
      ).rejects.toThrow(/receipts_trade_in_check/);
    });
  }, 180_000);
});
