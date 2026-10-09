import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/shared/db";
import { auditLogs } from "./schema";

// Acceso a la tabla propia de audit. Escribe solo con la transacción del cambio (brief-3.6, D-3)
// y lee el historial de una entidad para FR-AUD-02 (brief-4.4, D-1).

export async function insertAuditLog(
  tx: DbTransaction,
  entry: typeof auditLogs.$inferInsert,
): Promise<void> {
  await tx.insert(auditLogs).values(entry);
}

export type AuditLogQuery = {
  organizationId: string;
  // Varios tipos en una sola consulta: un producto reúne sus ediciones (product) y sus
  // ajustes de stock (inventory, con el id del producto) (brief-4.4, D-1).
  entityTypes: AuditLogRow["entityType"][];
  entityId: string;
};

export type AuditLogRow = {
  id: string;
  entityType: (typeof auditLogs.$inferSelect)["entityType"];
  action: (typeof auditLogs.$inferSelect)["action"];
  diff: unknown;
  actorUserId: string | null;
  actorCredentialId: string | null;
  createdAt: Date;
};

// Sirve el índice (organization_id, entity_type, entity_id, created_at desc).
function auditConditions(query: AuditLogQuery): SQL | undefined {
  return and(
    eq(auditLogs.organizationId, query.organizationId),
    inArray(auditLogs.entityType, query.entityTypes),
    eq(auditLogs.entityId, query.entityId),
  );
}

export async function countAuditLogs(query: AuditLogQuery): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(auditLogs)
    .where(auditConditions(query));
  return rows[0]!.total;
}

export function findAuditLogs(
  query: AuditLogQuery,
  limit: number,
  offset: number,
): Promise<AuditLogRow[]> {
  return getDb()
    .select({
      id: auditLogs.id,
      entityType: auditLogs.entityType,
      action: auditLogs.action,
      diff: auditLogs.diff,
      actorUserId: auditLogs.actorUserId,
      actorCredentialId: auditLogs.actorCredentialId,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(auditConditions(query))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit)
    .offset(offset);
}

// Cuántas veces un usuario puso un valor en un campo de un tipo de entidad dentro de una ventana
// que termina ahora, con el reloj de PostgreSQL, y en cuántos segundos sale de la ventana la más
// vieja. Es el límite de tasa de la imagen de producto (brief-17.5, D-5): cuenta las subidas, no
// las veces que se quitó (el campo queda en null). Solo lectura.
export type RecentUserChangesQuery = {
  organizationId: string;
  actorUserId: string;
  entityType: AuditLogRow["entityType"];
  field: string;
  windowSeconds: number;
};

export async function countRecentUserChanges(
  query: RecentUserChangesQuery,
): Promise<{ total: number; oldestLeavesInSeconds: number }> {
  const window = sql`make_interval(secs => ${query.windowSeconds})`;
  const rows = await getDb()
    .select({
      total: count(),
      leaves: sql<
        number | null
      >`ceil(extract(epoch from min(${auditLogs.createdAt}) + ${window} - now()))::int`,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.organizationId, query.organizationId),
        eq(auditLogs.actorUserId, query.actorUserId),
        eq(auditLogs.entityType, query.entityType),
        eq(auditLogs.action, "update"),
        sql`${auditLogs.diff} -> 'after' ->> ${query.field} is not null`,
        sql`${auditLogs.createdAt} > now() - ${window}`,
      ),
    );
  const row = rows[0]!;
  return {
    total: row.total,
    oldestLeavesInSeconds: Math.max(1, row.leaves ?? 1),
  };
}
