import { createHash } from "node:crypto";
import { z } from "zod";
import type { Failure } from "@/shared/errors";

// Contrato de ingestión v1: docs/contracts/ingestion-v1.md (brief-6.5.1).
// Validación pura del cuerpo de un evento y su payload_hash. Sin base de datos ni HTTP: el registro
// y la proyección llegan en la 6.5.2, y la credencial de servicio en la 6.5.3.

export const INGESTION_CONTRACT_VERSION = "1";
// client.resolved desde la 12.1 (D-1) y conversation.resolved desde la 12.2 (D-1): un event_type
// nuevo es un cambio compatible dentro de v1.
export const INGESTION_EVENT_TYPES = [
  "message.recorded",
  "client.resolved",
  "conversation.resolved",
] as const;
// Mismo límite que el alta desde el backoffice (brief-5.2, D-5).
export const MAX_CLIENT_NAME_LENGTH = 200;
// Alcanza para un cuerpo de 4096 puntos de código escritos como escapes \uXXXX (brief-6.5.1).
export const MAX_INGESTION_BODY_BYTES = 64 * 1024;
export const MAX_EXTERNAL_REF_LENGTH = 200;
export const MAX_MESSAGE_BODY_LENGTH = 4096;
// Tolerancia de reloj del emisor para fechas en el futuro (D-2).
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

// Campos que puede nombrar un VALIDATION_ERROR, en orden fijo. "body" es el cuerpo HTTP entero y
// "event" el objeto raíz; un campo desconocido se informa por su objeto, nunca por su nombre.
export const INGESTION_FIELDS = [
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
  "message.sent_at",
  "message.body_text",
  // client.resolved (brief-12.1).
  "client",
  "client.phone",
  "client.display_name",
] as const;

export type IngestionField = (typeof INGESTION_FIELDS)[number];

// Un surrogate suelto no es UTF-8 válido, y PostgreSQL rechaza el carácter NUL en text.
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
const CONTROL = /\p{Cc}/u;
const E164 = /^\+[1-9][0-9]{1,14}$/;
const MORE_THAN_MILLISECONDS = /\.\d{4,}/;

// Referencia opaca del emisor: el CRM no la interpreta.
const externalRef = z
  .string()
  .min(1)
  .max(MAX_EXTERNAL_REF_LENGTH)
  .refine((value) => value.trim() === value, "espacios al borde")
  .refine((value) => !CONTROL.test(value), "caracteres de control")
  .refine((value) => !LONE_SURROGATE.test(value), "UTF-16 inválido");

// La misma regla para el source de la credencial (brief-6.5.2).
export function isOpaqueReference(value: unknown): boolean {
  return externalRef.safeParse(value).success;
}

// Fecha ISO 8601 con zona y hasta milisegundos, que el hash guarda en UTC.
const timestamp = z.iso
  .datetime({ offset: true })
  .refine((value) => !MORE_THAN_MILLISECONDS.test(value), "precisión");

const bodyText = z
  .string()
  .min(1)
  .refine(
    (value) => Array.from(value).length <= MAX_MESSAGE_BODY_LENGTH,
    "largo",
  )
  .refine((value) => !value.includes("\u0000"), "carácter NUL")
  .refine((value) => !LONE_SURROGATE.test(value), "UTF-16 inválido");

// Cualquier tipo que no sea client.resolved ni conversation.resolved se valida con este esquema,
// como antes de la 12.1: un
// tipo desconocido sigue informando event_type y, si los hay, los demás campos inválidos (AC-8).
const messageRecordedSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION),
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
    sent_at: timestamp,
    body_text: bodyText.nullable(),
  }),
});

// Nombre propuesto por el emisor (brief-12.1, D-5). Se rechaza, no se normaliza: sin espacios al
// borde, sin caracteres de control y UTF-16 válido, como las referencias opacas.
const clientName = z
  .string()
  .min(1)
  .max(MAX_CLIENT_NAME_LENGTH)
  .refine((value) => value.trim() === value, "espacios al borde")
  .refine((value) => !CONTROL.test(value), "caracteres de control")
  .refine((value) => !LONE_SURROGATE.test(value), "UTF-16 inválido");

const clientResolvedSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION),
  event_type: z.literal("client.resolved"),
  event_id: externalRef,
  occurred_at: timestamp,
  client: z.strictObject({
    phone: z.string().regex(E164),
    display_name: clientName.nullable(),
  }),
});

// Mensaje entrante que va a la conversación vigente del cliente o a una nueva (brief-12.2, D-1).
// Sin direction: siempre es inbound. external_ref es la referencia propuesta (D-2), y el teléfono
// es obligatorio porque la vigencia se calcula por cliente (D-7).
const conversationResolvedSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION),
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
    sent_at: timestamp,
    body_text: bodyText.nullable(),
  }),
});

export type MessageRecordedEventV1 = z.infer<typeof messageRecordedSchema>;
export type ClientResolvedEventV1 = z.infer<typeof clientResolvedSchema>;
export type ConversationResolvedEventV1 = z.infer<
  typeof conversationResolvedSchema
>;
export type IngestionEventV1 =
  MessageRecordedEventV1 | ClientResolvedEventV1 | ConversationResolvedEventV1;

export type ParseIngestionEventResult =
  | { ok: true; event: IngestionEventV1 }
  | Failure<"VALIDATION_ERROR", { fields: IngestionField[] }>;

function invalid(fields: Iterable<string>): ParseIngestionEventResult {
  const named = new Set(fields);
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: INGESTION_FIELDS.filter((field) => named.has(field)),
  };
}

function toUtc(value: string): string {
  return new Date(value).toISOString();
}

// Valida el cuerpo crudo de un request y devuelve el evento normalizado: fechas en UTC con
// milisegundos. receivedAt es la hora de recepción, para rechazar fechas demasiado en el futuro.
export function parseIngestionEventV1(
  body: string,
  receivedAt: Date,
): ParseIngestionEventResult {
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
  const future = new Set<string>();

  if ((json as { event_type?: unknown }).event_type === "client.resolved") {
    const parsed = clientResolvedSchema.safeParse(json);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const event: ClientResolvedEventV1 = {
      ...parsed.data,
      occurred_at: toUtc(parsed.data.occurred_at),
    };
    if (Date.parse(event.occurred_at) > latest) future.add("occurred_at");
    if (future.size > 0) return invalid(future);
    return { ok: true, event };
  }

  if (
    (json as { event_type?: unknown }).event_type === "conversation.resolved"
  ) {
    const parsed = conversationResolvedSchema.safeParse(json);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const event: ConversationResolvedEventV1 = {
      ...parsed.data,
      occurred_at: toUtc(parsed.data.occurred_at),
      message: {
        ...parsed.data.message,
        sent_at: toUtc(parsed.data.message.sent_at),
      },
    };
    if (Date.parse(event.occurred_at) > latest) future.add("occurred_at");
    if (Date.parse(event.message.sent_at) > latest) {
      future.add("message.sent_at");
    }
    if (future.size > 0) return invalid(future);
    return { ok: true, event };
  }

  const parsed = messageRecordedSchema.safeParse(json);
  if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
  const event: MessageRecordedEventV1 = {
    ...parsed.data,
    occurred_at: toUtc(parsed.data.occurred_at),
    message: {
      ...parsed.data.message,
      sent_at: toUtc(parsed.data.message.sent_at),
    },
  };
  if (Date.parse(event.occurred_at) > latest) future.add("occurred_at");
  if (Date.parse(event.message.sent_at) > latest) {
    future.add("message.sent_at");
  }
  if (future.size > 0) return invalid(future);
  return { ok: true, event };
}

// JSON con las claves ordenadas y sin espacios (D-4).
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// SHA-256 en hexadecimal del evento ya normalizado (D-4).
export function ingestionPayloadHash(event: IngestionEventV1): string {
  return createHash("sha256")
    .update(canonicalJson(event), "utf8")
    .digest("hex");
}
