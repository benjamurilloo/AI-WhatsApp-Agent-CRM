import {
  escalateIngestedConversation,
  findEscalatedConversation,
  findIngestedConversation,
  recordIngestedMessage,
  resolveIngestedConversation,
  type ResolvedConversation,
} from "@/modules/conversations";
import {
  changeClientTagByPhone,
  findResolvedClientByPhone,
  resolveClientByPhone,
  type ResolvedClient,
} from "@/modules/crm";
import {
  findOrderPlacedByIngestion,
  placeOrderFromIngestion,
} from "@/modules/orders";
import type { DbTransaction } from "@/shared/db";
import type { Failure } from "@/shared/errors";
import {
  ingestionPayloadHash,
  isOpaqueReference,
  parseIngestionEventV1,
  type ClientResolvedEventV1,
  type ConversationEscalatedEventV1,
  type ConversationResolvedEventV1,
  type IngestionEventV1,
  type IngestionField,
  type MessageRecordedEventV1,
} from "./contract";
import {
  CLIENT_TAG_EVENT_TYPES_V2,
  ingestionPayloadHashV2,
  parseIngestionEventV2,
  type ClientResolvedEventV2,
  type ClientTagEventV2,
  type ConversationEscalatedEventV2,
  type ConversationResolvedEventV2,
  type IngestionEventV2,
  type IngestionFieldV2,
  type MessageRecordedEventV2,
  type OrderPlacedEventV2,
  type OrderPlacedWithUnitsEventV2,
} from "./contract-v2";
import * as repository from "./repository";

// Registro idempotente y proyección de un evento del contrato v1 (brief-6.5.2). Sin HTTP: el
// endpoint y la credencial llegan en la 6.5.3 (D-1). Hasta entonces, la organización y el source
// llegan como contexto explícito (brief-6.5.1, D-3).
//
// Desde la 12.1 (D-1) hay dos tipos de evento con el mismo ledger: message.recorded proyecta un
// mensaje en conversations, y client.resolved resuelve un cliente en crm, que lo audita con la
// credencial como actor. Desde la 12.2 (D-1), conversation.resolved registra un mensaje entrante
// en la conversación vigente del cliente o en una nueva, y conversation.escalated (D-6) deriva una
// conversación a una persona, auditada con la credencial. Desde la 16.2, client.tag_added y
// client.tag_removed ponen y quitan una etiqueta del catálogo, solo en v2. Desde la 19.4,
// order.placed deja un pedido pendiente en orders, también solo en v2. Desde la 29.8,
// order.placed_with_units deja el pendiente con las unidades que eligió el cliente (brief-29.8, D-7).

// Desde la 12.3 (D-1), el contrato v2 entra por recordIngestionEventV2 con el mismo ledger y la
// misma proyección. Lo único que cambia según la versión es el CONFLICT: v2 dice por qué (D-7).

type IngestionEvent = IngestionEventV1 | IngestionEventV2;
type ContractVersion = "1" | "2";

// credentialId es el actor de la auditoría de client.resolved (brief-12.1, D-3) y de
// conversation.escalated (brief-12.2, D-6). Lo trae el endpoint; sin él, esos eventos son un error
// de programación, no del emisor.
export type IngestionContext = {
  organizationId: string;
  source: string;
  credentialId?: string;
};

export type MessageAccepted = {
  ok: true;
  result: "accepted" | "duplicate";
  eventId: string;
  conversationExternalRef: string;
  messageExternalRef: string;
};

// client es null solo en un reenvío cuyo teléfono ya no pertenece a ningún cliente (D-9).
export type ClientAccepted = {
  ok: true;
  result: "accepted" | "duplicate";
  eventId: string;
  client: ResolvedClient | null;
};

// conversation.resolved y conversation.escalated. conversation es null solo en un reenvío: el de
// un conversation.resolved cuyo mensaje ya no se encuentra por el cliente del teléfono (brief-12.2,
// D-5), o el de un conversation.escalated cuya conversación ya no existe con esa referencia.
export type ConversationAccepted = {
  ok: true;
  result: "accepted" | "duplicate";
  eventId: string;
  conversation: ResolvedConversation | null;
};

// client.tag_added y client.tag_removed (brief-16.2, D-5): siempre 200, sin datos del cliente. Poner una
// que ya tiene, o quitar una que no tiene, es accepted sin escribir: el estado pedido ya se cumple.
export type ClientTagAccepted = {
  ok: true;
  result: "accepted" | "duplicate";
  eventId: string;
  eventType: ClientTagEventV2["event_type"];
};

