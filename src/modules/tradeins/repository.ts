import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  tradeInChecklistItems,
  tradeInChecklistResults,
  tradeInDestination,
  tradeInMargins,
  tradeIns,
  tradeInSettings,
  tradeInVoidReason,
  tradeInVoids,
} from "./schema";

// Acceso a las tablas de tradeins (brief-29.7, D-3 a D-5). Toda consulta filtra por organization_id en
// SQL, también las escrituras por id. Las escrituras son las de tests/guards/tradeins-dependencies.test.ts:
// cada una con su función y su llamador.

type Executor = Db | DbTransaction;

export type TradeInDestination = (typeof tradeInDestination.enumValues)[number];
export const TRADE_IN_DESTINATIONS = tradeInDestination.enumValues;
export type TradeInVoidReason = (typeof tradeInVoidReason.enumValues)[number];
export const TRADE_IN_VOID_REASONS = tradeInVoidReason.enumValues;

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

function uniqueViolationOf(error: unknown, constraint: string): boolean {
  for (
    let current: unknown = error;
    current;
    current = (current as { cause?: unknown }).cause
  ) {
    const candidate = current as { code?: string; constraint?: string };
    if (candidate.code === "23505" && candidate.constraint === constraint) {
      return true;
    }
  }
  return false;
}

// Los puntos del checklist (D-3).

export type ChecklistItemRow = {
  id: string;
  name: string;
  isMandatory: boolean;
  position: number;
  isActive: boolean;
  isExample: boolean;
  repairTypeId: string | null;
};

const itemColumns = {
  id: tradeInChecklistItems.id,
  name: tradeInChecklistItems.name,
  isMandatory: tradeInChecklistItems.isMandatory,
  position: tradeInChecklistItems.position,
  isActive: tradeInChecklistItems.isActive,
  isExample: tradeInChecklistItems.isExample,
  repairTypeId: tradeInChecklistItems.repairTypeId,
};

// En su orden, y el id para desempatar. forUpdate bloquea la lista entera: dos altas o dos movimientos
// se ordenan, y una recepción que la lee FOR SHARE ve la lista de antes o la de después.
export async function findChecklistItems(
  organizationId: string,
  executor: Executor = getDb(),
  options: { lock?: "update" | "share" } = {},
): Promise<ChecklistItemRow[]> {
  const query = executor
    .select(itemColumns)
    .from(tradeInChecklistItems)
    .where(eq(tradeInChecklistItems.organizationId, organizationId))
    .orderBy(
      asc(tradeInChecklistItems.position),
      asc(tradeInChecklistItems.id),
    );
  return options.lock ? query.for(options.lock) : query;
}

export async function findChecklistItem(
  organizationId: string,
  itemId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<ChecklistItemRow | undefined> {
  const query = executor
    .select(itemColumns)
    .from(tradeInChecklistItems)
    .where(
      and(
        eq(tradeInChecklistItems.organizationId, organizationId),
        eq(tradeInChecklistItems.id, itemId),
      ),
    )
    .limit(1);
  const rows = options.forUpdate ? await query.for("update") : await query;
  return rows[0];
}

const ITEM_NAME_UNIQUE =
  "trade_in_checklist_items_organization_name_lower_unique";

// Corre en un savepoint: un nombre repetido deshace solo esta escritura.
async function inSavepoint<T>(
  tx: DbTransaction,
  work: (savepoint: DbTransaction) => Promise<T>,
): Promise<T | "name_taken"> {
  try {
    return await tx.transaction(work);
  } catch (error) {
    if (uniqueViolationOf(error, ITEM_NAME_UNIQUE)) return "name_taken";
    throw error;
  }
}

export type ChecklistItemValues = {
  name: string;
  isMandatory: boolean;
  position: number;
  isActive: boolean;
};

export function insertChecklistItem(
  tx: DbTransaction,
  organizationId: string,
  values: ChecklistItemValues & { isExample: boolean },
): Promise<string | "name_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(tradeInChecklistItems)
      .values({ organizationId, ...values })
      .returning({ id: tradeInChecklistItems.id });
    return rows[0]!.id;
  });
}

