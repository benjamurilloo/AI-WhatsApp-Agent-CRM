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

// conversation.resolved contra PostgreSQL real (brief-12.2.1): la conversación vigente del
// cliente o una nueva que nace con el mensaje, la ventana de 24 horas con sus bordes, reenvíos,
// rechazos registrados, concurrencia con el cliente bloqueado y aislamiento. Los eventos salen de
// los fixtures del contrato, con forma asumida.

const FIXTURES = path.join(process.cwd(), "tests/fixtures/ingestion/v1");
const TEST_TIMEOUT = 20000;
const HOUR_MS = 60 * 60 * 1000;

type ConversationPayload = {
  event_id: string;
  conversation: { external_ref: string; client_phone: string };
  message: { external_ref: string; sent_at: string; body_text: string | null };
} & Record<string, unknown>;

function fixture(name: string) {
  const data = JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));
  if (data.shape !== "assumed") throw new Error(`${name} sin forma asumida`);
  return { payload: data.payload, receivedAt: new Date(data.received_at) };
}

const base = fixture("valid-conversation-resolved.json");
const RECEIVED_AT = base.receivedAt;
const PHONE: string = base.payload.conversation.client_phone;
// 2026-09-16T14:59:57.250Z, el sent_at del vector.
const SENT_AT = new Date(base.payload.message.sent_at);
const PROPOSED: string = base.payload.conversation.external_ref;

function event(change: (payload: ConversationPayload) => void = () => {}) {
  const payload: ConversationPayload = structuredClone(base.payload);
  change(payload);
  return payload;
}

// El n-ésimo mensaje de otro evento, con su propia referencia propuesta.
function another(n: number, sentAt = SENT_AT) {
  return event((p) => {
    p.event_id = `evt-conv-${n}`;
    p.conversation.external_ref = `conv-propuesta-${n}`;
    p.message.external_ref = `msg-conv-${n}`;
    p.message.sent_at = sentAt.toISOString();
  });
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

async function insertClient(organizationId: string, isActive = true) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164, is_active)
        values (${organizationId}, ${"María"}, ${PHONE}, ${isActive}) returning id`,
  );
  return result.rows[0]!.id;
}

// Conversación previa, con un mensaje en last_message_at: fixture sintético por SQL.
async function insertConversation(
  organizationId: string,
  clientId: string,
  values: {
    externalRef: string | null;
    lastMessageAt: Date;
    status?: "open" | "pending" | "closed";
  },
) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, client_id, channel, external_ref, status, started_at, last_message_at)
        values (${organizationId}, ${clientId}, 'whatsapp', ${values.externalRef},
          ${values.status ?? "open"}, ${values.lastMessageAt}, ${values.lastMessageAt})
        returning id`,
  );
  const id = result.rows[0]!.id;
  await getDb().execute(
    sql`insert into messages
          (organization_id, conversation_id, direction, external_ref, sent_at, body_text)
        values (${organizationId}, ${id}, 'inbound', ${`previo-${randomUUID()}`},
          ${values.lastMessageAt}, ${"Mensaje previo"})`,
  );
  return id;
}

async function conversationsOf(organizationId: string) {
  const result = await getDb().execute<{
    id: string;
    client_id: string | null;
    external_ref: string | null;
    status: string;
    started_at: string;
    last_message_at: string | null;
  }>(
    sql`select id, client_id, external_ref, status,
          to_char(started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started_at,
          to_char(last_message_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            as last_message_at
        from conversations where organization_id = ${organizationId}
        order by last_message_at, id`,
  );
  return result.rows;
}

