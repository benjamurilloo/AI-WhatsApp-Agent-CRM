import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/shared/db";
import { ingestionCredentials, ingestionEvents } from "./schema";

// Acceso a ingestion_events (brief-6.5.2) y a las credenciales y el límite de tasa (brief-6.5.3).
// De ingestion_events solo cambian status, error_code y processed_at; el trigger de la 6.1
// rechaza el resto.

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
  organizationId: string,
  eventId: string,
  outcome: { status: "processed" } | { status: "failed"; errorCode: string },
): Promise<void> {
  // A diferencia de las siete escrituras de la 9.0.1, acá el llamador no LEE la fila antes de
  // escribir: la CREA. `reserveEvent` la inserta en esta misma transacción con su
  // organization_id y devuelve el id, y el insert mantiene su bloqueo hasta el commit. Por eso
  // cero filas actualizadas no puede ser una carrera ni una fila ajena: es un defecto de
  // programación, y se lanza dentro de la transacción, que revierte (9.0.4, D-1).
  const rows = await tx
    .update(ingestionEvents)
    .set({
      status: outcome.status,
      errorCode: outcome.status === "failed" ? outcome.errorCode : null,
      processedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(ingestionEvents.organizationId, organizationId),
        eq(ingestionEvents.id, eventId),
      ),
    )
    .returning({ id: ingestionEvents.id });
  if (rows.length === 0) {
    throw new Error("finishEvent: la fila no existe en esta organización");
  }
}

// Credenciales de servicio (brief-6.5.3, D-1).

export type StoredCredential = {
  id: string;
  organizationId: string;
  source: string;
  // Alcance de la credencial (brief-11.3, D-2).
  scope: "ingest" | "read";
  revokedAt: Date | null;
};

export async function insertCredential(input: {
  organizationId: string;
  source: string;
  scope: "ingest" | "read";
  tokenHash: string;
}): Promise<string> {
  const rows = await getDb()
    .insert(ingestionCredentials)
    .values(input)
    .returning({ id: ingestionCredentials.id });
  const id = rows[0]?.id;
  if (!id) throw new Error("la credencial no se creó");
  return id;
}

export async function findCredentialByTokenHash(
  tokenHash: string,
): Promise<StoredCredential | undefined> {
  const rows = await getDb()
    .select({
      id: ingestionCredentials.id,
      organizationId: ingestionCredentials.organizationId,
      source: ingestionCredentials.source,
      scope: ingestionCredentials.scope,
      revokedAt: ingestionCredentials.revokedAt,
    })
    .from(ingestionCredentials)
    .where(eq(ingestionCredentials.tokenHash, tokenHash))
    .limit(1);
  return rows[0];
}

// Devuelve false si la credencial no existe o ya estaba revocada.
export async function revokeCredential(credentialId: string): Promise<boolean> {
  const rows = await getDb()
    .update(ingestionCredentials)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(ingestionCredentials.id, credentialId),
        isNull(ingestionCredentials.revokedAt),
      ),
    )
    .returning({ id: ingestionCredentials.id });
  return rows.length > 0;
}

// Cuenta un request en la ventana y borra las ventanas anteriores de la credencial, en una sola
// sentencia atómica: dos requests simultáneos nunca leen el mismo contador (D-3).
export async function incrementRateWindow(
  credentialId: string,
  windowStart: Date,
): Promise<number> {
  const result = await getDb().execute<{ request_count: number }>(sql`
    with expired as (
      delete from ingestion_rate_windows
      where credential_id = ${credentialId} and window_start < ${windowStart}
    )
    insert into ingestion_rate_windows (credential_id, window_start, request_count)
    values (${credentialId}, ${windowStart}, 1)
    on conflict (credential_id, window_start)
    do update set request_count = ingestion_rate_windows.request_count + 1
    returning request_count`);
  const count = result.rows[0]?.request_count;
  if (count === undefined) throw new Error("el contador de tasa no respondió");
  return Number(count);
}
