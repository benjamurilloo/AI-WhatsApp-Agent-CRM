import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  recordIngestionEvent,
  type IngestionContext,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// client.resolved contra PostgreSQL real (brief-12.1.2): alta auditada con el actor de servicio,
// cliente existente sin escritura, reenvíos, concurrencia, aislamiento y la cadena con
// message.recorded. Los eventos salen de los fixtures del contrato, con forma asumida.

const FIXTURES = path.join(process.cwd(), "tests/fixtures/ingestion/v1");
const TEST_TIMEOUT = 20000;

type ClientPayload = {
  event_id: string;
  occurred_at: string;
  client: { phone: string; display_name: string | null };
} & Record<string, unknown>;

function fixture(name: string) {
  const data = JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));
  if (data.shape !== "assumed") throw new Error(`${name} sin forma asumida`);
  return { payload: data.payload, receivedAt: new Date(data.received_at) };
}

const base = fixture("valid-client-resolved.json");
const RECEIVED_AT = base.receivedAt;
const PHONE: string = base.payload.client.phone;

function event(change: (payload: ClientPayload) => void = () => {}) {
  const payload: ClientPayload = structuredClone(base.payload);
  change(payload);
  return payload;
}

function send(context: IngestionContext, payload: unknown) {
  return recordIngestionEvent(context, JSON.stringify(payload), RECEIVED_AT);
}

async function organizationWithCredential(name: string, source: string) {
  const organization = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  const organizationId = organization.rows[0]!.id;
  const credential = await getDb().execute<{ id: string }>(
    sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
        values (${organizationId}, ${source}, 'ingest', ${randomUUID()}) returning id`,
  );
  return {
    organizationId,
    source,
    credentialId: credential.rows[0]!.id,
  } satisfies IngestionContext;
}

async function insertClient(
  organizationId: string,
  name: string,
  phone: string,
  isActive = true,
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, is_active)
        values (${organizationId}, ${name}, ${phone}, ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

async function clientsOf(organizationId: string) {
  const result = await getDb().execute<{
    id: string;
    display_name: string;
    phone_e164: string | null;
    is_active: boolean;
  }>(
    sql`select id, display_name, phone_e164, is_active from clients
        where organization_id = ${organizationId} order by display_name`,
  );
  return result.rows;
}

async function auditOf(organizationId: string) {
  const result = await getDb().execute<{
    entity_id: string;
    action: string;
    actor_user_id: string | null;
    actor_credential_id: string | null;
    diff: unknown;
  }>(
    sql`select entity_id, action, actor_user_id, actor_credential_id, diff from audit_logs
        where organization_id = ${organizationId} order by created_at, id`,
  );
  return result.rows;
}

async function eventsOf(organizationId: string) {
  const result = await getDb().execute<{
    external_ref: string;
    event_type: string;
    status: string;
  }>(
    sql`select external_ref, event_type, status from ingestion_events
        where organization_id = ${organizationId} order by external_ref`,
  );
  return result.rows;
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("client.resolved: alta", () => {
  it(
    "FR-API-04 y FR-AUD-03: un teléfono nuevo crea el cliente y lo audita con la credencial",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const result = await send(a, base.payload);
      const [client] = await clientsOf(a.organizationId);

      expect(result).toEqual({
        ok: true,
        result: "accepted",
        eventId: "evt-client-0001",
        client: { id: client!.id, displayName: "María Gómez", isActive: true },
      });
      expect(await clientsOf(a.organizationId)).toEqual([
        {
          id: client!.id,
          display_name: "María Gómez",
          phone_e164: PHONE,
          is_active: true,
        },
      ]);
      expect(await auditOf(a.organizationId)).toEqual([
        {
          entity_id: client!.id,
          action: "create",
          actor_user_id: null,
          actor_credential_id: a.credentialId,
          diff: {
            before: null,
            after: {
              displayName: "María Gómez",
              phoneE164: PHONE,
              notes: null,
              isActive: true,
            },
          },
        },
      ]);
      expect(await eventsOf(a.organizationId)).toEqual([
        {
          external_ref: "evt-client-0001",
          event_type: "client.resolved",
          status: "processed",
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-04: sin nombre se crea como «Sin nombre», nunca con el teléfono",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const { payload } = fixture("valid-client-resolved-without-name.json");
      const result = await send(a, payload);
      expect(
        result.ok && "client" in result && result.client?.displayName,
      ).toBe("Sin nombre");
      const [client] = await clientsOf(a.organizationId);
      expect(client!.display_name).toBe("Sin nombre");
      expect(client!.display_name).not.toContain(payload.client.phone);
    },
    TEST_TIMEOUT,
  );
});

describe("client.resolved: cliente existente", () => {
  it(
    "FR-API-04: un cliente activo se devuelve sin escribir ni renombrar",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const id = await insertClient(
        a.organizationId,
        "María del backoffice",
        PHONE,
      );
      const result = await send(a, base.payload);
      expect(result).toMatchObject({
        ok: true,
        result: "accepted",
        client: { id, displayName: "María del backoffice", isActive: true },
      });
      expect(await clientsOf(a.organizationId)).toHaveLength(1);
      expect((await clientsOf(a.organizationId))[0]!.display_name).toBe(
        "María del backoffice",
      );
      expect(await auditOf(a.organizationId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-04: un cliente inactivo se devuelve inactivo: no se reactiva ni se crea otro",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const id = await insertClient(a.organizationId, "María", PHONE, false);
      const result = await send(a, base.payload);
      expect(result).toMatchObject({
        ok: true,
        client: { id, isActive: false },
      });
      expect(await clientsOf(a.organizationId)).toEqual([
        { id, display_name: "María", phone_e164: PHONE, is_active: false },
      ]);
      expect(await auditOf(a.organizationId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe("client.resolved: reenvíos", () => {
  it(
    "FR-API-04: el mismo evento responde duplicate con el mismo cliente, sin otra escritura",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const first = await send(a, base.payload);
      const second = await send(a, base.payload);
      expect(second).toEqual({
        ...first,
        result: "duplicate",
      });
      expect(await clientsOf(a.organizationId)).toHaveLength(1);
      expect(await auditOf(a.organizationId)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-04: el mismo event_id con otro contenido es CONFLICT y no escribe",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await send(a, base.payload);
      const changed = event((p) => (p.client.phone = "+5491155550099"));
      expect(await send(a, changed)).toEqual({
        ok: false,
        code: "CONFLICT",
        recorded: false,
      });
      expect(await clientsOf(a.organizationId)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-04: un reenvío cuyo teléfono ya no es de nadie responde client null y no crea",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await send(a, base.payload);
      await getDb().execute(
        sql`update clients set phone_e164 = null where organization_id = ${a.organizationId}`,
      );
      expect(await send(a, base.payload)).toEqual({
        ok: true,
        result: "duplicate",
        eventId: "evt-client-0001",
        client: null,
      });
      expect(await clientsOf(a.organizationId)).toHaveLength(1);
      expect(await auditOf(a.organizationId)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});

// Una conexión aparte inserta el mismo teléfono y retiene su transacción sin confirmar: las
// resoluciones esperan en el índice único, y eso se comprueba en pg_stat_activity antes de soltarla
// (convención de la 4.3.2, revisión independiente R-1). Al soltarla, la revierte o la confirma.
class Released extends Error {}

async function holdClientInsert(organizationId: string) {
  let taken!: () => void;
  let release!: (commit: boolean) => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<boolean>((resolve) => (release = resolve));
  const holder = getDb()
    .transaction(async (tx) => {
      await tx.execute(
        sql`insert into clients (organization_id, display_name, phone_e164)
            values (${organizationId}, ${"Retenido"}, ${PHONE})`,
      );
      taken();
      if (!(await released)) throw new Released();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Released)) throw error;
    });
  await lockTaken;
  return async (commit: boolean) => {
    release(commit);
    await holder;
  };
}

async function waitForLockWaiters(count: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let waiting = -1;
  while (Date.now() < deadline) {
    const result = await getDb().execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = ${"Lock"}`,
    );
    waiting = result.rows[0]!.waiting;
    if (waiting === count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `se esperaban ${count} conexiones en un bloqueo y hay ${waiting}`,
  );
}

