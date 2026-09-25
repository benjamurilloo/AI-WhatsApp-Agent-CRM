import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGE_KINDS, MESSAGE_SENDERS } from "@/modules/conversations";
import {
  canonicalJson,
  ingestionPayloadHash,
  INGESTION_FIELDS,
  parseIngestionEventV1,
} from "./contract";
import {
  INGESTION_FIELDS_V2,
  ingestionPayloadHashV2,
  isPhoneAsName,
  MESSAGE_KINDS_V2,
  MESSAGE_SENDERS_V2,
  parseIngestionEventV2,
} from "./contract-v2";

// Contrato de ingestión v2 (brief-12.3). Los payloads son sintéticos, con forma asumida.

const RECEIVED_AT = new Date("2026-09-16T15:00:00.000Z");

type Payload = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function clientPayload(): Payload {
  return {
    contract_version: "2",
    event_type: "client.resolved",
    event_id: "evt-v2-client-0001",
    occurred_at: "2026-09-16T11:59:58-03:00",
    client: { phone: "+5491155550001", display_name: "María Gómez" },
  };
}

function conversationPayload(): Payload {
  return {
    contract_version: "2",
    event_type: "conversation.resolved",
    event_id: "evt-v2-conv-0001",
    occurred_at: "2026-09-16T11:59:58-03:00",
    conversation: {
      external_ref: "conv-propuesta-0001",
      channel: "whatsapp",
      client_phone: "+5491155550001",
    },
    message: {
      external_ref: "msg-v2-0001",
      kind: "audio",
      sent_at: "2026-09-16T11:59:57.250-03:00",
      body_text: "Hola, ¿tienen stock?",
    },
  };
}

function messagePayload(): Payload {
  return {
    contract_version: "2",
    event_type: "message.recorded",
    event_id: "evt-v2-msg-0001",
    occurred_at: "2026-09-16T12:00:05-03:00",
    conversation: {
      external_ref: "conv-propuesta-0001",
      channel: "whatsapp",
      client_phone: "+5491155550001",
    },
    message: {
      external_ref: "msg-v2-0002",
      direction: "outbound",
      kind: "text",
      sent_by: "agent",
      sent_at: "2026-09-16T12:00:04.500-03:00",
      body_text: "Sí, tenemos stock.",
    },
  };
}

function escalationPayload(): Payload {
  return {
    contract_version: "2",
    event_type: "conversation.escalated",
    event_id: "evt-v2-escalada-0001",
    occurred_at: "2026-09-16T12:00:10-03:00",
    conversation: { external_ref: "conv-propuesta-0001", channel: "whatsapp" },
  };
}

function parse(value: unknown, receivedAt = RECEIVED_AT) {
  return parseIngestionEventV2(JSON.stringify(value), receivedAt);
}

function fieldsOf(value: unknown) {
  const result = parse(value);
  return result.ok ? [] : result.fields;
}

// Serializaciones canónicas escritas a mano y su SHA-256, calculado sobre este texto y no con
// canonicalJson (docs/contracts/ingestion-v2.md, §payload_hash).
const VECTORS = [
  {
    name: "client.resolved",
    payload: clientPayload,
    canonical:
      '{"client":{"display_name":"María Gómez","phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-client-0001","event_type":"client.resolved","occurred_at":"2026-09-16T14:59:58.000Z"}',
    hash: "a58c8ae0d0a4fef267b8b887345c8e9718c9b60052138cf55c652c67a7fd4ab4",
  },
  {
    name: "conversation.resolved",
    payload: conversationPayload,
    canonical:
      '{"contract_version":"2","conversation":{"channel":"whatsapp","client_phone":"+5491155550001","external_ref":"conv-propuesta-0001"},"event_id":"evt-v2-conv-0001","event_type":"conversation.resolved","message":{"body_text":"Hola, ¿tienen stock?","external_ref":"msg-v2-0001","kind":"audio","sent_at":"2026-09-16T14:59:57.250Z"},"occurred_at":"2026-09-16T14:59:58.000Z"}',
    hash: "415aca6aabdcd6e3aeb69361d7a4f47f1275985f9cf9f173bbb1ba2cc28bfba9",
  },
  {
    name: "message.recorded",
    payload: messagePayload,
    canonical:
      '{"contract_version":"2","conversation":{"channel":"whatsapp","client_phone":"+5491155550001","external_ref":"conv-propuesta-0001"},"event_id":"evt-v2-msg-0001","event_type":"message.recorded","message":{"body_text":"Sí, tenemos stock.","direction":"outbound","external_ref":"msg-v2-0002","kind":"text","sent_at":"2026-09-16T15:00:04.500Z","sent_by":"agent"},"occurred_at":"2026-09-16T15:00:05.000Z"}',
    hash: "c1fa8fa103c8278affb92ae410ccdf5058e8f69a872c8cd86e7791baac7b4309",
  },
  {
    name: "conversation.escalated",
    payload: escalationPayload,
    canonical:
      '{"contract_version":"2","conversation":{"channel":"whatsapp","external_ref":"conv-propuesta-0001"},"event_id":"evt-v2-escalada-0001","event_type":"conversation.escalated","occurred_at":"2026-09-16T15:00:10.000Z"}',
    hash: "3aa0d77eae924f70a6478082c8e163057b5478557b4f6872ee7dcfe6894ad3a3",
  },
];

