import { readFileSync } from "node:fs";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ingestionPayloadHash,
  parseIngestionEventV1,
  recordIngestionEvent,
  type IngestionContext,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Registro idempotente y proyección de la ingestión contra PostgreSQL real (brief-6.5.2). Los
// eventos salen de los fixtures del contrato v1, con forma asumida: no provienen de un emisor real.

const FIXTURES = path.join(process.cwd(), "tests/fixtures/ingestion/v1");
const TEST_TIMEOUT = 20000;

type Payload = {
  event_id: string;
  occurred_at: string;
  conversation: {
    external_ref: string;
    channel: string;
    client_phone: string | null;
  };
  message: {
    external_ref: string;
    direction: string;
    sent_at: string;
    body_text: string | null;
  };
} & Record<string, unknown>;

function fixture(name: string): { payload: Payload; receivedAt: Date } {
  const data = JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));
  if (data.shape !== "assumed") throw new Error(`${name} sin forma asumida`);
  return { payload: data.payload, receivedAt: new Date(data.received_at) };
}

const base = fixture("valid-inbound-with-client.json");
const RECEIVED_AT = base.receivedAt;
const PHONE = base.payload.conversation.client_phone!;

// Evento del fixture base con cambios; cada llamada devuelve una copia nueva.
function event(change: (payload: Payload) => void = () => {}): Payload {
  const payload = structuredClone(base.payload);
  change(payload);
  return payload;
}

function send(context: IngestionContext, payload: unknown) {
  return recordIngestionEvent(context, JSON.stringify(payload), RECEIVED_AT);
}

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
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

type ConversationState = {
  id: string;
  client_id: string | null;
  status: string;
  started_at: string;
  last_message_at: string;
};

async function conversationsOf(organizationId: string) {
  const result = await getDb().execute<ConversationState>(
    sql`select id, client_id, status,
          to_char(started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started_at,
          to_char(last_message_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as last_message_at
        from conversations where organization_id = ${organizationId}
        order by external_ref`,
  );
  return result.rows;
}

async function messagesOf(organizationId: string) {
  const result = await getDb().execute<{
    external_ref: string;
    direction: string;
    body_text: string | null;
  }>(
    sql`select external_ref, direction, body_text from messages
        where organization_id = ${organizationId} order by sent_at, external_ref`,
  );
  return result.rows;
}

async function eventsOf(organizationId: string) {
  const result = await getDb().execute<{
    source: string;
    external_ref: string;
    event_type: string;
    payload_hash: string;
    status: string;
    error_code: string | null;
    processed: boolean;
  }>(
    sql`select source, external_ref, event_type, payload_hash, status, error_code,
          processed_at is not null as processed
        from ingestion_events where organization_id = ${organizationId}
        order by source, external_ref`,
  );
  return result.rows;
}

async function counts() {
  const result = await getDb().execute<{
    conversations: number;
    messages: number;
    events: number;
  }>(
    sql`select (select count(*)::int from conversations) as conversations,
          (select count(*)::int from messages) as messages,
          (select count(*)::int from ingestion_events) as events`,
  );
  return result.rows[0]!;
}

function hashOf(payload: unknown) {
  const parsed = parseIngestionEventV1(JSON.stringify(payload), RECEIVED_AT);
  if (!parsed.ok) throw new Error("payload inválido");
  return ingestionPayloadHash(parsed.event);
}

// Una conexión aparte ejecuta la consulta en su transacción y la mantiene abierta; al soltarla,
// la revierte, para que la fila retenida no exista para quienes esperaban (brief-4.3.2).
const held: (() => Promise<void>)[] = [];
class Rollback extends Error {}

