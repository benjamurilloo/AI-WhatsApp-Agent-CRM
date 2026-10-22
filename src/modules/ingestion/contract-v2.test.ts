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
  MAX_AGENT_LINE_UNITS,
  MAX_AGENT_ORDER_LINES,
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

const TAG_ID = "5f0c9a8e-3b1d-4c2a-9e7f-1a2b3c4d5e6f";

// Poner y quitar una etiqueta (brief-16.2, D-1 a D-3).
function tagPayload(
  eventType: "client.tag_added" | "client.tag_removed" = "client.tag_added",
): Payload {
  const added = eventType === "client.tag_added";
  return {
    contract_version: "2",
    event_type: eventType,
    event_id: added ? "evt-v2-etiqueta-0001" : "evt-v2-etiqueta-0002",
    occurred_at: added
      ? "2026-09-16T12:00:12-03:00"
      : "2026-09-16T12:00:14-03:00",
    client: { phone: "+5491155550001" },
    tag: { id: TAG_ID },
  };
}

const COFFEE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const TEA_ID = "9b2f4d1a-6c3e-4f8a-b5d7-2e1c0a9f8b6d";

// El pedido pendiente del agente (brief-19.4, D-1 a D-3).
function orderPayload(): Payload {
  return {
    contract_version: "2",
    event_type: "order.placed",
    event_id: "evt-v2-pedido-0001",
    occurred_at: "2026-09-16T12:00:16-03:00",
    client: { phone: "+5491155550001" },
    lines: [
      { product_id: COFFEE_ID, quantity: "2" },
      { product_id: TEA_ID, quantity: "1.5" },
    ],
  };
}

const UNIT_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

