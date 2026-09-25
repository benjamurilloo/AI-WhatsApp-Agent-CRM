import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  ingestionPayloadHash,
  MAX_INGESTION_BODY_BYTES,
  parseIngestionEventV1,
  type MessageRecordedEventV1,
} from "./contract";

// Contrato de ingestión v1 (brief-6.5.1). Los payloads son sintéticos, con forma asumida.

const RECEIVED_AT = new Date("2026-09-16T15:00:00.000Z");

function payload() {
  return {
    contract_version: "1",
    event_type: "message.recorded",
    event_id: "evt-0001",
    occurred_at: "2026-09-16T11:59:58-03:00",
    conversation: {
      external_ref: "conv-0001",
      channel: "whatsapp",
      client_phone: "+5491155550001",
    },
    message: {
      external_ref: "msg-0001",
      direction: "inbound",
      sent_at: "2026-09-16T11:59:57.250-03:00",
      body_text: "Hola, ¿tienen stock?",
    },
  } as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function parse(value: unknown, receivedAt = RECEIVED_AT) {
  return parseIngestionEventV1(JSON.stringify(value), receivedAt);
}

function fieldsOf(value: unknown) {
  const result = parse(value);
  if (result.ok) throw new Error("se esperaba un rechazo");
  return result.fields;
}

// Desde la 12.1 el evento es una unión: estos casos son todos de message.recorded.
function parsed(value: unknown): MessageRecordedEventV1 {
  const result = parse(value);
  if (!result.ok) throw new Error(`rechazado: ${result.fields.join(", ")}`);
  if (result.event.event_type !== "message.recorded") {
    throw new Error(`tipo inesperado: ${result.event.event_type}`);
  }
  return result.event;
}

// Vector del contrato: la serialización canónica escrita a mano y su SHA-256.
const VECTOR_CANONICAL =
  '{"contract_version":"1","conversation":{"channel":"whatsapp","client_phone":"+5491155550001","external_ref":"conv-0001"},"event_id":"evt-0001","event_type":"message.recorded","message":{"body_text":"Hola, ¿tienen stock?","direction":"inbound","external_ref":"msg-0001","sent_at":"2026-09-16T14:59:57.250Z"},"occurred_at":"2026-09-16T14:59:58.000Z"}';
const VECTOR_HASH =
  "529004aa199e81238af332e09262a30ec458f581188b6da0cdfa1ab53746ee2a";

describe("parseIngestionEventV1: evento válido", () => {
  it("normaliza las fechas a UTC con milisegundos y conserva lo demás", () => {
    expect(parsed(payload())).toEqual({
      ...payload(),
      occurred_at: "2026-09-16T14:59:58.000Z",
      message: { ...payload().message, sent_at: "2026-09-16T14:59:57.250Z" },
    });
  });

  it("acepta teléfono y cuerpo nulos, marcado y emojis tal cual", () => {
    const value = payload();
    value.conversation.client_phone = null;
    value.message.body_text = null;
    expect(parsed(value).message.body_text).toBeNull();
    value.message.body_text = "<b>hola</b>\n**x** 👋";
    expect(parsed(value).message.body_text).toBe("<b>hola</b>\n**x** 👋");
  });

  it("acepta los límites exactos", () => {
    const value = payload();
    value.event_id = "e".repeat(200);
    // 4096 puntos de código, aunque en UTF-16 ocupen el doble.
    value.message.body_text = "👋".repeat(4096);
    value.message.sent_at = "2026-09-16T15:05:00.000Z";
    expect(parse(value).ok).toBe(true);
  });
});

describe("parseIngestionEventV1: rechazos", () => {
  it("rechaza un cuerpo que no es un objeto JSON o supera el límite", () => {
    for (const body of ["", "{", "[]", "null", '"x"', "42"]) {
      expect(parseIngestionEventV1(body, RECEIVED_AT)).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["body"],
      });
    }
    const big = payload();
    big.message.body_text = "a".repeat(MAX_INGESTION_BODY_BYTES);
    expect(fieldsOf(big)).toEqual(["body"]);
  });

  it("informa un campo desconocido por su objeto, sin repetir su nombre", () => {
    const value = payload();
    value.secreto_del_emisor = 1;
    value.conversation.extra = true;
    const result = parse(value);
    expect(result).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["event", "conversation"],
    });
    expect(JSON.stringify(result)).not.toContain("secreto");
  });

  it("exige cada campo obligatorio y su tipo", () => {
    const value = payload();
    delete value.event_id;
    delete value.message.direction;
    value.occurred_at = 1;
    value.conversation = null;
    expect(fieldsOf(value)).toEqual([
      "event_id",
      "occurred_at",
      "conversation",
      "message.direction",
    ]);
  });

  it("rechaza versión, tipo, canal y dirección desconocidos", () => {
    const value = payload();
    value.contract_version = 1;
    value.event_type = "conversation.started";
    value.conversation.channel = "sms";
    value.message.direction = "internal";
    expect(fieldsOf(value)).toEqual([
      "contract_version",
      "event_type",
      "conversation.channel",
      "message.direction",
    ]);
  });

  it("valida las referencias como texto opaco acotado", () => {
    for (const bad of [
      "",
      " evt",
      "evt\t",
      "e".repeat(201),
      "evt\u0000",
      "evt\n1",
      "evt\uD800",
    ]) {
      const value = payload();
      value.event_id = bad;
      value.conversation.external_ref = bad;
      value.message.external_ref = bad;
      expect(fieldsOf(value), JSON.stringify(bad)).toEqual([
        "event_id",
        "conversation.external_ref",
        "message.external_ref",
      ]);
    }
  });

  it("exige fechas ISO 8601 existentes, con zona y hasta milisegundos", () => {
    for (const bad of [
      "2026-09-16T11:59:57",
      "2026-09-16 11:59:57Z",
      "2026-09-16T11:59Z",
      "2026-02-30T10:00:00Z",
      "2026-09-16T10:00:00+0300",
      "2026-09-16T10:00:00.1234Z",
      "1758034797",
    ]) {
      const value = payload();
      value.occurred_at = bad;
      value.message.sent_at = bad;
      expect(fieldsOf(value), bad).toEqual(["occurred_at", "message.sent_at"]);
    }
  });

  it("rechaza fechas más de 5 minutos después de la recepción", () => {
    const value = payload();
    value.occurred_at = "2026-09-16T15:05:00.001Z";
    value.message.sent_at = "2026-09-16T12:05:00.001-03:00";
    expect(fieldsOf(value)).toEqual(["occurred_at", "message.sent_at"]);
  });

  it("exige el teléfono en E.164, sin normalizarlo", () => {
    for (const bad of ["5491155550001", "+54 9 11 5555-0001", "+0123", ""]) {
      const value = payload();
      value.conversation.client_phone = bad;
      expect(fieldsOf(value), bad).toEqual(["conversation.client_phone"]);
    }
  });

  it("rechaza un cuerpo vacío, largo, con NUL o con UTF-16 inválido", () => {
    for (const bad of ["", "a".repeat(4097), "a\u0000b", "a\uDC00"]) {
      const value = payload();
      value.message.body_text = bad;
      expect(fieldsOf(value), JSON.stringify(bad)).toEqual([
        "message.body_text",
      ]);
    }
  });
});