// order.placed (brief-19.4, D-6) y, desde la 29.8, order.placed_with_units (D-7): siempre 200, con el número del pedido. order es null solo en un
// reenvío cuyo evento no tiene pedido, que no debería pasar.
export type OrderPlacedAccepted = {
  ok: true;
  result: "accepted" | "duplicate";
  eventId: string;
  order: { number: number; displayNumber: string } | null;
};

export type IngestionAccepted =
  | MessageAccepted
  | ClientAccepted
  | ConversationAccepted
  | ClientTagAccepted
  | OrderPlacedAccepted;

// Reglas de negocio de los tipos nuevos (brief-12.2, C-2): responden 422 y quedan como failed con
// la regla en error_code, para que un reenvío responda la misma (decisión del usuario del
// 2026-09-25, al empezar la 12.2.2). message.recorded y client.resolved no las devuelven nunca.
export const INGESTION_RULES = [
  "client_not_found",
  "conversation_not_found",
  "conversation_closed",
  // Desde la 16.2 (D-6), de client.tag_added y client.tag_removed.
  "tag_not_found",
  "client_tag_limit",
  // Desde la 19.4 (D-6), de order.placed, que también usa client_not_found.
  "client_inactive",
  "product_not_found",
  "product_without_price",
  "currency_mismatch",
  "amount_out_of_range",
  // Desde la 29.8 (D-7), solo de order.placed_with_units.
  "unit_tracking_mismatch",
  "unit_not_available",
] as const;
export type IngestionRule = (typeof INGESTION_RULES)[number];

function isIngestionRule(value: string): value is IngestionRule {
  return (INGESTION_RULES as readonly string[]).includes(value);
}

// Por qué un evento de v2 da CONFLICT (brief-12.3, D-7). event_payload_mismatch no se guarda: el
// registro existente no se modifica. Los otros dos quedan en error_code, solo en los eventos de v2,
// para que un reenvío responda el mismo (decisión del usuario del 2026-09-25, enmienda de D-7). Los
// de v1 siguen guardando CONFLICT.
export const CONFLICT_REASONS = [
  "event_payload_mismatch",
  "message_already_recorded",
  "conversation_ref_taken",
] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];

type StoredConflictReason = Exclude<ConflictReason, "event_payload_mismatch">;

function isStoredConflictReason(value: string): value is StoredConflictReason {
  return (
    value === "message_already_recorded" || value === "conversation_ref_taken"
  );
}

export type RecordIngestionEventResult =
  | IngestionAccepted
  | Failure<
      "VALIDATION_ERROR",
      { fields: (IngestionField | IngestionFieldV2 | "source")[] }
    >
  // recorded: el rechazo quedó en ingestion_events como failed (brief-6.5.1, D-6). reason, solo en
  // v2.
  | Failure<"CONFLICT", { recorded: boolean; reason?: ConflictReason }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: IngestionRule; recorded: true }>;

type ExistingOutcome =
  | { kind: "duplicate" }
  | { kind: "failed"; errorCode: string }
  | { kind: "conflict" };

// Qué responde un reenvío según el evento guardado (contrato v1, "Respuestas").
export function existingEventOutcome(
  stored: repository.StoredEvent,
  payloadHash: string,
): ExistingOutcome {
  if (stored.payloadHash !== payloadHash) return { kind: "conflict" };
  if (stored.status === "processed") return { kind: "duplicate" };
  if (stored.status === "failed" && stored.errorCode !== null) {
    return { kind: "failed", errorCode: stored.errorCode };
  }
  // received no se confirma nunca: la reserva y su cierre van en la misma transacción.
  throw new Error(`evento de ingestión en estado inesperado: ${stored.status}`);
}

function messageAccepted(
  event: MessageRecordedEventV1 | MessageRecordedEventV2,
  result: MessageAccepted["result"],
): MessageAccepted {
  return {
    ok: true,
    result,
    eventId: event.event_id,
    conversationExternalRef: event.conversation.external_ref,
    messageExternalRef: event.message.external_ref,
  };
}