// El pedido con unidades del agente (brief-29.8, D-7): una línea de unidades y una de cantidad.
function unitsOrderPayload(): Payload {
  return {
    contract_version: "2",
    event_type: "order.placed_with_units",
    event_id: "evt-v2-pedido-unidades-0001",
    occurred_at: "2026-09-16T12:00:18-03:00",
    client: { phone: "+5491155550001" },
    lines: [
      { product_id: COFFEE_ID, unit_ids: [UNIT_ID] },
      { product_id: TEA_ID, quantity: "1" },
    ],
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
  {
    name: "client.tag_added",
    payload: () => tagPayload("client.tag_added"),
    canonical:
      '{"client":{"phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-etiqueta-0001","event_type":"client.tag_added","occurred_at":"2026-09-16T15:00:12.000Z","tag":{"id":"5f0c9a8e-3b1d-4c2a-9e7f-1a2b3c4d5e6f"}}',
    hash: "43304fcc44dc4edf9c13b22467835e922eb16d6ed6ac7f5af60af8ada94b84d8",
  },
  {
    name: "client.tag_removed",
    payload: () => tagPayload("client.tag_removed"),
    canonical:
      '{"client":{"phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-etiqueta-0002","event_type":"client.tag_removed","occurred_at":"2026-09-16T15:00:14.000Z","tag":{"id":"5f0c9a8e-3b1d-4c2a-9e7f-1a2b3c4d5e6f"}}',
    hash: "c2f240f686edbefd11e66c132ea51af6e0fd66e9f3c3c32ba135ff5ac03b7ef2",
  },
  {
    name: "order.placed",
    payload: orderPayload,
    canonical:
      '{"client":{"phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-pedido-0001","event_type":"order.placed","lines":[{"product_id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","quantity":"2"},{"product_id":"9b2f4d1a-6c3e-4f8a-b5d7-2e1c0a9f8b6d","quantity":"1.5"}],"occurred_at":"2026-09-16T15:00:16.000Z"}',
    hash: "9c312d278d0e5a3fb0d212270a8940fe75cae1e169b7bf3b6059d753e5f49fab",
  },
  {
    name: "order.placed_with_units",
    payload: unitsOrderPayload,
    canonical:
      '{"client":{"phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-pedido-unidades-0001","event_type":"order.placed_with_units","lines":[{"product_id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","unit_ids":["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"]},{"product_id":"9b2f4d1a-6c3e-4f8a-b5d7-2e1c0a9f8b6d","quantity":"1"}],"occurred_at":"2026-09-16T15:00:18.000Z"}',
    hash: "5223e47c7c08f334e8017421fe57cd0a8bd39b5d28ca3cec53f8854224f45d2d",
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
  it("FR-API-07: nombra los campos de v1 más kind y sent_by, la etiqueta (brief-16.2) y las líneas (brief-19.4)", () => {
    const added = ["message.kind", "message.sent_by", "tag", "tag.id", "lines"];
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

describe("fixtures del contrato v2 (forma asumida y capturas del emisor)", () => {
  const dir = path.join(process.cwd(), "tests/fixtures/ingestion/v2");
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
  const captured = files.filter((file) => file.startsWith("captured-"));

  it("existen casos válidos e inválidos", () => {
    expect(files.some((file) => file.startsWith("valid-"))).toBe(true);
    expect(files.some((file) => file.startsWith("invalid-"))).toBe(true);
  });

  it("FR-API-07: las capturas del emisor real cubren los cuatro tipos y una salida con autor (brief-12.3, AC-17)", () => {
    const events = captured
      .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")))
      .filter((fixture) => fixture.expected.ok)
      .map((fixture) => JSON.parse(fixture.body));
    // Desde la 19.4.3, también el pedido del agente (brief-19.4, AC-15).
    expect(new Set(events.map((event) => event.event_type))).toEqual(
      new Set([
        "client.resolved",
        "conversation.resolved",
        "message.recorded",
        "conversation.escalated",
        "order.placed",
      ]),
    );
    expect(
      events.some(
        (event) =>
          event.message?.direction === "outbound" &&
          event.message?.sent_by === "agent",
      ),
    ).toBe(true);
  });

  it.each(files)("%s declara su forma y valida como espera", (file) => {
    const fixture = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const isCaptured = file.startsWith("captured-");
    // Una captura guarda el cuerpo tal como salió del emisor, y se valida ese texto.
    expect(fixture.shape).toBe(isCaptured ? "captured" : "assumed");
    expect(fixture.note).toMatch(
      isCaptured ? /capturada del emisor real/i : /forma asumida/i,
    );
    const result = isCaptured
      ? parseIngestionEventV2(fixture.body, new Date(fixture.received_at))
      : parse(fixture.payload, new Date(fixture.received_at));
    expect(result.ok).toBe(
      file.startsWith("valid-") ||
        (isCaptured && !file.startsWith("captured-invalid-")),
    );
    if (isCaptured) {
      // Un 422 es una regla de negocio sobre una forma válida (brief-19.4, D-6).
      expect(result.ok).toBe(
        fixture.staging_status < 300 || fixture.staging_status === 422,
      );
      // Ni un prefijo de token en todo el archivo, y solo teléfonos del rango sintético (D-9).
      expect(readFileSync(path.join(dir, file), "utf8")).not.toMatch(
        /crm_[a-z]+_/,
      );
      for (const phone of fixture.body.match(/\+\d+/g) ?? []) {
        expect(phone).toMatch(/^\+54911555500\d\d$/);
      }
    }
    expect(
      result.ok
        ? { ok: true, payload_hash: ingestionPayloadHashV2(result.event) }
        : { ok: false, fields: result.fields },
    ).toEqual(fixture.expected);
  });
});

describe("FR-CLI-11: poner y quitar una etiqueta (brief-16.2)", () => {
  it("D-3: la etiqueta va por id, y el cliente solo por teléfono", () => {
    expect(fieldsOf({ ...tagPayload(), tag: { name: "Reclamo" } })).toEqual([
      "tag",
      "tag.id",
    ]);
    expect(fieldsOf({ ...tagPayload(), tag: { id: "reclamo" } })).toEqual([
      "tag.id",
    ]);
    expect(
      fieldsOf({
        ...tagPayload(),
        client: { phone: "+5491155550001", id: TAG_ID },
      }),
    ).toEqual(["client"]);
    expect(fieldsOf({ ...tagPayload(), tag: undefined })).toEqual(["tag"]);
    expect(fieldsOf({ ...tagPayload(), client: undefined })).toEqual([
      "client",
    ]);
    expect(fieldsOf({ ...tagPayload(), conversation: {} })).toEqual(["event"]);
  });

  it("una fecha más de 5 minutos en el futuro se rechaza, como en los demás tipos", () => {
    expect(
      fieldsOf({ ...tagPayload(), occurred_at: "2026-09-16T15:05:01.000Z" }),
    ).toEqual(["occurred_at"]);
  });

  it("D-8: los tipos nuevos solo existen en v2; v1 los rechaza como tipo desconocido", () => {
    const v1 = parseIngestionEventV1(
      JSON.stringify({ ...tagPayload(), contract_version: "1" }),
      RECEIVED_AT,
    );
    expect(v1.ok).toBe(false);
    if (!v1.ok) expect(v1.fields).toContain("event_type");
  });
});

describe("brief-19.4: el pedido del agente", () => {
  const line = (quantity: unknown, product_id: unknown = COFFEE_ID) => ({
    ...orderPayload(),
    lines: [{ product_id, quantity }],
  });

  it("D-2: de 1 a 10 líneas, cada una con un uuid y una cantidad en texto", () => {
    expect(fieldsOf({ ...orderPayload(), lines: [] })).toEqual(["lines"]);
    const many = Array.from({ length: MAX_AGENT_ORDER_LINES + 1 }, (_, i) => ({
      product_id: `7c9e6679-7425-40de-944b-${String(i).padStart(12, "0")}`,
      quantity: "1",
    }));
    expect(fieldsOf({ ...orderPayload(), lines: many })).toEqual(["lines"]);
    expect(
      parse({ ...orderPayload(), lines: many.slice(0, MAX_AGENT_ORDER_LINES) })
        .ok,
    ).toBe(true);
    expect(fieldsOf(line("1", "café"))).toEqual(["lines"]);
    expect(fieldsOf({ ...orderPayload(), lines: undefined })).toEqual([
      "lines",
    ]);
  });

  it("D-2: la cantidad es un decimal en texto, mayor que cero, con hasta tres decimales", () => {
    for (const valid of ["1", "2.5", "0.001", "99999999999.999", "10"]) {
      expect(parse(line(valid)).ok).toBe(true);
    }
    for (const invalid of [
      2,
      "0",
      "0.000",
      "-1",
      "1.2345",
      "1,5",
      "01",
      "1e3",
      " 1",
      "100000000000",
      "",
    ]) {
      expect(fieldsOf(line(invalid))).toEqual(["lines"]);
    }
  });

  it("D-3: un producto repetido da 400, también con otra capitalización", () => {
    expect(
      fieldsOf({
        ...orderPayload(),
        lines: [
          { product_id: COFFEE_ID, quantity: "1" },
          { product_id: COFFEE_ID.toUpperCase(), quantity: "2" },
        ],
      }),
    ).toEqual(["lines"]);
  });

  it("D-1 y D-6: sin precios ni campos de más; el cliente solo por teléfono", () => {
    expect(
      fieldsOf({
        ...orderPayload(),
        lines: [{ product_id: COFFEE_ID, quantity: "1", unit_price: "10" }],
      }),
    ).toEqual(["lines"]);
    expect(
      fieldsOf({
        ...orderPayload(),
        client: { phone: "+5491155550001", display_name: "Ana" },
      }),
    ).toEqual(["client"]);
    expect(fieldsOf({ ...orderPayload(), client: undefined })).toEqual([
      "client",
    ]);
    expect(fieldsOf({ ...orderPayload(), message: {} })).toEqual(["event"]);
    expect(
      fieldsOf({ ...orderPayload(), occurred_at: "2026-09-16T15:05:01.000Z" }),
    ).toEqual(["occurred_at"]);
  });

  it("solo existe en v2: v1 lo rechaza como tipo desconocido", () => {
    const v1 = parseIngestionEventV1(
      JSON.stringify({ ...orderPayload(), contract_version: "1" }),
      RECEIVED_AT,
    );
    expect(v1.ok).toBe(false);
    if (!v1.ok) expect(v1.fields).toContain("event_type");
  });
});

describe("brief-29.8: el pedido con unidades del agente (D-7)", () => {
  const withLines = (lines: unknown) => ({ ...unitsOrderPayload(), lines });
  const unitId = (i: number) =>
    `a1b2c3d4-e5f6-4a7b-8c9d-${String(i).padStart(12, "0")}`;

  it("cada línea es de cantidad o de unidades, nunca de las dos", () => {
    expect(parse(unitsOrderPayload()).ok).toBe(true);
    expect(
      fieldsOf(
        withLines([
          { product_id: COFFEE_ID, unit_ids: [UNIT_ID], quantity: "1" },
        ]),
      ),
    ).toEqual(["lines"]);
    expect(fieldsOf(withLines([{ product_id: COFFEE_ID }]))).toEqual(["lines"]);
  });

  it("de 1 a 10 ids por línea, uuid y sin repetir, también con otra capitalización", () => {
    expect(
      parse(
        withLines([
          {
            product_id: COFFEE_ID,
            unit_ids: Array.from({ length: MAX_AGENT_LINE_UNITS }, (_, i) =>
              unitId(i),
            ),
          },
        ]),
      ).ok,
    ).toBe(true);
    for (const invalid of [
      [],
      Array.from({ length: MAX_AGENT_LINE_UNITS + 1 }, (_, i) => unitId(i)),
      ["356789012345678"],
      [UNIT_ID, UNIT_ID.toUpperCase()],
      UNIT_ID,
    ]) {
      expect(
        fieldsOf(withLines([{ product_id: COFFEE_ID, unit_ids: invalid }])),
      ).toEqual(["lines"]);
    }
  });

  it("de 1 a 10 líneas, sin repetir un producto, sin precios ni campos de más", () => {
    expect(fieldsOf(withLines([]))).toEqual(["lines"]);
    expect(
      fieldsOf(
        withLines([
          { product_id: COFFEE_ID, unit_ids: [UNIT_ID] },
          { product_id: COFFEE_ID.toUpperCase(), quantity: "1" },
        ]),
      ),
    ).toEqual(["lines"]);
    expect(
      fieldsOf(
        withLines([
          { product_id: COFFEE_ID, unit_ids: [UNIT_ID], unit_price: "420" },
        ]),
      ),
    ).toEqual(["lines"]);
    expect(
      fieldsOf({
        ...unitsOrderPayload(),
        client: { phone: "+5491155550001", display_name: "Ana" },
      }),
    ).toEqual(["client"]);
  });

  it("order.placed no admite líneas de unidades: su contrato no cambia", () => {
    expect(
      fieldsOf({
        ...orderPayload(),
        lines: [{ product_id: COFFEE_ID, unit_ids: [UNIT_ID] }],
      }),
    ).toEqual(["lines"]);
  });

  it("solo existe en v2: v1 lo rechaza como tipo desconocido", () => {
    const v1 = parseIngestionEventV1(
      JSON.stringify({ ...unitsOrderPayload(), contract_version: "1" }),
      RECEIVED_AT,
    );
    expect(v1.ok).toBe(false);
    if (!v1.ok) expect(v1.fields).toContain("event_type");
  });
});
