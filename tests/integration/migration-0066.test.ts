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

// La 0066 sobre una base que ya está en la 0065, como en producción (brief-29.10.2, D-4 y AC-1). La 0066
// vuelve nulable el autor de un turno y suma la credencial y el evento del agente, con sus restricciones,
// y reemplaza el trigger con una regla más en el alta. Una base propia, migrada hasta la 0065 y
// confirmada, con turnos dados por una persona en cada estado, y después la 0066 sola: ningún turno
// cambia, el trigger de antes sigue valiendo, y un turno del agente nace pedido.

const BASE_URL = process.env.DATABASE_URL ?? "";
const NAME = `${new URL(BASE_URL).pathname.slice(1)}_m0066`;
const URL_0066 = (() => {
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

// Una copia de drizzle/ con las migraciones hasta la 0065.
function folderUpTo0065(): string {
  const target = mkdtempSync(join(tmpdir(), "crm-m0066-"));
  mkdirSync(join(target, "meta"));
  const journal = JSON.parse(
    readFileSync("drizzle/meta/_journal.json", "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 65);
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
  const pool = new Pool({ connectionString: URL_0066 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: URL_0066 });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function failure(client: Client, query: string, values: unknown[]) {
  await client.query("savepoint intento");
  try {
    await client.query(query, values);
  } catch (error) {
    await client.query("rollback to savepoint intento");
    return (error as Error).message;
  }
  throw new Error("la base aceptó la escritura");
}

const APPOINTMENTS = `select jsonb_agg(to_jsonb(a) - 'created_by_credential_id' - 'ingestion_event_id'
    order by id) as rows from appointments a`;

beforeAll(async () => {
  if (!/^[a-z0-9_]+$/.test(NAME)) throw new Error("nombre de base inválido");
  await maintenance(`drop database if exists "${NAME}" with (force)`);
  // template0: una conexión abierta a template1 haría fallar el CREATE DATABASE.
  await maintenance(`create database "${NAME}" template template0`);
  folder = folderUpTo0065();
}, 60_000);

afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await maintenance(`drop database if exists "${NAME}" with (force)`);
}, 60_000);

describe("la 0066 sobre una base en la 0065 (D-4, AC-1)", () => {
  it("migra sin tocar ningún turno, el trigger de antes sigue, y un turno del agente nace pedido", async () => {
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
      const clientId = await one(
        `insert into clients (organization_id, display_name) values ($1, 'Ana') returning id`,
        [organizationId],
      );
      const reasonId = await one(
        `insert into appointment_reasons (organization_id, name) values ($1, 'Otro') returning id`,
        [organizationId],
      );
      const appointment = (status: string, days: number) =>
        one(
          `insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at, status,
             created_by, confirmed_at, note)
           values ($1, $2, $3, now() + make_interval(days => $5), now() + make_interval(days => $5, mins => 30),
             $4::appointment_status, $6, case when $4::text = 'confirmed' then now() end, 'Con la caja')
           returning id`,
          [organizationId, clientId, reasonId, status, days, userId],
        );
      const requested = await appointment("requested", 1);
      await appointment("confirmed", 2);
      const credentialId = await one(
        `insert into ingestion_credentials (organization_id, source, scope, token_hash)
         values ($1, 'agente-whatsapp', 'ingest', 'h') returning id`,
        [organizationId],
      );
      const eventId = await one(
        `insert into ingestion_events (organization_id, source, external_ref, event_type, payload_hash, status, processed_at)
         values ($1, 'agente-whatsapp', 'evt-1', 'appointment.requested', 'h', 'processed', now()) returning id`,
        [organizationId],
      );
      const before = (await client.query(APPOINTMENTS)).rows[0];
      return {
        organizationId,
        userId,
        clientId,
        reasonId,
        requested,
        credentialId,
        eventId,
        before,
      };
    });

    // La 0066, sola, sobre la base confirmada.
    await migrateWith("drizzle");

    await withClient(async (client) => {
      expect((await client.query(APPOINTMENTS)).rows[0]).toEqual(ids.before);
      const nulls = await client.query<{ n: number }>(
        `select count(*)::int as n from appointments
         where created_by_credential_id is not null or ingestion_event_id is not null`,
      );
      expect(nulls.rows[0]!.n).toBe(0);

      await client.query("begin");
      const insert = `insert into appointments (organization_id, client_id, reason_id, starts_at, ends_at,
          status, created_by, created_by_credential_id, ingestion_event_id, confirmed_at)
        values ($1, $2, $3, now() + interval '3 days', now() + interval '3 days 30 minutes',
          $4::appointment_status, $5, $6, $7, case when $4::text = 'confirmed' then now() end)`;
      const base = [ids.organizationId, ids.clientId, ids.reasonId];
      // La regla nueva del alta, y las dos restricciones del autor.
      expect(
        await failure(client, insert, [
          ...base,
          "confirmed",
          null,
          ids.credentialId,
          ids.eventId,
        ]),
      ).toContain("un turno del agente nace pedido");
      expect(
        await failure(client, insert, [
          ...base,
          "requested",
          ids.userId,
          ids.credentialId,
          ids.eventId,
        ]),
      ).toContain("appointments_one_creator");
      expect(
        await failure(client, insert, [
          ...base,
          "requested",
          null,
          ids.credentialId,
          null,
        ]),
      ).toContain("appointments_event_iff_credential");
      // El trigger de la 0065 sigue: un turno no se borra y una transición prohibida no pasa.
      expect(
        await failure(client, "delete from appointments where id = $1", [
          ids.requested,
        ]),
      ).toContain("un turno se cancela");
      expect(
        await failure(
          client,
          `update appointments set status = 'attended', attended_at = now() where id = $1`,
          [ids.requested],
        ),
      ).toContain("no permitida");
      // El vaciado de la nota sigue pasando sin transición.
      await client.query(`update appointments set note = null where id = $1`, [
        ids.requested,
      ]);
      // Y el turno del agente nace pedido y se confirma.
      await client.query(insert, [
        ...base,
        "requested",
        null,
        ids.credentialId,
        ids.eventId,
      ]);
      await client.query(
        `update appointments set status = 'confirmed', confirmed_at = now()
         where ingestion_event_id = $1`,
        [ids.eventId],
      );
      await client.query("commit");
    });
  }, 180_000);
});
