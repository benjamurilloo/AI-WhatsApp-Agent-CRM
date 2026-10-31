import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  stockUnitOrigin,
  stockUnits,
  stockUnitStatus,
  unitGrades,
} from "./schema";

// Acceso a stock_units y unit_grades (ADR 0024, puntos 6 y 13; brief-29.5, D-2, D-4 y D-5). Las
// escrituras de stock_units son insertStockUnit, setUnitsWrittenOff, updateUnitDetails, desde la
// 29.5.2, setUnitsStatus, de brief-29.5.2, D-3, y desde la 29.6.2, setUnitRepaired, de brief-29.6.2,
// D-2, y desde la 29.9, updateUnitWarrantyDays, de brief-29.9, D-1; las de unit_grades, insertGrade y updateGrade: tests/guards/unit-writes.test.ts fija quién
// llama a cada una. El saldo y los movimientos siguen en repository.ts.

type Executor = Db | DbTransaction;

export type StockUnitStatus = (typeof stockUnitStatus.enumValues)[number];

// Los seis estados, tomados del enum y no escritos a mano: un estado nuevo en el schema entra acá
// solo (brief-24.5.1, D-6).
export const UNIT_STATUSES: readonly StockUnitStatus[] =
  stockUnitStatus.enumValues;
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
  // Desde la 29.5.2 (brief-29.5.2, D-2): los dos o ninguno.
  price: string | null;
  priceCurrency: string | null;
  // Desde la 29.9 (brief-29.9, D-1): nulo, los de la organización.
  warrantyDays: number | null;
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
  price: stockUnits.price,
  priceCurrency: stockUnits.priceCurrency,
  warrantyDays: stockUnits.warrantyDays,
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

// El orden de los estados en la ficha: las disponibles, las reservadas, las vendidas y las dadas de
// baja. Desde la 29.5.2 el orden del enum ya no sirve: sus valores nuevos van al final.
const statusOrder = sql`case ${stockUnits.status}::text
  when 'available' then 0 when 'reserved' then 1 when 'sold' then 2 else 3 end`;

// Las unidades de un producto, por estado y cada grupo de la más nueva a la más vieja.
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
    .orderBy(asc(statusOrder), desc(stockUnits.createdAt), desc(stockUnits.id));
}

// Cuántas unidades tiene un producto en cada estado, contadas en SQL (brief-24.5.1, D-6). El
// Resumen de la ficha necesita tres números, y findUnitsOfProduct no tiene LIMIT: traería todas las
// unidades del producto para contarlas en memoria. Devuelve solo los estados con al menos una fila;
// quien la usa decide qué hacer con los que faltan, y un estado ausente significa cero unidades en
// ese estado, no un dato que no se pudo leer.
export async function countUnitsByStatus(
  organizationId: string,
  productId: string,
): Promise<Map<StockUnitStatus, number>> {
  const rows = await getDb()
    .select({ status: stockUnits.status, total: count() })
    .from(stockUnits)
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        eq(stockUnits.productId, productId),
      ),
    )
    .groupBy(stockUnits.status);
  return new Map(rows.map((row) => [row.status, row.total]));
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
  price: string | null;
  priceCurrency: string | null;
};

const lockedColumns = {
  id: stockUnits.id,
  productId: stockUnits.productId,
  serial: stockUnits.serial,
  status: stockUnits.status,
  price: stockUnits.price,
  priceCurrency: stockUnits.priceCurrency,
};

// Las unidades con esos ids, sin bloqueo, en la transacción de quien llama. Para el pedido del agente,
// que elige por id, nunca por IMEI (brief-29.8, D-7). Una de otra organización no vuelve.
export function findUnitsByIdsIn(
  executor: Executor,
  organizationId: string,
  unitIds: string[],
): Promise<LockedUnit[]> {
  if (unitIds.length === 0) return Promise.resolve([]);
  return executor
    .select(lockedColumns)
    .from(stockUnits)
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        inArray(stockUnits.id, unitIds),
      ),
    );
}

