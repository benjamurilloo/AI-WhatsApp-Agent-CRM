import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
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

// Historial de movimientos (brief-4.3.3). Filtros ya validados; fechas YYYY-MM-DD.
export type MovementQuery = {
  organizationId: string;
  productId: string;
  type: StockMovementType | null;
  from: string | null;
  to: string | null;
  timezone: string;
};

export type MovementRow = {
  id: string;
  type: StockMovementType;
  quantity: string;
  balanceAfter: string;
  reason: string;
  createdBy: string;
  createdAt: Date;
};

// Período [from 00:00, to + 1 día 00:00) en la zona de la organización, convertido por
// PostgreSQL con la zona IANA, incluidos los días de 23 o 25 horas (D-3).
function movementConditions(query: MovementQuery): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    eq(inventoryMovements.organizationId, query.organizationId),
    eq(inventoryMovements.productId, query.productId),
  ];
  if (query.type) conditions.push(eq(inventoryMovements.type, query.type));
  if (query.from) {
    conditions.push(
      sql`${inventoryMovements.createdAt} >= (${query.from}::date::timestamp at time zone ${query.timezone})`,
    );
  }
  if (query.to) {
    conditions.push(
      sql`${inventoryMovements.createdAt} < ((${query.to}::date + 1)::timestamp at time zone ${query.timezone})`,
    );
  }
  return and(...conditions);
}

export async function countMovements(query: MovementQuery): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(inventoryMovements)
    .where(movementConditions(query));
  return rows[0]!.total;
}

// Orden de la cadena de saldos: created_at es la hora del INSERT con el saldo bloqueado (D-1).
export function findMovements(
  query: MovementQuery,
  limit: number,
  offset: number,
): Promise<MovementRow[]> {
  return getDb()
    .select({
      id: inventoryMovements.id,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      balanceAfter: inventoryMovements.balanceAfter,
      reason: inventoryMovements.reason,
      createdBy: inventoryMovements.createdBy,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .where(movementConditions(query))
    .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
    .limit(limit)
    .offset(offset);
}

export async function hasMovements(
  organizationId: string,
  productId: string,
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.organizationId, organizationId),
        eq(inventoryMovements.productId, productId),
      ),
    )
    .limit(1);
  return rows.length > 0;
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
