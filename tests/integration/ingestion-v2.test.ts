import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  recordIngestionEvent,
  recordIngestionEventV2,
  type IngestionContext,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Contrato de ingestión v2 contra PostgreSQL real (brief-12.3.1): la migración 0023, el tipo y el
// autor guardados por la proyección, v1 sin cambios, el CONFLICT con motivo (D-7), lo que la guía
// del emisor afirma y el aislamiento. Los eventos salen de los fixtures, con forma asumida.

const TEST_TIMEOUT = 20000;
const HOUR_MS = 60 * 60 * 1000;

type Payload = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fixture(version: "v1" | "v2", name: string) {
  const file = path.join(
    process.cwd(),
    "tests/fixtures/ingestion",
    version,
    `${name}.json`,
  );
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (data.shape !== "assumed") throw new Error(`${name} sin forma asumida`);
  return data.payload as Payload;
}

const RECEIVED_AT = new Date("2026-09-16T15:00:00.000Z");
const PHONE = "+5491155550001";
const PROPOSED = "conv-propuesta-0001";

const clientEvent = () => fixture("v2", "valid-client-resolved");
const conversationEvent = () =>
  fixture("v2", "valid-conversation-resolved-audio");
const agentReply = () => fixture("v2", "valid-message-recorded-agent");
const escalation = () => fixture("v2", "valid-conversation-escalated");

function sendV2(context: IngestionContext, payload: unknown) {
  return recordIngestionEventV2(context, JSON.stringify(payload), RECEIVED_AT);
}

function sendV1(context: IngestionContext, payload: unknown) {
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

async function insertClient(organizationId: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${organizationId}, ${"María"}, ${PHONE}) returning id`,
  );
  return result.rows[0]!.id;
}

// Conversación previa con un mensaje en last_message_at: fixture sintético por SQL.
async function insertConversation(
  organizationId: string,
  clientId: string,
  values: {
    externalRef: string;
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

async function messagesOf(organizationId: string) {
  const result = await getDb().execute<{
    conversation_ref: string;
    external_ref: string;
    direction: string;
    kind: string | null;
    sent_by: string | null;
  }>(
    sql`select c.external_ref as conversation_ref, m.external_ref, m.direction, m.kind, m.sent_by
        from messages m join conversations c on c.id = m.conversation_id
        where m.organization_id = ${organizationId} and m.external_ref not like 'previo-%'
        order by m.sent_at, m.id`,
  );
  return result.rows;
}

async function conversationsOf(organizationId: string) {
  const result = await getDb().execute<{
    external_ref: string;
    status: string;
  }>(
    sql`select external_ref, status from conversations
        where organization_id = ${organizationId} order by started_at, id`,
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
        where organization_id = ${organizationId} order by received_at, external_ref`,
  );
  return result.rows;
}

async function pgError(
  query: Promise<unknown>,
): Promise<{ code: string; constraint: string }> {
  try {
    await query;
  } catch (error) {
    const e = error as {
      code?: string;
      constraint?: string;
      cause?: { code?: string; constraint?: string };
    };
    return {
      code: e.cause?.code ?? e.code ?? "sin código",
      constraint: e.cause?.constraint ?? e.constraint ?? "",
    };
  }
  throw new Error("la sentencia no falló");
}

