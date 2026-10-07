import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isReadCredentialAllowed, readReadApiConfig } from "./config";
import {
  contractAmount,
  conversationStateResponseSchema,
  errorResponseSchema,
  historyMessageSchema,
  knowledgeEntrySchema,
  knowledgeListResponseSchema,
  MESSAGES_DEFAULT_LIMIT,
  MESSAGES_MAX_LIMIT,
  messageListResponseSchema,
  parseConversationRef,
  parseLimit,
  parseQuery,
  productListResponseSchema,
  productResponseSchema,
  productSchema,
  toContractConversationState,
  toContractHistoryMessage,
} from "./contract";

// Partes puras de la API de lectura v1 (brief-11.3): parámetros, montos, validador y modo de
// prueba. Las respuestas reales se validan en tests/integration/read-api.test.ts.

const CREDENTIAL = "3f1c8a52-7d3e-4b61-9a0f-2c4d5e6f7a8b";

const PRODUCT = {
  product_id: "0b6f3c2e-5a4d-4e8f-9c1b-2a3d4e5f6a7b",
  sku: "AUR-01",
  name: "Auriculares",
  description: null,
  unit: "unidad",
  brand: "Sonora",
  category: "Audio",
  condition: "new",
  price: { amount: "1234.50", currency: "ARS" },
  stock_status: "disponible",
};

describe("q (FR-API-01)", () => {
  it("recorta, exige texto donde es obligatorio y admite ausencia donde no", () => {
    expect(parseQuery("  auriculares  ", { required: true })).toEqual({
      ok: true,
      value: "auriculares",
    });
    for (const raw of [null, "", "   "]) {
      expect(parseQuery(raw, { required: true }), String(raw)).toEqual({
        ok: false,
        field: "q",
      });
      expect(parseQuery(raw, { required: false }), String(raw)).toEqual({
        ok: true,
        value: null,
      });
    }
  });

  it("rechaza más de 200 caracteres, un NUL, otros caracteres de control y un surrogate suelto", () => {
    expect(parseQuery("a".repeat(200), { required: true }).ok).toBe(true);
    for (const raw of [
      "a".repeat(201),
      "auri\u0000culares",
      "auri\nculares",
      "auri\u007fculares",
      "auri\ud800culares",
    ]) {
      expect(parseQuery(raw, { required: true }), JSON.stringify(raw)).toEqual({
        ok: false,
        field: "q",
      });
    }
  });

  it("deja pasar los caracteres de tsquery: el escape es de la búsqueda compartida", () => {
    expect(parseQuery("!pago & 'x' | y:*", { required: true }).ok).toBe(true);
  });
});

describe("limit", () => {
  const range = { defaultLimit: 10, maxLimit: 25 };

  it("usa el valor por defecto sin parámetro y acepta de 1 al máximo", () => {
    expect(parseLimit(null, range)).toEqual({ ok: true, value: 10 });
    expect(parseLimit("1", range)).toEqual({ ok: true, value: 1 });
    expect(parseLimit("25", range)).toEqual({ ok: true, value: 25 });
  });

  it("rechaza cero, el máximo más uno, signos, decimales, ceros de relleno y texto", () => {
    for (const raw of ["", "0", "26", "-1", "+5", "5.0", "05", "1e1", "diez"]) {
      expect(parseLimit(raw, range), raw).toEqual({
        ok: false,
        field: "limit",
      });
    }
  });
});

describe("monto del contrato", () => {
  it("escribe los decimales de la moneda, nunca los de la base", () => {
    expect(contractAmount("1234.50", "ARS")).toBe("1234.50");
    expect(contractAmount("300000.00", "CLP")).toBe("300000");
    expect(contractAmount("5.00", "USD")).toBe("5.00");
  });

  it("falla si una moneda sin decimales trae centavos, en vez de redondear", () => {
    expect(() => contractAmount("300000.50", "CLP")).toThrow();
  });
});

