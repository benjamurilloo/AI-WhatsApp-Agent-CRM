import { and, asc, count, eq, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { clients } from "./schema";

// Acceso a clients. Toda consulta filtra por organization_id en SQL (brief-5.2).

type Executor = Db | DbTransaction;

export type ClientRow = {
  id: string;
  displayName: string;
  phoneE164: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Campos editables, con el teléfono ya normalizado a E.164.
export type ClientValues = {
  displayName: string;
  phoneE164: string | null;
  notes: string | null;
};

const clientColumns = {
  id: clients.id,
  displayName: clients.displayName,
  phoneE164: clients.phoneE164,
  notes: clients.notes,
  isActive: clients.isActive,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
};

export function withTransaction<T>(
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(work);
}

// forUpdate: la escritura bloquea la fila y calcula el diff sobre lo leído (brief-4.2, D-5).
export async function findClient(
  organizationId: string,
  clientId: string,
  executor: Executor = getDb(),
  { forUpdate = false } = {},
): Promise<ClientRow | undefined> {
  const query = executor
    .select(clientColumns)
    .from(clients)
    .where(
      and(eq(clients.organizationId, organizationId), eq(clients.id, clientId)),
    )
    .limit(1);
  const rows = forUpdate ? await query.for("update") : await query;
  return rows[0];
}

export type ActivityFilter = "active" | "inactive" | "all";

// Teléfono exacto o prefijo de nombre, nunca los dos: lo decide el servicio (brief-5.2, D-3).
export type ClientSearch =
  | { kind: "all" }
  | { kind: "phone"; e164: string }
  | { kind: "name"; prefix: string };

// % y _ del texto buscado se escapan: LIKE los trata como literales.
function likePrefix(text: string): string {
  return `${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function searchConditions(
  organizationId: string,
  search: ClientSearch,
  activity: ActivityFilter,
): SQL {
  const conditions: SQL[] = [eq(clients.organizationId, organizationId)];
  if (activity !== "all") {
    conditions.push(eq(clients.isActive, activity === "active"));
  }
  if (search.kind === "phone") {
    conditions.push(eq(clients.phoneE164, search.e164));
  } else if (search.kind === "name") {
    conditions.push(
      sql`lower(${clients.displayName}) like ${likePrefix(search.prefix)}`,
    );
  }
  return and(...conditions)!;
}

export async function countClients(
  organizationId: string,
  search: ClientSearch,
  activity: ActivityFilter,
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(clients)
    .where(searchConditions(organizationId, search, activity));
  return rows[0]?.total ?? 0;
}

// Orden por nombre, con desempate estable por id (brief-5.2, D-4).
export function findClients(
  organizationId: string,
  search: ClientSearch,
  activity: ActivityFilter,
  limit: number,
  offset: number,
): Promise<ClientRow[]> {
  return getDb()
    .select(clientColumns)
    .from(clients)
    .where(searchConditions(organizationId, search, activity))
    .orderBy(sql`lower(${clients.displayName})`, asc(clients.id))
    .limit(limit)
    .offset(offset);
}

// drizzle-orm envuelve el error de pg; el código y la constraint quedan en la causa.
function isPhoneUniqueViolation(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "clients_organization_phone_unique"
  );
}

// Corre en un savepoint: un teléfono repetido deshace solo esta escritura y la transacción sigue usable.
async function inSavepoint<T>(
  tx: DbTransaction,
  work: (savepoint: DbTransaction) => Promise<T>,
): Promise<T | "phone_taken"> {
  try {
    return await tx.transaction(work);
  } catch (error) {
    if (isPhoneUniqueViolation(error)) return "phone_taken";
    throw error;
  }
}

export function insertClient(
  tx: DbTransaction,
  organizationId: string,
  values: ClientValues,
): Promise<string | "phone_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(clients)
      .values({ organizationId, ...values })
      .returning({ id: clients.id });
    return rows[0]!.id;
  });
}

export function updateClientValues(
  tx: DbTransaction,
  clientId: string,
  values: Partial<ClientValues>,
): Promise<void | "phone_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    await savepoint.update(clients).set(values).where(eq(clients.id, clientId));
  });
}

export async function updateClientActive(
  tx: DbTransaction,
  clientId: string,
  isActive: boolean,
): Promise<void> {
  await tx.update(clients).set({ isActive }).where(eq(clients.id, clientId));
}
