import {
  findIngestedConversation,
  recordIngestedMessage,
  resolveIngestedConversation,
  type ResolvedConversation,
} from "@/modules/conversations";
import {
  findResolvedClientByPhone,
  resolveClientByPhone,
  type ResolvedClient,
} from "@/modules/crm";
import type { DbTransaction } from "@/shared/db";
import type { Failure } from "@/shared/errors";
import {
  ingestionPayloadHash,
  isOpaqueReference,
  parseIngestionEventV1,
  type ClientResolvedEventV1,
  type ConversationResolvedEventV1,
  type IngestionEventV1,
  type IngestionField,
  type MessageRecordedEventV1,
} from "./contract";
import * as repository from "./repository";

// Registro idempotente y proyección de un evento del contrato v1 (brief-6.5.2). Sin HTTP: el
// endpoint y la credencial llegan en la 6.5.3 (D-1). Hasta entonces, la organización y el source
// llegan como contexto explícito (brief-6.5.1, D-3).
//
// Desde la 12.1 (D-1) hay dos tipos de evento con el mismo ledger: message.recorded proyecta un
// mensaje en conversations, y client.resolved resuelve un cliente en crm, que lo audita con la
// credencial como actor. Desde la 12.2 (D-1), conversation.resolved registra un mensaje entrante
// en la conversación vigente del cliente o en una nueva.

// credentialId es el actor de la auditoría de client.resolved (brief-12.1, D-3). Lo trae el
// endpoint; sin él, un client.resolved es un error de programación, no del emisor.
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

// conversation es null solo en un reenvío cuyo mensaje ya no se encuentra por el cliente del
// teléfono (brief-12.2, D-5).
export type ConversationAccepted = {
  ok: true;
  result: "accepted" | "duplicate";
  eventId: string;
  conversation: ResolvedConversation | null;
};

export type IngestionAccepted =
  MessageAccepted | ClientAccepted | ConversationAccepted;

// Reglas de negocio de los tipos nuevos (brief-12.2, C-2): responden 422 y quedan como failed con
// error_code BUSINESS_RULE_VIOLATION. message.recorded y client.resolved no las devuelven nunca.
export type IngestionRule = "client_not_found";

export type RecordIngestionEventResult =
  | IngestionAccepted
  | Failure<"VALIDATION_ERROR", { fields: (IngestionField | "source")[] }>
  // recorded: el rechazo quedó en ingestion_events como failed (brief-6.5.1, D-6).
  | Failure<"CONFLICT", { recorded: boolean }>
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
  event: MessageRecordedEventV1,
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
  event: IngestionEventV1,
): Promise<IngestionAccepted> {
  if (event.event_type === "message.recorded") {
    return messageAccepted(event, "duplicate");
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

async function projectMessage(
  tx: DbTransaction,
  context: IngestionContext,
  reserved: string,
  event: MessageRecordedEventV1,
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
    },
  });
  if (!projected.ok) {
    await repository.finishEvent(tx, context.organizationId, reserved, {
      status: "failed",
      errorCode: projected.code,
    });
    return { ok: false, code: "CONFLICT", recorded: true };
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
  event: ConversationResolvedEventV1,
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
    },
  });
  if (!resolved.ok) {
    await repository.finishEvent(tx, context.organizationId, reserved, {
      status: "failed",
      errorCode: resolved.code,
    });
    return resolved.code === "CONFLICT"
      ? { ok: false, code: "CONFLICT", recorded: true }
      : {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: resolved.rule,
          recorded: true,
        };
  }
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

// La regla de un rechazo de negocio guardado (brief-12.2, C-2). error_code guarda el código de la
// taxonomía, y la regla se deduce del tipo: conversation.resolved tiene una sola.
function storedRule(event: IngestionEventV1): IngestionRule {
  if (event.event_type === "conversation.resolved") return "client_not_found";
  throw new Error(`${event.event_type} no tiene reglas de negocio`);
}

async function projectClient(
  tx: DbTransaction,
  context: IngestionContext,
  reserved: string,
  event: ClientResolvedEventV1,
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
  const event = parsed.event;
  const identity = {
    organizationId: context.organizationId,
    source: context.source,
    externalRef: event.event_id,
  };
  const payloadHash = ingestionPayloadHash(event);

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
          return duplicate(tx, context, event);
        }
        if (outcome.kind === "failed" && outcome.errorCode === "CONFLICT") {
          return { ok: false, code: "CONFLICT", recorded: true };
        }
        if (
          outcome.kind === "failed" &&
          outcome.errorCode === "BUSINESS_RULE_VIOLATION"
        ) {
          return {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: storedRule(event),
            recorded: true,
          };
        }
        if (outcome.kind === "failed") {
          throw new Error(
            `código de rechazo desconocido: ${outcome.errorCode}`,
          );
        }
        return { ok: false, code: "CONFLICT", recorded: false };
      }

      if (event.event_type === "message.recorded") {
        return projectMessage(tx, context, reserved, event);
      }
      if (event.event_type === "conversation.resolved") {
        return projectConversation(tx, context, reserved, event);
      }
      return projectClient(tx, context, reserved, event);
    },
  );
}