async function messagesOf(conversationId: string) {
  const result = await getDb().execute<{
    external_ref: string;
    direction: string;
    body_text: string | null;
  }>(
    sql`select external_ref, direction, body_text from messages
        where conversation_id = ${conversationId} order by sent_at, id`,
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

async function auditOf(organizationId: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`select id from audit_logs where organization_id = ${organizationId}`,
  );
  return result.rows;
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("conversation.resolved: sin conversación vigente", () => {
  it(
    "FR-API-05: crea la conversación con la referencia propuesta, que nace con el mensaje",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      const result = await send(a, base.payload);

      expect(result).toEqual({
        ok: true,
        result: "accepted",
        eventId: "evt-conv-0001",
        conversation: { externalRef: PROPOSED, status: "open" },
      });
      const [conversation, ...rest] = await conversationsOf(a.organizationId);
      expect(rest).toEqual([]);
      expect(conversation).toMatchObject({
        client_id: clientId,
        external_ref: PROPOSED,
        status: "open",
        started_at: "2026-09-16T14:59:57.250Z",
        last_message_at: "2026-09-16T14:59:57.250Z",
      });
      expect(await messagesOf(conversation!.id)).toEqual([
        {
          external_ref: "msg-conv-0001",
          direction: "inbound",
          body_text: "Hola, ¿tienen stock?",
        },
      ]);
      expect(await eventsOf(a.organizationId)).toEqual([
        {
          external_ref: "evt-conv-0001",
          status: "processed",
          error_code: null,
        },
      ]);
      // Registrar un mensaje no cambia ningún estado: no se audita nada.
      expect(await auditOf(a.organizationId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: un cliente inactivo recibe su conversación como cualquier otro",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await insertClient(a.organizationId, false);
      expect(await send(a, base.payload)).toMatchObject({
        ok: true,
        conversation: { externalRef: PROPOSED },
      });
    },
    TEST_TIMEOUT,
  );
});

describe("conversation.resolved: la ventana de vigencia (D-3)", () => {
  it(
    "FR-API-05: con una vigente, el mensaje entra en ella y la referencia propuesta se ignora",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      const current = await insertConversation(a.organizationId, clientId, {
        externalRef: "conv-vigente",
        lastMessageAt: new Date(SENT_AT.getTime() - HOUR_MS),
      });
      const result = await send(a, base.payload);

      expect(result).toMatchObject({
        ok: true,
        result: "accepted",
        conversation: { externalRef: "conv-vigente", status: "open" },
      });
      const conversations = await conversationsOf(a.organizationId);
      expect(conversations).toHaveLength(1);
      expect(conversations[0]).toMatchObject({
        id: current,
        started_at: "2026-09-16T13:59:57.250Z",
        last_message_at: "2026-09-16T14:59:57.250Z",
      });
      expect(await messagesOf(current)).toHaveLength(2);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: exactamente 24 horas es vigente, y 24 horas y 1 milisegundo ya no",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      await insertConversation(a.organizationId, clientId, {
        externalRef: "conv-borde",
        lastMessageAt: new Date(SENT_AT.getTime() - 24 * HOUR_MS),
      });
      expect(await send(a, base.payload)).toMatchObject({
        conversation: { externalRef: "conv-borde" },
      });

      const b = await organizationWithCredential("Negocio B", "emisor-b");
      const other = await insertClient(b.organizationId);
      await insertConversation(b.organizationId, other, {
        externalRef: "conv-vencida",
        lastMessageAt: new Date(SENT_AT.getTime() - 24 * HOUR_MS - 1),
      });
      expect(await send(b, base.payload)).toMatchObject({
        conversation: { externalRef: PROPOSED, status: "open" },
      });
      // La vencida no se toca: no se cierra sola.
      expect(
        (await conversationsOf(b.organizationId)).map((c) => [
          c.external_ref,
          c.status,
        ]),
      ).toEqual([
        ["conv-vencida", "open"],
        [PROPOSED, "open"],
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: una pending dentro de la ventana es vigente y sigue pending",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      await insertConversation(a.organizationId, clientId, {
        externalRef: "conv-derivada",
        lastMessageAt: new Date(SENT_AT.getTime() - HOUR_MS),
        status: "pending",
      });
      expect(await send(a, base.payload)).toMatchObject({
        conversation: { externalRef: "conv-derivada", status: "pending" },
      });
      expect(await conversationsOf(a.organizationId)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: una closed dentro de la ventana no es vigente ni se reabre",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      const closed = await insertConversation(a.organizationId, clientId, {
        externalRef: "conv-cerrada",
        lastMessageAt: new Date(SENT_AT.getTime() - 60 * 1000),
        status: "closed",
      });
      expect(await send(a, base.payload)).toMatchObject({
        conversation: { externalRef: PROPOSED, status: "open" },
      });
      expect(await messagesOf(closed)).toHaveLength(1);
      expect(
        (await conversationsOf(a.organizationId)).find((c) => c.id === closed)
          ?.status,
      ).toBe("closed");
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: entre dos candidatas gana la de último mensaje más reciente, y sin external_ref no es candidata",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      await insertConversation(a.organizationId, clientId, {
        externalRef: "conv-anterior",
        lastMessageAt: new Date(SENT_AT.getTime() - 3 * HOUR_MS),
      });
      await insertConversation(a.organizationId, clientId, {
        externalRef: "conv-reciente",
        lastMessageAt: new Date(SENT_AT.getTime() - 2 * HOUR_MS),
      });
      // Más reciente todavía, pero sin referencia: el emisor no podría seguir usándola.
      await insertConversation(a.organizationId, clientId, {
        externalRef: null,
        lastMessageAt: new Date(SENT_AT.getTime() - HOUR_MS),
      });
      expect(await send(a, base.payload)).toMatchObject({
        conversation: { externalRef: "conv-reciente" },
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: un mensaje que llega desordenado entra en la vigente y adelanta su inicio",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      await insertConversation(a.organizationId, clientId, {
        externalRef: "conv-vigente",
        lastMessageAt: SENT_AT,
      });
      const earlier = new Date(SENT_AT.getTime() - 10 * 60 * 1000);
      expect(await send(a, another(2, earlier))).toMatchObject({
        conversation: { externalRef: "conv-vigente" },
      });
      expect(await conversationsOf(a.organizationId)).toEqual([
        expect.objectContaining({
          external_ref: "conv-vigente",
          started_at: "2026-09-16T14:49:57.250Z",
          last_message_at: "2026-09-16T14:59:57.250Z",
        }),
      ]);
    },
    TEST_TIMEOUT,
  );
});

