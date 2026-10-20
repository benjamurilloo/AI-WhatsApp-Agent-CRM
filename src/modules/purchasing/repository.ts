import { and, asc, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { suppliers } from "./schema";

// Acceso a suppliers (brief-22.2). Toda consulta filtra por organization_id en SQL, también las
// escrituras por id (D-6).

type Executor = Db | DbTransaction;

export type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cuit: string | null;
  // Desde la 29.6 (brief-29.6, D-3): no es un campo del formulario; lo cambia setSupplierTechnician.
  isTechnician: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Los campos editables, ya validados: el teléfono en E.164 y el CUIT en once dígitos.
export type SupplierValues = {
  name: string;
  phone: string | null;
  email: string | null;
  cuit: string | null;
};

const supplierColumns = {
  id: suppliers.id,
  name: suppliers.name,
  phone: suppliers.phone,
  email: suppliers.email,
  cuit: suppliers.cuit,
  isTechnician: suppliers.isTechnician,
  isActive: suppliers.isActive,
  createdAt: suppliers.createdAt,
  updatedAt: suppliers.updatedAt,
};

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

// La edición, la desactivación y la reactivación leen con FOR UPDATE y deciden con lo leído
// (ADR 0023, punto 10; D-6), como la del cliente. Desde la 22.3, el alta de una orden de compra lo
// lee FOR SHARE (brief-22.3, D-7; H-4): espera a una edición o desactivación en curso y relee el
// estado ya confirmado. La clave foránea del INSERT no alcanza, porque no mira si está activo.
export async function findSupplier(
  organizationId: string,
  supplierId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean; forShare?: boolean } = {},
): Promise<SupplierRow | undefined> {
  const query = executor
    .select(supplierColumns)
    .from(suppliers)
    .where(
      and(
        eq(suppliers.organizationId, organizationId),
        eq(suppliers.id, supplierId),
      ),
    );
  const rows = options.forUpdate
    ? await query.for("update")
    : options.forShare
      ? await query.for("share")
      : await query;
  return rows[0];
}

export type SupplierStatusFilter = "active" | "inactive" | "all";

// Qué busca el texto de la lista (D-10): parte del nombre, o un CUIT exacto.
export type SupplierSearch =
  | { kind: "none" }
  | { kind: "name"; text: string }
  | { kind: "cuit"; digits: string };

