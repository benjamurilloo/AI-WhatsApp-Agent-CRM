import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  stockUnitOrigin,
  stockUnits,
  stockUnitStatus,
  unitGrades,
} from "./schema";

// Acceso a stock_units y unit_grades (ADR 0024, puntos 6 y 13; brief-29.5, D-2, D-4 y D-5). Las
// escrituras de stock_units son insertStockUnit, setUnitsWrittenOff y updateUnitDetails, y las de
// unit_grades, insertGrade y updateGrade: tests/guards/unit-writes.test.ts fija quién llama a cada una.
// El saldo y los movimientos siguen en repository.ts.

type Executor = Db | DbTransaction;

export type StockUnitStatus = (typeof stockUnitStatus.enumValues)[number];
export type StockUnitOrigin = (typeof stockUnitOrigin.enumValues)[number];

export type StockUnitRow = {
  id: string;
  productId: string;
  serial: string;
  status: StockUnitStatus;
  gradeId: string | null;
  gradeName: string | null;
  batteryHealth: number | null;
  cost: string;
  costCurrency: string;
  originType: StockUnitOrigin;
  originId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

const unitColumns = {
  id: stockUnits.id,
  productId: stockUnits.productId,
  serial: stockUnits.serial,
  status: stockUnits.status,
  gradeId: stockUnits.gradeId,
  gradeName: unitGrades.name,
  batteryHealth: stockUnits.batteryHealth,
  cost: stockUnits.cost,
  costCurrency: stockUnits.costCurrency,
  originType: stockUnits.originType,
  originId: stockUnits.originId,
  createdBy: stockUnits.createdBy,
  createdAt: stockUnits.createdAt,
  updatedAt: stockUnits.updatedAt,
};

const gradeJoin = and(
  eq(unitGrades.organizationId, stockUnits.organizationId),
  eq(unitGrades.id, stockUnits.gradeId),
);

// Las unidades de un producto: las disponibles primero (el orden del enum), cada grupo de la más
// nueva a la más vieja.
export function findUnitsOfProduct(
  organizationId: string,
  productId: string,
): Promise<StockUnitRow[]> {
  return getDb()
    .select(unitColumns)
    .from(stockUnits)
    .leftJoin(unitGrades, gradeJoin)
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        eq(stockUnits.productId, productId),
      ),
    )
    .orderBy(
      asc(stockUnits.status),
      desc(stockUnits.createdAt),
      desc(stockUnits.id),
    );
}

export async function findUnit(
  organizationId: string,
  unitId: string,
  executor: Executor = getDb(),
): Promise<StockUnitRow | undefined> {
  const rows = await executor
    .select(unitColumns)
    .from(stockUnits)
    .leftJoin(unitGrades, gradeJoin)
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        eq(stockUnits.id, unitId),
      ),
    )
    .limit(1);
  return rows[0];
}

export function findUnitsByIds(
  organizationId: string,
  unitIds: string[],
): Promise<StockUnitRow[]> {
  if (unitIds.length === 0) return Promise.resolve([]);
  return getDb()
    .select(unitColumns)
    .from(stockUnits)
    .leftJoin(unitGrades, gradeJoin)
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        inArray(stockUnits.id, unitIds),
      ),
    );
}

export type LockedUnit = {
  id: string;
  productId: string;
  serial: string;
  status: StockUnitStatus;
};

// Las unidades FOR UPDATE, ordenadas por id: después del producto y antes del saldo (ADR 0024, punto
// 16; brief-29.5, D-4). Una de otra organización no vuelve.
export function lockUnits(
  tx: DbTransaction,
  organizationId: string,
  unitIds: string[],
): Promise<LockedUnit[]> {
  if (unitIds.length === 0) return Promise.resolve([]);
  return tx
    .select({
      id: stockUnits.id,
      productId: stockUnits.productId,
      serial: stockUnits.serial,
      status: stockUnits.status,
    })
    .from(stockUnits)
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        inArray(stockUnits.id, unitIds),
      ),
    )
    .orderBy(stockUnits.id)
    .for("update");
}

// Los IMEI de la lista que ya tienen una unidad vigente en la organización, sin distinguir mayúsculas.
// Es el aviso con nombre; la última defensa es el índice único parcial.
export async function findTakenSerials(
  tx: DbTransaction,
  organizationId: string,
  serials: string[],
): Promise<string[]> {
  if (serials.length === 0) return [];
  const lowered = [...new Set(serials.map((serial) => serial.toLowerCase()))];
  const rows = await tx
    .select({ serial: stockUnits.serial })
    .from(stockUnits)
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        ne(stockUnits.status, "written_off"),
        inArray(sql<string>`lower(${stockUnits.serial})`, lowered),
      ),
    );
  return rows.map((row) => row.serial);
}

export type NewStockUnit = {
  organizationId: string;
  productId: string;
  serial: string;
  gradeId: string | null;
  batteryHealth: number | null;
  cost: string;
  costCurrency: string;
  originType: StockUnitOrigin;
  originId: string | null;
  createdBy: string;
};

