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
// la 16.2, dos tipos que solo existen en v2: poner y quitar una etiqueta en un cliente. Desde la
// 19.4, un tercero: el pedido pendiente que deja el agente. Desde la 29.10.2, el turno que pide.

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
// desde la 16.2 la etiqueta y desde la 19.4 las líneas del pedido, que se nombran juntas.
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
  "lines",
  "appointment",
  "appointment.reason_id",
  "appointment.starts_at",
  "appointment.product_id",
  "appointment.unit_id",
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

// El pedido pendiente del agente (brief-19.4, D-1 a D-3): el cliente por teléfono, que tiene que
// existir, y de 1 a 10 líneas con el id del producto, leído de la lectura, y la cantidad en texto,
// como quantity_available: mayor que cero, con hasta tres decimales y dentro de numeric(14, 3). Sin
// precios: los copia el CRM. Un producto repetido es un defecto del emisor y da 400 (D-3).
export const ORDER_PLACED_EVENT_TYPE_V2 = "order.placed";
export const MAX_AGENT_ORDER_LINES = 10;

const QUANTITY_TEXT = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;
const quantityText = z
  .string()
  .regex(QUANTITY_TEXT)
  .refine((value) => /[1-9]/.test(value));

const orderPlacedSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION_V2),
  event_type: z.literal(ORDER_PLACED_EVENT_TYPE_V2),
  event_id: externalRef,
  occurred_at: timestamp,
  client: z.strictObject({
    phone: z.string().regex(E164),
  }),
  lines: z
    .array(
      z.strictObject({
        product_id: z.uuid(),
        quantity: quantityText,
      }),
    )
    .min(1)
    .max(MAX_AGENT_ORDER_LINES),
});

// El pedido con unidades del agente (brief-29.8, D-7; U-2): un tipo nuevo dentro de v2, compatible.
// Cada línea es de cantidad, como en order.placed, o de unidades, con de 1 a 10 ids sin repetir, leídos
// de la lectura v3. La cantidad de una línea de unidades es la cuenta de ids. order.placed no cambia.
export const ORDER_PLACED_WITH_UNITS_EVENT_TYPE_V2 = "order.placed_with_units";
export const MAX_AGENT_LINE_UNITS = 10;

const orderPlacedWithUnitsSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION_V2),
  event_type: z.literal(ORDER_PLACED_WITH_UNITS_EVENT_TYPE_V2),
  event_id: externalRef,
  occurred_at: timestamp,
  client: z.strictObject({
    phone: z.string().regex(E164),
  }),
  lines: z
    .array(
      z.union([
        z.strictObject({
          product_id: z.uuid(),
          quantity: quantityText,
        }),
        z.strictObject({
          product_id: z.uuid(),
          unit_ids: z.array(z.uuid()).min(1).max(MAX_AGENT_LINE_UNITS),
        }),
      ]),
    )
    .min(1)
    .max(MAX_AGENT_ORDER_LINES),
});

// El turno que pide el agente (brief-29.10.2, D-3; U-3): el cliente por teléfono, que tiene que existir,
// el motivo y el inicio de una franja, leídos de GET /api/read/v3/appointment-slots, y opcional un
// producto o una unidad, nunca los dos. Sin nota ni fin: el fin lo pone el CRM. starts_at sigue las
// reglas de fecha de occurred_at y se normaliza a UTC, así que el desplazamiento con que llega no cambia
// el contenido. Un tipo nuevo es un cambio compatible dentro de v2.
export const APPOINTMENT_REQUESTED_EVENT_TYPE_V2 = "appointment.requested";

const appointmentRequestedSchema = z.strictObject({
  contract_version: z.literal(INGESTION_CONTRACT_VERSION_V2),
  event_type: z.literal(APPOINTMENT_REQUESTED_EVENT_TYPE_V2),
  event_id: externalRef,
  occurred_at: timestamp,
  client: z.strictObject({
    phone: z.string().regex(E164),
  }),
  appointment: z.strictObject({
    reason_id: z.uuid(),
    starts_at: timestamp,
    product_id: z.uuid().optional(),
    unit_id: z.uuid().optional(),
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
export type OrderPlacedEventV2 = z.infer<typeof orderPlacedSchema>;
export type OrderPlacedWithUnitsEventV2 = z.infer<
  typeof orderPlacedWithUnitsSchema
>;
export type AppointmentRequestedEventV2 = z.infer<
  typeof appointmentRequestedSchema
>;
export type IngestionEventV2 =
  | MessageRecordedEventV2
  | ClientResolvedEventV2
  | ConversationResolvedEventV2
  | ConversationEscalatedEventV2
  | ClientTagEventV2
  | OrderPlacedEventV2
  | OrderPlacedWithUnitsEventV2
  | AppointmentRequestedEventV2;

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

  // Un problema dentro de las líneas se informa como lines, sin la posición (brief-19.4, D-2).
  const fieldsOf = (issues: z.core.$ZodIssue[]) =>
    issues.map((issue) =>
      issue.path.length === 0
        ? "event"
        : issue.path[0] === "lines"
          ? "lines"
          : issue.path.join("."),
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

  if (eventType === ORDER_PLACED_EVENT_TYPE_V2) {
    const parsed = orderPlacedSchema.safeParse(json);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const event: OrderPlacedEventV2 = {
      ...parsed.data,
      occurred_at: toUtc(parsed.data.occurred_at),
    };
    const rejected = new Set<string>();
    if (late(event.occurred_at)) rejected.add("occurred_at");
    // El uuid se compara sin mayúsculas: es el mismo producto (D-3).
    const products = event.lines.map((line) => line.product_id.toLowerCase());
    if (new Set(products).size !== products.length) rejected.add("lines");
    if (rejected.size > 0) return invalid(rejected);
    return { ok: true, event };
  }

  if (eventType === ORDER_PLACED_WITH_UNITS_EVENT_TYPE_V2) {
    const parsed = orderPlacedWithUnitsSchema.safeParse(json);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const event: OrderPlacedWithUnitsEventV2 = {
      ...parsed.data,
      occurred_at: toUtc(parsed.data.occurred_at),
    };
    const rejected = new Set<string>();
    if (late(event.occurred_at)) rejected.add("occurred_at");
    // Los uuid se comparan sin mayúsculas, como en order.placed: ni un producto ni una unidad se
    // repiten en su línea.
    const products = event.lines.map((line) => line.product_id.toLowerCase());
    if (new Set(products).size !== products.length) rejected.add("lines");
    for (const line of event.lines) {
      if (!("unit_ids" in line)) continue;
      const units = line.unit_ids.map((id) => id.toLowerCase());
      if (new Set(units).size !== units.length) rejected.add("lines");
    }
    if (rejected.size > 0) return invalid(rejected);
    return { ok: true, event };
  }

  if (eventType === APPOINTMENT_REQUESTED_EVENT_TYPE_V2) {
    const parsed = appointmentRequestedSchema.safeParse(json);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const { product_id, unit_id } = parsed.data.appointment;
    const event: AppointmentRequestedEventV2 = {
      ...parsed.data,
      occurred_at: toUtc(parsed.data.occurred_at),
      appointment: {
        ...parsed.data.appointment,
        starts_at: toUtc(parsed.data.appointment.starts_at),
      },
    };
    const rejected = new Set<string>();
    if (late(event.occurred_at)) rejected.add("occurred_at");
    // Un producto o una unidad, nunca los dos (U-3).
    if (product_id !== undefined && unit_id !== undefined) {
      rejected.add("appointment");
    }
    if (rejected.size > 0) return invalid(rejected);
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
