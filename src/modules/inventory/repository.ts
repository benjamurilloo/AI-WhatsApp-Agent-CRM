import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/shared/db";
import { inventories } from "./schema";

// Acceso a inventories. En la 4.2 solo lee saldos (brief-4.2, D-1).

// Saldo por producto de la organización. Un producto sin fila no aparece: su saldo es 0 (brief-4.1, D-7).
export async function findBalances(
  organizationId: string,
  productIds: string[],
): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const rows = await getDb()
    .select({
      productId: inventories.productId,
      quantityOnHand: inventories.quantityOnHand,
    })
    .from(inventories)
    .where(
      and(
        eq(inventories.organizationId, organizationId),
        inArray(inventories.productId, productIds),
      ),
    );
  return new Map(rows.map((row) => [row.productId, row.quantityOnHand]));
}