describe("vectores del contrato v2", () => {
  it.each(VECTORS)(
    "FR-API-07: $name normaliza las fechas y coincide con su vector",
    ({ payload, canonical, hash }) => {
      const result = parse(payload());
      if (!result.ok) throw new Error(result.fields.join(", "));
      expect(canonicalJson(result.event)).toBe(canonical);
      expect(ingestionPayloadHashV2(result.event)).toBe(hash);
      expect(createHash("sha256").update(canonical).digest("hex")).toBe(hash);
    },
  );

  it("FR-API-07: el mismo contenido por v1 y por v2 nunca comparte el hash (D-1)", () => {
    const v2 = parse(escalationPayload());
    const v1 = parseIngestionEventV1(
      JSON.stringify({ ...escalationPayload(), contract_version: "1" }),
      RECEIVED_AT,
    );
    if (!v1.ok || !v2.ok) throw new Error("vector inválido");
    expect(ingestionPayloadHashV2(v2.event)).not.toBe(
      ingestionPayloadHash(v1.event),
    );
  });

  it("FR-API-07: kind y sent_by cambian el hash", () => {
    const hashOf = (change: (value: Payload) => void) => {
      const value = messagePayload();
      change(value);
      const result = parse(value);
      if (!result.ok) throw new Error(result.fields.join(", "));
      return ingestionPayloadHashV2(result.event);
    };
    const hashes = [
      hashOf(() => {}),
      hashOf((value) => (value.message.kind = "audio")),
      hashOf((value) => (value.message.sent_by = "person")),
    ];
    expect(new Set(hashes).size).toBe(3);
  });
});

describe("tipo original y autor (D-2 y D-3)", () => {
  it("FR-API-07: las listas del contrato son las de los enums de messages", () => {
    expect([...MESSAGE_KINDS_V2]).toEqual(MESSAGE_KINDS);
    expect([...MESSAGE_SENDERS_V2]).toEqual(MESSAGE_SENDERS);
  });

  it.each(MESSAGE_KINDS_V2)("FR-API-07: acepta kind %s", (kind) => {
    const value = conversationPayload();
    value.message.kind = kind;
    expect(parse(value).ok).toBe(true);
  });

  it.each([["sticker"], [null], ["TEXT"], [""]])(
    "FR-API-07: rechaza kind %j",
    (kind) => {
      const value = messagePayload();
      value.message.kind = kind;
      expect(fieldsOf(value)).toEqual(["message.kind"]);
    },
  );

  it("FR-API-07: exige kind en los dos eventos que registran mensajes", () => {
    const recorded = messagePayload();
    delete recorded.message.kind;
    const resolved = conversationPayload();
    delete resolved.message.kind;
    expect(fieldsOf(recorded)).toEqual(["message.kind"]);
    expect(fieldsOf(resolved)).toEqual(["message.kind"]);
  });

  it.each(MESSAGE_SENDERS_V2)(
    "FR-API-07: acepta sent_by %s en una salida",
    (sender) => {
      const value = messagePayload();
      value.message.sent_by = sender;
      expect(parse(value).ok).toBe(true);
    },
  );

  it("FR-API-07: una salida sin sent_by se rechaza", () => {
    const value = messagePayload();
    delete value.message.sent_by;
    expect(fieldsOf(value)).toEqual(["message.sent_by"]);
  });

  it.each([["agent"], ["person"]])(
    "FR-API-07: una entrada con sent_by %s se rechaza",
    (sender) => {
      const value = messagePayload();
      value.message.direction = "inbound";
      value.message.sent_by = sender;
      expect(fieldsOf(value)).toEqual(["message.sent_by"]);
    },
  );

  it("FR-API-07: una entrada sin sent_by se acepta, y sent_by null se rechaza", () => {
    const inbound = messagePayload();
    inbound.message.direction = "inbound";
    delete inbound.message.sent_by;
    expect(parse(inbound).ok).toBe(true);
    const nulled = messagePayload();
    nulled.message.sent_by = null;
    expect(fieldsOf(nulled)).toEqual(["message.sent_by"]);
  });

  it("FR-API-07: conversation.resolved rechaza sent_by y direction como campos desconocidos", () => {
    const withSender = conversationPayload();
    withSender.message.sent_by = "agent";
    const withDirection = conversationPayload();
    withDirection.message.direction = "inbound";
    expect(fieldsOf(withSender)).toEqual(["message"]);
    expect(fieldsOf(withDirection)).toEqual(["message"]);
  });
});