// Reenvío de un evento ya procesado: un mensaje no hace nada más; un cliente se vuelve a leer por
// teléfono, sin escribir (D-9).
async function duplicate(
  tx: DbTransaction,
  context: IngestionContext,
  event: IngestionEvent,
  storedId: string,
): Promise<IngestionAccepted> {
  if (event.event_type === "message.recorded") {
    return messageAccepted(event, "duplicate");
  }
  if (
    event.event_type === "order.placed" ||
    event.event_type === "order.placed_with_units"
  ) {
    // El mismo número que la primera vez, por el vínculo del pedido con su evento, sin escribir
    // (brief-19.4, D-6).
    return {
      ok: true,
      result: "duplicate",
      eventId: event.event_id,
      order: await findOrderPlacedByIngestion(
        tx,
        context.organizationId,
        storedId,
      ),
    };
  }
  if (isClientTagEvent(event)) {
    // Sin leer ni escribir: la respuesta no lleva datos del cliente (brief-16.2, D-5).
    return clientTagAccepted(event, "duplicate");
  }
  if (event.event_type === "conversation.resolved") {
    return {
      ok: true,
      result: "duplicate",
      eventId: event.event_id,
      conversation: await findIngestedConversation(tx, {
        organizationId: context.organizationId,
        clientPhone: event.conversation.client_phone,
        channel: event.conversation.channel,
        messageExternalRef: event.message.external_ref,
      }),
    };
  }
  if (event.event_type === "conversation.escalated") {
    // El estado actual, sin escribir ni auditar otra vez.
    return {
      ok: true,
      result: "duplicate",
      eventId: event.event_id,
      conversation: await findEscalatedConversation(tx, {
        organizationId: context.organizationId,
        channel: event.conversation.channel,
        externalRef: event.conversation.external_ref,
      }),
    };
  }
  return {
    ok: true,

    result: "duplicate",
    eventId: event.event_id,
    client: await findResolvedClientByPhone(
      tx,
      context.organizationId,
      event.client.phone,
    ),
  };
}

// Un mensaje que no se registró queda failed: en v1 con CONFLICT, y en v2 con el motivo (D-7).
async function rejectConflict(
  tx: DbTransaction,
  context: IngestionContext,
  reserved: string,
  version: ContractVersion,
  reason: StoredConflictReason,
): Promise<RecordIngestionEventResult> {
  await repository.finishEvent(tx, context.organizationId, reserved, {
    status: "failed",
    errorCode: version === "2" ? reason : "CONFLICT",
  });
  return version === "2"
    ? { ok: false, code: "CONFLICT", recorded: true, reason }
    : { ok: false, code: "CONFLICT", recorded: true };
}

async function projectMessage(
  tx: DbTransaction,
  context: IngestionContext,
  reserved: string,
  version: ContractVersion,
  event: MessageRecordedEventV1 | MessageRecordedEventV2,
): Promise<RecordIngestionEventResult> {
  const projected = await recordIngestedMessage(tx, {
    organizationId: context.organizationId,
    conversation: {
      externalRef: event.conversation.external_ref,
      channel: event.conversation.channel,
      clientPhone: event.conversation.client_phone,
    },
    message: {
      externalRef: event.message.external_ref,
      direction: event.message.direction,
      sentAt: new Date(event.message.sent_at),
      bodyText: event.message.body_text,
      // v1 no los trae: quedan null, sin dato (brief-12.3, D-2 y D-3).
      kind: "kind" in event.message ? event.message.kind : null,
      sentBy: "kind" in event.message ? (event.message.sent_by ?? null) : null,
    },
  });
  if (!projected.ok) {
    return rejectConflict(tx, context, reserved, version, projected.reason);
  }
  await repository.finishEvent(tx, context.organizationId, reserved, {
    status: "processed",
  });
  return messageAccepted(event, "accepted");
}

async function projectConversation(
  tx: DbTransaction,
  context: IngestionContext,
  reserved: string,
  version: ContractVersion,
  event: ConversationResolvedEventV1 | ConversationResolvedEventV2,
): Promise<RecordIngestionEventResult> {
  const resolved = await resolveIngestedConversation(tx, {
    organizationId: context.organizationId,
    clientPhone: event.conversation.client_phone,
    channel: event.conversation.channel,
    proposedExternalRef: event.conversation.external_ref,
    message: {
      externalRef: event.message.external_ref,
      sentAt: new Date(event.message.sent_at),
      bodyText: event.message.body_text,
      kind: "kind" in event.message ? event.message.kind : null,
    },
  });
  if (!resolved.ok && resolved.code === "CONFLICT") {
    return rejectConflict(tx, context, reserved, version, resolved.reason);
  }
  if (!resolved.ok) return rejectByRule(tx, context, reserved, resolved.rule);
  await repository.finishEvent(tx, context.organizationId, reserved, {
    status: "processed",
  });
  return {
    ok: true,
    result: "accepted",
    eventId: event.event_id,
    conversation: resolved.conversation,
  };
}

