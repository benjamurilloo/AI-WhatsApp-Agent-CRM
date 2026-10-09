import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  knowledgeEntries,
  knowledgeSearchCondition,
  knowledgeSearchRank,
} from "./schema";

// Acceso a knowledge_entries. Toda consulta filtra por organization_id en SQL (brief-11.2, AC-6).

type Executor = Db | DbTransaction;

// Estado de una entrada respecto del día de hoy de la organización (brief-11.2, D-3). Lo calcula
// PostgreSQL con la zona de la organización, nunca el reloj de la aplicación.
export type KnowledgeStatus = "current" | "scheduled" | "expired" | "inactive";

export type KnowledgeRow = {
  id: string;
  title: string;
  category: string;
  content: string;
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
  status: KnowledgeStatus;
  createdAt: Date;
  updatedAt: Date;
};

// Campos editables, ya validados y recortados.
export type KnowledgeValues = {
  title: string;
  category: string;
  content: string;
  validFrom: string | null;
  validUntil: string | null;
};

function today(timezone: string): SQL {
  return sql`(now() at time zone ${timezone})::date`;
}

// Una sola definición del estado: la usan la columna calculada y el filtro, para que la etiqueta
// de una fila y el filtro que la incluye no puedan contradecirse.
function statusExpression(timezone: string): SQL<KnowledgeStatus> {
  const t = today(timezone);
  return sql<KnowledgeStatus>`case
    when not ${knowledgeEntries.isActive} then 'inactive'
    when ${knowledgeEntries.validFrom} > ${t} then 'scheduled'
    when ${knowledgeEntries.validUntil} < ${t} then 'expired'
    else 'current' end`;
}

function columns(timezone: string) {
  return {
    id: knowledgeEntries.id,
    title: knowledgeEntries.title,
    category: knowledgeEntries.category,
    content: knowledgeEntries.content,
    isActive: knowledgeEntries.isActive,
    validFrom: knowledgeEntries.validFrom,
    validUntil: knowledgeEntries.validUntil,
    status: statusExpression(timezone),
    createdAt: knowledgeEntries.createdAt,
    updatedAt: knowledgeEntries.updatedAt,
  };
}

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

// forUpdate: la escritura bloquea la fila y calcula el diff sobre lo leído (brief-4.2, D-5).
export async function findEntry(
  organizationId: string,
  entryId: string,
  timezone: string,
  executor: Executor = getDb(),
  { forUpdate = false } = {},
): Promise<KnowledgeRow | undefined> {
  const query = executor
    .select(columns(timezone))
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.organizationId, organizationId),
        eq(knowledgeEntries.id, entryId),
      ),
    )
    .limit(1);
  const rows = forUpdate ? await query.for("update") : await query;
  return rows[0];
}

export type StatusFilter = KnowledgeStatus | "all";

export type EntryQuery = {
  organizationId: string;
  timezone: string;
  text: string;
  status: StatusFilter;
};

function entryConditions(query: EntryQuery): SQL {
  const conditions: SQL[] = [
    eq(knowledgeEntries.organizationId, query.organizationId),
  ];
  if (query.status !== "all") {
    conditions.push(sql`${statusExpression(query.timezone)} = ${query.status}`);
  }
  if (query.text !== "") {
    conditions.push(knowledgeSearchCondition(query.text));
  }
  return and(...conditions)!;
}

export async function countEntries(query: EntryQuery): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(knowledgeEntries)
    .where(entryConditions(query));
  return rows[0]!.total;
}

// Con texto, por relevancia (brief-11.2, D-6); sin texto, por categoría y título. Siempre con
// desempate por id, para que la paginación sea estable (brief-4.3.3, D-2).
export function findEntries(
  query: EntryQuery,
  limit: number,
  offset: number,
): Promise<KnowledgeRow[]> {
  const order =
    query.text === ""
      ? [
          asc(knowledgeEntries.category),
          asc(knowledgeEntries.title),
          asc(knowledgeEntries.id),
        ]
      : [
          desc(knowledgeSearchRank(query.text)),
          asc(knowledgeEntries.title),
          asc(knowledgeEntries.id),
        ];
  return getDb()
    .select(columns(query.timezone))
    .from(knowledgeEntries)
    .where(entryConditions(query))
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
}

