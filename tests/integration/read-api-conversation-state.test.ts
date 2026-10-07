import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  afterAll,
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
  conversationStateResponseSchema,
  errorResponseSchema,
} from "@/app/api/read/v1/contract";
import { handleConversationState } from "@/app/api/read/v1/conversation-state/handler";
import { validateSession } from "@/modules/auth";
import {
  createIngestionCredential,
  INGESTION_RATE_LIMIT,
  revokeIngestionCredential,
} from "@/modules/ingestion";
import { getDb } from "@/shared/db";
import { resetDatabase } from "./reset-database";

// Marca de pausa de la API de lectura v1 contra PostgreSQL real (brief-16.3, D-3; FR-CONV-06): la
// marca y su hora; el alcance `context`; el mismo 404 para ajena e inexistente; el borde; el log
// sin la referencia; y que no escribe. Los requests son sintéticos: nada de esto es evidencia de
// integración con el agente.

const BASE = "http://localhost/api/read/v1";
const NOW = new Date("2026-10-07T15:00:00.000Z");
const PAUSED_AT = "2026-10-07T14:31:07.123Z";
const TEST_TIMEOUT = 30000;
const SOURCE = "agente-whatsapp";

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

function state(
  params: Record<string, string>,
  token: string | null,
  options: { headers?: Record<string, string> } = {},
) {
  const query = new URLSearchParams(params).toString();
  return handleConversationState(
    new Request(
      `${BASE}/conversation-state${query === "" ? "" : `?${query}`}`,
      {
        headers: {
          ...(token === null ? {} : { authorization: `Bearer ${token}` }),
          ...options.headers,
        },
      },
    ),
    NOW,
  );
}

