import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/shared/db";
import {
  collectTurnReport,
  type ExpectedMessage,
} from "../../scripts/conciliar-turnos";
import { resetDatabase } from "./reset-database";

// La conciliación de una corrida de turnos, contra PostgreSQL real (brief-12.5, D-7 y AC-3).
// Los datos imitan lo que deja un turno: los eventos del emisor y los mensajes que proyectaron.

const SOURCE = "agente-prueba";
const PHONE = "+5491155550099";
const NAME = "Cliente Kumquat";
const BODY = "Texto que nunca sale en el reporte";
const FROM = new Date("2026-09-27T18:00:00.000Z");
const TO = new Date("2026-09-27T19:00:00.000Z");
const INSIDE = "2026-09-27T18:20:00.000Z";
const OUTSIDE = "2026-09-27T17:00:00.000Z";

let organizationId: string;
let clientId: string;

async function insertConversation(externalRef: string): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, client_id, channel, external_ref, status, started_at, last_message_at)
        values (${organizationId}, ${clientId}, 'whatsapp', ${externalRef}, 'open',
                ${INSIDE}, ${INSIDE})
        returning id`,
  );
  return result.rows[0]!.id;
}

async function insertMessage(
  conversationId: string,
  externalRef: string,
  direction: "inbound" | "outbound",
  createdAt = INSIDE,
) {
  await getDb().execute(
    sql`insert into messages
          (organization_id, conversation_id, direction, external_ref, sent_at, body_text, created_at)
        values (${organizationId}, ${conversationId}, ${direction}, ${externalRef}, ${INSIDE},
                ${BODY}, ${createdAt})`,
  );
}

async function insertEvent(
  externalRef: string,
  eventType: string,
  status: "processed" | "failed" = "processed",
  source = SOURCE,
  receivedAt = INSIDE,
) {
  await getDb().execute(
    sql`insert into ingestion_events
          (organization_id, source, external_ref, event_type, payload_hash, status, error_code,
           received_at, processed_at)
        values (${organizationId}, ${source}, ${externalRef}, ${eventType}, 'hash', ${status},
                ${status === "failed" ? "conversation_ref_taken" : null}, ${receivedAt},
                ${receivedAt})`,
  );
}

// Un turno: cliente, mensaje entrante, dos segmentos de respuesta y la derivación.
async function insertTurn() {
  const conversationId = await insertConversation("conv-1");
  await insertMessage(conversationId, "msg-in-1", "inbound");
  await insertMessage(conversationId, "msg-out-1", "outbound");
  await insertMessage(conversationId, "msg-out-2", "outbound");
  await insertEvent("evt-cli-1", "client.resolved");
  await insertEvent("evt-conv-1", "conversation.resolved");
  await insertEvent("evt-out-1", "message.recorded");
  await insertEvent("evt-out-2", "message.recorded");
  await insertEvent("evt-esc-1", "conversation.escalated");
  return conversationId;
}

const TURN: ExpectedMessage[] = [
  { message_ref: "msg-in-1", direction: "inbound", conversation_ref: "conv-1" },
  {
    message_ref: "msg-out-1",
    direction: "outbound",
    conversation_ref: "conv-1",
  },
  {
    message_ref: "msg-out-2",
    direction: "outbound",
    conversation_ref: "conv-1",
  },
];

function report(expected?: ExpectedMessage[]) {
  return collectTurnReport(getDb(), {
    organizationId,
    source: SOURCE,
    from: FROM,
    to: TO,
    expected,
  });
}

beforeEach(async () => {
  await resetDatabase(getDb());
  const org = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values ('Negocio Turnos') returning id`,
  );
  organizationId = org.rows[0]!.id;
  const client = await getDb().execute<{ id: string }>(
    sql`insert into clients (organization_id, display_name, phone_e164)
        values (${organizationId}, ${NAME}, ${PHONE}) returning id`,
  );
  clientId = client.rows[0]!.id;
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("conciliar-turnos (brief-12.5, D-7)", () => {
  it("FR-API-07: un turno completo concilia, con los eventos por tipo y la métrica 12 a mano", async () => {
    await insertTurn();
    const result = await report(TURN);

    expect(result.reconciliation).toEqual({
      expected: 3,
      found: 3,
      missing: [],
      duplicated: [],
      wrong_conversation: [],
      wrong_direction: [],
      unexpected: [],
      repeated_expected: [],
      ok: true,
    });
    expect(result.events).toEqual([
      {
        event_type: "client.resolved",
        status: "processed",
        error_code: null,
        count: 1,
      },
      {
        event_type: "conversation.escalated",
        status: "processed",
        error_code: null,
        count: 1,
      },
      {
        event_type: "conversation.resolved",
        status: "processed",
        error_code: null,
        count: 1,
      },
      {
        event_type: "message.recorded",
        status: "processed",
        error_code: null,
        count: 2,
      },
    ]);
    // MetricsCatalog §12: sin client.resolved ni conversation.escalated.
    expect(result.metric_12_by_hand).toEqual({ total: 3, failed: 0 });
    expect(result.conversations).toEqual([
      { conversation_ref: "conv-1", status: "open", inbound: 1, outbound: 2 },
    ]);
  });

  it("FR-API-07: detecta un mensaje esperado que falta", async () => {
    await insertTurn();
    const result = await report([
      ...TURN,
      {
        message_ref: "msg-in-2",
        direction: "inbound",
        conversation_ref: "conv-1",
      },
    ]);
    expect(result.reconciliation?.missing).toEqual(["msg-in-2"]);
    expect(result.reconciliation?.ok).toBe(false);
  });

  it("FR-API-07: detecta un mensaje guardado dos veces, en otra conversación o con otra dirección", async () => {
    await insertTurn();
    const other = await insertConversation("conv-2");
    await insertMessage(other, "msg-out-1", "inbound");
    const result = await report(TURN);
    expect(result.reconciliation).toMatchObject({
      duplicated: ["msg-out-1"],
      wrong_conversation: ["msg-out-1"],
      wrong_direction: ["msg-out-1"],
      ok: false,
    });
  });

  it("FR-API-07: una referencia repetida en los esperados no tapa un faltante", async () => {
    await insertTurn();
    const first = TURN[0];
    if (!first) throw new Error("TURN vacío");
    const result = await report([...TURN, first]);
    expect(result.reconciliation).toMatchObject({
      repeated_expected: [first.message_ref],
      missing: [],
      duplicated: [],
      unexpected: [],
      ok: false,
    });
  });

  it("FR-API-07: detecta un mensaje insertado en la ventana que el emisor no esperaba", async () => {
    const conversationId = await insertTurn();
    await insertMessage(conversationId, "msg-extra", "outbound");
    const result = await report(TURN);
    expect(result.reconciliation?.unexpected).toEqual(["msg-extra"]);
    expect(result.reconciliation?.ok).toBe(false);
  });

  it("FR-API-07: deja afuera lo que no es de la ventana ni del source", async () => {
    const conversationId = await insertTurn();
    await insertMessage(conversationId, "msg-viejo", "inbound", OUTSIDE);
    await insertEvent(
      "evt-viejo",
      "message.recorded",
      "processed",
      SOURCE,
      OUTSIDE,
    );
    // Otro emisor de la misma organización: no está en los eventos del source, pero la métrica 12
    // es de la organización, como el dashboard.
    await insertEvent("evt-otro", "message.recorded", "failed", "otro-emisor");
    const result = await report(TURN);
    expect(result.reconciliation?.ok).toBe(true);
    expect(result.events.map((e) => e.count).reduce((a, b) => a + b)).toBe(5);
    expect(result.metric_12_by_hand).toEqual({ total: 4, failed: 1 });
  });

  it("FR-API-07: el reporte no lleva teléfonos, nombres ni textos", async () => {
    await insertTurn();
    const text = JSON.stringify(await report(TURN));
    for (const secret of [PHONE, PHONE.slice(1), NAME, BODY]) {
      expect(text).not.toContain(secret);
    }
  });

  it("FR-API-07: no mezcla organizaciones", async () => {
    await insertTurn();
    const org = await getDb().execute<{ id: string }>(
      sql`insert into organizations (name) values ('Otro Negocio') returning id`,
    );
    const mine = organizationId;
    organizationId = org.rows[0]!.id;
    const foreign = await report(TURN);
    organizationId = mine;
    expect(foreign.events).toEqual([]);
    expect(foreign.reconciliation?.missing).toEqual([
      "msg-in-1",
      "msg-out-1",
      "msg-out-2",
    ]);
  });
});