describe("payload_hash (D-4)", () => {
  it("coincide con el vector del contrato", () => {
    const event = parsed(payload());
    expect(canonicalJson(event)).toBe(VECTOR_CANONICAL);
    expect(
      createHash("sha256").update(VECTOR_CANONICAL, "utf8").digest("hex"),
    ).toBe(VECTOR_HASH);
    expect(ingestionPayloadHash(event)).toBe(VECTOR_HASH);
  });

  it("no cambia con el orden de las claves, los espacios ni la zona de las fechas", () => {
    const value = payload();
    const reordered = {
      message: {
        body_text: value.message.body_text,
        sent_at: "2026-09-16T14:59:57.25Z",
        direction: "inbound",
        external_ref: "msg-0001",
      },
      occurred_at: "2026-09-16T14:59:58Z",
      conversation: { ...value.conversation },
      event_id: "evt-0001",
      event_type: "message.recorded",
      contract_version: "1",
    };
    const result = parseIngestionEventV1(
      JSON.stringify(reordered, null, 4),
      RECEIVED_AT,
    );
    expect(result.ok && ingestionPayloadHash(result.event)).toBe(VECTOR_HASH);
  });

  it("cambia con cada campo del evento", () => {
    const changes: ((value: ReturnType<typeof payload>) => void)[] = [
      (v) => (v.event_id = "evt-0002"),
      (v) => (v.occurred_at = "2026-09-16T11:59:59-03:00"),
      (v) => (v.conversation.external_ref = "conv-0002"),
      (v) => (v.conversation.client_phone = null),
      (v) => (v.conversation.client_phone = "+5491155550002"),
      (v) => (v.message.external_ref = "msg-0002"),
      (v) => (v.message.direction = "outbound"),
      (v) => (v.message.sent_at = "2026-09-16T11:59:57.251-03:00"),
      (v) => (v.message.body_text = "Hola, ¿tienen stock? "),
      (v) => (v.message.body_text = null),
    ];
    const hashes = changes.map((change) => {
      const value = payload();
      change(value);
      return ingestionPayloadHash(parsed(value));
    });
    expect(new Set([VECTOR_HASH, ...hashes]).size).toBe(changes.length + 1);
  });

  it("serializa en forma canónica valores anidados", () => {
    expect(canonicalJson({ b: [2, { d: null, c: "é" }], a: true })).toBe(
      '{"a":true,"b":[2,{"c":"é","d":null}]}',
    );
  });
});

describe("fixtures del contrato (forma asumida)", () => {
  const dir = path.join(process.cwd(), "tests/fixtures/ingestion/v1");
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

  it("existen casos válidos e inválidos", () => {
    expect(files.some((file) => file.startsWith("valid-"))).toBe(true);
    expect(files.some((file) => file.startsWith("invalid-"))).toBe(true);
  });

  it.each(files)("%s declara su forma asumida y valida como espera", (file) => {
    const fixture = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    expect(fixture.shape).toBe("assumed");
    expect(fixture.note).toMatch(/forma asumida/i);
    const result = parse(fixture.payload, new Date(fixture.received_at));
    expect(result.ok).toBe(file.startsWith("valid-"));
    expect(
      result.ok
        ? { ok: true, payload_hash: ingestionPayloadHash(result.event) }
        : { ok: false, fields: result.fields },
    ).toEqual(fixture.expected);
  });
});

