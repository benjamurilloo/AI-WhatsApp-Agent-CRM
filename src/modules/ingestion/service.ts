import { recordIngestedMessage } from "@/modules/conversations";
import type { Failure } from "@/shared/errors";
import {
  ingestionPayloadHash,
  isOpaqueReference,
  parseIngestionEventV1,
  type IngestionEventV1,
  type IngestionField,
} from "./contract";
import * as repository from "./repository";

// Registro idempotente y proyección de un evento del contrato v1 (brief-6.5.2). Sin HTTP: el
// endpoint y la credencial llegan en la 6.5.3 (D-1). Hasta entonces, la organización y el source
// llegan como contexto explícito (brief-6.5.1, D-3).

export type IngestionContext = { organizationId: string; source: string };

export type IngestionAccepted = {
  ok: true;
  result: "accepted" | "duplicate";
  eventId: string;
  conversationExternalRef: string;
  messageExternalRef: string;
};

export type RecordIngestionEventResult =
  | IngestionAccepted
  | Failure<"VALIDATION_ERROR", { fields: (IngestionField | "source")[] }>
  // recorded: el rechazo quedó en ingestion_events como failed (brief-6.5.1, D-6).
  | Failure<"CONFLICT", { recorded: boolean }>;

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

function accepted(
  event: IngestionEventV1,
  result: IngestionAccepted["result"],
): IngestionAccepted {
  return {
    ok: true,
    result,
    eventId: event.event_id,
    conversationExternalRef: event.conversation.external_ref,
    messageExternalRef: event.message.external_ref,
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
        if (outcome.kind === "duplicate") return accepted(event, "duplicate");
        if (outcome.kind === "failed" && outcome.errorCode === "CONFLICT") {
          return { ok: false, code: "CONFLICT", recorded: true };
        }
        if (outcome.kind === "failed") {
          throw new Error(
            `código de rechazo desconocido: ${outcome.errorCode}`,
          );
        }
        return { ok: false, code: "CONFLICT", recorded: false };
      }

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
      return accepted(event, "accepted");
    },
  );
}