export function updateChecklistItem(
  tx: DbTransaction,
  organizationId: string,
  itemId: string,
  values: Partial<ChecklistItemValues & { repairTypeId: string | null }>,
): Promise<void | "name_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .update(tradeInChecklistItems)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(tradeInChecklistItems.organizationId, organizationId),
          eq(tradeInChecklistItems.id, itemId),
        ),
      )
      .returning({ id: tradeInChecklistItems.id });
    if (rows.length === 0) {
      throw new Error("updateChecklistItem: el punto no existe");
    }
  });
}

// Las recepciones (D-4).

export type TradeInRow = {
  id: string;
  number: number;
  clientId: string;
  productId: string;
  unitId: string;
  serial: string;
  batteryHealth: number;
  gradeId: string;
  value: string;
  currency: string;
  destination: TradeInDestination;
  createdBy: string;
  createdAt: Date;
  // La anulación, si la tiene.
  voided: TradeInVoidRow | null;
};

export type TradeInVoidRow = {
  id: string;
  number: number;
  reason: TradeInVoidReason;
  createdBy: string;
  createdAt: Date;
};

const tradeInColumns = {
  id: tradeIns.id,
  number: tradeIns.number,
  clientId: tradeIns.clientId,
  productId: tradeIns.productId,
  unitId: tradeIns.unitId,
  serial: tradeIns.serial,
  batteryHealth: tradeIns.batteryHealth,
  gradeId: tradeIns.gradeId,
  value: tradeIns.value,
  currency: tradeIns.currency,
  destination: tradeIns.destination,
  createdBy: tradeIns.createdBy,
  createdAt: tradeIns.createdAt,
  voidId: tradeInVoids.id,
  voidNumber: tradeInVoids.number,
  voidReason: tradeInVoids.reason,
  voidCreatedBy: tradeInVoids.createdBy,
  voidCreatedAt: tradeInVoids.createdAt,
};

const voidJoin = and(
  eq(tradeInVoids.organizationId, tradeIns.organizationId),
  eq(tradeInVoids.tradeInId, tradeIns.id),
);

function toTradeInRow(r: {
  id: string;
  number: number;
  clientId: string;
  productId: string;
  unitId: string;
  serial: string;
  batteryHealth: number;
  gradeId: string;
  value: string;
  currency: string;
  destination: TradeInDestination;
  createdBy: string;
  createdAt: Date;
  voidId: string | null;
  voidNumber: number | null;
  voidReason: TradeInVoidReason | null;
  voidCreatedBy: string | null;
  voidCreatedAt: Date | null;
}): TradeInRow {
  return {
    id: r.id,
    number: r.number,
    clientId: r.clientId,
    productId: r.productId,
    unitId: r.unitId,
    serial: r.serial,
    batteryHealth: r.batteryHealth,
    gradeId: r.gradeId,
    value: r.value,
    currency: r.currency,
    destination: r.destination,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    voided:
      r.voidId !== null
        ? {
            id: r.voidId,
            number: r.voidNumber!,
            reason: r.voidReason!,
            createdBy: r.voidCreatedBy!,
            createdAt: r.voidCreatedAt!,
          }
        : null,
  };
}

export async function findTradeIn(
  organizationId: string,
  tradeInId: string,
  executor: Executor = getDb(),
): Promise<TradeInRow | undefined> {
  const rows = await executor
    .select(tradeInColumns)
    .from(tradeIns)
    .leftJoin(tradeInVoids, voidJoin)
    .where(
      and(
        eq(tradeIns.organizationId, organizationId),
        eq(tradeIns.id, tradeInId),
      ),
    )
    .limit(1);
  return rows[0] ? toTradeInRow(rows[0]) : undefined;
}

