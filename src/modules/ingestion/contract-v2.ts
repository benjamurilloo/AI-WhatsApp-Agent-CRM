import { createHash } from "node:crypto";
import { z } from "zod";
import type { Failure } from "@/shared/errors";
import {
  bodyText,
  canonicalJson,
  clientName,
  E164,
  externalRef,
  MAX_CLOCK_SKEW_MS,
  MAX_INGESTION_BODY_BYTES,
  timestamp,
  toUtc,
} from "./contract";

// Contrato de ingestión v2: docs/contracts/ingestion-v2.md (brief-12.3). Los cuatro tipos de
// evento de v1, con el tipo original del mensaje (kind, D-2) y el autor de una salida (sent_by,
// D-3). Las referencias, las fechas, el texto y el hash siguen las reglas de v1, que no cambia. Desde
// la 16.2, dos tipos que solo existen en v2: poner y quitar una etiqueta en un cliente.

export const INGESTION_CONTRACT_VERSION_V2 = "2";

// Las mismas listas que los enums de messages (conversations/schema.ts); un test las compara.
export const MESSAGE_KINDS_V2 = [
  "text",
  "audio",
  "image",
  "video",
  "document",
  "other",
] as const;
export const MESSAGE_SENDERS_V2 = ["agent", "person"] as const;

// Campos que puede nombrar un VALIDATION_ERROR de v2, en orden fijo: los de v1 más kind y sent_by,
// y desde la 16.2 la etiqueta.
export const INGESTION_FIELDS_V2 = [
  "body",
  "event",
  "contract_version",
  "event_type",
  "event_id",
  "occurred_at",
  "conversation",
  "conversation.external_ref",
  "conversation.channel",
  "conversation.client_phone",
  "message",
  "message.external_ref",
  "message.direction",
  "message.kind",
  "message.sent_by",
  "message.sent_at",
  "message.body_text",
  "client",
  "client.phone",
  "client.display_name",
  "tag",
  "tag.id",
] as const;

export type IngestionFieldV2 = (typeof INGESTION_FIELDS_V2)[number];

const kind = z.enum(MESSAGE_KINDS_V2);
const sentBy = z.enum(MESSAGE_SENDERS_V2);

// sent_by es obligatorio en una salida y prohibido en una entrada (D-3); se comprueba después del
// esquema, porque depende de direction.
const messageRecordedSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION_V2),
  event_type: z.literal("message.recorded"),
  event_id: externalRef,
  occurred_at: timestamp,
  conversation: z.strictObject({
    external_ref: externalRef,
    channel: z.literal("whatsapp"),
    client_phone: z.string().regex(E164).nullable(),
  }),
  message: z.strictObject({
    external_ref: externalRef,
    direction: z.enum(["inbound", "outbound"]),
    kind,
    sent_by: sentBy.optional(),
    sent_at: timestamp,
    body_text: bodyText.nullable(),
  }),
});

const clientResolvedSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION_V2),
  event_type: z.literal("client.resolved"),
  event_id: externalRef,
  occurred_at: timestamp,
  client: z.strictObject({
    phone: z.string().regex(E164),
    display_name: clientName.nullable(),
  }),
});

// Siempre entrante: sin direction ni sent_by, que se rechazan como campos desconocidos.
const conversationResolvedSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION_V2),
  event_type: z.literal("conversation.resolved"),
  event_id: externalRef,
  occurred_at: timestamp,
  conversation: z.strictObject({
    external_ref: externalRef,
    channel: z.literal("whatsapp"),
    client_phone: z.string().regex(E164),
  }),
  message: z.strictObject({
    external_ref: externalRef,
    kind,
    sent_at: timestamp,
    body_text: bodyText.nullable(),
  }),
});

const conversationEscalatedSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION_V2),
  event_type: z.literal("conversation.escalated"),
  event_id: externalRef,
  occurred_at: timestamp,
  conversation: z.strictObject({
    external_ref: externalRef,
    channel: z.literal("whatsapp"),
  }),
});

// Poner y quitar una etiqueta del catálogo en un cliente (brief-16.2, D-1 a D-3): el cliente por
// teléfono, que tiene que existir, y la etiqueta por su id del CRM, leído de
// GET /api/read/v1/client-tags. Un tipo nuevo es un cambio compatible dentro de v2.
export const CLIENT_TAG_EVENT_TYPES_V2 = [
  "client.tag_added",
  "client.tag_removed",
] as const;

const clientTagSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION_V2),
  event_type: z.enum(CLIENT_TAG_EVENT_TYPES_V2),
  event_id: externalRef,
  occurred_at: timestamp,
  client: z.strictObject({
    phone: z.string().regex(E164),
  }),
  tag: z.strictObject({
    id: z.uuid(),
  }),
});

export type MessageRecordedEventV2 = z.infer<typeof messageRecordedSchema>;
export type ClientResolvedEventV2 = z.infer<typeof clientResolvedSchema>;
export type ConversationResolvedEventV2 = z.infer<
  typeof conversationResolvedSchema
>;
export type ConversationEscalatedEventV2 = z.infer<
  typeof conversationEscalatedSchema
