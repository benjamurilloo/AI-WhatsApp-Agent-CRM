import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { inventoryMovements, stockUnits, unitSettings } from "./schema";
import type { StockUnitStatus } from "./unit-repository";

// Acceso a unit_settings y las lecturas de la garantía de una unidad vendida (brief-29.9, D-1 y D-2).
// La fecha de inicio sale de los movimientos de la unidad, no de sales ni de orders (H-3): inventory no
// los conoce.

type Executor = Db | DbTransaction;

export type UnitSettingsRow = {
  id: string;
  warrantyDays: number;
  isExample: boolean;
};

const settingsColumns = {
  id: unitSettings.id,
  warrantyDays: unitSettings.warrantyDays,
  isExample: unitSettings.isExample,
};

export async function findUnitSettings(
  organizationId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<UnitSettingsRow | undefined> {
  const query = executor
    .select(settingsColumns)
    .from(unitSettings)
    .where(eq(unitSettings.organizationId, organizationId))
    .limit(1);
  const rows = options.forUpdate ? await query.for("update") : await query;
  return rows[0];
}

export type UnitSettingsValues = Omit<UnitSettingsRow, "id">;

const SETTINGS_UNIQUE = "unit_settings_organization_unique";

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

// Una por organización: si otra transacción la creó a la vez, devuelve "taken" y no escribe nada.
export async function insertUnitSettings(
  tx: DbTransaction,
  organizationId: string,
  values: UnitSettingsValues,
): Promise<string | "taken"> {
  try {
    return await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(unitSettings)
        .values({ organizationId, ...values })
        .returning({ id: unitSettings.id });
      return rows[0]!.id;
    });
  } catch (error) {
    if (uniqueViolationOf(error, SETTINGS_UNIQUE)) return "taken";
    throw error;
  }
}

export async function updateUnitSettings(
  tx: DbTransaction,
  organizationId: string,
  values: UnitSettingsValues,
): Promise<void> {
  const rows = await tx
    .update(unitSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(unitSettings.organizationId, organizationId))
    .returning({ id: unitSettings.id });
  if (rows.length === 0) {
    throw new Error("updateUnitSettings: la organización no tiene valores");
  }
}

export type WarrantyUnitRow = {
  id: string;
  productId: string;
  serial: string;
  status: StockUnitStatus;
  warrantyDays: number | null;
  createdAt: Date;
  // La fecha del último movimiento sale u order_delivery de la unidad; null si nunca salió.
  soldAt: Date | null;
  // Hay otra unidad posterior con el mismo IMEI: el equipo volvió al local (U-4).
  returned: boolean;
};

// El último movimiento que sacó a la unidad: una venta sin pedido o la entrega de un pedido. Con la
// anulación de la venta la unidad vuelve a available, así que una unidad sold siempre tiene uno. Por
// unidad, con inventory_movements_unit_idx: no agrega las salidas de toda la organización.
//
// Las subconsultas nombran la unidad de afuera como "stock_units" a mano: en una consulta de una sola
// tabla, drizzle no califica las columnas, y "id" o "serial" quedarían ligadas a la tabla de adentro.
function warrantyUnitColumns() {
  return {
    id: stockUnits.id,
    productId: stockUnits.productId,
    serial: stockUnits.serial,
    status: stockUnits.status,
    warrantyDays: stockUnits.warrantyDays,
    createdAt: stockUnits.createdAt,
    soldAt: sql<Date | null>`(
      select max(movement.created_at) from ${inventoryMovements} movement
      where movement.organization_id = "stock_units"."organization_id"
        and movement.unit_id = "stock_units"."id"
        and movement.type in ('sale', 'order_delivery')
    )`.mapWith(inventoryMovements.createdAt),
    returned: sql<boolean>`exists (
      select 1 from ${stockUnits} later
      where later.organization_id = "stock_units"."organization_id"
        and lower(later.serial) = lower("stock_units"."serial")
        and later.created_at > "stock_units"."created_at"
    )`.mapWith(Boolean),
  };
}

function findWarrantyUnits(
  organizationId: string,
  condition: ReturnType<typeof and>,
) {
  return getDb()
    .select(warrantyUnitColumns())
    .from(stockUnits)
    .where(and(eq(stockUnits.organizationId, organizationId), condition))
    .orderBy(desc(stockUnits.createdAt), desc(stockUnits.id));
}

export function findWarrantyUnitsByIds(
  organizationId: string,
  unitIds: string[],
): Promise<WarrantyUnitRow[]> {
  if (unitIds.length === 0) return Promise.resolve([]);
  return findWarrantyUnits(
    organizationId,
    and(inArray(stockUnits.id, unitIds)),
  );
}

// Todas las unidades con un IMEI, sin distinguir mayúsculas, de la más nueva a la más vieja (U-3).
export function findWarrantyUnitsBySerial(
  organizationId: string,
  serial: string,
): Promise<WarrantyUnitRow[]> {
  return findWarrantyUnits(
    organizationId,
    and(sql`lower(${stockUnits.serial}) = ${serial.toLowerCase()}`),
  );
}