// Los usados de una lista de ids, anulados incluidos, para cash (brief-29.7.2): con la transacción que
// recibe, que en un cobro o un pago tiene el bloqueo de cobros tomado.
export async function findTradeInsByIds(
  organizationId: string,
  tradeInIds: string[],
  executor: Executor = getDb(),
): Promise<TradeInRow[]> {
  if (tradeInIds.length === 0) return [];
  const rows = await executor
    .select(tradeInColumns)
    .from(tradeIns)
    .leftJoin(tradeInVoids, voidJoin)
    .where(
      and(
        eq(tradeIns.organizationId, organizationId),
        inArray(tradeIns.id, tradeInIds),
      ),
    )
    .orderBy(tradeIns.number);
  return rows.map(toTradeInRow);
}

// Los usados vigentes de un cliente con un destino, del más viejo al más nuevo, para la permuta.
export async function findClientCurrentTradeIns(
  organizationId: string,
  clientId: string,
  destination: TradeInDestination,
  executor: Executor = getDb(),
): Promise<TradeInRow[]> {
  const rows = await executor
    .select(tradeInColumns)
    .from(tradeIns)
    .leftJoin(tradeInVoids, voidJoin)
    .where(
      and(
        eq(tradeIns.organizationId, organizationId),
        eq(tradeIns.clientId, clientId),
        eq(tradeIns.destination, destination),
        sql`${tradeInVoids.id} is null`,
      ),
    )
    .orderBy(tradeIns.number);
  return rows.map(toTradeInRow);
}

// La recepción que creó una unidad, para su ficha.
export async function findTradeInsByUnits(
  organizationId: string,
  unitIds: string[],
): Promise<TradeInRow[]> {
  if (unitIds.length === 0) return [];
  const rows = await getDb()
    .select(tradeInColumns)
    .from(tradeIns)
    .leftJoin(tradeInVoids, voidJoin)
    .where(
      and(
        eq(tradeIns.organizationId, organizationId),
        inArray(tradeIns.unitId, unitIds),
      ),
    );
  return rows.map(toTradeInRow);
}

export type TradeInListQuery = {
  organizationId: string;
  // null: vigentes y anuladas.
  voided: boolean | null;
  destination: TradeInDestination | null;
  number: number | null;
  // El IMEI, sin distinguir mayúsculas.
  serial: string | null;
  clientId: string | null;
  // Los usados que no entran, por id: el filtro «Falta pagar» deja afuera los pagados del todo, que
  // calcula cash (brief-29.7.2, D-6). Vacío, no deja ninguno afuera.
  excludeIds?: string[];
};

function listConditions(query: TradeInListQuery): SQL {
  const conditions: SQL[] = [eq(tradeIns.organizationId, query.organizationId)];
  if (query.voided === true)
    conditions.push(sql`${tradeInVoids.id} is not null`);
  if (query.voided === false) conditions.push(sql`${tradeInVoids.id} is null`);
  if (query.destination !== null) {
    conditions.push(eq(tradeIns.destination, query.destination));
  }
  if (query.number !== null) conditions.push(eq(tradeIns.number, query.number));
  if (query.serial !== null) {
    conditions.push(
      eq(sql`lower(${tradeIns.serial})`, query.serial.toLowerCase()),
    );
  }
  if (query.clientId !== null) {
    conditions.push(eq(tradeIns.clientId, query.clientId));
  }
  if (query.excludeIds && query.excludeIds.length > 0) {
    conditions.push(notInArray(tradeIns.id, query.excludeIds));
  }
  return and(...conditions)!;
}

export async function countTradeIns(query: TradeInListQuery): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(tradeIns)
    .leftJoin(tradeInVoids, voidJoin)
    .where(listConditions(query));
  return rows[0]?.value ?? 0;
}