describe("client.resolved: concurrencia (D-10)", () => {
  it(
    "FR-API-04: si la inserción retenida se revierte, una de las dos resoluciones crea y la otra la lee",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const release = await holdClientInsert(a.organizationId);
      const pending = ["evt-concurrente-1", "evt-concurrente-2"].map((id) =>
        send(
          a,
          event((p) => (p.event_id = id)),
        ),
      );
      await waitForLockWaiters(2);
      await release(false);
      const results = await Promise.all(pending);

      const clients = await clientsOf(a.organizationId);
      expect(clients).toHaveLength(1);
      expect(clients[0]!.display_name).toBe("María Gómez");
      for (const result of results) {
        expect(result).toMatchObject({
          ok: true,
          result: "accepted",
          client: { id: clients[0]!.id },
        });
      }
      expect(await auditOf(a.organizationId)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-04: si la inserción retenida se confirma, ninguna resolución crea ni audita: las dos la leen",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const release = await holdClientInsert(a.organizationId);
      const pending = ["evt-concurrente-1", "evt-concurrente-2"].map((id) =>
        send(
          a,
          event((p) => (p.event_id = id)),
        ),
      );
      await waitForLockWaiters(2);
      await release(true);
      const results = await Promise.all(pending);

      const clients = await clientsOf(a.organizationId);
      expect(clients).toEqual([
        expect.objectContaining({ display_name: "Retenido" }),
      ]);
      for (const result of results) {
        expect(result).toMatchObject({
          ok: true,
          client: { id: clients[0]!.id, displayName: "Retenido" },
        });
      }
      expect(await auditOf(a.organizationId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe("client.resolved: aislamiento y cadena", () => {
  it(
    "FR-API-04: el cliente de otra organización con el mismo teléfono no se devuelve",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const b = await organizationWithCredential("Negocio B", "emisor-b");
      const foreign = await insertClient(b.organizationId, "De B", PHONE);
      const result = await send(a, base.payload);
      const [own] = await clientsOf(a.organizationId);
      expect(own).toBeDefined();
      expect(result).toMatchObject({ client: { id: own!.id } });
      expect(own!.id).not.toBe(foreign);
      expect(await clientsOf(b.organizationId)).toHaveLength(1);
      expect(await auditOf(b.organizationId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-04: un message.recorded posterior con el mismo teléfono se asocia al cliente resuelto",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const resolved = await send(a, base.payload);
      const message = fixture("valid-inbound-with-client.json").payload;
      message.conversation.client_phone = PHONE;
      expect(await send(a, message)).toMatchObject({
        ok: true,
        result: "accepted",
      });
      const conversation = await getDb().execute<{ client_id: string }>(
        sql`select client_id from conversations where organization_id = ${a.organizationId}`,
      );
      expect(conversation.rows).toEqual([
        {
          client_id: resolved.ok && "client" in resolved && resolved.client?.id,
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-AUD-03: sin credencial en el contexto no hay actor, así que client.resolved no escribe nada",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await expect(
        send(
          { organizationId: a.organizationId, source: a.source },
          base.payload,
        ),
      ).rejects.toThrow("client.resolved sin credencial");
      expect(await clientsOf(a.organizationId)).toEqual([]);
      expect(await eventsOf(a.organizationId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