// Un rechazo de negocio queda failed con la regla en error_code (brief-12.2, C-2).
async function rejectByRule(
  tx: DbTransaction,
  context: IngestionContext,
  reserved: string,
  rule: IngestionRule,
): Promise<RecordIngestionEventResult> {
  await repository.finishEvent(tx, context.organizationId, reserved, {
    status: "failed",
    errorCode: rule,
  });
  return { ok: false, code: "BUSINESS_RULE_VIOLATION", rule, recorded: true };
}

async function projectEscalation(
  tx: DbTransaction,
  context: IngestionContext,
  reserved: string,
  event: ConversationEscalatedEventV1 | ConversationEscalatedEventV2,
): Promise<RecordIngestionEventResult> {
  if (!context.credentialId) {
    throw new Error("conversation.escalated sin credencial para auditar");
  }
  const escalated = await escalateIngestedConversation(tx, {
    organizationId: context.organizationId,
    credentialId: context.credentialId,
    channel: event.conversation.channel,
    externalRef: event.conversation.external_ref,
  });
  if (!escalated.ok) {
    return rejectByRule(tx, context, reserved, escalated.rule);
  }
  await repository.finishEvent(tx, context.organizationId, reserved, {
    status: "processed",
  });
  return {
    ok: true,
    result: "accepted",
    eventId: event.event_id,
    conversation: escalated.conversation,
  };
}

function isClientTagEvent(event: IngestionEvent): event is ClientTagEventV2 {
  return (CLIENT_TAG_EVENT_TYPES_V2 as readonly string[]).includes(
    event.event_type,
  );
}

function clientTagAccepted(
  event: ClientTagEventV2,
  result: ClientTagAccepted["result"],
): ClientTagAccepted {
  return {
    ok: true,
    result,
    eventId: event.event_id,
    eventType: event.event_type,
  };
}

// Poner o quitar una etiqueta (brief-16.2): crm busca y bloquea al cliente por teléfono, aplica las
// reglas de la ficha y audita con la credencial. Un rechazo queda failed con la regla (D-6).
async function projectClientTag(
  tx: DbTransaction,
  context: IngestionContext,
  reserved: string,
  event: ClientTagEventV2,
): Promise<RecordIngestionEventResult> {
  if (!context.credentialId) {
    throw new Error(`${event.event_type} sin credencial para auditar`);
  }
  const changed = await changeClientTagByPhone(tx, {
    organizationId: context.organizationId,
    credentialId: context.credentialId,
    phoneE164: event.client.phone,
    tagId: event.tag.id,
    assign: event.event_type === "client.tag_added",
  });
  if (!changed.ok) return rejectByRule(tx, context, reserved, changed.rule);
  await repository.finishEvent(tx, context.organizationId, reserved, {
    status: "processed",
  });
  return clientTagAccepted(event, "accepted");
}

// El pedido pendiente del agente (brief-19.4): orders busca y bloquea al cliente por teléfono, aplica
// las reglas del alta y audita con la credencial. Un rechazo queda failed con la regla (D-6) y no
// escribe nada en orders. Desde la 29.8, order.placed_with_units admite líneas de unidades; order.placed
// sigue rechazando el producto por unidad como product_not_found (brief-29.8, D-7).
async function projectOrderPlaced(
  tx: DbTransaction,
  context: IngestionContext,
  reserved: string,
  event: OrderPlacedEventV2 | OrderPlacedWithUnitsEventV2,
): Promise<RecordIngestionEventResult> {
  if (!context.credentialId) {
    throw new Error(`${event.event_type} sin credencial para auditar`);
  }
  const placed = await placeOrderFromIngestion(tx, {
    organizationId: context.organizationId,
    credentialId: context.credentialId,
    ingestionEventId: reserved,
    phoneE164: event.client.phone,
    withUnits: event.event_type === "order.placed_with_units",
    lines: event.lines.map((line) =>
      "unit_ids" in line
        ? { productId: line.product_id, unitIds: line.unit_ids }
        : { productId: line.product_id, quantity: line.quantity },
    ),
  });
  if (!placed.ok) return rejectByRule(tx, context, reserved, placed.rule);
  await repository.finishEvent(tx, context.organizationId, reserved, {
    status: "processed",
  });
  return {
    ok: true,
    result: "accepted",
    eventId: event.event_id,
    order: placed.order,
  };
}

