import { createHash, randomBytes } from "node:crypto";
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
import type { z } from "zod";
import {
  errorResponseSchema,
  messageListResponseSchema,
} from "@/app/api/read/v1/contract";
import { handleIngestionEventV2 } from "@/app/api/ingestion/v2/events/handler";
import { handleKnowledgeList } from "@/app/api/read/v1/knowledge/handler";
import { handleMessageHistory } from "@/app/api/read/v1/messages/handler";
import { handleProductSearch } from "@/app/api/read/v1/products/handler";
import { validateSession } from "@/modules/auth";
import {
  createIngestionCredential,
  INGESTION_RATE_LIMIT,
  revokeIngestionCredential,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Historial de la API de lectura v1 contra PostgreSQL real (brief-12.4; FR-API-08): los últimos N
// mensajes de una conversación, en orden cronológico; el alcance `context`; el aislamiento; el
// borde; el log sin la referencia ni el texto; y el plan de la consulta. Los requests son
// sintéticos: nada de esto es evidencia de integración con el agente.

const BASE = "http://localhost/api/read/v1";
const NOW = new Date("2026-09-26T15:00:00.000Z");
const TEST_TIMEOUT = 30000;
const SOURCE = "agente-whatsapp";
const START = Date.parse("2026-09-26T10:00:00.000Z");

type Credential = { id: string; token: string };

async function credential(
  organizationId: string,
  scope: "ingest" | "read" | "context",
  source = SOURCE,
): Promise<Credential> {
  const created = await createIngestionCredential(
    organizationId,
    source,
    scope,
  );
  if (!created.ok) throw new Error("credencial inválida");
  return { id: created.credentialId, token: created.token };
}

function history(
  params: Record<string, string>,
  token: string | null,
  options: { headers?: Record<string, string>; now?: Date } = {},
) {
  const query = new URLSearchParams(params).toString();
  return handleMessageHistory(
    new Request(`${BASE}/messages${query === "" ? "" : `?${query}`}`, {
      headers: {
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    }),
    options.now ?? NOW,
  );
}

// Toda respuesta de éxito pasa el validador estricto del contrato (AC-4).
async function valid(
  response: Response,
): Promise<z.infer<typeof messageListResponseSchema>> {
  expect(response.status).toBe(200);
  const parsed = messageListResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`respuesta fuera del contrato: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function rejected(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(errorResponseSchema.safeParse(body).success).toBe(true);
  return body as { code: string; request_id: string; fields?: string[] };
}

async function createOrganization(name: string) {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into organizations (name) values (${name}) returning id`,
  );
  return result.rows[0]!.id;
}

async function conversation(
  organizationId: string,
  externalRef: string | null,
  status: "open" | "pending" | "closed" = "open",
): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations (organization_id, channel, external_ref, status, started_at)
        values (${organizationId}, 'whatsapp', ${externalRef}, ${status},
          ${new Date(START).toISOString()}) returning id`,
  );
  return result.rows[0]!.id;
}

type MessageSeed = {
  minute: number;
  direction?: "inbound" | "outbound";
  externalRef?: string | null;
  body?: string | null;
  kind?: string | null;
  sentBy?: "agent" | "person" | null;
  // Hora exacta, para empates y milisegundos.
  sentAt?: string;
};

async function message(
  organizationId: string,
  conversationId: string,
  seed: MessageSeed,
): Promise<string> {
  const sentAt =
    seed.sentAt ?? new Date(START + seed.minute * 60_000).toISOString();
  const result = await getDb().execute<{ id: string }>(
    sql`insert into messages (organization_id, conversation_id, direction, external_ref,
          sent_at, body_text, kind, sent_by)
        values (${organizationId}, ${conversationId}, ${seed.direction ?? "inbound"},
          ${seed.externalRef === undefined ? `msg-${seed.minute}` : seed.externalRef},
          ${sentAt}, ${seed.body === undefined ? `Mensaje ${seed.minute}` : seed.body},
          ${seed.kind ?? null}::message_kind, ${seed.sentBy ?? null}::message_sender)
        returning id`,
  );
  await getDb().execute(
    sql`update conversations set last_message_at = greatest(last_message_at, ${sentAt}::timestamptz)
        where id = ${conversationId}`,
  );
  return result.rows[0]!.id;
}

async function rateWindows() {
  const result = await getDb().execute<{ total: number }>(
    sql`select coalesce(sum(request_count), 0)::int as total from ingestion_rate_windows`,
  );
  return result.rows[0]!.total;
}

async function writes() {
  const result = await getDb().execute<{
    audit: number;
    events: number;
    messages: number;
    conversations: string;
  }>(
    sql`select (select count(*) from audit_logs)::int as audit,
          (select count(*) from ingestion_events)::int as events,
          (select count(*) from messages)::int as messages,
          (select string_agg(id::text || status::text || coalesce(last_message_at::text, ''), ',' order by id)
            from conversations) as conversations`,
  );
  return result.rows[0]!;
}

function allow(...credentials: Credential[]) {
  process.env.READ_API_ENABLED = "true";
  process.env.READ_API_ALLOWED_CREDENTIALS = credentials
    .map((c) => c.id)
    .join(",");
}

const savedEnv = {
  enabled: process.env.READ_API_ENABLED,
  allowed: process.env.READ_API_ALLOWED_CREDENTIALS,
};

let orgA: string;
let orgB: string;
let contextA: Credential;
let contextB: Credential;
let readerA: Credential;
let ingestA: Credential;
// 30 mensajes, uno por minuto: msg-1 a msg-30.
let largaA: string;

beforeEach(async () => {
  await resetDatabase(getDb());
  orgA = await createOrganization("Organización A");
  orgB = await createOrganization("Organización B");
  largaA = await conversation(orgA, "conv-larga");
  for (let minute = 1; minute <= 30; minute++) {
    await message(orgA, largaA, {
      minute,
      direction: minute % 2 === 0 ? "outbound" : "inbound",
    });
  }
  contextA = await credential(orgA, "context");
  contextB = await credential(orgB, "context");
  readerA = await credential(orgA, "read");
  ingestA = await credential(orgA, "ingest");
  allow(contextA, contextB, readerA, ingestA);
});

afterEach(() => {
  for (const [key, value] of [
    ["READ_API_ENABLED", savedEnv.enabled],
    ["READ_API_ALLOWED_CREDENTIALS", savedEnv.allowed],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

const refs = (body: z.infer<typeof messageListResponseSchema>) =>
  body.items.map((item) => item.external_ref);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `msg-${from + i}`);

describe("API de lectura: historial", { timeout: TEST_TIMEOUT }, () => {
  it("1. FR-API-08: trae los últimos N en orden cronológico, nunca los primeros, y no escribe nada", async () => {
    const before = await writes();

    const twenty = await valid(
      await history(
        { conversation_ref: "conv-larga", limit: "20" },
        contextA.token,
      ),
    );
    expect(refs(twenty)).toEqual(range(11, 30));

    const byDefault = await valid(
      await history({ conversation_ref: "conv-larga" }, contextA.token),
    );
    expect(refs(byDefault)).toEqual(range(11, 30));

    const all = await valid(
      await history(
        { conversation_ref: "conv-larga", limit: "50" },
        contextA.token,
      ),
    );
    expect(refs(all)).toEqual(range(1, 30));

    const one = await valid(
      await history(
        { conversation_ref: "conv-larga", limit: "1" },
        contextA.token,
      ),
    );
    expect(refs(one)).toEqual(["msg-30"]);

    expect(await writes()).toEqual(before);
  });

  it("2. FR-API-08: ordena por la hora del mensaje, no por la de inserción, y desempata por id de forma estable", async () => {
    const conv = await conversation(orgA, "conv-desordenada");
    await message(orgA, conv, { minute: 10, externalRef: "diez" });
    await message(orgA, conv, { minute: 30, externalRef: "treinta" });
    // Llega después, pero se mandó antes.
    await message(orgA, conv, { minute: 20, externalRef: "veinte" });
    const tie = "2026-09-26T10:40:00.123Z";
    const ids = [
      await message(orgA, conv, {
        minute: 40,
        sentAt: tie,
        externalRef: "empate-1",
      }),
      await message(orgA, conv, {
        minute: 40,
        sentAt: tie,
        externalRef: "empate-2",
      }),
      await message(orgA, conv, {
        minute: 40,
        sentAt: tie,
        externalRef: "empate-3",
      }),
    ];
    const tied = [
      ["empate-1", ids[0]!],
      ["empate-2", ids[1]!],
      ["empate-3", ids[2]!],
    ]
      .sort(([, a], [, b]) => (a! < b! ? -1 : 1))
      .map(([ref]) => ref);

    const first = await valid(
      await history({ conversation_ref: "conv-desordenada" }, contextA.token),
    );
    expect(refs(first)).toEqual(["diez", "veinte", "treinta", ...tied]);
    expect(first.items.at(-1)?.sent_at).toBe(tie);

    // Con un límite que corta el empate, entran los de id mayor, y el resultado se repite.
    for (let i = 0; i < 3; i++) {
      const cut = await valid(
        await history(
          { conversation_ref: "conv-desordenada", limit: "2" },
          contextA.token,
        ),
      );
      expect(refs(cut)).toEqual(tied.slice(1));
    }
  });

  it("3. FR-API-08: cada mensaje trae su dirección, tipo y autor; los de v1 salen sin dato, nunca inventado", async () => {
    const conv = await conversation(orgA, "conv-turno");
    await message(orgA, conv, {
      minute: 1,
      externalRef: "v1-entrada",
      body: "Hola",
    });
    await message(orgA, conv, {
      minute: 2,
      direction: "outbound",
      externalRef: "v1-salida",
      body: "Buen día",
    });
    await message(orgA, conv, {
      minute: 3,
      externalRef: "v2-audio",
      body: "Hola, ¿tienen stock?",
      kind: "audio",
    });
    await message(orgA, conv, {
      minute: 4,
      direction: "outbound",
      externalRef: "v2-agente",
      body: "Sí, tenemos stock.",
      kind: "text",
      sentBy: "agent",
    });
    await message(orgA, conv, {
      minute: 5,
      direction: "outbound",
      externalRef: null,
      body: null,
      kind: "image",
      sentBy: "person",
    });

    const body = await valid(
      await history({ conversation_ref: "conv-turno" }, contextA.token),
    );
    expect(body).toStrictEqual({
      contract_version: "1",
      items: [
        {
          external_ref: "v1-entrada",
          direction: "inbound",
          kind: null,
          sent_by: null,
          sent_at: "2026-09-26T10:01:00.000Z",
          body_text: "Hola",
        },
        {
          external_ref: "v1-salida",
          direction: "outbound",
          kind: null,
          sent_by: null,
          sent_at: "2026-09-26T10:02:00.000Z",
          body_text: "Buen día",
        },
        {
          external_ref: "v2-audio",
          direction: "inbound",
          kind: "audio",
          sent_by: null,
          sent_at: "2026-09-26T10:03:00.000Z",
          body_text: "Hola, ¿tienen stock?",
        },
        {
          external_ref: "v2-agente",
          direction: "outbound",
          kind: "text",
          sent_by: "agent",
          sent_at: "2026-09-26T10:04:00.000Z",
          body_text: "Sí, tenemos stock.",
        },
        {
          external_ref: null,
          direction: "outbound",
          kind: "image",
          sent_by: "person",
          sent_at: "2026-09-26T10:05:00.000Z",
          body_text: null,
        },
      ],
    });
  });

  it("4. FR-API-08: una conversación de otra organización da el mismo 404 que una inexistente; una cerrada o vacía se lee", async () => {
    // Solo en B: la referencia existe, pero no para la credencial de A.
    const soloB = await conversation(orgB, "conv-de-b");
    await message(orgB, soloB, { minute: 1, body: "Secreto de B" });
    const ajena = await rejected(
      await history({ conversation_ref: "conv-de-b" }, contextA.token),
      404,
    );
    const inexistente = await rejected(
      await history({ conversation_ref: "conv-inexistente" }, contextA.token),
      404,
    );
    expect({ ...ajena, request_id: null }).toStrictEqual({
      code: "NOT_FOUND",
      request_id: null,
    });
    expect({ ...inexistente, request_id: null }).toStrictEqual({
      ...ajena,
      request_id: null,
    });

    // La misma referencia en las dos organizaciones: cada una lee la suya.
    const compartidaA = await conversation(orgA, "conv-compartida");
    const compartidaB = await conversation(orgB, "conv-compartida");
    await message(orgA, compartidaA, { minute: 1, externalRef: "de-a" });
    await message(orgB, compartidaB, { minute: 1, externalRef: "de-b" });
    expect(
      refs(
        await valid(
          await history(
            { conversation_ref: "conv-compartida" },
            contextA.token,
          ),
        ),
      ),
    ).toEqual(["de-a"]);
    expect(
      refs(
        await valid(
          await history(
            { conversation_ref: "conv-compartida" },
            contextB.token,
          ),
        ),
      ),
    ).toEqual(["de-b"]);

    const cerrada = await conversation(orgA, "conv-cerrada", "closed");
    await message(orgA, cerrada, { minute: 1, externalRef: "antes-de-cerrar" });
    expect(
      refs(
        await valid(
          await history({ conversation_ref: "conv-cerrada" }, contextA.token),
        ),
      ),
    ).toEqual(["antes-de-cerrar"]);

    await conversation(orgA, "conv-vacia");
    expect(
      (
        await valid(
          await history({ conversation_ref: "conv-vacia" }, contextA.token),
        )
      ).items,
    ).toEqual([]);
  });

  it("5. FR-API-08: solo una credencial context lee el historial, y una context no lee otra superficie", async () => {
    for (const other of [readerA, ingestA]) {
      expect(
        (
          await rejected(
            await history({ conversation_ref: "conv-larga" }, other.token),
            403,
          )
        ).code,
      ).toBe("FORBIDDEN");
    }
    const products = await handleProductSearch(
      new Request(`${BASE}/products?q=auriculares`, {
        headers: { authorization: `Bearer ${contextA.token}` },
      }),
      NOW,
    );
    expect((await rejected(products, 403)).code).toBe("FORBIDDEN");
    const knowledge = await handleKnowledgeList(
      new Request(`${BASE}/knowledge`, {
        headers: { authorization: `Bearer ${contextA.token}` },
      }),
      NOW,
    );
    expect((await rejected(knowledge, 403)).code).toBe("FORBIDDEN");

    // Revocada, o fuera de la allowlist: 403. Ninguno de estos rechazos consume el límite.
    const otra = await credential(orgA, "context", "otro-emisor");
    await rejected(
      await history({ conversation_ref: "conv-larga" }, otra.token),
      403,
    );
    expect(await revokeIngestionCredential(contextA.id)).toBe(true);
    await rejected(
      await history({ conversation_ref: "conv-larga" }, contextA.token),
      403,
    );
    expect(await rateWindows()).toBe(0);

    // Sin credencial, o con un token desconocido: 401.
    const unauthenticated = await history(
      { conversation_ref: "conv-larga" },
      null,
    );
    await rejected(unauthenticated, 401);
    expect(unauthenticated.headers.get("www-authenticate")).toBe("Bearer");
    await rejected(
      await history(
        { conversation_ref: "conv-larga" },
        `crm_ctx_${"a".repeat(43)}`,
      ),
      401,
    );
  });

  it("6. FR-API-08: tiene el borde de la lectura: apagada, límite con Retry-After, encabezados y correlación", async () => {
    process.env.READ_API_ENABLED = "false";
    const off = await history(
      { conversation_ref: "conv-larga" },
      contextA.token,
    );
    expect(off.status).toBe(404);
    expect(await off.text()).toBe("");
    expect(off.headers.get("cache-control")).toBe("no-store");

    allow(contextA, contextB);
    for (let i = 0; i < INGESTION_RATE_LIMIT; i++) {
      await valid(
        await history({ conversation_ref: "conv-larga" }, contextA.token),
      );
    }
    const limited = await history(
      { conversation_ref: "conv-larga" },
      contextA.token,
    );
    expect((await rejected(limited, 429)).code).toBe("RATE_LIMITED");
    expect(limited.headers.get("retry-after")).toBe("60");
    // Otra credencial tiene su propio presupuesto.
    await rejected(
      await history({ conversation_ref: "conv-de-nadie" }, contextB.token),
      404,
    );

    const correlated = await history(
      { conversation_ref: "conv-larga" },
      contextB.token,
      { headers: { "x-correlation-id": "turno-0007" } },
    );
    expect(correlated.status).toBe(404);
    expect(correlated.headers.get("x-correlation-id")).toBe("turno-0007");
    expect(correlated.headers.get("cache-control")).toBe("no-store");
    expect(correlated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("7. FR-API-08: valida conversation_ref y limit con 400 y sus campos", async () => {
    const cases: [Record<string, string>, string[]][] = [
      [{}, ["conversation_ref"]],
      [{ conversation_ref: "" }, ["conversation_ref"]],
      [{ conversation_ref: " conv-larga" }, ["conversation_ref"]],
      [{ conversation_ref: "conv\u0001larga" }, ["conversation_ref"]],
      [{ conversation_ref: "conv\u0000larga" }, ["conversation_ref"]],
      [{ conversation_ref: "a".repeat(201) }, ["conversation_ref"]],
      [{ conversation_ref: "conv-larga", limit: "0" }, ["limit"]],
      [{ conversation_ref: "conv-larga", limit: "51" }, ["limit"]],
      [{ conversation_ref: "conv-larga", limit: "+5" }, ["limit"]],
      [{ conversation_ref: "conv-larga", limit: "05" }, ["limit"]],
      [{ conversation_ref: "conv-larga", limit: "abc" }, ["limit"]],
      [{ limit: "abc" }, ["conversation_ref", "limit"]],
    ];
    for (const [params, fields] of cases) {
      const body = await rejected(await history(params, contextA.token), 400);
      expect(body, JSON.stringify(params)).toMatchObject({
        code: "VALIDATION_ERROR",
        fields,
      });
    }
  });

  it("8. FR-API-08: el log lleva la ruta fija y la correlación, nunca la referencia, el texto ni el token", async () => {
    const conv = await conversation(orgA, "conv-5491155550099-privada");
    await message(orgA, conv, {
      minute: 1,
      body: "Mi dirección es Calle Falsa 123",
    });
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.join(" "));
    const spies: MockInstance[] = [
      vi.spyOn(console, "log").mockImplementation(capture),
      vi.spyOn(console, "error").mockImplementation(capture),
      vi.spyOn(console, "warn").mockImplementation(capture),
    ];
    const correlation = { "x-correlation-id": "turno-0042" };

    await valid(
      await history(
        { conversation_ref: "conv-5491155550099-privada", limit: "7" },
        contextA.token,
        { headers: correlation },
      ),
    );
    await history(
      { conversation_ref: "conv-5491155550099-privada", limit: "99" },
      contextA.token,
    );
    await history(
      { conversation_ref: "conv-5491155550099-otra" },
      contextA.token,
    );
    await history(
      { conversation_ref: "conv-5491155550099-privada" },
      readerA.token,
    );
    await history(
      { conversation_ref: "conv-5491155550099-privada" },
      `crm_ctx_${"a".repeat(43)}`,
    );
    for (const spy of spies) spy.mockRestore();

    const output = lines.join("\n");
    for (const hidden of [
      "5491155550099",
      "privada",
      "Calle Falsa",
      "msg-1",
      contextA.token.slice("crm_ctx_".length),
      readerA.token.slice("crm_read_".length),
      "a".repeat(43),
    ]) {
      expect(output).not.toContain(hidden);
    }
    const events = lines.map((line) => JSON.parse(line));
    expect(
      events.map((e) => [e.route, e.code, e.correlation_id ?? null]),
    ).toEqual([
      ["/api/read/v1/messages", "OK", "turno-0042"],
      ["/api/read/v1/messages", "VALIDATION_ERROR", null],
      ["/api/read/v1/messages", "NOT_FOUND", null],
      ["/api/read/v1/messages", "FORBIDDEN", null],
      ["/api/read/v1/messages", "UNAUTHENTICATED", null],
    ]);
    expect(events[0]).toMatchObject({
      level: "info",
      organization_id: orgA,
      source: SOURCE,
      duration_ms: expect.any(Number),
      request_id: expect.any(String),
    });
    expect(events[0]).not.toHaveProperty("limit");
  });

  it("9. FR-API-08: un error inesperado responde 500 sin detalles y queda en el log", async () => {
    const client = getDb().$client;
    const original = client.query.bind(client) as (
      ...args: unknown[]
    ) => unknown;
    vi.spyOn(client, "query").mockImplementation(((...args: unknown[]) => {
      const [first] = args;
      const text =
        typeof first === "string" ? first : (first as { text: string }).text;
      // La falla va en la consulta que lleva la referencia como parámetro, y el mensaje del error
      // la repite, como un error de driver que cita sus parámetros: si el log empezara a
      // registrar mensajes o parámetros, la aserción de abajo fallaría (revisión independiente,
      // R-6).
      return /from "conversations"/.test(text)
        ? Promise.reject(new Error(`falla forzada con ${String(args[1])}`))
        : original(...args);
    }) as never);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await history(
      { conversation_ref: "conv-larga" },
      contextA.token,
    );
    expect(await rejected(response, 500)).toStrictEqual({
      code: "INTERNAL",
      request_id: expect.any(String),
    });
    expect(errors).toHaveBeenCalledTimes(1);
    const logged = String(errors.mock.calls[0]?.[0]);
    expect(JSON.parse(logged)).toMatchObject({
      route: "/api/read/v1/messages",
      code: "INTERNAL",
    });
    expect(logged).not.toContain("conv-larga");
    expect(logged).not.toContain("falla forzada");
  });
});

describe("alcance context (brief-12.4, D-6)", { timeout: TEST_TIMEOUT }, () => {
  it("11. FR-API-08: se crea una credencial context con su prefijo, y el CHECK sigue rechazando un alcance desconocido", async () => {
    const created = await createIngestionCredential(orgA, "agente", "context");
    if (!created.ok) throw new Error("credencial inválida");
    expect(created.token).toMatch(/^crm_ctx_[A-Za-z0-9_-]{43}$/);
    const stored = await getDb().execute<{ scope: string; token_hash: string }>(
      sql`select scope, token_hash from ingestion_credentials where id = ${created.credentialId}`,
    );
    expect(stored.rows[0]?.scope).toBe("context");
    // Solo el hash: el token no se guarda.
    expect(stored.rows[0]?.token_hash).not.toContain(
      created.token.slice("crm_ctx_".length),
    );

    for (const scope of ["write", "CONTEXT", "ctx", ""]) {
      await expect(
        getDb().execute(
          sql`insert into ingestion_credentials (organization_id, source, scope, token_hash)
              values (${orgA}, 'x', ${scope}, ${`hash-${scope}`})`,
        ),
        scope,
      ).rejects.toMatchObject({
        cause: { constraint: "ingestion_credentials_scope_valid" },
      });
    }
  });
});

describe(
  "alcance context: sesión y escritura (revisión independiente, R-5)",
  { timeout: TEST_TIMEOUT },
  () => {
    it("12. FR-API-08: una sesión válida del CRM no autentica el historial", async () => {
      const user = await getDb().execute<{ id: string }>(
        sql`insert into users (email, password_hash, name)
            values ('admin-a@example.com', 'x', 'Admin') returning id`,
      );
      await getDb().execute(
        sql`insert into organization_members (organization_id, user_id, role)
            values (${orgA}, ${user.rows[0]!.id}, 'admin')`,
      );
      const token = randomBytes(32).toString("base64url");
      await getDb().execute(
        sql`insert into sessions (id, user_id, expires_at)
            values (${createHash("sha256").update(token).digest("hex")}, ${user.rows[0]!.id},
              now() + interval '1 hour')`,
      );
      expect(await validateSession(token)).not.toBeNull();
      for (const cookie of [
        `crm_session=${token}`,
        `__Host-crm_session=${token}`,
      ]) {
        const response = await history(
          { conversation_ref: "conv-larga" },
          null,
          {
            headers: { cookie },
          },
        );
        expect((await rejected(response, 401)).code).toBe("UNAUTHENTICATED");
      }
    });

    it("13. FR-API-08: una credencial context no escribe por la ingestión", async () => {
      const saved = {
        enabled: process.env.INGESTION_ENABLED,
        allowed: process.env.INGESTION_ALLOWED_CREDENTIALS,
      };
      process.env.INGESTION_ENABLED = "true";
      process.env.INGESTION_ALLOWED_CREDENTIALS = contextA.id;
      try {
        const before = await writes();
        const response = await handleIngestionEventV2(
          new Request("http://localhost/api/ingestion/v2/events", {
            method: "POST",
            headers: {
              authorization: `Bearer ${contextA.token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              contract_version: "2",
              event_id: "evt-ctx-0001",
              event_type: "client.resolved",
              occurred_at: "2026-09-26T14:59:00.000Z",
              client: { phone: "+5491155550077", display_name: "Prueba" },
            }),
          }),
          NOW,
        );
        expect((await rejected(response, 403)).code).toBe("FORBIDDEN");
        expect(await writes()).toEqual(before);
        expect(await rateWindows()).toBe(0);
      } finally {
        for (const [key, value] of [
          ["INGESTION_ENABLED", saved.enabled],
          ["INGESTION_ALLOWED_CREDENTIALS", saved.allowed],
        ] as const) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });
  },
);