describe("el teléfono como nombre (D-8)", () => {
  it.each([
    "+5491155550001",
    "5491155550001",
    "+54 9 11 5555-0001",
    "(54) 911-5555-0001",
  ])("FR-API-07: rechaza %j", (name) => {
    const value = clientPayload();
    value.client.display_name = name;
    expect(fieldsOf(value)).toEqual(["client.display_name"]);
  });

  it.each(["Local 12", "María Gómez", "11 5555-0001", "Juan 2"])(
    "FR-API-07: acepta %j, que no son los dígitos del teléfono",
    (name) => {
      const value = clientPayload();
      value.client.display_name = name;
      expect(parse(value).ok).toBe(true);
    },
  );

  it("FR-API-07: un nombre sin dígitos nunca es el teléfono, y null se acepta", () => {
    expect(isPhoneAsName("María", "+5491155550001")).toBe(false);
    const value = clientPayload();
    value.client.display_name = null;
    expect(parse(value).ok).toBe(true);
  });
});

describe("reglas heredadas de v1", () => {
  it("FR-API-07: nombra los campos de v1 más kind y sent_by", () => {
    const added = ["message.kind", "message.sent_by"];
    expect(
      INGESTION_FIELDS_V2.filter((field) => !added.includes(field)),
    ).toEqual([...INGESTION_FIELDS]);
  });

  it("FR-API-07: rechaza contract_version 1, un tipo desconocido y un campo desconocido", () => {
    expect(fieldsOf({ ...messagePayload(), contract_version: "1" })).toEqual([
      "contract_version",
    ]);
    expect(
      fieldsOf({ ...messagePayload(), event_type: "message.deleted" }),
    ).toEqual(["event_type"]);
    expect(fieldsOf({ ...escalationPayload(), extra: true })).toEqual([
      "event",
    ]);
  });

  it("FR-API-07: rechaza NUL en el texto, UTF-16 inválido en una referencia y una fecha futura", () => {
    const nul = conversationPayload();
    nul.message.body_text = "a\u0000b";
    const surrogate = messagePayload();
    surrogate.message.external_ref = "msg-\uD800";
    const future = messagePayload();
    future.message.sent_at = "2026-09-16T15:05:00.001Z";
    expect(fieldsOf(nul)).toEqual(["message.body_text"]);
    expect(fieldsOf(surrogate)).toEqual(["message.external_ref"]);
    expect(fieldsOf(future)).toEqual(["message.sent_at"]);
  });

  it("FR-API-07: rechaza un cuerpo que no es un objeto JSON", () => {
    expect(parseIngestionEventV2("[]", RECEIVED_AT)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["body"],
    });
    expect(parseIngestionEventV2("{", RECEIVED_AT).ok).toBe(false);
  });
});

describe("fixtures del contrato v2 (forma asumida)", () => {
  const dir = path.join(process.cwd(), "tests/fixtures/ingestion/v2");
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

  it("existen casos válidos e inválidos", () => {
    expect(files.some((file) => file.startsWith("valid-"))).toBe(true);
    expect(files.some((file) => file.startsWith("invalid-"))).toBe(true);
  });

  it.each(files)("%s declara su forma y valida como espera", (file) => {
    const fixture = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    expect(fixture.shape).toBe("assumed");
    expect(fixture.note).toMatch(/forma asumida/i);
    const result = parse(fixture.payload, new Date(fixture.received_at));
    expect(result.ok).toBe(file.startsWith("valid-"));
    expect(
      result.ok
        ? { ok: true, payload_hash: ingestionPayloadHashV2(result.event) }
        : { ok: false, fields: result.fields },
    ).toEqual(fixture.expected);
  });
});