async function holdUncommitted(query: SQL): Promise<() => Promise<void>> {
  let taken!: () => void;
  let release!: () => void;
  const lockTaken = new Promise<void>((resolve) => (taken = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  const holder = getDb()
    .transaction(async (tx) => {
      await tx.execute(query);
      taken();
      await released;
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
  await lockTaken;
  const releaseHold = async () => {
    release();
    await holder;
  };
  held.push(releaseHold);
  return releaseHold;
}

async function waitForLockWaiters(count: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let waiting = -1;
  while (Date.now() < deadline) {
    const result = await getDb().execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    waiting = result.rows[0]!.waiting;
    if (waiting === count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `se esperaban ${count} conexiones en un bloqueo y hay ${waiting}`,
  );
}

// Toda conversación creada por la ingestión: inicio = primer mensaje, último = último (DataModel).
async function expectDateInvariant() {
  const result = await getDb().execute<{ id: string }>(
    sql`select c.id from conversations c
        left join messages m on m.conversation_id = c.id
        group by c.id, c.started_at, c.last_message_at
        having count(m.id) = 0
          or c.started_at <> min(m.sent_at)
          or c.last_message_at <> max(m.sent_at)`,
  );
  expect(result.rows).toEqual([]);
}

let orgA: string;
let orgB: string;
let contextA: IngestionContext;

beforeEach(async () => {
  await resetDatabase(getDb());
  orgA = await createOrganization("Negocio A");
  orgB = await createOrganization("Negocio B");
  contextA = { organizationId: orgA, source: "emisor-de-prueba" };
});

afterEach(async () => {
  await Promise.all(held.splice(0).map((releaseHold) => releaseHold()));
});

afterAll(async () => {
  await getDb().$client.end();
});

describe("proyección de un evento nuevo", () => {
  it("caso 1: crea la conversación abierta con el cliente del teléfono y registra el evento", async () => {
    const clientId = await insertClient(orgA, "Ana Pérez", PHONE);
    await insertClient(orgB, "Otra organización", "+5491155550009");

    expect(await send(contextA, base.payload)).toEqual({
      ok: true,
      result: "accepted",
      eventId: "evt-0001",
      conversationExternalRef: "conv-0001",
      messageExternalRef: "msg-0001",
    });
    expect(await conversationsOf(orgA)).toEqual([
      expect.objectContaining({
        client_id: clientId,
        status: "open",
        started_at: "2026-09-16T14:59:57.250Z",
        last_message_at: "2026-09-16T14:59:57.250Z",
      }),
    ]);
    expect(await messagesOf(orgA)).toEqual([
      {
        external_ref: "msg-0001",
        direction: "inbound",
        body_text: "Hola, ¿tienen stock?",
      },
    ]);
    expect(await eventsOf(orgA)).toEqual([
      {
        source: "emisor-de-prueba",
        external_ref: "evt-0001",
        event_type: "message.recorded",
        payload_hash:
          "529004aa199e81238af332e09262a30ec458f581188b6da0cdfa1ab53746ee2a",
        status: "processed",
        error_code: null,
        processed: true,
      },
    ]);
    await expectDateInvariant();
  });

  it("caso 2: resuelve un cliente inactivo; sin teléfono, de otra organización o desconocido queda sin cliente", async () => {
    const inactive = await insertClient(orgA, "Inactivo", PHONE, false);
    await insertClient(orgB, "Ajeno", "+5491155550002");

    await send(contextA, base.payload);
    const outbound = fixture("valid-outbound-without-phone.json").payload;
    outbound.conversation.external_ref = "conv-sin-telefono";
    await send(contextA, outbound);
    await send(
      contextA,
      event((p) => {
        p.event_id = "evt-ajeno";
        p.conversation.external_ref = "conv-ajeno";
        p.conversation.client_phone = "+5491155550002";
      }),
    );
    await send(
      contextA,
      event((p) => {
        p.event_id = "evt-desconocido";
        p.conversation.external_ref = "conv-desconocido";
        p.conversation.client_phone = "+5491155559999";
      }),
    );

    const clients = (await conversationsOf(orgA)).map((c) => c.client_id);
    // Orden por external_ref: conv-0001, conv-ajeno, conv-desconocido, conv-sin-telefono.
    expect(clients).toEqual([inactive, null, null, null]);
    expect(await counts()).toMatchObject({ conversations: 4, messages: 4 });
  });

  it("caso 3: guarda los fixtures válidos del contrato con el cuerpo tal cual", async () => {
    for (const name of [
      "valid-markup-body.json",
      "valid-null-body.json",
      "valid-outbound-without-phone.json",
    ]) {
      const { payload, receivedAt } = fixture(name);
      const result = await recordIngestionEvent(
        contextA,
        JSON.stringify(payload),
        receivedAt,
      );
      expect(result, name).toMatchObject({ ok: true, result: "accepted" });
    }
    expect((await messagesOf(orgA)).map((m) => m.body_text).sort()).toEqual(
      [
        '<script>alert("x")</script> **negrita** 👋',
        "Sí, hay 3 unidades.",
        null,
      ].sort(),
    );
    expect(await counts()).toMatchObject({ conversations: 1, messages: 3 });
    await expectDateInvariant();
  });
});

describe("mensajes siguientes de una conversación", () => {
  it("caso 4: ajusta el inicio y el último mensaje sin cambiar cliente ni estado", async () => {
    const clientId = await insertClient(orgA, "Ana Pérez", PHONE);
    await insertClient(orgA, "Otro cliente", "+5491155550002");
    await send(contextA, base.payload);
    await getDb().execute(
      sql`update conversations set status = 'closed' where organization_id = ${orgA}`,
    );

    const later = event((p) => {
      p.event_id = "evt-0002";
      p.message.external_ref = "msg-0002";
      p.message.direction = "outbound";
      p.message.sent_at = "2026-09-16T14:59:59.000Z";
      p.conversation.client_phone = "+5491155550002";
    });
    const earlier = event((p) => {
      p.event_id = "evt-0003";
      p.message.external_ref = "msg-0003";
      p.message.sent_at = "2026-09-15T23:00:00.000-03:00";
      p.conversation.client_phone = null;
    });
    expect(await send(contextA, later)).toMatchObject({ result: "accepted" });
    expect(await send(contextA, earlier)).toMatchObject({ result: "accepted" });

    expect(await conversationsOf(orgA)).toEqual([
      expect.objectContaining({
        client_id: clientId,
        status: "closed",
        started_at: "2026-09-16T02:00:00.000Z",
        last_message_at: "2026-09-16T14:59:59.000Z",
      }),
    ]);
    expect((await messagesOf(orgA)).map((m) => m.external_ref)).toEqual([
      "msg-0003",
      "msg-0001",
      "msg-0002",
    ]);
    await expectDateInvariant();
  });

  it("caso 5: el mismo conversation.external_ref en otra organización es otra conversación", async () => {
    const contextB = { organizationId: orgB, source: "emisor-de-prueba" };
    await send(contextA, base.payload);
    expect(await send(contextB, base.payload)).toMatchObject({
      result: "accepted",
    });
    expect(await conversationsOf(orgA)).toHaveLength(1);
    expect(await conversationsOf(orgB)).toHaveLength(1);
    expect(await messagesOf(orgB)).toHaveLength(1);
  });
});

describe("reenvíos", () => {
  it("caso 6: el mismo contenido, aun con otro formato, es duplicate y no escribe nada", async () => {
    await send(contextA, base.payload);
    const before = {
      counts: await counts(),
      conversations: await conversationsOf(orgA),
      events: await eventsOf(orgA),
    };
    const reformatted = fixture("valid-other-offset.json").payload;

    expect(await send(contextA, base.payload)).toMatchObject({
      ok: true,
      result: "duplicate",
      eventId: "evt-0001",
    });
    const pretty = await recordIngestionEvent(
      contextA,
      JSON.stringify(reformatted, null, 2),
      RECEIVED_AT,
    );
    expect(pretty).toMatchObject({ ok: true, result: "duplicate" });
    expect({
      counts: await counts(),
      conversations: await conversationsOf(orgA),
      events: await eventsOf(orgA),
    }).toEqual(before);
  });

  it("caso 7: el mismo event_id con otro contenido da CONFLICT sin modificar nada", async () => {
    await send(contextA, base.payload);
    const before = {
      counts: await counts(),
      messages: await messagesOf(orgA),
      events: await eventsOf(orgA),
    };
    const changed = event((p) => {
      p.message.body_text = "Otro texto";
    });
    expect(await send(contextA, changed)).toEqual({
      ok: false,
      code: "CONFLICT",
      recorded: false,
    });
    expect({
      counts: await counts(),
      messages: await messagesOf(orgA),
      events: await eventsOf(orgA),
    }).toEqual(before);
  });

  it("caso 8: el mismo mensaje con otro event_id queda failed, sin cambios, y su reenvío repite el rechazo", async () => {
    await send(contextA, base.payload);
    const conversationsBefore = await conversationsOf(orgA);
    const again = event((p) => {
      p.event_id = "evt-repetido";
      p.message.sent_at = "2026-09-16T10:00:00.000Z";
    });

    expect(await send(contextA, again)).toEqual({
      ok: false,
      code: "CONFLICT",
      recorded: true,
    });
    expect(await send(contextA, again)).toEqual({
      ok: false,
      code: "CONFLICT",
      recorded: true,
    });
    expect(
      await send(
        contextA,
        event((p) => {
          p.event_id = "evt-repetido";
          p.message.body_text = "corregido";
        }),
      ),
    ).toEqual({ ok: false, code: "CONFLICT", recorded: false });

    expect(await eventsOf(orgA)).toEqual([
      expect.objectContaining({
        external_ref: "evt-0001",
        status: "processed",
      }),
      expect.objectContaining({
        external_ref: "evt-repetido",
        status: "failed",
        error_code: "CONFLICT",
        payload_hash: hashOf(again),
        processed: true,
      }),
    ]);
    expect(await messagesOf(orgA)).toHaveLength(1);
    expect(await conversationsOf(orgA)).toEqual(conversationsBefore);
  });

  it("caso 9: el mismo event_id con otro source o en otra organización es otro evento", async () => {
    await send(contextA, base.payload);
    const otherSource = { organizationId: orgA, source: "otro-emisor" };
    // Mismo mensaje en la misma conversación: el evento nuevo se registra y falla por el mensaje.
    expect(await send(otherSource, base.payload)).toEqual({
      ok: false,
      code: "CONFLICT",
      recorded: true,
    });
    expect(
      await send(
        { organizationId: orgB, source: "emisor-de-prueba" },
        base.payload,
      ),
    ).toMatchObject({ ok: true, result: "accepted" });
    expect((await eventsOf(orgA)).map((e) => [e.source, e.status])).toEqual([
      ["emisor-de-prueba", "processed"],
      ["otro-emisor", "failed"],
    ]);
    expect(await eventsOf(orgB)).toHaveLength(1);
  });
});

describe("rechazos sin registro", () => {
  it("caso 10: un payload o un source inválidos no escriben nada", async () => {
    const invalid = fixture("invalid-unknown-field.json");
    expect(
      await recordIngestionEvent(
        contextA,
        JSON.stringify(invalid.payload),
        invalid.receivedAt,
      ),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["message"] });
    expect(await recordIngestionEvent(contextA, "{", RECEIVED_AT)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["body"],
    });
    for (const source of ["", " emisor", "e".repeat(201)]) {
      expect(
        await send({ organizationId: orgA, source }, base.payload),
      ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["source"] });
    }
    expect(await counts()).toEqual({
      conversations: 0,
      messages: 0,
      events: 0,
    });
  });

  it("caso 11: un error inesperado en la proyección revierte también la reserva", async () => {
    await getDb().execute(sql`
      create function test_fail_message() returns trigger language plpgsql as $$
      begin
        if new.body_text = 'provocar falla' then
          raise exception 'falla de prueba';
        end if;
        return new;
      end $$`);
    await getDb().execute(sql`
      create trigger test_fail_message before insert on messages
      for each row execute function test_fail_message()`);
    try {
      await expect(
        send(
          contextA,
          event((p) => {
            p.message.body_text = "provocar falla";
          }),
        ),
      ).rejects.toThrow();
      expect(await counts()).toEqual({
        conversations: 0,
        messages: 0,
        events: 0,
      });
      // El mismo evento, con otro contenido, se acepta: no quedó reservado.
      expect(await send(contextA, base.payload)).toMatchObject({
        result: "accepted",
      });
    } finally {
      await getDb().execute(sql`drop trigger test_fail_message on messages`);
      await getDb().execute(sql`drop function test_fail_message()`);
    }
  });
});

describe("entregas simultáneas", () => {
  it(
    "caso 12: dos entregas del mismo evento dejan un mensaje, una accepted y otra duplicate",
    async () => {
      // La fila retenida sin confirmar hace esperar a las dos reservas en el índice único.
      const release = await holdUncommitted(
        sql`insert into ingestion_events
              (organization_id, source, external_ref, event_type, payload_hash)
            values (${orgA}, ${contextA.source}, 'evt-0001', 'message.recorded', 'retenido')`,
      );
      const deliveries = [
        send(contextA, base.payload),
        send(contextA, base.payload),
      ];
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all(deliveries);

      expect(results.map((r) => r.ok && r.result).sort()).toEqual([
        "accepted",
        "duplicate",
      ]);
      expect(await counts()).toEqual({
        conversations: 1,
        messages: 1,
        events: 1,
      });
      await expectDateInvariant();
    },
    TEST_TIMEOUT,
  );

  it(
    "caso 13: dos eventos de una conversación nueva dejan una conversación con los dos mensajes",
    async () => {
      // La conversación retenida sin confirmar hace esperar a las dos proyecciones.
      const release = await holdUncommitted(
        sql`insert into conversations
              (organization_id, channel, external_ref, status, started_at)
            values (${orgA}, 'whatsapp', 'conv-0001', 'open', now())`,
      );
      const first = event();
      const second = event((p) => {
        p.event_id = "evt-0002";
        p.message.external_ref = "msg-0002";
        p.message.sent_at = "2026-09-16T14:00:00.000Z";
      });
      const deliveries = [send(contextA, first), send(contextA, second)];
      await waitForLockWaiters(2);
      await release();
      const results = await Promise.all(deliveries);

      expect(results).toEqual([
        expect.objectContaining({ result: "accepted" }),
        expect.objectContaining({ result: "accepted" }),
      ]);
      expect(await conversationsOf(orgA)).toEqual([
        expect.objectContaining({
          started_at: "2026-09-16T14:00:00.000Z",
          last_message_at: "2026-09-16T14:59:57.250Z",
        }),
      ]);
      expect(await counts()).toEqual({
        conversations: 1,
        messages: 2,
        events: 2,
      });
      await expectDateInvariant();
    },
    TEST_TIMEOUT,
  );
});