// El plan de la consulta del historial (brief-12.4, AC-9), con el mismo método que
// read-api.test.ts: se captura el SQL que la lectura ejecuta de verdad, con sus parámetros, y se
// le pide el plan a PostgreSQL. Las aserciones van sobre la condición del índice.
async function planOf(
  matches: RegExp,
  run: () => Promise<unknown>,
): Promise<string> {
  const client = getDb().$client;
  const spy = vi.spyOn(client, "query");
  let recorded: unknown[][];
  try {
    await run();
  } finally {
    recorded = spy.mock.calls.map((call) => [...call]);
    spy.mockRestore();
  }
  const calls = recorded.map(([first, second]) => ({
    text: typeof first === "string" ? first : (first as { text: string }).text,
    values: (second as unknown[] | undefined) ?? [],
  }));
  const target = calls.filter((call) => matches.test(call.text));
  expect(target, String(matches)).toHaveLength(1);
  const result = await client.query<{ "QUERY PLAN": string }>(
    `explain ${target[0]!.text}`,
    target[0]!.values,
  );
  return result.rows.map((row) => row["QUERY PLAN"]).join("\n");
}

describe(
  "API de lectura: plan del historial",
  { timeout: TEST_TIMEOUT },
  () => {
    it("10. FR-API-08: los últimos N usan messages_conversation_sent_idx y cortan con LIMIT en SQL", async () => {
      // Con pocas filas el planificador recorre la tabla sin mirar ningún índice. Los datos son
      // sintéticos, con la forma del caso real: 200 conversaciones de 50 mensajes, intercaladas
      // en el tiempo, y la del turno es una más entre ellas.
      //
      // El caso que este test no cubre, a propósito: una conversación con una fracción grande
      // de los mensajes de la organización. Ahí los dos índices cuestan parecido y el
      // planificador puede recorrer messages_organization_sent_idx hacia atrás filtrando por
      // conversación, según la muestra de ANALYZE. Pasó en la primera versión de este test, con
      // una conversación de 5000 mensajes sobre 15 000 (brief-12.4, §Resultados).
      await getDb().execute(
        sql`insert into conversations (organization_id, channel, external_ref, started_at)
          select ${orgA}, 'whatsapp', 'vol-'||g, ${new Date(START).toISOString()}::timestamptz
          from generate_series(1, 200) g`,
      );
      await getDb().execute(
        sql`insert into messages (organization_id, conversation_id, direction, sent_at, body_text)
          select c.organization_id, c.id, 'inbound',
            c.started_at + ((k * 200 + g) || ' seconds')::interval, 'x'
          from (select id, organization_id, started_at,
                  row_number() over (order by id) as g
                from conversations where external_ref like 'vol-%') c,
            generate_series(1, 50) k`,
      );
      await getDb().execute(sql.raw("analyze conversations"));
      await getDb().execute(sql.raw("analyze messages"));

      const plan = await planOf(/from "messages"/, async () =>
        valid(await history({ conversation_ref: "vol-137" }, contextA.token)),
      );
      expect(plan.split("\n")[0]).toMatch(/^Limit/);
      expect(plan).toMatch(/messages_conversation_sent_idx/);
      expect(plan).toMatch(/Index Cond: \(conversation_id = /);
      expect(plan).not.toMatch(/Seq Scan on messages/);
    });
  },
);