describe("validador estricto (D-8)", () => {
  it("acepta un producto del contrato, con o sin precio", () => {
    expect(productSchema.safeParse(PRODUCT).success).toBe(true);
    expect(productSchema.safeParse({ ...PRODUCT, price: null }).success).toBe(
      true,
    );
  });

  it("rechaza un campo de más, la cantidad en stock y un monto como número", () => {
    for (const product of [
      { ...PRODUCT, is_active: true },
      { ...PRODUCT, quantity_on_hand: "3.000" },
      { ...PRODUCT, price: { amount: 1234.5, currency: "ARS" } },
      { ...PRODUCT, price: { ...PRODUCT.price, id: "x" } },
      { ...PRODUCT, stock_status: "available" },
    ]) {
      expect(
        productSchema.safeParse(product).success,
        JSON.stringify(product),
      ).toBe(false);
    }
    expect(
      productListResponseSchema.safeParse({
        contract_version: "1",
        items: [PRODUCT],
        total: 1,
      }).success,
    ).toBe(false);
  });
});

const ENTRY = {
  entry_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  title: "Horarios",
  category: "Atención",
  content: "De lunes a viernes, de 9 a 18",
  valid_from: null,
  valid_until: "2026-12-31",
};

describe("validador estricto de la información del negocio (FR-API-02)", () => {
  it("acepta una entrada con o sin fechas", () => {
    expect(knowledgeEntrySchema.safeParse(ENTRY).success).toBe(true);
    expect(
      knowledgeEntrySchema.safeParse({
        ...ENTRY,
        valid_from: "2026-01-01",
        valid_until: null,
      }).success,
    ).toBe(true);
  });

  it("rechaza un campo de más, el estado, una fecha con hora y una fecha imposible", () => {
    for (const entry of [
      { ...ENTRY, status: "current" },
      { ...ENTRY, is_active: true },
      { ...ENTRY, valid_until: "2026-12-31T00:00:00Z" },
      { ...ENTRY, valid_until: "2026-02-30" },
      { ...ENTRY, content: "" },
    ]) {
      expect(
        knowledgeEntrySchema.safeParse(entry).success,
        JSON.stringify(entry),
      ).toBe(false);
    }
    expect(
      knowledgeListResponseSchema.safeParse({
        contract_version: "1",
        items: [ENTRY],
        total: 1,
      }).success,
    ).toBe(false);
  });
});

describe("historial (FR-API-08, brief-12.4)", () => {
  const MESSAGE = {
    external_ref: "msg-v2-0002",
    direction: "outbound",
    kind: "text",
    sent_by: "agent",
    sent_at: "2026-09-16T15:00:04.500Z",
    body_text: "Sí, tenemos stock.",
  };

  it("FR-API-08: conversation_ref sigue la regla de las referencias opacas, sin recortar", () => {
    for (const ok of ["conv-1", "a".repeat(200), "wa-conv-3EB0/ÄÖ?&=", "ñ"]) {
      expect(parseConversationRef(ok), ok).toEqual({ ok: true, value: ok });
    }
    for (const bad of [
      null,
      "",
      " conv-1",
      "conv-1 ",
      "conv\u00001",
      "conv\t1",
      "a".repeat(201),
      "\uD800",
    ]) {
      expect(parseConversationRef(bad), JSON.stringify(bad)).toEqual({
        ok: false,
        field: "conversation_ref",
      });
    }
  });

  it("FR-API-08: limit de 1 a 50, por defecto 20", () => {
    const range = {
      defaultLimit: MESSAGES_DEFAULT_LIMIT,
      maxLimit: MESSAGES_MAX_LIMIT,
    };
    expect(parseLimit(null, range)).toEqual({ ok: true, value: 20 });
    expect(parseLimit("50", range)).toEqual({ ok: true, value: 50 });
    for (const bad of ["0", "51", "+5", "05", "abc", ""]) {
      expect(parseLimit(bad, range).ok, bad).toBe(false);
    }
  });

  it("FR-API-08: el mensaje es estricto, con kind y sent_by nulables y sent_by solo en salidas", () => {
    expect(historyMessageSchema.safeParse(MESSAGE).success).toBe(true);
    for (const valid of [
      { ...MESSAGE, kind: null, sent_by: null, external_ref: null },
      { ...MESSAGE, direction: "inbound", sent_by: null, body_text: null },
    ]) {
      expect(historyMessageSchema.safeParse(valid).success).toBe(true);
    }
    for (const invalid of [
      { ...MESSAGE, id: "0b6f3c2e-5a4d-4e8f-9c1b-2a3d4e5f6a7b" },
      { ...MESSAGE, direction: "inbound" },
      { ...MESSAGE, kind: "sticker" },
      { ...MESSAGE, sent_by: "bot" },
      { ...MESSAGE, sent_at: "2026-09-16T15:00:04Z" },
      { ...MESSAGE, sent_at: "2026-09-16T12:00:04.500-03:00" },
      Object.fromEntries(
        Object.entries(MESSAGE).filter(([key]) => key !== "body_text"),
      ),
    ]) {
      expect(
        historyMessageSchema.safeParse(invalid).success,
        JSON.stringify(invalid),
      ).toBe(false);
    }
  });

  it("FR-API-08: el mapeo lleva solo los campos del contrato, con la hora en UTC y milisegundos", () => {
    const mapped = toContractHistoryMessage({
      externalRef: null,
      direction: "inbound",
      sentAt: new Date("2026-09-16T12:00:00-03:00"),
      body: "Hola",
      kind: null,
      sentBy: null,
    });
    expect(mapped).toStrictEqual({
      external_ref: null,
      direction: "inbound",
      kind: null,
      sent_by: null,
      sent_at: "2026-09-16T15:00:00.000Z",
      body_text: "Hola",
    });
    expect(historyMessageSchema.safeParse(mapped).success).toBe(true);
  });
});