async function projectClient(
  tx: DbTransaction,
  context: IngestionContext,
  reserved: string,
  event: ClientResolvedEventV1 | ClientResolvedEventV2,
): Promise<RecordIngestionEventResult> {
  if (!context.credentialId) {
    throw new Error("client.resolved sin credencial para auditar");
  }
  const client = await resolveClientByPhone(tx, {
    organizationId: context.organizationId,
    credentialId: context.credentialId,
    phoneE164: event.client.phone,
    displayName: event.client.display_name,
  });
  await repository.finishEvent(tx, context.organizationId, reserved, {
    status: "processed",
  });
  return {
    ok: true,

    result: "accepted",
    eventId: event.event_id,
    client,
  };
}

export async function recordIngestionEvent(
  context: IngestionContext,
  body: string,
  receivedAt: Date = new Date(),
): Promise<RecordIngestionEventResult> {
  if (!isOpaqueReference(context.source)) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["source"] };
  }
  const parsed = parseIngestionEventV1(body, receivedAt);
  if (!parsed.ok) return parsed;
  return recordEvent(
    context,
    parsed.event,
    ingestionPayloadHash(parsed.event),
    "1",
  );
}

// Contrato v2 (brief-12.3, D-1): mismo ledger, misma identidad y misma proyección que v1.
export async function recordIngestionEventV2(
  context: IngestionContext,
  body: string,
  receivedAt: Date = new Date(),
): Promise<RecordIngestionEventResult> {
  if (!isOpaqueReference(context.source)) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["source"] };
  }
  const parsed = parseIngestionEventV2(body, receivedAt);
  if (!parsed.ok) return parsed;
  return recordEvent(
    context,
    parsed.event,
    ingestionPayloadHashV2(parsed.event),
    "2",
  );
}

async function recordEvent(
  context: IngestionContext,
  event: IngestionEvent,
  payloadHash: string,
  version: ContractVersion,
): Promise<RecordIngestionEventResult> {
  const identity = {
    organizationId: context.organizationId,
    source: context.source,
    externalRef: event.event_id,
  };
  return repository.withTransaction(
    async (tx): Promise<RecordIngestionEventResult> => {
      const reserved = await repository.reserveEvent(tx, {
        ...identity,
        eventType: event.event_type,
        payloadHash,
      });

      if (!reserved) {
        const stored = await repository.findEvent(tx, identity);
        if (!stored) {
          throw new Error("evento de ingestión ausente después del conflicto");
        }
        const outcome = existingEventOutcome(stored, payloadHash);
        if (outcome.kind === "duplicate") {
          return duplicate(tx, context, event, stored.id);
        }
        if (outcome.kind === "failed" && outcome.errorCode === "CONFLICT") {
          return { ok: false, code: "CONFLICT", recorded: true };
        }
        // Solo los eventos de v2 guardan el motivo, y su reenvío responde el mismo (D-7).
        if (
          outcome.kind === "failed" &&
          isStoredConflictReason(outcome.errorCode)
        ) {
          return {
            ok: false,
            code: "CONFLICT",
            recorded: true,
            reason: outcome.errorCode,
          };
        }
        if (outcome.kind === "failed" && isIngestionRule(outcome.errorCode)) {
          return {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: outcome.errorCode,
            recorded: true,
          };
        }
        if (outcome.kind === "failed") {
          throw new Error(
            `código de rechazo desconocido: ${outcome.errorCode}`,
          );
        }
        return version === "2"
          ? {
              ok: false,
              code: "CONFLICT",
              recorded: false,
              reason: "event_payload_mismatch",
            }
          : { ok: false, code: "CONFLICT", recorded: false };
      }

      if (event.event_type === "message.recorded") {
        return projectMessage(tx, context, reserved, version, event);
      }
      if (event.event_type === "conversation.resolved") {
        return projectConversation(tx, context, reserved, version, event);
      }
      if (event.event_type === "conversation.escalated") {
        return projectEscalation(tx, context, reserved, event);
      }
      if (isClientTagEvent(event)) {
        return projectClientTag(tx, context, reserved, event);
      }
      if (
        event.event_type === "order.placed" ||
        event.event_type === "order.placed_with_units"
      ) {
        return projectOrderPlaced(tx, context, reserved, event);
      }
      return projectClient(tx, context, reserved, event);
    },
  );
}
