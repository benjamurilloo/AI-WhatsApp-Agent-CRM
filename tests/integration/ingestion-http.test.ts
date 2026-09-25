import { createHash, randomBytes } from "node:crypto";
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
import { validateSession } from "@/modules/auth";
import {
  createIngestionCredential,
  INGESTION_RATE_LIMIT,
  MAX_INGESTION_BODY_BYTES,
  revokeIngestionCredential,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Endpoint de ingestión contra PostgreSQL real (brief-6.5.3): credencial de servicio, modo de
// prueba, límite de tasa, lectura del cuerpo y respuestas del contrato v1. Los requests son
// sintéticos y los eventos salen de fixtures con forma asumida: no hay emisor real (D-6).

const FIXTURES = path.join(process.cwd(), "tests/fixtures/ingestion/v1");
const URL = "http://localhost/api/ingestion/v1/events";
const TEST_TIMEOUT = 30000;

type Payload = {
  event_id: string;
  conversation: { external_ref: string; client_phone: string | null };
  message: { external_ref: string; body_text: string | null };
} & Record<string, unknown>;

function fixture(name: string): { payload: Payload; receivedAt: Date } {
  const data = JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));
  if (data.shape !== "assumed") throw new Error(`${name} sin forma asumida`);
  return { payload: data.payload, receivedAt: new Date(data.received_at) };
}

const base = fixture("valid-inbound-with-client.json");
const NOW = base.receivedAt;
const PHONE = base.payload.conversation.client_phone!;
const BODY_TEXT = base.payload.message.body_text!;

function event(change: (payload: Payload) => void = () => {}): Payload {
  const payload = structuredClone(base.payload);
  change(payload);
  return payload;
}

type Credential = { id: string; token: string };

async function credential(
  organizationId: string,
  source: string,
): Promise<Credential> {
  const created = await createIngestionCredential(organizationId, source);
  if (!created.ok) throw new Error("credencial inválida");
  return { id: created.credentialId, token: created.token };
}

function post(
  token: string | null,
  body: string | ReadableStream<Uint8Array>,
  options: { headers?: Record<string, string>; now?: Date } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    ...options.headers,
  };
  const init = {
    method: "POST",
    headers,
    body,
    ...(typeof body === "string" ? {} : { duplex: "half" }),
  } as RequestInit;
  return handleIngestionEvent(new Request(URL, init), options.now ?? NOW);
}