beforeEach(async () => {
  await resetDatabase(getDb());
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("migración 0023 (D-4)", () => {
  it("FR-API-07: el CHECK rechaza una entrada con autor y acepta una salida con o sin él", async () => {
    const a = await organizationWithCredential("Negocio A", "emisor-a");
    const clientId = await insertClient(a.organizationId);
    const conversationId = await insertConversation(
      a.organizationId,
      clientId,
      {
        externalRef: PROPOSED,
        lastMessageAt: new Date("2026-09-16T10:00:00Z"),
      },
    );
    const insert = (direction: string, sentBy: string | null, ref: string) =>
      getDb().execute(
        sql`insert into messages
              (organization_id, conversation_id, direction, external_ref, sent_at, kind, sent_by)
            values (${a.organizationId}, ${conversationId}, ${direction}::message_direction,
              ${ref}, now(), 'text', ${sentBy}::message_sender)`,
      );

    expect(await pgError(insert("inbound", "agent", "m-1"))).toEqual({
      code: "23514",
      constraint: "messages_sent_by_only_outbound",
    });
    await insert("outbound", "person", "m-2");
    await insert("outbound", null, "m-3");
    await insert("inbound", null, "m-4");
  });

  it("FR-API-07: messages sigue siendo de solo inserción, también en las columnas nuevas", async () => {
    const a = await organizationWithCredential("Negocio A", "emisor-a");
    const clientId = await insertClient(a.organizationId);
    await insertConversation(a.organizationId, clientId, {
      externalRef: PROPOSED,
      lastMessageAt: new Date("2026-09-16T10:00:00Z"),
    });
    const update = await pgError(
      getDb().execute(
        sql`update messages set kind = 'audio' where organization_id = ${a.organizationId}`,
      ),
    );
    expect(update.code).toBe("P0001");
  });
});

describe("v1 no cambia (AC-3)", () => {
  it(
    "FR-API-07: un mensaje de v1 queda con kind y sent_by en null",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await insertClient(a.organizationId);
      const outbound = fixture("v1", "valid-outbound-without-phone");
      expect((await sendV1(a, outbound)).ok).toBe(true);
      expect(
        (await sendV1(a, fixture("v1", "valid-conversation-resolved"))).ok,
      ).toBe(true);

      const rows = await messagesOf(a.organizationId);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toMatchObject({ kind: null, sent_by: null });
      }
    },
    TEST_TIMEOUT,
  );
});

describe("proyección de v2 (AC-5)", () => {
  it(
    "FR-API-07: un turno completo guarda el tipo del audio y el autor de la respuesta",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");

      expect(await sendV2(a, clientEvent())).toMatchObject({
        ok: true,
        result: "accepted",
        client: { displayName: "María Gómez" },
      });
      expect(await sendV2(a, conversationEvent())).toEqual({
        ok: true,
        result: "accepted",
        eventId: "evt-v2-conv-0001",
        conversation: { externalRef: PROPOSED, status: "open" },
      });
      expect(await sendV2(a, agentReply())).toEqual({
        ok: true,
        result: "accepted",
        eventId: "evt-v2-msg-0001",
        conversationExternalRef: PROPOSED,
        messageExternalRef: "msg-v2-0002",
      });
      expect(await sendV2(a, escalation())).toEqual({
        ok: true,
        result: "accepted",
        eventId: "evt-v2-escalada-0001",
        conversation: { externalRef: PROPOSED, status: "pending" },
      });

      expect(await messagesOf(a.organizationId)).toEqual([
        {
          conversation_ref: PROPOSED,
          external_ref: "msg-v2-0001",
          direction: "inbound",
          kind: "audio",
          sent_by: null,
        },
        {
          conversation_ref: PROPOSED,
          external_ref: "msg-v2-0002",
          direction: "outbound",
          kind: "text",
          sent_by: "agent",
        },
      ]);
      expect(
        (await eventsOf(a.organizationId)).map((event) => event.status),
      ).toEqual(["processed", "processed", "processed", "processed"]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-07: una entrada sin teléfono guarda su tipo y ningún autor, y una persona queda como person",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await sendV2(
        a,
        fixture("v2", "valid-message-recorded-inbound-without-phone"),
      );
      await sendV2(a, fixture("v2", "valid-message-recorded-person-image"));

      // Los dos tienen el mismo sent_at: se ordenan por tipo.
      expect(
        (await messagesOf(a.organizationId))
          .map(({ kind, sent_by }) => [kind, sent_by])
          .sort(),
      ).toEqual([
        ["document", null],
        ["image", "person"],
      ]);
    },
    TEST_TIMEOUT,
  );

  // Los bordes de la vigencia de la 12.2 (D-3), por v2: la regla no depende de la versión.
  it.each([
    ["24 horas exactas: vigente", 24 * HOUR_MS, 1],
    ["24 horas y 1 ms: no vigente", 24 * HOUR_MS + 1, 2],
  ])(
    "FR-API-05: %s",
    async (_, gap, expected) => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      const sentAt = new Date(conversationEvent().message.sent_at);
      await insertConversation(a.organizationId, clientId, {
        externalRef: "conv-previa",
        lastMessageAt: new Date(sentAt.getTime() - gap),
      });
      expect((await sendV2(a, conversationEvent())).ok).toBe(true);
      expect(await conversationsOf(a.organizationId)).toHaveLength(expected);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-05: una closed dentro de la ventana no es vigente por v2",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      await insertConversation(a.organizationId, clientId, {
        externalRef: "conv-cerrada",
        lastMessageAt: new Date("2026-09-16T14:58:00Z"),
        status: "closed",
      });
      expect(await sendV2(a, conversationEvent())).toMatchObject({
        ok: true,
        conversation: { externalRef: PROPOSED, status: "open" },
      });
    },
    TEST_TIMEOUT,
  );
});

