import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/shared/db";
import {
  inventories,
  inventoryMovements,
  inventoryMovementType,
} from "./schema";

// Acceso a inventories e inventory_movements: lectura de saldos (brief-4.2, D-1) y las únicas
// escrituras del saldo (brief-4.3.1, D-6; desde la 19.3, lo reservado y la entrega del ADR 0020;
// desde la 20.3, la venta sin pedido del ADR 0021), que vigila tests/guards/stock-writes.test.ts.

export type StockMovementType =
  (typeof inventoryMovementType.enumValues)[number];

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

// El saldo físico y lo reservado de un producto, en la escala de la base ("6.000").
export type Balance = { onHand: string; reserved: string };

// Saldo por producto de la organización. Un producto sin fila no aparece: su saldo es 0 (brief-4.1, D-7).
export async function findBalances(
  organizationId: string,
  productIds: string[],
): Promise<Map<string, Balance>> {
  if (productIds.length === 0) return new Map();
  const rows = await getDb()
    .select({
      productId: inventories.productId,
      onHand: inventories.quantityOnHand,
      reserved: inventories.quantityReserved,
    })
    .from(inventories)
    .where(
      and(
        eq(inventories.organizationId, organizationId),
        inArray(inventories.productId, productIds),
      ),
    );
  return new Map(
    rows.map((row) => [
      row.productId,
      { onHand: row.onHand, reserved: row.reserved },
    ]),
  );
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
// (brief-4.1, D-7). Devuelve el saldo y lo reservado bajo el bloqueo (desde la 19.3).
export async function lockBalance(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
): Promise<Balance> {
  await tx
    .insert(inventories)
    .values({ organizationId, productId })
    .onConflictDoNothing({ target: inventories.productId });
  const rows = await tx
    .select({
      onHand: inventories.quantityOnHand,
      reserved: inventories.quantityReserved,
    })
    .from(inventories)
    .where(
      and(
        eq(inventories.organizationId, organizationId),
        eq(inventories.productId, productId),
      ),
    )
    .for("update");
  return rows[0]!;
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

// Lo reservado de un producto, sin movimiento (ADR 0020, punto 4): reservar y liberar no
// cambian el saldo físico. Exige la transacción que ya bloqueó la fila con lockBalance.
export async function setReserved(
  tx: DbTransaction,
  organizationId: string,
  productId: string,
  reserved: string,
): Promise<void> {
  await tx
    .update(inventories)
    .set({ quantityReserved: reserved })
    .where(
      and(
        eq(inventories.organizationId, organizationId),
        eq(inventories.productId, productId),
      ),
    );
}

export type Delivery = {
  organizationId: string;
  productId: string;
  quantity: string;
  balanceAfter: string;
  reservedAfter: string;
  reason: string;
  createdBy: string;
};

// La entrega de una línea de un pedido (ADR 0020, punto 4): el movimiento order_delivery y,
// después, el saldo y lo reservado en una sola sentencia. En dos, el caso válido en que todo el
// saldo está reservado violaría el CHECK entre una y otra.
export async function applyDelivery(
  tx: DbTransaction,
  delivery: Delivery,
): Promise<void> {
  await tx.insert(inventoryMovements).values({
    organizationId: delivery.organizationId,
    productId: delivery.productId,
    type: "order_delivery",
    quantity: delivery.quantity,
    balanceAfter: delivery.balanceAfter,
    reason: delivery.reason,
    createdBy: delivery.createdBy,
  });
  await tx
    .update(inventories)
    .set({
      quantityOnHand: delivery.balanceAfter,
      quantityReserved: delivery.reservedAfter,
    })
    .where(
      and(
        eq(inventories.organizationId, delivery.organizationId),
        eq(inventories.productId, delivery.productId),
      ),
    );
}

export type Sale = {
  organizationId: string;
  productId: string;
  quantity: string;
  balanceAfter: string;
  reason: string;
  createdBy: string;
};

// La salida de una línea de una venta sin pedido (ADR 0021, punto 5): el movimiento sale y el
// saldo físico nuevo. No toca lo reservado: quien llama ya comprobó lo disponible con el saldo
// bloqueado, así que el saldo nuevo nunca queda por debajo de lo reservado; el CHECK es la última
// defensa (brief-20.3, D-3).
export async function applySale(tx: DbTransaction, sale: Sale): Promise<void> {
  await tx.insert(inventoryMovements).values({
    organizationId: sale.organizationId,
    productId: sale.productId,
    type: "sale",
    quantity: sale.quantity,
    balanceAfter: sale.balanceAfter,
    reason: sale.reason,
    createdBy: sale.createdBy,
  });
  await tx
    .update(inventories)
    .set({ quantityOnHand: sale.balanceAfter })
    .where(
      and(
        eq(inventories.organizationId, sale.organizationId),
        eq(inventories.productId, sale.productId),
      ),
    );
}

// La reposición de una línea de la anulación de una venta sin pedido (ADR 0021, punto 6; brief-20.4,
// D-5): el movimiento sale_void y el saldo físico nuevo. No toca lo reservado. Exige la transacción
// que ya bloqueó la fila con lockBalance.
export async function applySaleVoid(
  tx: DbTransaction,
  restore: Sale,
): Promise<void> {
  await tx.insert(inventoryMovements).values({
    organizationId: restore.organizationId,
    productId: restore.productId,
    type: "sale_void",
    quantity: restore.quantity,
    balanceAfter: restore.balanceAfter,
    reason: restore.reason,
    createdBy: restore.createdBy,
  });
  await tx
    .update(inventories)
    .set({ quantityOnHand: restore.balanceAfter })
    .where(
      and(
        eq(inventories.organizationId, restore.organizationId),
        eq(inventories.productId, restore.productId),
      ),
    );
}

// La entrada de una línea de una recepción de mercadería (ADR 0023, punto 4; brief-22.4, D-3): el
// movimiento goods_receipt y el saldo físico nuevo. No toca lo reservado. Exige la transacción que ya
// bloqueó la fila con lockBalance.
export async function applyGoodsReceipt(
  tx: DbTransaction,
  receipt: Sale,
): Promise<void> {
  await tx.insert(inventoryMovements).values({
    organizationId: receipt.organizationId,
    productId: receipt.productId,
    type: "goods_receipt",
    quantity: receipt.quantity,
    balanceAfter: receipt.balanceAfter,
    reason: receipt.reason,
    createdBy: receipt.createdBy,
  });
  await tx
    .update(inventories)
    .set({ quantityOnHand: receipt.balanceAfter })
    .where(
      and(
        eq(inventories.organizationId, receipt.organizationId),
        eq(inventories.productId, receipt.productId),
      ),
    );
}

// La salida de una línea de la anulación de una recepción (ADR 0023, punto 6; brief-22.5, D-3): el
// movimiento goods_receipt_void y el saldo físico nuevo. No toca lo reservado: quien llama ya comprobó
// lo disponible con el saldo bloqueado, como en applySale; el CHECK es la última defensa.
export async function applyGoodsReceiptVoid(
  tx: DbTransaction,
  removal: Sale,
): Promise<void> {
  await tx.insert(inventoryMovements).values({
    organizationId: removal.organizationId,
    productId: removal.productId,
    type: "goods_receipt_void",
    quantity: removal.quantity,
    balanceAfter: removal.balanceAfter,
    reason: removal.reason,
    createdBy: removal.createdBy,
  });
  await tx
    .update(inventories)
    .set({ quantityOnHand: removal.balanceAfter })
    .where(
      and(
        eq(inventories.organizationId, removal.organizationId),
        eq(inventories.productId, removal.productId),
      ),
    );
}