describe("marca de pausa (FR-CONV-06, brief-16.3)", () => {
  const PAUSED = {
    contract_version: "1",
    agent_paused: true,
    agent_paused_at: "2026-10-07T14:31:07.123Z",
  };

  it("FR-CONV-06: acepta una pausada con su hora y una activa con null", () => {
    expect(conversationStateResponseSchema.safeParse(PAUSED).success).toBe(
      true,
    );
    expect(
      conversationStateResponseSchema.safeParse({
        contract_version: "1",
        agent_paused: false,
        agent_paused_at: null,
      }).success,
    ).toBe(true);
  });

  it("FR-CONV-06: rechaza un campo de más, una marca sin hora o una hora sin marca, y otra versión", () => {
    for (const invalid of [
      { ...PAUSED, status: "open" },
      { ...PAUSED, client_phone: "+5491155550001" },
      { ...PAUSED, agent_paused_at: null },
      { ...PAUSED, agent_paused: false },
      { ...PAUSED, agent_paused: "true" },
      { ...PAUSED, agent_paused_at: "2026-10-07T11:31:07.123-03:00" },
      { ...PAUSED, contract_version: "2" },
      { contract_version: "1", agent_paused: false },
    ]) {
      expect(
        conversationStateResponseSchema.safeParse(invalid).success,
        JSON.stringify(invalid),
      ).toBe(false);
    }
  });

  it("FR-CONV-06: el mapeo lleva solo los campos del contrato, con la hora en UTC y milisegundos", () => {
    const paused = toContractConversationState({
      ok: true,
      agentPausedAt: new Date("2026-10-07T11:31:07.123-03:00"),
    });
    expect(paused).toStrictEqual(PAUSED);
    expect(
      toContractConversationState({ ok: true, agentPausedAt: null }),
    ).toStrictEqual({
      contract_version: "1",
      agent_paused: false,
      agent_paused_at: null,
    });
  });
});