// Las unidades no dadas de baja con esos IMEI, sin distinguir mayúsculas y sin bloqueo. Para elegir
// las unidades de una línea de un pedido o una venta (brief-29.5.2, D-1 y D-5). Desde la 29.7 un IMEI
// puede tener una vendida y otra en el local (brief-29.7, U-2): quien elige prefiere la del local.
export async function findCurrentUnitsBySerials(
  executor: Executor,
  organizationId: string,
  serials: string[],
): Promise<LockedUnit[]> {
  if (serials.length === 0) return [];
  const lowered = [...new Set(serials.map((serial) => serial.toLowerCase()))];
  return executor
    .select(lockedColumns)
    .from(stockUnits)
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        ne(stockUnits.status, "written_off"),
        inArray(sql<string>`lower(${stockUnits.serial})`, lowered),
      ),
    );
}

// Las unidades disponibles de un producto, para elegirlas en un pedido o una venta (brief-29.5.2,
// D-5), de la más vieja a la más nueva.
export function findAvailableUnitsOfProduct(
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
        eq(stockUnits.status, "available"),
      ),
    )
    .orderBy(asc(stockUnits.createdAt), asc(stockUnits.id));
}

// Las unidades FOR UPDATE, ordenadas por id: después del producto y antes del saldo (ADR 0024, punto
// 16; brief-29.5, D-4). Una de otra organización no vuelve.
export function lockUnits(
  tx: DbTransaction,
  organizationId: string,
  unitIds: string[],
): Promise<LockedUnit[]> {
  if (unitIds.length === 0) return Promise.resolve([]);
  return tx
    .select(lockedColumns)
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

// Los estados de una unidad que está en el local: los que cuenta el índice único parcial del IMEI.
// Desde la 29.7, una vendida tampoco cuenta (brief-29.7, U-2).
const OUT_OF_SHOP: StockUnitStatus[] = ["written_off", "sold"];

// Los IMEI de la lista que ya tienen una unidad en el local, sin distinguir mayúsculas. Es el aviso con
// nombre; la última defensa es el índice único parcial.
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
        notInArray(stockUnits.status, OUT_OF_SHOP),
        inArray(sql<string>`lower(${stockUnits.serial})`, lowered),
      ),
    );
  return rows.map((row) => row.serial);
}

// Los IMEI de unas unidades que volvieron al local en otra unidad (brief-29.7, U-2): un equipo vendido
// que se recibió como usado. La anulación de su venta se rechaza, porque la vendida volvería al local
// con el IMEI de la otra. Sin bloqueo: el índice único parcial es la última defensa.
export async function findSerialsBackInShop(
  tx: DbTransaction,
  organizationId: string,
  unitIds: string[],
): Promise<string[]> {
  if (unitIds.length === 0) return [];
  const rows = await tx
    .selectDistinct({ serial: stockUnits.serial })
    .from(stockUnits)
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        notInArray(stockUnits.id, unitIds),
        notInArray(stockUnits.status, OUT_OF_SHOP),
        inArray(
          sql<string>`lower(${stockUnits.serial})`,
          tx
            .select({ serial: sql<string>`lower(${stockUnits.serial})` })
            .from(stockUnits)
            .where(
              and(
                eq(stockUnits.organizationId, organizationId),
                inArray(stockUnits.id, unitIds),
              ),
            ),
        ),
      ),
    )
    .orderBy(stockUnits.serial);
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
  // Sin él, la unidad no tiene precio propio (brief-29.5.2, D-2).
  price?: { amount: string; currency: string } | null;
  originType: StockUnitOrigin;
  originId: string | null;
  createdBy: string;
  // Desde la 29.7, la unidad de un usado nace en revisión (brief-29.7, D-2). Sin él, disponible.
  status?: "available" | "in_review";
};

// Nace disponible, o en revisión la de un usado (trigger stock_units_guard). Un IMEI repetido entre las vigentes lo rechaza el
// índice único parcial: la transacción queda abortada y quien llama la revierte entera.
export async function insertStockUnit(
  tx: DbTransaction,
  unit: NewStockUnit,
): Promise<string> {
  const { price, ...values } = unit;
  const rows = await tx
    .insert(stockUnits)
    .values({
      ...values,
      price: price?.amount ?? null,
      priceCurrency: price?.currency ?? null,
    })
    .returning({ id: stockUnits.id });
  return rows[0]!.id;
}