export async function findTradeIns(
  query: TradeInListQuery,
  limit: number,
  offset: number,
): Promise<TradeInRow[]> {
  const rows = await getDb()
    .select(tradeInColumns)
    .from(tradeIns)
    .leftJoin(tradeInVoids, voidJoin)
    .where(listConditions(query))
    .orderBy(desc(tradeIns.createdAt), desc(tradeIns.id))
    .limit(limit)
    .offset(offset);
  return rows.map(toTradeInRow);
}

export type NewTradeIn = {
  id: string;
  organizationId: string;
  number: number;
  clientId: string;
  productId: string;
  unitId: string;
  serial: string;
  batteryHealth: number;
  gradeId: string;
  value: string;
  currency: string;
  destination: TradeInDestination;
  createdBy: string;
};

export async function insertTradeIn(
  tx: DbTransaction,
  values: NewTradeIn,
): Promise<{ id: string; number: number }> {
  const rows = await tx
    .insert(tradeIns)
    .values(values)
    .returning({ id: tradeIns.id, number: tradeIns.number });
  return rows[0]!;
}

// El resultado del checklist (D-4).

export type ChecklistResultRow = {
  checklistItemId: string;
  position: number;
  itemName: string;
  wasMandatory: boolean;
  passed: boolean;
};

export async function findChecklistResults(
  organizationId: string,
  tradeInId: string,
): Promise<ChecklistResultRow[]> {
  return getDb()
    .select({
      checklistItemId: tradeInChecklistResults.checklistItemId,
      position: tradeInChecklistResults.position,
      itemName: tradeInChecklistResults.itemName,
      wasMandatory: tradeInChecklistResults.wasMandatory,
      passed: tradeInChecklistResults.passed,
    })
    .from(tradeInChecklistResults)
    .where(
      and(
        eq(tradeInChecklistResults.organizationId, organizationId),
        eq(tradeInChecklistResults.tradeInId, tradeInId),
      ),
    )
    .orderBy(asc(tradeInChecklistResults.position));
}

export async function insertChecklistResults(
  tx: DbTransaction,
  organizationId: string,
  tradeInId: string,
  results: ChecklistResultRow[],
): Promise<void> {
  if (results.length === 0) return;
  await tx
    .insert(tradeInChecklistResults)
    .values(
      results.map((result) => ({ organizationId, tradeInId, ...result })),
    );
}

// Cuántas recepciones tiene cada punto: uno usado no se borra (D-3).
export async function countResultsByItem(
  organizationId: string,
): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({
      itemId: tradeInChecklistResults.checklistItemId,
      value: count(),
    })
    .from(tradeInChecklistResults)
    .where(eq(tradeInChecklistResults.organizationId, organizationId))
    .groupBy(tradeInChecklistResults.checklistItemId);
  return new Map(rows.map((row) => [row.itemId, row.value]));
}

// La anulación (D-5).

export async function insertTradeInVoid(
  tx: DbTransaction,
  values: {
    organizationId: string;
    number: number;
    tradeInId: string;
    reason: TradeInVoidReason;
    createdBy: string;
  },
): Promise<TradeInVoidRow> {
  const rows = await tx.insert(tradeInVoids).values(values).returning({
    id: tradeInVoids.id,
    number: tradeInVoids.number,
    reason: tradeInVoids.reason,
    createdBy: tradeInVoids.createdBy,
    createdAt: tradeInVoids.createdAt,
  });
  return rows[0]!;
}

// Dos anulaciones de la misma recepción que llegaron hasta la base.
export function isTradeInAlreadyVoided(error: unknown): boolean {
  return uniqueViolationOf(error, "trade_in_voids_trade_in_unique");
}

// Los valores sueltos y los márgenes de la cotización (brief-29.7.3, D-1 y D-2).

export type QuoteSettingsRow = {
  id: string;
  batteryThreshold: number;
  rangePercent: string;
  roundingStep: string;
  roundingCurrency: string;
  batteryRepairTypeId: string | null;
  isExample: boolean;
};