describe("CONFLICT con motivo (D-7)", () => {
  it(
    "FR-API-07: el mismo mensaje con otro event_id es message_already_recorded, guardado y repetido al reenviar",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await sendV2(a, agentReply());
      const again = agentReply();
      again.event_id = "evt-v2-msg-otra";

      const expected = {
        ok: false,
        code: "CONFLICT",
        recorded: true,
        reason: "message_already_recorded",
      };
      expect(await sendV2(a, again)).toEqual(expected);
      expect(await sendV2(a, again)).toEqual(expected);
      expect(await eventsOf(a.organizationId)).toEqual([
        {
          external_ref: "evt-v2-msg-0001",
          status: "processed",
          error_code: null,
        },
        {
          external_ref: "evt-v2-msg-otra",
          status: "failed",
          error_code: "message_already_recorded",
        },
      ]);
      expect(await messagesOf(a.organizationId)).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-07: conversation.resolved con el mensaje ya en la vigente es message_already_recorded",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await insertClient(a.organizationId);
      await sendV2(a, conversationEvent());
      const again = conversationEvent();
      again.event_id = "evt-v2-conv-otra";
      again.conversation.external_ref = "conv-propuesta-otra";

      expect(await sendV2(a, again)).toEqual({
        ok: false,
        code: "CONFLICT",
        recorded: true,
        reason: "message_already_recorded",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-07: una referencia propuesta que ya es de otra conversación es conversation_ref_taken, guardado y repetido",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const clientId = await insertClient(a.organizationId);
      await insertConversation(a.organizationId, clientId, {
        externalRef: PROPOSED,
        lastMessageAt: new Date("2026-09-16T14:58:00Z"),
        status: "closed",
      });

      const expected = {
        ok: false,
        code: "CONFLICT",
        recorded: true,
        reason: "conversation_ref_taken",
      };
      expect(await sendV2(a, conversationEvent())).toEqual(expected);
      expect(await sendV2(a, conversationEvent())).toEqual(expected);
      expect(await eventsOf(a.organizationId)).toEqual([
        {
          external_ref: "evt-v2-conv-0001",
          status: "failed",
          error_code: "conversation_ref_taken",
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-07: el mismo event_id con otro contenido es event_payload_mismatch, sin tocar el registro",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await sendV2(a, agentReply());
      const changed = agentReply();
      changed.message.body_text = "Otro texto";

      expect(await sendV2(a, changed)).toEqual({
        ok: false,
        code: "CONFLICT",
        recorded: false,
        reason: "event_payload_mismatch",
      });
      expect(await eventsOf(a.organizationId)).toEqual([
        {
          external_ref: "evt-v2-msg-0001",
          status: "processed",
          error_code: null,
        },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-07: el mismo event_id por v1 y por v2 es event_payload_mismatch (D-1)",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const v1 = fixture("v1", "valid-outbound-without-phone");
      await sendV1(a, v1);
      const v2 = agentReply();
      v2.event_id = v1.event_id;

      expect(await sendV2(a, v2)).toMatchObject({
        code: "CONFLICT",
        recorded: false,
        reason: "event_payload_mismatch",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-07: v1 sigue guardando CONFLICT y no responde motivo",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const first = fixture("v1", "valid-outbound-without-phone");
      await sendV1(a, first);
      const again = structuredClone(first);
      again.event_id = "evt-v1-otra";

      expect(await sendV1(a, again)).toEqual({
        ok: false,
        code: "CONFLICT",
        recorded: true,
      });
      expect(
        (await eventsOf(a.organizationId)).find(
          (event) => event.external_ref === "evt-v1-otra",
        ),
      ).toMatchObject({ status: "failed", error_code: "CONFLICT" });
    },
    TEST_TIMEOUT,
  );
});

describe("lo que afirma la guía del emisor (AC-7)", () => {
  it(
    "FR-API-07: un reenvío idéntico después de confirmar responde duplicate con los mismos datos, sin otro mensaje",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      await insertClient(a.organizationId);
      const conversation = await sendV2(a, conversationEvent());
      const reply = await sendV2(a, agentReply());

      expect(await sendV2(a, conversationEvent())).toEqual({
        ...conversation,
        result: "duplicate",
      });
      expect(await sendV2(a, agentReply())).toEqual({
        ...reply,
        result: "duplicate",
      });
      expect(await messagesOf(a.organizationId)).toHaveLength(2);
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-07: un error inesperado revierte la reserva, y el reenvío del mismo evento se procesa",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      // Sin credencial en el contexto, client.resolved lanza antes de escribir: un 500.
      const withoutCredential = {
        organizationId: a.organizationId,
        source: a.source,
      };
      await expect(sendV2(withoutCredential, clientEvent())).rejects.toThrow();
      expect(await eventsOf(a.organizationId)).toEqual([]);

      expect(await sendV2(a, clientEvent())).toMatchObject({
        ok: true,
        result: "accepted",
      });
    },
    TEST_TIMEOUT,
  );

  it(
    "FR-API-07: un 422 es terminal: el reenvío responde la misma regla aunque ya se cumpla",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const rejected = {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "conversation_not_found",
        recorded: true,
      };
      expect(await sendV2(a, escalation())).toEqual(rejected);
      await insertClient(a.organizationId);
      await sendV2(a, conversationEvent());
      expect(await sendV2(a, escalation())).toEqual(rejected);
    },
    TEST_TIMEOUT,
  );
});

describe("aislamiento entre organizaciones (AC-9)", () => {
  it(
    "FR-API-07: cada tipo que escribe por v2 toca solo la organización de la credencial",
    async () => {
      const a = await organizationWithCredential("Negocio A", "emisor-a");
      const b = await organizationWithCredential("Negocio B", "emisor-b");
      const clientB = await insertClient(b.organizationId);
      await insertConversation(b.organizationId, clientB, {
        externalRef: PROPOSED,
        lastMessageAt: new Date("2026-09-16T14:58:00Z"),
      });

      await sendV2(a, clientEvent());
      expect(await sendV2(a, conversationEvent())).toMatchObject({
        ok: true,
        conversation: { externalRef: PROPOSED, status: "open" },
      });
      await sendV2(a, agentReply());
      await sendV2(a, escalation());

      expect(await conversationsOf(b.organizationId)).toEqual([
        { external_ref: PROPOSED, status: "open" },
      ]);
      expect(await messagesOf(b.organizationId)).toEqual([]);
      expect(await messagesOf(a.organizationId)).toHaveLength(2);
      const audits = await getDb().execute<{ n: number }>(
        sql`select count(*)::int as n from audit_logs where organization_id = ${b.organizationId}`,
      );
      expect(audits.rows[0]!.n).toBe(0);
    },
    TEST_TIMEOUT,
  );
});