// Un cambio de estado de pedidos y ventas (brief-29.5.2, D-3): solo desde from, que quien llama ya
// comprobó con las unidades bloqueadas, así que una que no cambia es un defecto y se lanza dentro de
// la transacción. El trigger stock_units_guard rechaza la transición que no esté permitida.
export async function setUnitsStatus(
  tx: DbTransaction,
  organizationId: string,
  unitIds: string[],
  from: StockUnitStatus,
  to: StockUnitStatus,
): Promise<void> {
  if (unitIds.length === 0) return;
  const rows = await tx
    .update(stockUnits)
    .set({ status: to })
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        inArray(stockUnits.id, unitIds),
        eq(stockUnits.status, from),
      ),
    )
    .returning({ id: stockUnits.id });
  if (rows.length !== unitIds.length) {
    throw new Error(`setUnitsStatus: una unidad no estaba en ${from}`);
  }
}

// Desde available o, desde la 29.6.2, desde in_review (brief-29.6.2, U-2): quien llama ya las bloqueó y
// comprobó su estado, así que una que no cambia es un defecto, y se lanza dentro de la transacción.
export async function setUnitsWrittenOff(
  tx: DbTransaction,
  organizationId: string,
  unitIds: string[],
  from: "available" | "in_review" = "available",
): Promise<void> {
  if (unitIds.length === 0) return;
  const rows = await tx
    .update(stockUnits)
    .set({ status: "written_off" })
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        inArray(stockUnits.id, unitIds),
        eq(stockUnits.status, from),
      ),
    )
    .returning({ id: stockUnits.id });
  if (rows.length !== unitIds.length) {
    throw new Error(`setUnitsWrittenOff: una unidad no estaba en ${from}`);
  }
}

// La vuelta de reparación (brief-29.6.2, D-2): in_repair → in_review con el costo ya sumado. El
// trigger acepta un costo nuevo solo en esta transición, y solo mayor.
export async function setUnitRepaired(
  tx: DbTransaction,
  organizationId: string,
  unitId: string,
  cost: string,
): Promise<void> {
  const rows = await tx
    .update(stockUnits)
    .set({ status: "in_review", cost })
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        eq(stockUnits.id, unitId),
        eq(stockUnits.status, "in_repair"),
      ),
    )
    .returning({ id: stockUnits.id });
  if (rows.length !== 1) {
    throw new Error("setUnitRepaired: la unidad no estaba en reparación");
  }
}

// Los días de garantía propios de una unidad (brief-29.9, D-1): no tocan el saldo, el estado ni el
// costo, así que valen en cualquier estado salvo dada de baja, que el trigger rechaza.
export async function updateUnitWarrantyDays(
  tx: DbTransaction,
  organizationId: string,
  unitId: string,
  warrantyDays: number | null,
): Promise<void> {
  const rows = await tx
    .update(stockUnits)
    .set({ warrantyDays })
    .where(
      and(
        eq(stockUnits.organizationId, organizationId),
        eq(stockUnits.id, unitId),
      ),
    )
    .returning({ id: stockUnits.id });
  if (rows.length === 0) {
    throw new Error(
      "updateUnitWarrantyDays: la unidad no existe en esta organización",
    );
  }
}

export async function updateUnitDetails(
  tx: DbTransaction,
  organizationId: string,
  unitId: string,
  details: {
    gradeId: string | null;
    batteryHealth: number | null;
    // Desde la 29.5.2 (brief-29.5.2, D-2).
    price: { amount: string; currency: string } | null;
  },
): Promise<void> {
  const { price, ...rest } = details;
  const rows = await tx
    .update(stockUnits)
    .set({
      ...rest,
      price: price?.amount ?? null,
      priceCurrency: price?.currency ?? null,
    })
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