function send(token: string, payload: unknown, now = NOW) {
  return post(token, JSON.stringify(payload), { now });
}

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function eventsOf(organizationId: string) {
  const result = await getDb().execute<{
    source: string;
    external_ref: string;
    status: string;
    error_code: string | null;
  }>(
    sql`select source, external_ref, status, error_code from ingestion_events
        where organization_id = ${organizationId} order by source, external_ref`,
  );
  return result.rows;
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

const NOTHING_WRITTEN = { conversations: 0, messages: 0, events: 0 };

function allow(...credentials: Credential[]) {
  process.env.INGESTION_ENABLED = "true";
  process.env.INGESTION_ALLOWED_CREDENTIALS = credentials
    .map((c) => c.id)
    .join(",");
}

const savedEnv = {
  enabled: process.env.INGESTION_ENABLED,
  allowed: process.env.INGESTION_ALLOWED_CREDENTIALS,
};

let orgA: string;
let orgB: string;
let emitterA: Credential;
let emitterA2: Credential;
let emitterB: Credential;

beforeEach(async () => {
  await resetDatabase(getDb());
  orgA = await createOrganization("Organización A");
  orgB = await createOrganization("Organización B");
  emitterA = await credential(orgA, "emisor-a");
  emitterA2 = await credential(orgA, "emisor-b");
  emitterB = await credential(orgB, "emisor-a");
  allow(emitterA, emitterA2, emitterB);
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

describe("endpoint de ingestión", { timeout: TEST_TIMEOUT }, () => {
  it("1. acepta un evento con 201, responde 200 al reenvío y solo devuelve referencias del emisor", async () => {
    const first = await send(emitterA.token, event());
    expect(first.status).toBe(201);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const expected = {
      contract_version: "1",
      event_id: base.payload.event_id,
      result: "accepted",
      conversation_external_ref: base.payload.conversation.external_ref,
      message_external_ref: base.payload.message.external_ref,
    };
    expect(await first.json()).toStrictEqual(expected);

    const again = await send(emitterA.token, event());
    expect(again.status).toBe(200);
    expect(await again.json()).toStrictEqual({
      ...expected,
      result: "duplicate",
    });

    expect(await counts()).toMatchObject({
      conversations: 1,
      messages: 1,
      events: 1,
    });
    expect(await eventsOf(orgA)).toEqual([
      {
        source: "emisor-a",
        external_ref: base.payload.event_id,
        status: "processed",
        error_code: null,
      },
    ]);
  });

  it("2. la organización y el source salen de la credencial", async () => {
    expect((await send(emitterA.token, event())).status).toBe(201);
    // Mismo event_id con otro source: es otro evento, y su mensaje ya existe en la conversación.
    const otherSource = await send(emitterA2.token, event());
    expect(otherSource.status).toBe(409);
    // Otra organización: su propia conversación.
    expect((await send(emitterB.token, event())).status).toBe(201);

    expect(await eventsOf(orgA)).toEqual([
      {
        source: "emisor-a",
        external_ref: base.payload.event_id,
        status: "processed",
        error_code: null,
      },
      {
        source: "emisor-b",
        external_ref: base.payload.event_id,
        status: "failed",
        error_code: "CONFLICT",
      },
    ]);
    expect(await eventsOf(orgB)).toHaveLength(1);
    expect(await counts()).toMatchObject({ conversations: 2, messages: 2 });
  });

  it("3. rechaza sin escribir ni consumir límite a quien no se autentica", async () => {
    const unknown = `crm_ing_${randomBytes(32).toString("base64url")}`;
    const attempts: [string, Record<string, string>][] = [
      ["sin encabezado", {}],
      ["otro esquema", { authorization: `Basic ${emitterA.token}` }],
      ["token desconocido", { authorization: `Bearer ${unknown}` }],
      ["token mal formado", { authorization: "Bearer crm_ing_x" }],
    ];
    for (const [name, headers] of attempts) {
      const response = await post(null, JSON.stringify(event()), { headers });
      expect(response.status, name).toBe(401);
      expect(response.headers.get("www-authenticate"), name).toBe("Bearer");
      const body = await response.json();
      expect(body, name).toStrictEqual({
        code: "UNAUTHENTICATED",
        request_id: expect.any(String),
      });
    }
    expect(await counts()).toEqual({ ...NOTHING_WRITTEN, windows: 0 });
  });

  it("4. rechaza con 403 una credencial revocada o fuera de la allowlist", async () => {
    expect(await revokeIngestionCredential(emitterA.id)).toBe(true);
    expect(await revokeIngestionCredential(emitterA.id)).toBe(false);
    const revoked = await send(emitterA.token, event());
    expect(revoked.status).toBe(403);
    expect(await revoked.json()).toMatchObject({ code: "FORBIDDEN" });

    allow(emitterA2);
    const notAllowed = await send(emitterB.token, event());
    expect(notAllowed.status).toBe(403);

    expect(await counts()).toEqual({ ...NOTHING_WRITTEN, windows: 0 });
  });

  it("5. responde 404 sin cuerpo con el modo de prueba apagado o mal configurado", async () => {
    for (const [enabled, allowed] of [
      [undefined, emitterA.id],
      ["false", emitterA.id],
      ["si", emitterA.id],
      ["true", "no-es-un-uuid"],
    ] as const) {
      if (enabled === undefined) delete process.env.INGESTION_ENABLED;
      else process.env.INGESTION_ENABLED = enabled;
      process.env.INGESTION_ALLOWED_CREDENTIALS = allowed;
      const response = await send(emitterA.token, event());
      expect(response.status, String(enabled)).toBe(404);
      expect(await response.text()).toBe("");
    }
    process.env.INGESTION_ENABLED = "true";
    process.env.INGESTION_ALLOWED_CREDENTIALS = "";
    expect((await send(emitterA.token, event())).status).toBe(403);
    expect(await counts()).toEqual({ ...NOTHING_WRITTEN, windows: 0 });
  });

  it("6. una sesión válida del CRM no autentica el endpoint (D-5)", async () => {
    const token = randomBytes(32).toString("base64url");
    const user = await getDb().execute<{ id: string }>(
      sql`insert into users (email, password_hash, name)
          values ('admin-http@example.com', 'x', 'Admin') returning id`,
    );
    const userId = user.rows[0]!.id;
    await getDb().execute(
      sql`insert into organization_members (organization_id, user_id, role)
          values (${orgA}, ${userId}, 'admin')`,
    );
    await getDb().execute(
      sql`insert into sessions (id, user_id, expires_at)
          values (${createHash("sha256").update(token).digest("hex")}, ${userId},
            now() + interval '1 hour')`,
    );
    expect(await validateSession(token)).not.toBeNull();

    for (const cookie of [
      `crm_session=${token}`,
      `__Host-crm_session=${token}`,
    ]) {
      const response = await post(null, JSON.stringify(event()), {
        headers: { cookie, origin: "http://localhost" },
      });
      expect(response.status, cookie).toBe(401);
    }
    expect(await counts()).toEqual({ ...NOTHING_WRITTEN, windows: 0 });
  });

  it("7. rechaza con VALIDATION_ERROR el tipo de contenido, el tamaño, los bytes y el evento inválidos", async () => {
    const valid = JSON.stringify(event());
    const big = new Uint8Array(MAX_INGESTION_BODY_BYTES + 1).fill(32);
    const stream = (bytes: Uint8Array) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 16384) {
            controller.enqueue(bytes.slice(i, i + 16384));
          }
          controller.close();
        },
      });

    const bodyErrors: [string, Promise<Response>][] = [
      [
        "texto plano",
        post(emitterA.token, valid, {
          headers: { "content-type": "text/plain" },
        }),
      ],
      [
        "sin tipo",
        post(emitterA.token, new Blob([valid]).stream(), {
          headers: { "content-type": "" },
        }),
      ],
      [
        "Content-Length declarado",
        post(emitterA.token, valid, {
          headers: { "content-length": String(MAX_INGESTION_BODY_BYTES + 1) },
        }),
      ],
      ["cuerpo real sin Content-Length", post(emitterA.token, stream(big))],
      [
        "UTF-8 inválido",
        post(emitterA.token, stream(new Uint8Array([0x7b, 0xff, 0x7d]))),
      ],
    ];
    for (const [name, pending] of bodyErrors) {
      const response = await pending;
      expect(response.status, name).toBe(400);
      expect(await response.json(), name).toStrictEqual({
        code: "VALIDATION_ERROR",
        request_id: expect.any(String),
        fields: ["body"],
      });
    }

    // Un cuerpo del tamaño exacto del límite se lee y llega a la validación del evento.
    const multibyte = Buffer.byteLength(valid) - valid.length;
    const padded = valid.padEnd(MAX_INGESTION_BODY_BYTES - multibyte, " ");
    expect(Buffer.byteLength(padded)).toBe(MAX_INGESTION_BODY_BYTES);
    expect((await post(emitterA.token, padded)).status).toBe(201);

    const invalid = fixture("invalid-unknown-field.json").payload;
    const rejected = await send(emitterA2.token, invalid);
    expect(rejected.status).toBe(400);
    const text = await rejected.text();
    expect(JSON.parse(text)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain(BODY_TEXT);

    expect(await eventsOf(orgA)).toHaveLength(1);
  });

  it("8. responde 409 a otro contenido y al mensaje repetido con otro event_id", async () => {
    expect((await send(emitterA.token, event())).status).toBe(201);

    const changed = await send(
      emitterA.token,
      event((p) => (p.message.body_text = "Otro texto")),
    );
    expect(changed.status).toBe(409);
    expect(await changed.json()).toStrictEqual({
      code: "CONFLICT",
      request_id: expect.any(String),
    });

    const repeated = event((p) => (p.event_id = "evt-otro"));
    expect((await send(emitterA.token, repeated)).status).toBe(409);
    expect((await send(emitterA.token, repeated)).status).toBe(409);

    expect(await eventsOf(orgA)).toEqual([
      {
        source: "emisor-a",
        external_ref: base.payload.event_id,
        status: "processed",
        error_code: null,
      },
      {
        source: "emisor-a",
        external_ref: "evt-otro",
        status: "failed",
        error_code: "CONFLICT",
      },
    ]);
    expect(await counts()).toMatchObject({ conversations: 1, messages: 1 });
  });

  it("9. aplica el límite de tasa por credencial y lo reinicia en la ventana siguiente", async () => {
    const cheap = () =>
      post(emitterA.token, "{}", { headers: { "content-type": "text/plain" } });
    for (let i = 0; i < INGESTION_RATE_LIMIT; i++) {
      expect((await cheap()).status).toBe(400);
    }

    const limited = await send(emitterA.token, event());
    expect(limited.status).toBe(429);
    const windowMs = 60_000;
    const expectedWait = Math.ceil(
      (windowMs - (NOW.getTime() % windowMs)) / 1000,
    );
    expect(limited.headers.get("retry-after")).toBe(String(expectedWait));
    expect(await limited.json()).toStrictEqual({
      code: "RATE_LIMITED",
      request_id: expect.any(String),
    });
    expect(await counts()).toMatchObject(NOTHING_WRITTEN);

    // Otra credencial de la misma organización tiene su propio límite.
    expect((await send(emitterA2.token, event())).status).toBe(201);

    // En la ventana siguiente vuelve a aceptar, y la ventana vencida se borra.
    const next = new Date(NOW.getTime() + windowMs);
    const later = event((p) => {
      p.event_id = "evt-2";
      p.message.external_ref = "msg-2";
    });
    expect((await send(emitterA.token, later, next)).status).toBe(201);
    const windows = await getDb().execute<{ request_count: number }>(
      sql`select request_count from ingestion_rate_windows
          where credential_id = ${emitterA.id}`,
    );
    expect(windows.rows).toEqual([{ request_count: 1 }]);
  });

  it("10. bajo concurrencia, el límite deja pasar exactamente su valor", async () => {
    const extra = 5;
    const responses = await Promise.all(
      Array.from({ length: INGESTION_RATE_LIMIT + extra }, () =>
        post(emitterA.token, "{}", {
          headers: { "content-type": "text/plain" },
        }),
      ),
    );
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 400)).toHaveLength(
      INGESTION_RATE_LIMIT,
    );
    expect(statuses.filter((status) => status === 429)).toHaveLength(extra);
    const windows = await getDb().execute<{ request_count: number }>(
      sql`select request_count from ingestion_rate_windows
          where credential_id = ${emitterA.id}`,
    );
    expect(windows.rows).toEqual([
      { request_count: INGESTION_RATE_LIMIT + extra },
    ]);
  });

  it("11. guarda solo el hash del token", async () => {
    const rows = await getDb().execute<{ row: string }>(
      sql`select row_to_json(c)::text as row from ingestion_credentials c`,
    );
    expect(rows.rows).toHaveLength(3);
    for (const { token } of [emitterA, emitterA2, emitterB]) {
      const secret = token.slice("crm_ing_".length);
      for (const { row } of rows.rows) expect(row).not.toContain(secret);
    }
    const hashes = await getDb().execute<{ token_hash: string }>(
      sql`select token_hash from ingestion_credentials where id = ${emitterA.id}`,
    );
    expect(hashes.rows[0]!.token_hash).toBe(
      createHash("sha256").update(emitterA.token).digest("hex"),
    );
  });

  it("12. el log no contiene el token, el teléfono ni el cuerpo del mensaje", async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.join(" "));
    const spies: MockInstance[] = [
      vi.spyOn(console, "log").mockImplementation(capture),
      vi.spyOn(console, "error").mockImplementation(capture),
      vi.spyOn(console, "warn").mockImplementation(capture),
    ];

    await send(emitterA.token, event());
    await send(
      emitterA.token,
      event((p) => (p.message.body_text = "Otro")),
    );
    await send(emitterA.token, fixture("invalid-unknown-field.json").payload);
    await post(`crm_ing_${"a".repeat(43)}`, JSON.stringify(event()));
    for (const spy of spies) spy.mockRestore();

    const output = lines.join("\n");
    expect(lines).toHaveLength(4);
    for (const secret of [
      emitterA.token.slice("crm_ing_".length),
      "a".repeat(43),
      PHONE,
      BODY_TEXT,
      "Otro",
    ]) {
      expect(output).not.toContain(secret);
    }
    const events = lines.map((line) => JSON.parse(line));
    expect(events.map((e) => e.code)).toEqual([
      "OK",
      "CONFLICT",
      "VALIDATION_ERROR",
      "UNAUTHENTICATED",
    ]);
    expect(events[0]).toMatchObject({
      route: "/api/ingestion/v1/events",
      organization_id: orgA,
      source: "emisor-a",
    });
  });

  it("13. un error inesperado responde 500 sin detalles y no deja el evento", async () => {
    await getDb().execute(
      sql.raw(`create function fail_messages_insert() returns trigger
        language plpgsql as $$ begin raise exception 'falla forzada'; end $$`),
    );
    await getDb().execute(
      sql.raw(`create trigger fail_messages before insert on messages
        for each row execute function fail_messages_insert()`),
    );
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await send(emitterA.token, event());
    expect(response.status).toBe(500);
    expect(await response.json()).toStrictEqual({
      code: "INTERNAL",
      request_id: expect.any(String),
    });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]?.[0])).not.toContain("falla forzada");
    expect(await counts()).toMatchObject(NOTHING_WRITTEN);
  });

  it("14. una credencial de lectura no escribe: 403 sin consumir el límite (brief-11.3, D-2)", async () => {
    const created = await createIngestionCredential(orgA, "emisor-a", "read");
    if (!created.ok) throw new Error("credencial inválida");
    expect(created.token).toMatch(/^crm_read_/);
    allow(emitterA, { id: created.credentialId, token: created.token });

    const response = await send(created.token, event());
    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      code: "FORBIDDEN",
      request_id: expect.any(String),
    });
    expect(await counts()).toEqual({ ...NOTHING_WRITTEN, windows: 0 });

    // La de ingestión de la misma organización y el mismo source sigue escribiendo.
    expect((await send(emitterA.token, event())).status).toBe(201);
  });

  // client.resolved por el mismo endpoint (brief-12.1, D-1 y D-9).
  const resolved = fixture("valid-client-resolved.json").payload as unknown as {
    event_id: string;
    client: { phone: string; display_name: string };
  };

  it("15. FR-API-04: client.resolved responde 200 con el cliente y sin su teléfono, también al reenvío", async () => {
    const first = await send(emitterA.token, resolved);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const body = await first.json();
    expect(body).toStrictEqual({
      contract_version: "1",
      event_id: resolved.event_id,
      result: "accepted",
      client: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        display_name: resolved.client.display_name,
        is_active: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain(resolved.client.phone);

    const again = await send(emitterA.token, resolved);
    expect(again.status).toBe(200);
    expect(await again.json()).toStrictEqual({ ...body, result: "duplicate" });
    const audit = await getDb().execute<{ actor_credential_id: string }>(
      sql`select actor_credential_id from audit_logs where organization_id = ${orgA}`,
    );
    expect(audit.rows).toEqual([{ actor_credential_id: emitterA.id }]);
  });

  it("16. FR-API-04: client.resolved pasa por la misma cadena: lectura, allowlist y límite compartido", async () => {
    const reader = await createIngestionCredential(orgA, "emisor-a", "read");
    if (!reader.ok) throw new Error("credencial inválida");
    allow(emitterA, { id: reader.credentialId, token: reader.token });
    expect((await send(reader.token, resolved)).status).toBe(403);
    expect((await send(emitterA2.token, resolved)).status).toBe(403);

    // El límite es por credencial y lo comparten los dos tipos de evento.
    for (let index = 0; index < INGESTION_RATE_LIMIT - 1; index += 1) {
      await send(
        emitterA.token,
        event((p) => (p.event_id = `evt-limite-${index}`)),
      );
    }
    expect((await send(emitterA.token, resolved)).status).toBe(200);
    const limited = await send(emitterA.token, {
      ...resolved,
      event_id: "evt-client-limitado",
    });
    expect(limited.status).toBe(429);
    const clients = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from clients where organization_id = ${orgA}`,
    );
    expect(clients.rows[0]!.count).toBe(1);
  });

  it("17. FR-API-04: el log de client.resolved no lleva el teléfono ni el nombre", async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.join(" "));
    const spies: MockInstance[] = [
      vi.spyOn(console, "log").mockImplementation(capture),
      vi.spyOn(console, "error").mockImplementation(capture),
      vi.spyOn(console, "warn").mockImplementation(capture),
    ];
    await send(emitterA.token, resolved);
    await send(
      emitterA.token,
      fixture("invalid-client-resolved-name.json").payload,
    );
    for (const spy of spies) spy.mockRestore();

    const output = lines.join("\n");
    expect(lines).toHaveLength(2);
    for (const secret of [
      resolved.client.phone,
      resolved.client.display_name,
      "María",
      "5491155550003",
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(lines.map((line) => JSON.parse(line).code)).toEqual([
      "OK",
      "VALIDATION_ERROR",
    ]);
  });

  it("18. FR-API-04: client.resolved responde 404 con el endpoint apagado y 401 sin credencial, sin escribir", async () => {
    process.env.INGESTION_ENABLED = "false";
    const off = await send(emitterA.token, resolved);
    expect(off.status).toBe(404);
    expect(await off.text()).toBe("");
    allow(emitterA);
    const anonymous = await post(null, JSON.stringify(resolved));
    expect(anonymous.status).toBe(401);
    const clients = await getDb().execute<{ count: number }>(
      sql`select count(*)::int as count from clients`,
    );
    expect(clients.rows[0]!.count).toBe(0);
    expect(await counts()).toMatchObject({ events: 0, windows: 0 });
  });

  // conversation.resolved por el mismo endpoint (brief-12.2, D-1, D-5 y C-2).
  const inbound = fixture("valid-conversation-resolved.json")
    .payload as unknown as {
    event_id: string;
    conversation: { external_ref: string; client_phone: string };
    message: { body_text: string };
  };

  async function clientOf(organizationId: string, phone: string) {
    await getDb().execute(
      sql`insert into clients (organization_id, display_name, phone_e164)
          values (${organizationId}, ${"Cliente"}, ${phone})`,
    );
  }

  it("19. FR-API-05: conversation.resolved responde 200 con la referencia y el estado, sin id, teléfono ni texto, también al reenvío", async () => {
    await clientOf(orgA, inbound.conversation.client_phone);
    const first = await send(emitterA.token, inbound);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const body = await first.json();
    expect(body).toStrictEqual({
      contract_version: "1",
      event_id: inbound.event_id,
      result: "accepted",
      conversation: {
        external_ref: inbound.conversation.external_ref,
        status: "open",
      },
    });
    for (const secret of [
      inbound.conversation.client_phone,
      inbound.message.body_text,
    ]) {
      expect(JSON.stringify(body)).not.toContain(secret);
    }

    const again = await send(emitterA.token, inbound);
    expect(again.status).toBe(200);
    expect(await again.json()).toStrictEqual({ ...body, result: "duplicate" });
    expect(await counts()).toMatchObject({ conversations: 1, messages: 1 });
  });

  it("20. FR-API-05: un teléfono sin cliente responde 422 con la regla, con cuerpo, y el reenvío responde lo mismo", async () => {
    const first = await send(emitterA.token, inbound);
    expect(first.status).toBe(422);
    const body = await first.json();
    expect(body).toStrictEqual({
      code: "BUSINESS_RULE_VIOLATION",
      request_id: expect.any(String),
      rule: "client_not_found",
    });
    const again = await send(emitterA.token, inbound);
    expect(again.status).toBe(422);
    expect(await again.json()).toMatchObject({ rule: "client_not_found" });
    expect(await eventsOf(orgA)).toEqual([
      {
        source: "emisor-a",
        external_ref: inbound.event_id,
        status: "failed",
        error_code: "BUSINESS_RULE_VIOLATION",
      },
    ]);
    expect(await counts()).toMatchObject({ conversations: 0, messages: 0 });
  });

  it("21. FR-API-05: conversation.resolved pasa por la misma cadena: apagado, credencial, lectura, allowlist y límite compartido", async () => {
    await clientOf(orgA, inbound.conversation.client_phone);
    process.env.INGESTION_ENABLED = "false";
    const off = await send(emitterA.token, inbound);
    expect(off.status).toBe(404);
    expect(await off.text()).toBe("");

    const reader = await createIngestionCredential(orgA, "emisor-a", "read");
    if (!reader.ok) throw new Error("credencial inválida");
    allow(emitterA, { id: reader.credentialId, token: reader.token });
    expect((await post(null, JSON.stringify(inbound))).status).toBe(401);
    expect((await send(reader.token, inbound)).status).toBe(403);
    expect((await send(emitterA2.token, inbound)).status).toBe(403);
    expect(await counts()).toMatchObject(NOTHING_WRITTEN);

    for (let index = 0; index < INGESTION_RATE_LIMIT - 1; index += 1) {
      await send(
        emitterA.token,
        event((p) => (p.event_id = `evt-limite-${index}`)),
      );
    }
    expect((await send(emitterA.token, inbound)).status).toBe(200);
    const limited = await send(emitterA.token, {
      ...inbound,
      event_id: "evt-conv-limitado",
    });
    expect(limited.status).toBe(429);
    expect(
      (await eventsOf(orgA)).filter((e) =>
        e.external_ref.startsWith("evt-conv"),
      ),
    ).toHaveLength(1);
  });

  it("22. FR-API-05: el log de conversation.resolved no lleva el teléfono ni el texto", async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.join(" "));
    const spies: MockInstance[] = [
      vi.spyOn(console, "log").mockImplementation(capture),
      vi.spyOn(console, "error").mockImplementation(capture),
      vi.spyOn(console, "warn").mockImplementation(capture),
    ];
    await send(emitterA.token, inbound);
    await clientOf(orgA, inbound.conversation.client_phone);
    await send(emitterA.token, { ...inbound, event_id: "evt-conv-ok" });
    for (const spy of spies) spy.mockRestore();

    const output = lines.join("\n");
    expect(lines).toHaveLength(2);
    for (const secret of [
      inbound.conversation.client_phone,
      inbound.message.body_text,
      "5491155550001",
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(lines.map((line) => JSON.parse(line).code)).toEqual([
      "BUSINESS_RULE_VIOLATION",
      "OK",
    ]);
  });
});