// Parte del nombre, sin distinguir mayúsculas ni acentos. `%`, `_` y `\` del texto buscado son
// literales: se escapan antes de armar el patrón.
function likeContains(text: string): string {
  return `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function listConditions(
  organizationId: string,
  status: SupplierStatusFilter,
  search: SupplierSearch,
): SQL {
  const conditions: SQL[] = [eq(suppliers.organizationId, organizationId)];
  if (status !== "all") {
    conditions.push(eq(suppliers.isActive, status === "active"));
  }
  if (search.kind === "name") {
    conditions.push(
      sql`immutable_unaccent(lower(${suppliers.name})) like immutable_unaccent(${likeContains(search.text)})`,
    );
  } else if (search.kind === "cuit") {
    conditions.push(eq(suppliers.cuit, search.digits));
  }
  return and(...conditions)!;
}

export async function countSuppliers(
  organizationId: string,
  status: SupplierStatusFilter,
  search: SupplierSearch,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(suppliers)
    .where(listConditions(organizationId, status, search));
  return rows[0]?.total ?? 0;
}

// Orden alfabético por lower(name), el del índice único, y el id para desempatar (D-10).
export function findSuppliers(
  organizationId: string,
  status: SupplierStatusFilter,
  search: SupplierSearch,
  limit: number,
  offset: number,
): Promise<SupplierRow[]> {
  return getDb()
    .select(supplierColumns)
    .from(suppliers)
    .where(listConditions(organizationId, status, search))
    .orderBy(sql`lower(${suppliers.name})`, asc(suppliers.id))
    .limit(limit)
    .offset(offset);
}

export type SupplierUniqueRule = "duplicate_name" | "duplicate_cuit";

// drizzle-orm envuelve el error de pg; el código y la constraint quedan en la causa. Solo se
// rescatan las dos restricciones de D-2 y D-4, por su nombre: cualquier otro 23505 se relanza (D-6).
// Exportada para su test unitario; no sale de la interfaz pública del módulo.
export function uniqueRuleOf(error: unknown): SupplierUniqueRule | null {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  if (source?.code !== "23505") return null;
  if (source.constraint === "suppliers_organization_name_lower_unique") {
    return "duplicate_name";
  }
  if (source.constraint === "suppliers_organization_cuit_unique") {
    return "duplicate_cuit";
  }
  return null;
}

// Corre en un savepoint: un nombre o un CUIT repetido deshace solo esta escritura y la transacción
// sigue usable.
async function inSavepoint<T>(
  tx: DbTransaction,
  work: (savepoint: DbTransaction) => Promise<T>,
): Promise<T | SupplierUniqueRule> {
  try {
    return await tx.transaction(work);
  } catch (error) {
    const rule = uniqueRuleOf(error);
    if (rule !== null) return rule;
    throw error;
  }
}

export function insertSupplier(
  tx: DbTransaction,
  organizationId: string,
  values: SupplierValues,
): Promise<{ id: string } | SupplierUniqueRule> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(suppliers)
      .values({ organizationId, ...values })
      .returning({ id: suppliers.id });
    return { id: rows[0]!.id };
  });
}

// El llamador ya leyó la fila filtrada por organización y con FOR UPDATE en esta misma
// transacción, así que cero filas actualizadas no es una carrera: es un defecto de programación.
// Se lanza dentro de la transacción, que revierte, como en crm (9.0.1, D-1).
function assertUpdatedOne(rows: unknown[], what: string): void {
  if (rows.length === 0) {
    throw new Error(`${what}: la fila no existe en esta organización`);
  }
}

export function updateSupplierValues(
  tx: DbTransaction,
  organizationId: string,
  supplierId: string,
  values: Partial<SupplierValues>,
): Promise<void | SupplierUniqueRule> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .update(suppliers)
      .set(values)
      .where(
        and(
          eq(suppliers.organizationId, organizationId),
          eq(suppliers.id, supplierId),
        ),
      )
      .returning({ id: suppliers.id });
    assertUpdatedOne(rows, "updateSupplierValues");
  });
}

export async function updateSupplierActive(
  tx: DbTransaction,
  organizationId: string,
  supplierId: string,
  isActive: boolean,
): Promise<void> {
  const rows = await tx
    .update(suppliers)
    .set({ isActive })
    .where(
      and(
        eq(suppliers.organizationId, organizationId),
        eq(suppliers.id, supplierId),
      ),
    )
    .returning({ id: suppliers.id });
  assertUpdatedOne(rows, "updateSupplierActive");
}

export async function updateSupplierTechnician(
  tx: DbTransaction,
  organizationId: string,
  supplierId: string,
  isTechnician: boolean,
): Promise<void> {
  const rows = await tx
    .update(suppliers)
    .set({ isTechnician })
    .where(
      and(
        eq(suppliers.organizationId, organizationId),
        eq(suppliers.id, supplierId),
      ),
    )
    .returning({ id: suppliers.id });
  assertUpdatedOne(rows, "updateSupplierTechnician");
}

// Los técnicos activos, por nombre, para la orden de servicio (brief-29.6, D-3).
export function findActiveTechnicians(
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  return getDb()
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(
      and(
        eq(suppliers.organizationId, organizationId),
        eq(suppliers.isActive, true),
        eq(suppliers.isTechnician, true),
      ),
    )
    .orderBy(sql`lower(${suppliers.name})`, asc(suppliers.id));
}

// Los nombres de unos proveedores, para las pantallas de los pagos (brief-22.6, D-13).
export async function findSupplierNames(
  organizationId: string,
  supplierIds: string[],
): Promise<{ id: string; name: string }[]> {
  if (supplierIds.length === 0) return [];
  return getDb()
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(
      and(
        eq(suppliers.organizationId, organizationId),
        inArray(suppliers.id, supplierIds),
      ),
    );
}
