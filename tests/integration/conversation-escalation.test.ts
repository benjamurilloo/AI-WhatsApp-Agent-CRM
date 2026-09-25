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

// conversation.escalated contra PostgreSQL real (brief-12.2.2): derivar a una persona es pasar a
// pending, auditado con la credencial como actor; ya pending no escribe; closed e inexistente son
// rechazos de negocio terminales con la regla en error_code; reenvíos, concurrencia, aislamiento y
// la cadena con conversation.resolved. Los eventos salen de los fixtures, con forma asumida.

const FIXTURES = path.join(process.cwd(), "tests/fixtures/ingestion/v1");
const TEST_TIMEOUT = 20000;

type EscalatedPayload = {
  event_id: string;
  occurred_at: string;
  conversation: { external_ref: string };
} & Record<string, unknown>;

function fixture(name: string) {
  const data = JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));
  if (data.shape !== "assumed") throw new Error(`${name} sin forma asumida`);
  return { payload: data.payload, receivedAt: new Date(data.received_at) };
}

const base = fixture("valid-conversation-escalated.json");
const RECEIVED_AT = base.receivedAt;
const REF: string = base.payload.conversation.external_ref;

function event(change: (payload: EscalatedPayload) => void = () => {}) {
  const payload: EscalatedPayload = structuredClone(base.payload);
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

// Conversación con la referencia del emisor: fixture sintético por SQL.
async function insertConversation(
  organizationId: string,
  status: "open" | "pending" | "closed",
  externalRef = REF,
) {
  const at = new Date("2026-09-16T14:00:00.000Z");
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, channel, external_ref, status, started_at, last_message_at)
        values (${organizationId}, 'whatsapp', ${externalRef}, ${status}, ${at}, ${at})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function statusOf(conversationId: string) {
  const result = await getDb().execute<{ status: string }>(
    sql`select status from conversations where id = ${conversationId}`,
  );
  return result.rows[0]!.status;
}

async function auditOf(organizationId: string) {
  const result = await getDb().execute<{
    entity_type: string;
    entity_id: string;
    action: string;
    actor_user_id: string | null;
    actor_credential_id: string | null;
    diff: unknown;
  }>(
    sql`select entity_type, entity_id, action, actor_user_id, actor_credential_id, diff
        from audit_logs where organization_id = ${organizationId} order by created_at, id`,
  );
  return result.rows;
}

async function eventsOf(organizationId: string) {
  const result = await getDb().execute<{
    external_ref: string;
    status: string;
    error_code: string | null;
  }>(
    sql`select external_ref, status, error_code from ingestion_events
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

describe("conversation.escalated: derivación", () => {
  it(
    "FR-API-06 y FR-AUD-03: una open pasa a pending, auditada con la credencial",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const id = await insertConversation(a.organizationId, "open");
      const result = await send(a, base.payload);

      expect(result).toEqual({
        ok: true,
        result: "accepted",
        eventId: "evt-escalada-0001",
        conversation: { externalRef: REF, status: "pending" },
      });
      expect(await statusOf(id)).toBe("pending");
      expect(await auditOf(a.organizationId)).toEqual([
        {
          entity_type: "conversation",
          entity_id: id,
          action: "status_change",
          actor_user_id: null,
          actor_credential_id: a.credentialId,
          diff: { before: { status: "open" }, after: { status: "pending" } },
        },
      ]);
      expect(await eventsOf(a.organizationId)).toEqual([
        {
          external_ref: "evt-escalada-0001",
          status: "processed",
          error_code: null,
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-06: una pending no escribe ni audita, y responde accepted",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const id = await insertConversation(a.organizationId, "pending");
      expect(await send(a, base.payload)).toMatchObject({
        ok: true,
        result: "accepted",
        conversation: { externalRef: REF, status: "pending" },
      });
      expect(await statusOf(id)).toBe("pending");
      expect(await auditOf(a.organizationId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});

describe("conversation.escalated: rechazos de negocio", () => {
  it(
    "FR-API-06: una closed es conversation_closed, no se reabre, y el reenvío responde lo mismo aunque se haya reabierto",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const id = await insertConversation(a.organizationId, "closed");
      const rejected = {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "conversation_closed",
        recorded: true,
      };
      expect(await send(a, base.payload)).toEqual(rejected);
      expect(await statusOf(id)).toBe("closed");
      expect(await auditOf(a.organizationId)).toEqual([]);
      expect(await eventsOf(a.organizationId)).toEqual([
        {
          external_ref: "evt-escalada-0001",
          status: "failed",
          error_code: "conversation_closed",
        },
      ]);
      // Un failed es terminal: un admin la reabre, y el reenvío no la deriva.
      await getDb().execute(
        sql`update conversations set status = 'open' where id = ${id}`,
      );
      expect(await send(a, base.payload)).toEqual(rejected);
      expect(await statusOf(id)).toBe("open");
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-06: una referencia inexistente es conversation_not_found, terminal aunque la conversación aparezca después",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const rejected = {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "conversation_not_found",
        recorded: true,
      };
      expect(await send(a, base.payload)).toEqual(rejected);
      expect(await eventsOf(a.organizationId)).toEqual([
        {
          external_ref: "evt-escalada-0001",
          status: "failed",
          error_code: "conversation_not_found",
        },
      ]);
      const id = await insertConversation(a.organizationId, "open");
      expect(await send(a, base.payload)).toEqual(rejected);
      expect(await statusOf(id)).toBe("open");
    },
    TEST_TIMEOUT,
  );
});

describe("conversation.escalated: reenvíos", () => {
  it(
    "FR-API-06: el mismo evento responde duplicate con el estado actual, sin otra auditoría",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const id = await insertConversation(a.organizationId, "open");
      const first = await send(a, base.payload);
      expect(await send(a, base.payload)).toEqual({
        ...first,
        result: "duplicate",
      });
      expect(await auditOf(a.organizationId)).toHaveLength(1);

      // El reenvío informa el estado de ahora, no el de entonces, y no vuelve a derivar.
      await getDb().execute(
        sql`update conversations set status = 'closed' where id = ${id}`,
      );
      expect(await send(a, base.payload)).toMatchObject({
        result: "duplicate",
        conversation: { externalRef: REF, status: "closed" },
      });
      expect(await auditOf(a.organizationId)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-06: el mismo event_id con otro contenido es CONFLICT y no escribe",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await insertConversation(a.organizationId, "open");
      const other = await insertConversation(
        a.organizationId,
        "open",
        "conv-otra",
      );
      await send(a, base.payload);
      const changed = event((p) => (p.conversation.external_ref = "conv-otra"));
      expect(await send(a, changed)).toEqual({
        ok: false,
        code: "CONFLICT",
        recorded: false,
      });
      expect(await statusOf(other)).toBe("open");
      expect(await auditOf(a.organizationId)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});

// Una conexión aparte bloquea la conversación y retiene su transacción: las dos derivaciones
// esperan, y eso se comprueba en pg_stat_activity antes de soltarla (convención de la 4.3.2).
async function holdConversationLock(conversationId: string) {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select id from conversations where id = ${conversationId} for update`,
    );
    taken();
    await released;
  });
  await lockTaken;
  return async () => {
    release();
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

describe("conversation.escalated: concurrencia", () => {
  it(
    "FR-API-06 y FR-AUD-03: dos derivaciones simultáneas de la misma conversación dejan una sola fila de auditoría",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const id = await insertConversation(a.organizationId, "open");
      const release = await holdConversationLock(id);
      const pending = ["evt-escalada-1", "evt-escalada-2"].map((eventId) =>
        send(
          a,
          event((p) => (p.event_id = eventId)),
        ),
      );
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all(pending);

      for (const result of results) {
        expect(result).toMatchObject({
          ok: true,
          result: "accepted",
          conversation: { status: "pending" },
        });
      }
      expect(await statusOf(id)).toBe("pending");
      expect(await auditOf(a.organizationId)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});

describe("conversation.escalated: aislamiento y cadena", () => {
  it(
    "FR-API-06: la conversación de otra organización con la misma referencia no se toca",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const b = await organizationWithCredential("Negocio B", "emisor-b");
      const foreign = await insertConversation(b.organizationId, "open");
      expect(await send(a, base.payload)).toMatchObject({
        code: "BUSINESS_RULE_VIOLATION",
        rule: "conversation_not_found",
      });
      expect(await statusOf(foreign)).toBe("open");
      expect(await auditOf(b.organizationId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05 y FR-API-06: una conversación derivada sigue vigente y recibe el mensaje siguiente del cliente",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const phone = "+5491155550001";
      await getDb().execute(
        sql`insert into clients (organization_id, display_name, phone_e164)
            values (${a.organizationId}, ${"María"}, ${phone})`,
      );
      const inbound = fixture("valid-conversation-resolved.json").payload;
      expect(await send(a, inbound)).toMatchObject({
        conversation: { externalRef: REF, status: "open" },
      });
      expect(await send(a, base.payload)).toMatchObject({
        conversation: { externalRef: REF, status: "pending" },
      });
      const next = structuredClone(inbound);
      next.event_id = "evt-conv-siguiente";
      next.conversation.external_ref = "conv-propuesta-siguiente";
      next.message.external_ref = "msg-conv-siguiente";
      expect(await send(a, next)).toMatchObject({
        conversation: { externalRef: REF, status: "pending" },
      });
      const count = await getDb().execute<{ conversations: number }>(
        sql`select count(*)::int as conversations from conversations
            where organization_id = ${a.organizationId}`,
      );
      expect(count.rows[0]!.conversations).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-AUD-03: sin credencial en el contexto no hay actor, así que conversation.escalated no escribe nada",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const id = await insertConversation(a.organizationId, "open");
      await expect(
        send(
          { organizationId: a.organizationId, source: a.source },
          base.payload,
        ),
      ).rejects.toThrow("conversation.escalated sin credencial");
      expect(await statusOf(id)).toBe("open");
      expect(await eventsOf(a.organizationId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
