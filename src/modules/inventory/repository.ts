import { and, eq, inArray } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/shared/db";
import {
  inventories,
  inventoryMovements,
  inventoryMovementType,
} from "./schema";

// Acceso a inventories e inventory_movements: lectura de saldos (brief-4.2, D-1) y la única
// escritura del saldo (brief-4.3.1, D-6), que vigila tests/guards/stock-writes.test.ts.

export type StockMovementType =
  (typeof inventoryMovementType.enumValues)[number];

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

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

// Crea la fila en 0 si falta, sin tocar un saldo existente, y la bloquea con FOR UPDATE
// (brief-4.1, D-7). Devuelve el saldo bajo el bloqueo.
export async function lockBalance(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
): Promise<string> {
  await tx
    .insert(inventories)
    .values({ organizationId, productId })
    .onConflictDoNothing({ target: inventories.productId });
  const rows = await tx
    .select({ quantityOnHand: inventories.quantityOnHand })
    .from(inventories)
    .where(
      and(
        eq(inventories.organizationId, organizationId),
        eq(inventories.productId, productId),
      ),
    )
    .for("update");
  return rows[0]!.quantityOnHand;
}

export type StockChange = {
  organizationId: string;
  productId: string;
  type: StockMovementType;
  quantity: string;
  balanceAfter: string;
  reason: string;
  createdBy: string;
};

// Única vía que cambia quantity_on_hand: siempre junto con el movimiento cuyo balance_after
// es el saldo nuevo (FR-PROD-07). Exige la transacción que ya bloqueó la fila.
export async function applyStockChange(
  tx: DbTransaction,
  change: StockChange,
): Promise<void> {
  await tx.insert(inventoryMovements).values(change);
  await tx
    .update(inventories)
    .set({ quantityOnHand: change.balanceAfter })
    .where(
      and(
        eq(inventories.organizationId, change.organizationId),
        eq(inventories.productId, change.productId),
      ),
    );
}
