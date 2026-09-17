import { and, eq, sql } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/shared/db";
import { ingestionEvents } from "./schema";

// Acceso a ingestion_events (brief-6.5.2). Solo cambian status, error_code y processed_at; el
// trigger de la 6.1 rechaza el resto.

export type EventIdentity = {
  organizationId: string;
  source: string;
  externalRef: string;
};

export type StoredEvent = {
  id: string;
  payloadHash: string;
  status: "received" | "processed" | "failed";
  errorCode: string | null;
};

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

// Reserva atómica (D-3): con otra entrega del mismo evento en curso, espera en el índice único
// hasta que esa transacción termine. Devuelve el id solo si reservó.
export async function reserveEvent(
  tx: DbTransaction,
  identity: EventIdentity & { eventType: string; payloadHash: string },
): Promise<string | undefined> {
  const result = await tx.execute<{ id: string }>(sql`
    insert into ingestion_events
      (organization_id, source, external_ref, event_type, payload_hash)
    values (${identity.organizationId}, ${identity.source}, ${identity.externalRef},
      ${identity.eventType}, ${identity.payloadHash})
    on conflict on constraint ingestion_events_organization_source_external_ref_unique
    do nothing
    returning id`);
  return result.rows[0]?.id;
}

export async function findEvent(
  tx: DbTransaction,
  identity: EventIdentity,
): Promise<StoredEvent | undefined> {
  const rows = await tx
    .select({
      id: ingestionEvents.id,
      payloadHash: ingestionEvents.payloadHash,
      status: ingestionEvents.status,
      errorCode: ingestionEvents.errorCode,
    })
    .from(ingestionEvents)
    .where(
      and(
        eq(ingestionEvents.organizationId, identity.organizationId),
        eq(ingestionEvents.source, identity.source),
        eq(ingestionEvents.externalRef, identity.externalRef),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function finishEvent(
  tx: DbTransaction,
  eventId: string,
  outcome: { status: "processed" } | { status: "failed"; errorCode: string },
): Promise<void> {
  await tx
    .update(ingestionEvents)
    .set({
      status: outcome.status,
      errorCode: outcome.status === "failed" ? outcome.errorCode : null,
      processedAt: sql`clock_timestamp()`,
    })
    .where(eq(ingestionEvents.id, eventId));
}