const settingsColumns = {
  id: tradeInSettings.id,
  batteryThreshold: tradeInSettings.batteryThreshold,
  rangePercent: tradeInSettings.rangePercent,
  roundingStep: tradeInSettings.roundingStep,
  roundingCurrency: tradeInSettings.roundingCurrency,
  batteryRepairTypeId: tradeInSettings.batteryRepairTypeId,
  isExample: tradeInSettings.isExample,
};

export async function findQuoteSettings(
  organizationId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<QuoteSettingsRow | undefined> {
  const query = executor
    .select(settingsColumns)
    .from(tradeInSettings)
    .where(eq(tradeInSettings.organizationId, organizationId))
    .limit(1);
  const rows = options.forUpdate ? await query.for("update") : await query;
  return rows[0];
}

export type QuoteSettingsValues = Omit<QuoteSettingsRow, "id">;

const SETTINGS_UNIQUE = "trade_in_settings_organization_unique";

// Una por organización: si otra transacción la creó a la vez, devuelve "taken" y no escribe nada.
export async function insertQuoteSettings(
  tx: DbTransaction,
  organizationId: string,
  values: QuoteSettingsValues,
): Promise<string | "taken"> {
  try {
    return await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(tradeInSettings)
        .values({ organizationId, ...values })
        .returning({ id: tradeInSettings.id });
      return rows[0]!.id;
    });
  } catch (error) {
    if (uniqueViolationOf(error, SETTINGS_UNIQUE)) return "taken";
    throw error;
  }
}

export async function updateQuoteSettings(
  tx: DbTransaction,
  organizationId: string,
  values: QuoteSettingsValues,
): Promise<void> {
  const rows = await tx
    .update(tradeInSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(tradeInSettings.organizationId, organizationId))
    .returning({ id: tradeInSettings.id });
  if (rows.length === 0) {
    throw new Error("updateQuoteSettings: la organización no tiene valores");
  }
}

export type MarginRow = {
  id: string;
  modelId: string;
  amount: string;
  currency: string;
};

const marginColumns = {
  id: tradeInMargins.id,
  modelId: tradeInMargins.modelId,
  amount: tradeInMargins.amount,
  currency: tradeInMargins.currency,
};

export async function findMargins(
  organizationId: string,
): Promise<MarginRow[]> {
  return getDb()
    .select(marginColumns)
    .from(tradeInMargins)
    .where(eq(tradeInMargins.organizationId, organizationId));
}

export async function findMargin(
  organizationId: string,
  modelId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<MarginRow | undefined> {
  const query = executor
    .select(marginColumns)
    .from(tradeInMargins)
    .where(
      and(
        eq(tradeInMargins.organizationId, organizationId),
        eq(tradeInMargins.modelId, modelId),
      ),
    )
    .limit(1);
  const rows = options.forUpdate ? await query.for("update") : await query;
  return rows[0];
}

const MARGIN_UNIQUE = "trade_in_margins_organization_model_unique";

export async function insertMargin(
  tx: DbTransaction,
  organizationId: string,
  values: { modelId: string; amount: string; currency: string },
): Promise<string | "taken"> {
  try {
    return await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(tradeInMargins)
        .values({ organizationId, ...values })
        .returning({ id: tradeInMargins.id });
      return rows[0]!.id;
    });
  } catch (error) {
    if (uniqueViolationOf(error, MARGIN_UNIQUE)) return "taken";
    throw error;
  }
}

export async function updateMargin(
  tx: DbTransaction,
  organizationId: string,
  marginId: string,
  values: { amount: string; currency: string },
): Promise<void> {
  const rows = await tx
    .update(tradeInMargins)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(tradeInMargins.organizationId, organizationId),
        eq(tradeInMargins.id, marginId),
      ),
    )
    .returning({ id: tradeInMargins.id });
  if (rows.length === 0) throw new Error("updateMargin: el margen no existe");
}