// Categorías ya usadas en la organización, para sugerirlas en el formulario (D-2). Con tope,
// porque es una ayuda y no un listado.
export const SUGGESTIONS_LIMIT = 200;

export async function findCategories(
  organizationId: string,
): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ value: knowledgeEntries.category })
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.organizationId, organizationId))
    .orderBy(knowledgeEntries.category)
    .limit(SUGGESTIONS_LIMIT);
  return rows.map((row) => row.value);
}

// Una entrada vigente de alguna de esas categorías, sin distinguir mayúsculas: la pantalla del
// horario avisa que hay un texto de horarios además del horario estructurado (brief-17.4, D-5).
export async function findCurrentEntryInCategories(
  organizationId: string,
  timezone: string,
  categories: string[],
): Promise<{ id: string; title: string } | undefined> {
  const rows = await getDb()
    .select({ id: knowledgeEntries.id, title: knowledgeEntries.title })
    .from(knowledgeEntries)
    .where(
      and(
        eq(knowledgeEntries.organizationId, organizationId),
        sql`lower(${knowledgeEntries.category}) in ${categories}`,
        sql`${statusExpression(timezone)} = 'current'`,
      ),
    )
    .orderBy(asc(knowledgeEntries.title), asc(knowledgeEntries.id))
    .limit(1);
  return rows[0];
}

// drizzle-orm envuelve el error de pg; el código y la constraint quedan en la causa.
function isTitleUniqueViolation(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "knowledge_entries_organization_title_lower_unique"
  );
}

// Corre en un savepoint: un título repetido deshace solo esta escritura (D-5).
async function inSavepoint<T>(
  tx: DbTransaction,
  work: (savepoint: DbTransaction) => Promise<T>,
): Promise<T | "title_taken"> {
  try {
    return await tx.transaction(work);
  } catch (error) {
    if (isTitleUniqueViolation(error)) return "title_taken";
    throw error;
  }
}

export function insertEntry(
  tx: DbTransaction,
  organizationId: string,
  values: KnowledgeValues,
): Promise<string | "title_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(knowledgeEntries)
      .values({ organizationId, ...values })
      .returning({ id: knowledgeEntries.id });
    return rows[0]!.id;
  });
}

// El llamador ya leyó la fila filtrada por organización y con FOR UPDATE en esta misma
// transacción: cero filas actualizadas es un defecto de programación, y se lanza (9.0.1, D-1).
function assertUpdatedOne(rows: unknown[], what: string): void {
  if (rows.length === 0) {
    throw new Error(`${what}: la fila no existe en esta organización`);
  }
}

export function updateEntryValues(
  tx: DbTransaction,
  organizationId: string,
  entryId: string,
  values: Partial<KnowledgeValues>,
): Promise<void | "title_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .update(knowledgeEntries)
      .set(values)
      .where(
        and(
          eq(knowledgeEntries.organizationId, organizationId),
          eq(knowledgeEntries.id, entryId),
        ),
      )
      .returning({ id: knowledgeEntries.id });
    assertUpdatedOne(rows, "updateEntryValues");
  });
}

export async function updateEntryActive(
  tx: DbTransaction,
  organizationId: string,
  entryId: string,
  isActive: boolean,
): Promise<void> {
  const rows = await tx
    .update(knowledgeEntries)
    .set({ isActive })
    .where(
      and(
        eq(knowledgeEntries.organizationId, organizationId),
        eq(knowledgeEntries.id, entryId),
      ),
    )
    .returning({ id: knowledgeEntries.id });
  assertUpdatedOne(rows, "updateEntryActive");
}