// Nace disponible (trigger stock_units_guard). Un IMEI repetido entre las vigentes lo rechaza el
// índice único parcial: la transacción queda abortada y quien llama la revierte entera.
export async function insertStockUnit(
  tx: DbTransaction,
  unit: NewStockUnit,
): Promise<string> {
  const rows = await tx
    .insert(stockUnits)
    .values(unit)
    .returning({ id: stockUnits.id });
  return rows[0]!.id;
}

// Solo desde available: quien llama ya las bloqueó y comprobó su estado, así que una que no cambia es
// un defecto, y se lanza dentro de la transacción.
export async function setUnitsWrittenOff(
  tx: DbTransaction,
  organizationId: string,
  unitIds: string[],
): Promise<void> {
  if (unitIds.length === 0) return;
  const rows = await tx
    .update(stockUnits)
    .set({ status: "written_off" })
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        inArray(stockUnits.id, unitIds),
        eq(stockUnits.status, "available"),
      ),
    )
    .returning({ id: stockUnits.id });
  if (rows.length !== unitIds.length) {
    throw new Error("setUnitsWrittenOff: una unidad no estaba disponible");
  }
}

export async function updateUnitDetails(
  tx: DbTransaction,
  organizationId: string,
  unitId: string,
  details: { gradeId: string | null; batteryHealth: number | null },
): Promise<void> {
  const rows = await tx
    .update(stockUnits)
    .set(details)
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        eq(stockUnits.id, unitId),
      ),
    )
    .returning({ id: stockUnits.id });
  if (rows.length === 0) {
    throw new Error(
      "updateUnitDetails: la unidad no existe en esta organización",
    );
  }
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

// Una violación de unicidad del IMEI entre las unidades vigentes: dos altas simultáneas del mismo IMEI.
export function isSerialTaken(error: unknown): boolean {
  return uniqueViolationOf(
    error,
    "stock_units_organization_serial_lower_unique",
  );
}

// Los grados (ADR 0024, punto 13; brief-29.5, D-5).

export type GradeRow = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  isActive: boolean;
  isExample: boolean;
};

const gradeColumns = {
  id: unitGrades.id,
  name: unitGrades.name,
  description: unitGrades.description,
  position: unitGrades.position,
  isActive: unitGrades.isActive,
  isExample: unitGrades.isExample,
};

// forUpdate: los grados de la organización juntos, para reordenarlos.
export async function findGrades(
  organizationId: string,
  executor: Executor = getDb(),
  { forUpdate = false } = {},
): Promise<GradeRow[]> {
  const query = executor
    .select(gradeColumns)
    .from(unitGrades)
    .where(eq(unitGrades.organizationId, organizationId))
    .orderBy(
      asc(unitGrades.position),
      asc(unitGrades.name),
      asc(unitGrades.id),
    );
  return forUpdate ? query.for("update") : query;
}

export async function findGrade(
  organizationId: string,
  gradeId: string,
  executor: Executor = getDb(),
  { forUpdate = false } = {},
): Promise<GradeRow | undefined> {
  const query = executor
    .select(gradeColumns)
    .from(unitGrades)
    .where(
      and(
        eq(unitGrades.organizationId, organizationId),
        eq(unitGrades.id, gradeId),
      ),
    )
    .limit(1);
  const rows = forUpdate ? await query.for("update") : await query;
  return rows[0];
}

export type GradeValues = {
  name: string;
  description: string | null;
  position: number;
  isActive: boolean;
};

// Un nombre repetido, sin distinguir mayúsculas, deshace solo esta escritura, en un savepoint, y la
// transacción sigue usable.
export async function insertGrade(
  tx: DbTransaction,
  organizationId: string,
  values: GradeValues & { isExample: boolean },
): Promise<string | "name_taken"> {
  try {
    return await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(unitGrades)
        .values({ organizationId, ...values })
        .returning({ id: unitGrades.id });
      return rows[0]!.id;
    });
  } catch (error) {
    if (uniqueViolationOf(error, GRADE_NAME_UNIQUE)) return "name_taken";
    throw error;
  }
}

export async function updateGrade(
  tx: DbTransaction,
  organizationId: string,
  gradeId: string,
  values: Partial<GradeValues>,
): Promise<void | "name_taken"> {
  try {
    await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .update(unitGrades)
        .set(values)
        .where(
          and(
            eq(unitGrades.organizationId, organizationId),
            eq(unitGrades.id, gradeId),
          ),
        )
        .returning({ id: unitGrades.id });
      if (rows.length === 0) {
        throw new Error("updateGrade: el grado no existe en esta organización");
      }
    });
  } catch (error) {
    if (uniqueViolationOf(error, GRADE_NAME_UNIQUE)) return "name_taken";
    throw error;
  }
}

const GRADE_NAME_UNIQUE = "unit_grades_organization_name_lower_unique";