// Toda respuesta de éxito pasa el validador estricto del contrato (AC-6).
async function valid(
  response: Response,
): Promise<z.infer<typeof conversationStateResponseSchema>> {
  expect(response.status).toBe(200);
  const parsed = conversationStateResponseSchema.safeParse(
    await response.json(),
  );
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
  externalRef: string,
  options: {
    status?: "open" | "pending" | "closed";
    pausedAt?: string | null;
  } = {},
): Promise<string> {
  const result = await getDb().execute<{ id: string }>(
    sql`insert into conversations
          (organization_id, channel, external_ref, status, started_at, agent_paused_at)
        values (${organizationId}, 'whatsapp', ${externalRef}, ${options.status ?? "open"},
          '2026-10-07T10:00:00Z', ${options.pausedAt ?? null})
        returning id`,
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
          (select string_agg(id::text || status::text || coalesce(agent_paused_at::text, ''), ',' order by id)
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

beforeEach(async () => {
  await resetDatabase(getDb());
  orgA = await createOrganization("Organización A");
  orgB = await createOrganization("Organización B");
  await conversation(orgA, "conv-pausada", { pausedAt: PAUSED_AT });
  await conversation(orgA, "conv-activa");
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

afterAll(async () => {
  await getDb().$client.end();
});

describe("API de lectura: marca de pausa", { timeout: TEST_TIMEOUT }, () => {
  it("1. FR-CONV-06: devuelve la marca y su hora, o activa con null, y no escribe nada", async () => {
    const before = await writes();
    expect(
      await valid(
        await state({ conversation_ref: "conv-pausada" }, contextA.token),
      ),
    ).toStrictEqual({
      contract_version: "1",
      agent_paused: true,
      agent_paused_at: PAUSED_AT,
    });
    expect(
      await valid(
        await state({ conversation_ref: "conv-activa" }, contextA.token),
      ),
    ).toStrictEqual({
      contract_version: "1",
      agent_paused: false,
      agent_paused_at: null,
    });
    expect(await writes()).toEqual(before);
  });

  it("2. FR-CONV-06: la marca no depende del estado: una pending activa, una pending pausada y una cerrada se leen", async () => {
    await conversation(orgA, "conv-derivada", { status: "pending" });
    await conversation(orgA, "conv-derivada-pausada", {
      status: "pending",
      pausedAt: PAUSED_AT,
    });
    await conversation(orgA, "conv-cerrada", {
      status: "closed",
      pausedAt: PAUSED_AT,
    });
    const read = async (ref: string) =>
      (await valid(await state({ conversation_ref: ref }, contextA.token)))
        .agent_paused;
    expect(await read("conv-derivada")).toBe(false);
    expect(await read("conv-derivada-pausada")).toBe(true);
    expect(await read("conv-cerrada")).toBe(true);
  });

  it("3. FR-CONV-06: una conversación de otra organización da el mismo 404 que una inexistente; con la misma referencia, cada una lee la suya", async () => {
    await conversation(orgB, "conv-de-b", { pausedAt: PAUSED_AT });
    const ajena = await rejected(
      await state({ conversation_ref: "conv-de-b" }, contextA.token),
      404,
    );
    const inexistente = await rejected(
      await state({ conversation_ref: "conv-inexistente" }, contextA.token),
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

    await conversation(orgB, "conv-activa", { pausedAt: PAUSED_AT });
    expect(
      (
        await valid(
          await state({ conversation_ref: "conv-activa" }, contextA.token),
        )
      ).agent_paused,
    ).toBe(false);
    expect(
      (
        await valid(
          await state({ conversation_ref: "conv-activa" }, contextB.token),
        )
      ).agent_paused,
    ).toBe(true);
  });

  it("4. FR-CONV-06: solo una credencial context la lee; sin credencial o con un token desconocido, 401", async () => {
    for (const other of [readerA, ingestA]) {
      expect(
        (
          await rejected(
            await state({ conversation_ref: "conv-pausada" }, other.token),
            403,
          )
        ).code,
      ).toBe("FORBIDDEN");
    }
    // Revocada, o fuera de la allowlist: 403. Ninguno de estos rechazos consume el límite.
    const otra = await credential(orgA, "context", "otro-emisor");
    await rejected(
      await state({ conversation_ref: "conv-pausada" }, otra.token),
      403,
    );
    expect(await revokeIngestionCredential(contextA.id)).toBe(true);
    await rejected(
      await state({ conversation_ref: "conv-pausada" }, contextA.token),
      403,
    );
    expect(await rateWindows()).toBe(0);

    const unauthenticated = await state(
      { conversation_ref: "conv-pausada" },
      null,
    );
    await rejected(unauthenticated, 401);
    expect(unauthenticated.headers.get("www-authenticate")).toBe("Bearer");
    await rejected(
      await state(
        { conversation_ref: "conv-pausada" },
        `crm_ctx_${"a".repeat(43)}`,
      ),
      401,
    );
  });

  it("5. FR-CONV-06: tiene el borde de la lectura: apagada, límite compartido con Retry-After y correlación", async () => {
    process.env.READ_API_ENABLED = "false";
    const off = await state(
      { conversation_ref: "conv-pausada" },
      contextA.token,
    );
    expect(off.status).toBe(404);
    expect(await off.text()).toBe("");
    expect(off.headers.get("cache-control")).toBe("no-store");

    allow(contextA, contextB);
    for (let i = 0; i < INGESTION_RATE_LIMIT; i++) {
      await valid(
        await state({ conversation_ref: "conv-pausada" }, contextA.token),
      );
    }
    const limited = await state(
      { conversation_ref: "conv-pausada" },
      contextA.token,
    );
    expect((await rejected(limited, 429)).code).toBe("RATE_LIMITED");
    expect(limited.headers.get("retry-after")).toBe("60");

    const correlated = await state(
      { conversation_ref: "conv-de-nadie" },
      contextB.token,
      { headers: { "x-correlation-id": "turno-0007" } },
    );
    expect(correlated.status).toBe(404);
    expect(correlated.headers.get("x-correlation-id")).toBe("turno-0007");
    expect(correlated.headers.get("cache-control")).toBe("no-store");
    expect(correlated.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("6. FR-CONV-06: valida conversation_ref con 400 y su campo", async () => {
    const cases: Record<string, string>[] = [
      {},
      { conversation_ref: "" },
      { conversation_ref: " conv-pausada" },
      { conversation_ref: "conv\u0001pausada" },
      { conversation_ref: "conv\u0000pausada" },
      { conversation_ref: "a".repeat(201) },
    ];
    for (const params of cases) {
      expect(
        await rejected(await state(params, contextA.token), 400),
        JSON.stringify(params),
      ).toMatchObject({
        code: "VALIDATION_ERROR",
        fields: ["conversation_ref"],
      });
    }
  });

  it("7. FR-CONV-06: el log lleva la ruta fija y la correlación, nunca la referencia ni el token", async () => {
    await conversation(orgA, "conv-5491155550099-privada", {
      pausedAt: PAUSED_AT,
    });
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.join(" "));
    const spies: MockInstance[] = [
      vi.spyOn(console, "log").mockImplementation(capture),
      vi.spyOn(console, "error").mockImplementation(capture),
      vi.spyOn(console, "warn").mockImplementation(capture),
    ];

    await valid(
      await state(
        { conversation_ref: "conv-5491155550099-privada" },
        contextA.token,
        { headers: { "x-correlation-id": "turno-0042" } },
      ),
    );
    await state({ conversation_ref: " conv-5491155550099" }, contextA.token);
    await state(
      { conversation_ref: "conv-5491155550099-otra" },
      contextA.token,
    );
    await state(
      { conversation_ref: "conv-5491155550099-privada" },
      readerA.token,
    );
    await state(
      { conversation_ref: "conv-5491155550099-privada" },
      `crm_ctx_${"a".repeat(43)}`,
    );
    for (const spy of spies) spy.mockRestore();

    const output = lines.join("\n");
    for (const hidden of [
      "5491155550099",
      "privada",
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
      ["/api/read/v1/conversation-state", "OK", "turno-0042"],
      ["/api/read/v1/conversation-state", "VALIDATION_ERROR", null],
      ["/api/read/v1/conversation-state", "NOT_FOUND", null],
      ["/api/read/v1/conversation-state", "FORBIDDEN", null],
      ["/api/read/v1/conversation-state", "UNAUTHENTICATED", null],
    ]);
    expect(events[0]).toMatchObject({
      level: "info",
      organization_id: orgA,
      source: SOURCE,
      request_id: expect.any(String),
    });
  });

  it("8. FR-CONV-06: una sesión válida del CRM no autentica la ruta", async () => {
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
      const response = await state({ conversation_ref: "conv-pausada" }, null, {
        headers: { cookie },
      });
      expect((await rejected(response, 401)).code).toBe("UNAUTHENTICATED");
    }
  });
});