>;
export type ClientTagEventV2 = z.infer<typeof clientTagSchema>;
export type IngestionEventV2 =
  | MessageRecordedEventV2
  | ClientResolvedEventV2
  | ConversationResolvedEventV2
  | ConversationEscalatedEventV2
  | ClientTagEventV2;

export type ParseIngestionEventV2Result =
  | { ok: true; event: IngestionEventV2 }
  | Failure<"VALIDATION_ERROR", { fields: IngestionFieldV2[] }>;

function invalid(fields: Iterable<string>): ParseIngestionEventV2Result {
  const named = new Set(fields);
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: INGESTION_FIELDS_V2.filter((field) => named.has(field)),
  };
}

// El teléfono como nombre (brief-12.1, R-6; brief-12.3, D-8): se comparan solo los dígitos, así que
// "+54 9 11 5555-0001" es el teléfono +5491155550001. Un nombre con otros dígitos se acepta.
export function isPhoneAsName(displayName: string, phone: string): boolean {
  const digits = displayName.replace(/\D/g, "");
  return digits !== "" && digits === phone.replace(/\D/g, "");
}

// Valida el cuerpo crudo y devuelve el evento normalizado, como parseIngestionEventV1: fechas en
// UTC con milisegundos, y ninguna más de 5 minutos después de receivedAt.
export function parseIngestionEventV2(
  body: string,
  receivedAt: Date,
): ParseIngestionEventV2Result {
  if (Buffer.byteLength(body, "utf8") > MAX_INGESTION_BODY_BYTES) {
    return invalid(["body"]);
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return invalid(["body"]);
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return invalid(["body"]);
  }

  const fieldsOf = (issues: z.core.$ZodIssue[]) =>
    issues.map((issue) =>
      issue.path.length === 0 ? "event" : issue.path.join("."),
    );
  const latest = receivedAt.getTime() + MAX_CLOCK_SKEW_MS;
  const late = (value: string) => Date.parse(value) > latest;
  const eventType = (json as { event_type?: unknown }).event_type;

  if (eventType === "client.resolved") {
    const parsed = clientResolvedSchema.safeParse(json);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const event: ClientResolvedEventV2 = {
      ...parsed.data,
      occurred_at: toUtc(parsed.data.occurred_at),
    };
    const rejected = new Set<string>();
    if (late(event.occurred_at)) rejected.add("occurred_at");
    if (
      event.client.display_name !== null &&
      isPhoneAsName(event.client.display_name, event.client.phone)
    ) {
      rejected.add("client.display_name");
    }
    if (rejected.size > 0) return invalid(rejected);
    return { ok: true, event };
  }

  if (eventType === "client.tag_added" || eventType === "client.tag_removed") {
    const parsed = clientTagSchema.safeParse(json);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const event: ClientTagEventV2 = {
      ...parsed.data,
      occurred_at: toUtc(parsed.data.occurred_at),
    };
    if (late(event.occurred_at)) return invalid(["occurred_at"]);
    return { ok: true, event };
  }

  if (eventType === "conversation.escalated") {
    const parsed = conversationEscalatedSchema.safeParse(json);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const event: ConversationEscalatedEventV2 = {
      ...parsed.data,
      occurred_at: toUtc(parsed.data.occurred_at),
    };
    if (late(event.occurred_at)) return invalid(["occurred_at"]);
    return { ok: true, event };
  }

  if (eventType === "conversation.resolved") {
    const parsed = conversationResolvedSchema.safeParse(json);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const event: ConversationResolvedEventV2 = {
      ...parsed.data,
      occurred_at: toUtc(parsed.data.occurred_at),
      message: {
        ...parsed.data.message,
        sent_at: toUtc(parsed.data.message.sent_at),
      },
    };
    const rejected = new Set<string>();
    if (late(event.occurred_at)) rejected.add("occurred_at");
    if (late(event.message.sent_at)) rejected.add("message.sent_at");
    if (rejected.size > 0) return invalid(rejected);
    return { ok: true, event };
  }

  // Cualquier otro tipo se valida como message.recorded, como en v1: un tipo desconocido informa
  // event_type y los demás campos inválidos.
  const parsed = messageRecordedSchema.safeParse(json);
  if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
  const event: MessageRecordedEventV2 = {
    ...parsed.data,
    occurred_at: toUtc(parsed.data.occurred_at),
    message: {
      ...parsed.data.message,
      sent_at: toUtc(parsed.data.message.sent_at),
    },
  };
  const rejected = new Set<string>();
  const outbound = event.message.direction === "outbound";
  if (outbound !== (event.message.sent_by !== undefined)) {
    rejected.add("message.sent_by");
  }
  if (late(event.occurred_at)) rejected.add("occurred_at");
  if (late(event.message.sent_at)) rejected.add("message.sent_at");
  if (rejected.size > 0) return invalid(rejected);
  return { ok: true, event };
}

// El mismo algoritmo que v1 (D-4 de la 6.5.1). contract_version entra en el hash, así que el mismo
// event_id enviado por v1 y por v2 nunca comparte el hash (brief-12.3, D-1).
export function ingestionPayloadHashV2(event: IngestionEventV2): string {
  return createHash("sha256")
    .update(canonicalJson(event), "utf8")
    .digest("hex");
}