// client.resolved (brief-12.1, D-1 y D-5): mismo ledger y mismo hash, otro objeto.
describe("client.resolved", () => {
  function clientPayload() {
    return {
      contract_version: "1",
      event_type: "client.resolved",
      event_id: "evt-client-0001",
      occurred_at: "2026-09-16T11:59:58-03:00",
      client: { phone: "+5491155550001", display_name: "María Gómez" },
    } as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  // Serialización canónica escrita a mano y su SHA-256, calculado sobre este texto y no con
  // canonicalJson.
  const CLIENT_VECTOR_CANONICAL =
    '{"client":{"display_name":"María Gómez","phone":"+5491155550001"},"contract_version":"1","event_id":"evt-client-0001","event_type":"client.resolved","occurred_at":"2026-09-16T14:59:58.000Z"}';
  const CLIENT_VECTOR_HASH =
    "69779577a3a2aa226ef36ccf53a7ed817f3827f2955073967ed3d724b80728cc";

  it("FR-API-04: normaliza occurred_at y coincide con el vector del contrato", () => {
    const result = parse(clientPayload());
    if (!result.ok) throw new Error(result.fields.join(", "));
    expect(result.event).toEqual({
      ...clientPayload(),
      occurred_at: "2026-09-16T14:59:58.000Z",
    });
    expect(canonicalJson(result.event)).toBe(CLIENT_VECTOR_CANONICAL);
    expect(ingestionPayloadHash(result.event)).toBe(CLIENT_VECTOR_HASH);
    expect(
      createHash("sha256").update(CLIENT_VECTOR_CANONICAL).digest("hex"),
    ).toBe(CLIENT_VECTOR_HASH);
  });

  it("FR-API-04: acepta el nombre nulo y el de 200 caracteres", () => {
    const value = clientPayload();
    value.client.display_name = null;
    expect(parse(value).ok).toBe(true);
    value.client.display_name = "n".repeat(200);
    expect(parse(value).ok).toBe(true);
  });

  it("FR-API-04: rechaza el nombre vacío, largo, con espacios al borde, de control, NUL o UTF-16 inválido", () => {
    for (const bad of [
      "",
      "n".repeat(201),
      " Ana",
      "Ana ",
      "Ana\nPérez",
      "Ana\u0000",
      "Ana\uD800",
      42,
    ]) {
      const value = clientPayload();
      value.client.display_name = bad;
      expect(fieldsOf(value), JSON.stringify(bad)).toEqual([
        "client.display_name",
      ]);
    }
  });

  it("FR-API-04: el teléfono es obligatorio y en E.164 canónico", () => {
    for (const bad of [
      null,
      "",
      "5491155550001",
      "+54 9 11 5555-0001",
      "+0123",
    ]) {
      const value = clientPayload();
      value.client.phone = bad;
      expect(fieldsOf(value), JSON.stringify(bad)).toEqual(["client.phone"]);
    }
  });

  it("FR-API-04: el objeto es estricto y client es obligatorio", () => {
    const extra = clientPayload();
    extra.client.notes = "x";
    expect(fieldsOf(extra)).toEqual(["client"]);
    const missing = clientPayload();
    delete missing.client;
    expect(fieldsOf(missing)).toEqual(["client"]);
    const withMessage = clientPayload();
    withMessage.message = { external_ref: "m" };
    expect(fieldsOf(withMessage)).toEqual(["event"]);
  });

  it("FR-API-04: rechaza occurred_at más de 5 minutos en el futuro", () => {
    const value = clientPayload();
    value.occurred_at = "2026-09-16T15:05:00.001Z";
    expect(fieldsOf(value)).toEqual(["occurred_at"]);
    value.occurred_at = "2026-09-16T15:05:00.000Z";
    expect(parse(value).ok).toBe(true);
  });

  it("FR-API-04: el hash cambia con cada campo", () => {
    const changes: ((value: ReturnType<typeof clientPayload>) => void)[] = [
      (v) => (v.event_id = "evt-client-0002"),
      (v) => (v.occurred_at = "2026-09-16T11:59:59-03:00"),
      (v) => (v.client.phone = "+5491155550002"),
      (v) => (v.client.display_name = "María Gómez "),
      (v) => (v.client.display_name = null),
      (v) => (v.client.display_name = "María Gomez"),
    ];
    const hashes = changes.map((change) => {
      const value = clientPayload();
      change(value);
      const result = parse(value);
      return result.ok ? ingestionPayloadHash(result.event) : "rechazado";
    });
    expect(hashes.filter((hash) => hash === "rechazado")).toHaveLength(1);
    expect(new Set([CLIENT_VECTOR_HASH, ...hashes]).size).toBe(
      changes.length + 1,
    );
  });
});