describe("modo de prueba de la lectura (D-7)", () => {
  it("está apagado por defecto, con false, y no lo encienden las variables de ingestión", () => {
    for (const env of [
      {},
      { READ_API_ENABLED: "false" },
      {
        INGESTION_ENABLED: "true",
        INGESTION_ALLOWED_CREDENTIALS: CREDENTIAL,
      },
    ]) {
      expect(readReadApiConfig(env), JSON.stringify(env)).toEqual({
        enabled: false,
        invalid: false,
      });
    }
  });

  it("se apaga y se marca inválido con un valor desconocido o un id que no es UUID", () => {
    for (const env of [
      { READ_API_ENABLED: "1" },
      { READ_API_ENABLED: "TRUE" },
      {
        READ_API_ENABLED: "true",
        READ_API_ALLOWED_CREDENTIALS: `${CREDENTIAL},otro`,
      },
    ]) {
      expect(readReadApiConfig(env), JSON.stringify(env)).toEqual({
        enabled: false,
        invalid: true,
      });
    }
  });

  it("encendida, solo acepta las credenciales listadas, sin distinguir mayúsculas", () => {
    const config = readReadApiConfig({
      READ_API_ENABLED: "true",
      READ_API_ALLOWED_CREDENTIALS: ` ${CREDENTIAL.toUpperCase()} ,`,
    });
    if (!config.enabled) throw new Error("debería estar encendida");
    expect(isReadCredentialAllowed(config, CREDENTIAL)).toBe(true);
    expect(
      isReadCredentialAllowed(config, "0b6f3c2e-5a4d-4e8f-9c1b-2a3d4e5f6a7b"),
    ).toBe(false);
  });
});

describe("fixtures del contrato (D-8)", () => {
  const dir = path.join(process.cwd(), "tests/fixtures/read/v1");
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

  it("existen", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s declara su forma y pasa el validador", (file) => {
    const data = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    expect(["assumed", "captured"]).toContain(data.shape);
    const { status, body } = data.response;
    const schema =
      status !== 200
        ? errorResponseSchema
        : data.request.path.startsWith("/api/read/v1/knowledge")
          ? knowledgeListResponseSchema
          : data.request.path.startsWith("/api/read/v1/messages")
            ? messageListResponseSchema
            : data.request.path.startsWith("/api/read/v1/conversation-state")
              ? conversationStateResponseSchema
              : "items" in body
                ? productListResponseSchema
                : productResponseSchema;
    const parsed = schema.safeParse(body);
    expect(parsed.success, parsed.error?.message).toBe(true);
  });

  // Capturas del agente como consumidor real (brief-12.5, D-8 y AC-9).
  const captured = files.filter((file) => file.startsWith("captured-"));

  it("D-8: hay una captura de cada ruta de lectura", () => {
    const paths = captured.map(
      (file) =>
        JSON.parse(readFileSync(path.join(dir, file), "utf8")).request
          .path as string,
    );
    for (const route of ["products", "knowledge", "messages"]) {
      expect(
        paths.some((p) => p.startsWith(`/api/read/v1/${route}?`)),
        route,
      ).toBe(true);
    }
  });

  it.each(captured)(
    "D-8: %s es una captura declarada, sin encabezados ni tokens",
    (file) => {
      const raw = readFileSync(path.join(dir, file), "utf8");
      const data = JSON.parse(raw);
      expect(data.shape).toBe("captured");
      expect(data.note).toMatch(/Capturada del consumidor real/);
      // n8n guarda el cuerpo parseado: la captura valida el esquema, no los bytes.
      expect(data.note).toMatch(/no necesariamente los mismos bytes/);
      expect(data.received_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
      expect(raw).not.toMatch(/"headers"\s*:/i);
      expect(raw).not.toMatch(/crm_[a-z]+_/);
    },
  );

  it("FR-API-08 (AC-7): el historial capturado trae el turno anterior con la respuesta del agente, en orden", () => {
    const data = JSON.parse(
      readFileSync(path.join(dir, "captured-messages-history.json"), "utf8"),
    );
    const items = data.response.body.items as {
      external_ref: string;
      direction: string;
      sent_by: string | null;
      sent_at: string;
    }[];
    // El turno 1 completo (entrada y respuesta del agente) y los dos mensajes del turno 2,
    // exactamente en este orden y con su autor.
    expect(
      items.map((item) => [item.external_ref, item.direction, item.sent_by]),
    ).toEqual([
      ["wa-msg-wamid-fict-w1-t1-1", "inbound", null],
      [
        "wa-msg-wamid-dbl-1b6850b9-a7c0-4458-9851-284b2abfbd34-1",
        "outbound",
        "agent",
      ],
      ["wa-msg-wamid-fict-w1-t2-1", "inbound", null],
      ["wa-msg-wamid-fict-w1-t2-2", "inbound", null],
    ]);
    const times = items.map((item) => item.sent_at);
    expect(times).toEqual([...times].sort());
  });
});