describe("conversation.resolved: reenvíos y rechazos", () => {
  it(
    "FR-API-05: el mismo evento responde duplicate con la misma conversación, sin otro mensaje",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      const current = await insertConversation(a.organizationId, clientId, {
        externalRef: "conv-vigente",
        lastMessageAt: new Date(SENT_AT.getTime() - HOUR_MS),
      });
      const first = await send(a, base.payload);
      const second = await send(a, base.payload);
      expect(second).toEqual({ ...first, result: "duplicate" });
      expect(second).toMatchObject({
        conversation: { externalRef: "conv-vigente" },
      });
      expect(await messagesOf(current)).toHaveLength(2);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: un reenvío cuyo mensaje ya no se encuentra por el teléfono responde conversation null y no escribe",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await insertClient(a.organizationId);
      await send(a, base.payload);
      await getDb().execute(
        sql`update clients set phone_e164 = null where organization_id = ${a.organizationId}`,
      );
      expect(await send(a, base.payload)).toEqual({
        ok: true,
        result: "duplicate",
        eventId: "evt-conv-0001",
        conversation: null,
      });
      expect(await conversationsOf(a.organizationId)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: el mismo event_id con otro contenido es CONFLICT y no escribe",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await insertClient(a.organizationId);
      await send(a, base.payload);
      const changed = event((p) => (p.message.body_text = "Otro texto"));
      expect(await send(a, changed)).toEqual({
        ok: false,
        code: "CONFLICT",
        recorded: false,
      });
      const [conversation] = await conversationsOf(a.organizationId);
      expect(await messagesOf(conversation!.id)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: un teléfono sin cliente es client_not_found, queda failed y el reenvío responde lo mismo",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const rejected = {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "client_not_found",
        recorded: true,
      };
      expect(await send(a, base.payload)).toEqual(rejected);
      expect(await conversationsOf(a.organizationId)).toEqual([]);
      expect(await eventsOf(a.organizationId)).toEqual([
        {
          external_ref: "evt-conv-0001",
          status: "failed",
          error_code: "BUSINESS_RULE_VIOLATION",
        },
      ]);
      // Un failed es terminal: aunque el cliente exista ahora, el reenvío no crea nada.
      await insertClient(a.organizationId);
      expect(await send(a, base.payload)).toEqual(rejected);
      expect(await conversationsOf(a.organizationId)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: una referencia propuesta que ya es de otra conversación es CONFLICT, queda failed y no escribe",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      const expired = await insertConversation(a.organizationId, clientId, {
        externalRef: PROPOSED,
        lastMessageAt: new Date(SENT_AT.getTime() - 48 * HOUR_MS),
      });
      expect(await send(a, base.payload)).toEqual({
        ok: false,
        code: "CONFLICT",
        recorded: true,
      });
      expect(await conversationsOf(a.organizationId)).toHaveLength(1);
      expect(await messagesOf(expired)).toHaveLength(1);
      expect(await eventsOf(a.organizationId)).toEqual([
        {
          external_ref: "evt-conv-0001",
          status: "failed",
          error_code: "CONFLICT",
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: un mensaje que ya está en la vigente, llegado con otro event_id, es CONFLICT",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await insertClient(a.organizationId);
      await send(a, base.payload);
      const again = event((p) => (p.event_id = "evt-conv-otro"));
      expect(await send(a, again)).toEqual({
        ok: false,
        code: "CONFLICT",
        recorded: true,
      });
      const [conversation] = await conversationsOf(a.organizationId);
      expect(await messagesOf(conversation!.id)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});

// Una conexión aparte bloquea al cliente y retiene su transacción: las dos resoluciones esperan en
// ese bloqueo, y eso se comprueba en pg_stat_activity antes de soltarlo (convención de la 4.3.2).
async function holdClientLock(clientId: string) {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select id from clients where id = ${clientId} for update`,
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

describe("conversation.resolved: concurrencia (D-8)", () => {
  it(
    "FR-API-05: dos mensajes simultáneos del mismo cliente sin vigente dejan una conversación con los dos",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      const release = await holdClientLock(clientId);
      const pending = [2, 3].map((n) => send(a, another(n)));
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all(pending);

      const conversations = await conversationsOf(a.organizationId);
      expect(conversations).toHaveLength(1);
      const [only] = conversations;
      for (const result of results) {
        expect(result).toMatchObject({
          ok: true,
          result: "accepted",
          conversation: { externalRef: only!.external_ref },
        });
      }
      expect(
        (await messagesOf(only!.id)).map((m) => m.external_ref).sort(),
      ).toEqual(["msg-conv-2", "msg-conv-3"]);
    },
    TEST_TIMEOUT,
  );
});

describe("conversation.resolved: aislamiento", () => {
  it(
    "FR-API-05: la vigente de otra organización con un cliente del mismo teléfono no se usa ni se toca",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const b = await organizationWithCredential("Negocio B", "emisor-b");
      const own = await insertClient(a.organizationId);
      const foreignClient = await insertClient(b.organizationId);
      const foreign = await insertConversation(
        b.organizationId,
        foreignClient,
        {
          externalRef: "conv-de-b",
          lastMessageAt: new Date(SENT_AT.getTime() - HOUR_MS),
        },
      );
      expect(await send(a, base.payload)).toMatchObject({
        conversation: { externalRef: PROPOSED },
      });
      expect(await conversationsOf(a.organizationId)).toEqual([
        expect.objectContaining({ client_id: own, external_ref: PROPOSED }),
      ]);
      expect(await messagesOf(foreign)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});
