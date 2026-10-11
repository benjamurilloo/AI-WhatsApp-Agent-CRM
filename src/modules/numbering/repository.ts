import { and, eq, sql } from "drizzle-orm";
import type { DbTransaction } from "@/shared/db";
import { documentCounters, documentKind } from "./schema";

// Acceso a document_counters (ADR 0019, punto 2; brief-19.2). La única escritura es
// takeNextNumber, que vigila tests/guards/counter-writes.test.ts (brief-19.2, AC-11).

export type DocumentKind = (typeof documentKind.enumValues)[number];

// El número siguiente de la serie, en la transacción del documento que lo usa. Como el saldo de
// inventories: la fila nace en 0 la primera vez (ON CONFLICT DO NOTHING), se bloquea FOR UPDATE y
// se incrementa. Si la transacción se revierte, el número no se consume; dos altas simultáneas de
// la misma organización y tipo se serializan en la fila, también la primera vez.
export async function takeNextNumber(
  tx: DbTransaction,
  organizationId: string,
  kind: DocumentKind,
): Promise<number> {
  await tx
    .insert(documentCounters)
    .values({ organizationId, kind, lastNumber: 0 })
    .onConflictDoNothing({
      target: [documentCounters.organizationId, documentCounters.kind],
    });
  const where = and(
    eq(documentCounters.organizationId, organizationId),
    eq(documentCounters.kind, kind),
  );
  const locked = await tx
    .select({ lastNumber: documentCounters.lastNumber })
    .from(documentCounters)
    .where(where)
    .for("update");
  const next = locked[0]!.lastNumber + 1;
  await tx
    .update(documentCounters)
    .set({ lastNumber: next, updatedAt: sql`now()` })
    .where(where);
  return next;
}
