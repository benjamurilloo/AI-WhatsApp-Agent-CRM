import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { handleIngestionEvent } from "@/app/api/ingestion/v1/events/handler";
import { handleIngestionEventV2 } from "@/app/api/ingestion/v2/events/handler";
import {
  createIngestionCredential,
  INGESTION_RATE_LIMIT,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Endpoint de ingestión v2 contra PostgreSQL real (brief-12.3.1): el borde de v1 con la
// correlación antes del límite (D-6), el CONFLICT con motivo (D-7) y las respuestas de v2. Los
// requests son sintéticos y los eventos salen de fixtures con forma asumida: no hay emisor real.

const URL_V2 = "http://localhost/api/ingestion/v2/events";
const URL_V1 = "http://localhost/api/ingestion/v1/events";
const NOW = new Date("2026-09-16T15:00:00.000Z");
const TEST_TIMEOUT = 30000;
const PHONE = "+5491155550001";

type Payload = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fixture(version: "v1" | "v2", name: string): Payload {
  const file = path.join(
    process.cwd(),
    "tests/fixtures/ingestion",
    version,
    `${name}.json`,
  );
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (data.shape !== "assumed") throw new Error(`${name} sin forma asumida`);
  return data.payload;
}

const clientEvent = () => fixture("v2", "valid-client-resolved");
const conversationEvent = () =>
  fixture("v2", "valid-conversation-resolved-audio");
const agentReply = () => fixture("v2", "valid-message-recorded-agent");
const escalation = () => fixture("v2", "valid-conversation-escalated");

type Credential = { id: string; token: string };

async function credential(
  organizationId: string,
  source: string,
  scope: "ingest" | "read" = "ingest",
): Promise<Credential> {
  const created = await createIngestionCredential(
    organizationId,
    source,
    scope,
  );
  if (!created.ok) throw new Error("credencial inválida");
  return { id: created.credentialId, token: created.token };
}

function request(
  url: string,
  token: string | null,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

function send(
  token: string | null,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  return handleIngestionEventV2(request(URL_V2, token, payload, headers), NOW);
}

function sendV1(token: string, payload: unknown) {
  return handleIngestionEvent(request(URL_V1, token, payload), NOW);
}

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function counts() {
  const result = await getDb().execute<{
    conversations: number;
    messages: number;
    events: number;
    windows: number;
  }>(
    sql`select (select count(*)::int from conversations) as conversations,
          (select count(*)::int from messages) as messages,
          (select count(*)::int from ingestion_events) as events,
          (select count(*)::int from ingestion_rate_windows) as windows`,
  );
  return result.rows[0]!;
}

function allow(...credentials: Credential[]) {
  process.env.INGESTION_ENABLED = "true";
  process.env.INGESTION_ALLOWED_CREDENTIALS = credentials
    .map((c) => c.id)
    .join(",");
}

function captureLog() {
  const lines: string[] = [];
  const capture = (...args: unknown[]) => void lines.push(args.join(" "));
  const spies: MockInstance[] = [
    vi.spyOn(console, "log").mockImplementation(capture),
    vi.spyOn(console, "error").mockImplementation(capture),
    vi.spyOn(console, "warn").mockImplementation(capture),
  ];
  return {
    lines,
    stop: () => {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

const savedEnv = {
  enabled: process.env.INGESTION_ENABLED,
  allowed: process.env.INGESTION_ALLOWED_CREDENTIALS,
};

let orgA: string;
let emitter: Credential;

beforeEach(async () => {
  await resetDatabase(getDb());
  orgA = await createOrganization("Organización A");
  emitter = await credential(orgA, "emisor-a");
  allow(emitter);
});

afterEach(async () => {
  for (const [key, value] of [
    ["INGESTION_ENABLED", savedEnv.enabled],
    ["INGESTION_ALLOWED_CREDENTIALS", savedEnv.allowed],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
  await getDb().execute(sql`drop trigger if exists fail_messages on messages`);
  await getDb().execute(sql`drop function if exists fail_messages_insert()`);
});

describe("endpoint de ingestión v2", { timeout: TEST_TIMEOUT }, () => {
  it("1. FR-API-07: un turno responde con contract_version 2 y las formas de v1, sin ids, teléfono ni texto", async () => {
    const client = await send(emitter.token, clientEvent());
    expect(client.status).toBe(200);
    expect(await client.json()).toStrictEqual({
      contract_version: "2",
      event_id: "evt-v2-client-0001",
      result: "accepted",
      client: {
        id: expect.any(String),
        display_name: "María Gómez",
        is_active: true,
      },
    });

    const conversation = await send(emitter.token, conversationEvent());
    expect(conversation.status).toBe(200);
    expect(await conversation.json()).toStrictEqual({
      contract_version: "2",
      event_id: "evt-v2-conv-0001",
      result: "accepted",
      conversation: { external_ref: "conv-propuesta-0001", status: "open" },
    });

    const reply = await send(emitter.token, agentReply());
    expect(reply.status).toBe(201);
    expect(reply.headers.get("cache-control")).toBe("no-store");
    expect(reply.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const expected = {
      contract_version: "2",
      event_id: "evt-v2-msg-0001",
      result: "accepted",
      conversation_external_ref: "conv-propuesta-0001",
      message_external_ref: "msg-v2-0002",
    };
    expect(await reply.json()).toStrictEqual(expected);

    const again = await send(emitter.token, agentReply());
    expect(again.status).toBe(200);
    expect(await again.json()).toStrictEqual({
      ...expected,
      result: "duplicate",
    });

    const escalated = await send(emitter.token, escalation());
    expect(await escalated.json()).toMatchObject({
      contract_version: "2",
      conversation: { external_ref: "conv-propuesta-0001", status: "pending" },
    });
    expect(await counts()).toMatchObject({
      conversations: 1,
      messages: 2,
      events: 4,
    });
  });

  it("2. FR-API-07: el 409 dice su motivo, en la primera respuesta y en el reenvío", async () => {
    await send(emitter.token, agentReply());
    const repeated = agentReply();
    repeated.event_id = "evt-v2-msg-otra";
    const changed = agentReply();
    changed.message.body_text = "Otro texto";

    for (const [payload, reason] of [
      [repeated, "message_already_recorded"],
      [repeated, "message_already_recorded"],
      [changed, "event_payload_mismatch"],
    ] as const) {
      const response = await send(emitter.token, payload);
      expect(response.status).toBe(409);
      expect(await response.json()).toStrictEqual({
        code: "CONFLICT",
        request_id: expect.any(String),
        reason,
      });
    }

    await getDb().execute(
      sql`insert into clients (organization_id, display_name, phone_e164)
          values (${orgA}, 'María', ${PHONE})`,
    );
    await getDb().execute(
      sql`update conversations set status = 'closed' where organization_id = ${orgA}`,
    );
    const taken = await send(emitter.token, conversationEvent());
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({
      reason: "conversation_ref_taken",
    });
  });

  it("3. FR-API-07: v1 sigue respondiendo el 409 sin motivo", async () => {
    const first = fixture("v1", "valid-outbound-without-phone");
    await sendV1(emitter.token, first);
    const response = await sendV1(emitter.token, {
      ...first,
      event_id: "evt-v1-otra",
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toStrictEqual({
      code: "CONFLICT",
      request_id: expect.any(String),
    });
  });

  it("4. FR-API-07: la correlación se devuelve en cada respuesta y queda en el log", async () => {
    const log = captureLog();
    const ok = await send(emitter.token, agentReply(), {
      "x-correlation-id": "turno-0001",
    });
    const invalidEvent = await send(
      emitter.token,
      { ...agentReply(), extra: true },
      { "x-correlation-id": "turno-0002" },
    );
    log.stop();

    expect(ok.status).toBe(201);
    expect(ok.headers.get("x-correlation-id")).toBe("turno-0001");
    expect(invalidEvent.status).toBe(400);
    expect(invalidEvent.headers.get("x-correlation-id")).toBe("turno-0002");
    const events = log.lines.map((line) => JSON.parse(line));
    expect(events.map((e) => [e.code, e.correlation_id])).toEqual([
      ["OK", "turno-0001"],
      ["VALIDATION_ERROR", "turno-0002"],
    ]);
    expect(events[0]).toMatchObject({
      route: "/api/ingestion/v2/events",
      organization_id: orgA,
      source: "emisor-a",
    });
  });

  it("5. FR-API-07: una correlación inválida responde 400 sin consumir el límite ni escribir", async () => {
    // Los espacios de los bordes los recorta HTTP antes de que el valor llegue (read-v1).
    for (const value of ["a".repeat(201), "turno\u0001x"]) {
      const response = await send(emitter.token, agentReply(), {
        "x-correlation-id": value,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toStrictEqual({
        code: "VALIDATION_ERROR",
        request_id: expect.any(String),
        fields: ["correlation_id"],
      });
      expect(response.headers.get("x-correlation-id")).toBeNull();
    }
    expect(await counts()).toEqual({
      conversations: 0,
      messages: 0,
      events: 0,
      windows: 0,
    });
  });

  it("6. FR-API-07: el límite es el de la credencial, compartido con v1, y el 429 lleva la correlación", async () => {
    for (let index = 0; index < INGESTION_RATE_LIMIT; index += 1) {
      const response = await sendV1(emitter.token, {
        ...fixture("v1", "valid-outbound-without-phone"),
        event_id: `evt-limite-${index}`,
      });
      expect(response.status).not.toBe(429);
    }

    const log = captureLog();
    const limited = await send(emitter.token, agentReply(), {
      "x-correlation-id": "turno-limitado",
    });
    log.stop();

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(limited.headers.get("x-correlation-id")).toBe("turno-limitado");
    expect(JSON.parse(log.lines[0]!)).toMatchObject({
      code: "RATE_LIMITED",
      correlation_id: "turno-limitado",
    });
  });

  it("7. FR-API-07: la misma cadena que v1: apagado, sin credencial, lectura y fuera de la allowlist, sin escribir", async () => {
    delete process.env.INGESTION_ENABLED;
    const off = await send(emitter.token, agentReply(), {
      "x-correlation-id": "turno-apagado",
    });
    expect(off.status).toBe(404);
    expect(await off.text()).toBe("");
    expect(off.headers.get("x-correlation-id")).toBeNull();

    const reader = await credential(orgA, "emisor-a", "read");
    const outside = await credential(orgA, "emisor-fuera");
    allow(emitter, reader);

    const anonymous = await send(null, agentReply());
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toBe("Bearer");
    expect((await send(reader.token, agentReply())).status).toBe(403);
    expect((await send(outside.token, agentReply())).status).toBe(403);
    expect(await counts()).toEqual({
      conversations: 0,
      messages: 0,
      events: 0,
      windows: 0,
    });
  });

  it("8. FR-API-07: el log no lleva el token, el teléfono, el nombre ni el texto", async () => {
    const log = captureLog();
    await send(emitter.token, clientEvent());
    await send(emitter.token, conversationEvent());
    await send(emitter.token, agentReply());
    await send(emitter.token, { ...clientEvent(), extra: "x" });
    log.stop();

    const output = log.lines.join("\n");
    expect(log.lines).toHaveLength(4);
    for (const secret of [
      emitter.token.slice("crm_ing_".length),
      PHONE,
      "María Gómez",
      "Hola, ¿tienen stock?",
      "Sí, tenemos stock.",
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  it("9. FR-API-07: un 422 lleva su regla, y un error inesperado responde 500 con la correlación y sin escribir", async () => {
    const missing = await send(emitter.token, conversationEvent());
    expect(missing.status).toBe(422);
    expect(await missing.json()).toStrictEqual({
      code: "BUSINESS_RULE_VIOLATION",
      request_id: expect.any(String),
      rule: "client_not_found",
    });

    await getDb().execute(
      sql.raw(`create function fail_messages_insert() returns trigger
        language plpgsql as $$ begin raise exception 'falla forzada'; end $$`),
    );
    await getDb().execute(
      sql.raw(`create trigger fail_messages before insert on messages
        for each row execute function fail_messages_insert()`),
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await send(emitter.token, agentReply(), {
      "x-correlation-id": "turno-500",
    });
    expect(failed.status).toBe(500);
    expect(failed.headers.get("x-correlation-id")).toBe("turno-500");
    expect(await failed.json()).toStrictEqual({
      code: "INTERNAL",
      request_id: expect.any(String),
    });
    expect(String(errors.mock.calls[0]?.[0])).not.toContain("falla forzada");
    expect(await counts()).toMatchObject({ messages: 0 });
  });
});

describe(
  "endpoint de ingestión v2: etiquetas (brief-16.2)",
  { timeout: TEST_TIMEOUT },
  () => {
    const tagAdded = () => fixture("v2", "valid-client-tag-added");
    const tagRemoved = () => fixture("v2", "valid-client-tag-removed");

    async function catalogTag() {
      await getDb().execute(
        sql`insert into client_tags (id, organization_id, name)
            values (${tagAdded().tag.id}, ${orgA}, 'Reclamo')`,
      );
    }

    it("FR-CLI-11: responde 200 sin datos del cliente, también en el reenvío y al quitar (D-5)", async () => {
      await send(emitter.token, clientEvent());
      await catalogTag();

      const added = await send(emitter.token, tagAdded(), {
        "x-correlation-id": "turno-etiqueta",
      });
      expect(added.status).toBe(200);
      expect(added.headers.get("x-correlation-id")).toBe("turno-etiqueta");
      expect(await added.json()).toStrictEqual({
        contract_version: "2",
        event_id: "evt-v2-etiqueta-0001",
        result: "accepted",
      });

      const again = await send(emitter.token, tagAdded());
      expect(again.status).toBe(200);
      expect(await again.json()).toStrictEqual({
        contract_version: "2",
        event_id: "evt-v2-etiqueta-0001",
        result: "duplicate",
      });

      const removed = await send(emitter.token, tagRemoved());
      expect(removed.status).toBe(200);
      expect(await removed.json()).toStrictEqual({
        contract_version: "2",
        event_id: "evt-v2-etiqueta-0002",
        result: "accepted",
      });
    });

    it("FR-CLI-11: una regla responde 422 con rule, y v1 rechaza el tipo con 400", async () => {
      await catalogTag();
      const missing = await send(emitter.token, tagAdded());
      expect(missing.status).toBe(422);
      expect(await missing.json()).toStrictEqual({
        code: "BUSINESS_RULE_VIOLATION",
        request_id: expect.any(String),
        rule: "client_not_found",
      });

      const v1 = await sendV1(emitter.token, {
        ...tagAdded(),
        contract_version: "1",
        event_id: "evt-v1-etiqueta",
      });
      expect(v1.status).toBe(400);
      expect(await v1.json()).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: expect.arrayContaining(["event_type"]),
      });
    });
  },
);

describe(
  "endpoint de ingestión v2: el pedido del agente (brief-19.4)",
  { timeout: TEST_TIMEOUT },
  () => {
    const placed = () => fixture("v2", "valid-order-placed");

    // Los dos productos del vector, con precio en ARS, en la organización A.
    async function catalog() {
      const user = await getDb().execute<{ id: string }>(
        sql`insert into users (email, password_hash, name)
            values ('precios@example.com', 'x', 'Admin') returning id`,
      );
      for (const [index, line] of placed().lines.entries()) {
        await getDb().execute(
          sql`insert into products (id, organization_id, sku, name)
              values (${line.product_id}, ${orgA}, ${`P-${index}`}, 'Producto')`,
        );
        await getDb().execute(
          sql`insert into product_prices (organization_id, product_id, amount, currency, created_by)
              values (${orgA}, ${line.product_id}, 100, 'ARS', ${user.rows[0]!.id})`,
        );
      }
    }

    it("D-6: responde 200 con el número, y el mismo número en el reenvío", async () => {
      await send(emitter.token, clientEvent());
      await catalog();

      const accepted = await send(emitter.token, placed(), {
        "x-correlation-id": "turno-pedido",
      });
      expect(accepted.status).toBe(200);
      expect(accepted.headers.get("x-correlation-id")).toBe("turno-pedido");
      expect(await accepted.json()).toStrictEqual({
        contract_version: "2",
        event_id: "evt-v2-pedido-0001",
        result: "accepted",
        order: { number: "P-000001" },
      });

      const again = await send(emitter.token, placed());
      expect(again.status).toBe(200);
      expect(await again.json()).toStrictEqual({
        contract_version: "2",
        event_id: "evt-v2-pedido-0001",
        result: "duplicate",
        order: { number: "P-000001" },
      });
    });

    it("D-6: una regla responde 422 con rule; la forma, 400 con lines; v1 rechaza el tipo", async () => {
      await catalog();
      const missing = await send(emitter.token, placed());
      expect(missing.status).toBe(422);
      expect(await missing.json()).toStrictEqual({
        code: "BUSINESS_RULE_VIOLATION",
        request_id: expect.any(String),
        rule: "client_not_found",
      });

      const repeated = await send(
        emitter.token,
        fixture("v2", "invalid-order-repeated-product"),
      );
      expect(repeated.status).toBe(400);
      expect(await repeated.json()).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: ["lines"],
      });

      const v1 = await sendV1(emitter.token, {
        ...placed(),
        contract_version: "1",
        event_id: "evt-v1-pedido",
      });
      expect(v1.status).toBe(400);
      expect(await v1.json()).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: expect.arrayContaining(["event_type"]),
      });
    });
  },
);

describe(
  "endpoint de ingestión v2: el turno pedido por el agente (brief-29.10.2)",
  { timeout: TEST_TIMEOUT },
  () => {
    const requested = () => fixture("v2", "valid-appointment-requested");

    // appointments con 30 minutos y cupo 1, el motivo y el producto del vector, abierto todo el día, y
    // una fecha a tres días: el servicio mira la hora de la base, no la del request.
    async function offered(): Promise<string> {
      const vector = requested().appointment;
      const user = await getDb().execute<{ id: string }>(
        sql`insert into users (email, password_hash, name)
            values ('turnos@example.com', 'x', 'Admin') returning id`,
      );
      await getDb().execute(
        sql`insert into organization_capabilities (organization_id, capability, activated_by)
            values (${orgA}, 'appointments', ${user.rows[0]!.id})`,
      );
      await getDb().execute(
        sql`insert into appointment_settings (organization_id, slot_minutes, capacity)
            values (${orgA}, 30, 1)`,
      );
      await getDb().execute(
        sql`insert into appointment_reasons (id, organization_id, name)
            values (${vector.reason_id}, ${orgA}, 'Revisión')`,
      );
      await getDb().execute(
        sql`insert into products (id, organization_id, sku, name)
            values (${vector.product_id}, ${orgA}, 'P-turno', 'Producto')`,
      );
      for (let weekday = 1; weekday <= 7; weekday++) {
        await getDb().execute(
          sql`insert into business_hours (organization_id, weekday, opens_1, closes_1)
              values (${orgA}, ${weekday}, '00:00', '23:59')`,
        );
      }
      const date = await getDb().execute<{ date: string }>(
        sql`select to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date + 3,
                           'YYYY-MM-DD') as date`,
      );
      return date.rows[0]!.date;
    }

    function withStart(date: string, eventId?: string): Payload {
      const payload = requested();
      return {
        ...payload,
        ...(eventId ? { event_id: eventId } : {}),
        appointment: {
          ...payload.appointment,
          starts_at: `${date}T15:00:00-03:00`,
        },
      };
    }

    it("D-3: responde 200 con la franja y su desplazamiento, y la misma en el reenvío", async () => {
      await send(emitter.token, clientEvent());
      const date = await offered();

      const accepted = await send(emitter.token, withStart(date), {
        "x-correlation-id": "turno-del-agente",
      });
      expect(accepted.status).toBe(200);
      expect(accepted.headers.get("x-correlation-id")).toBe("turno-del-agente");
      const body = {
        contract_version: "2",
        event_id: "evt-v2-turno-0001",
        result: "accepted",
        appointment: {
          starts_at: `${date}T15:00:00-03:00`,
          ends_at: `${date}T15:30:00-03:00`,
        },
      };
      expect(await accepted.json()).toStrictEqual(body);

      const again = await send(emitter.token, withStart(date));
      expect(again.status).toBe(200);
      expect(await again.json()).toStrictEqual({
        ...body,
        result: "duplicate",
      });
    });

    it("D-3: una regla responde 422 con rule; producto y unidad juntos, 400; v1 rechaza el tipo", async () => {
      await send(emitter.token, clientEvent());
      const date = await offered();
      expect((await send(emitter.token, withStart(date))).status).toBe(200);

      const pending = await send(
        emitter.token,
        withStart(date, "evt-v2-turno-0003"),
      );
      expect(pending.status).toBe(422);
      expect(await pending.json()).toStrictEqual({
        code: "BUSINESS_RULE_VIOLATION",
        request_id: expect.any(String),
        rule: "client_has_pending_request",
      });

      const both = await send(
        emitter.token,
        fixture("v2", "invalid-appointment-product-and-unit"),
      );
      expect(both.status).toBe(400);
      expect(await both.json()).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: ["appointment"],
      });

      const v1 = await sendV1(emitter.token, {
        ...withStart(date, "evt-v1-turno"),
        contract_version: "1",
      });
      expect(v1.status).toBe(400);
      expect(await v1.json()).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: expect.arrayContaining(["event_type"]),
      });
    });
  },
);
