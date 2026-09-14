import type { DbTransaction } from "@/shared/db";
import { auditLogs } from "./schema";

// Acceso a la tabla propia de audit. Solo inserta, y siempre con la transacción del cambio (brief-3.6, D-3).

export async function insertAuditLog(
  tx: DbTransaction,
  entry: typeof auditLogs.$inferInsert,
): Promise<void> {
  await tx.insert(auditLogs).values(entry);
}
