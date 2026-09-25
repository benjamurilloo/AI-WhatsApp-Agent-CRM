import { and, asc, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { clients, searchNormalized } from "./schema";

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
    // `searchNormalized` es la misma función que define el índice
    // `clients_organization_display_name_unaccent_idx`, para que no puedan separarse (D-2).
    conditions.push(
      sql`${searchNormalized(clients.displayName)} like immutable_unaccent(lower(${likePrefix(search.prefix)}))`,
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

// Todos los ids que cumplen los filtros, en el orden de nombre de findClients. Para que otro
// módulo componga el orden por última interacción sin JOIN (brief-6.3, D-1).
export async function findClientIdsByName(
  organizationId: string,
  search: ClientSearch,
  activity: ActivityFilter,
): Promise<string[]> {
  const rows = await getDb()
    .select({ id: clients.id })
    .from(clients)
    .where(searchConditions(organizationId, search, activity))
    .orderBy(sql`lower(${clients.displayName})`, asc(clients.id));
  return rows.map((row) => row.id);
}

export function findClientsByIds(
  organizationId: string,
  clientIds: string[],
): Promise<ClientRow[]> {
  if (clientIds.length === 0) return Promise.resolve([]);
  return getDb()
    .select(clientColumns)
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        inArray(clients.id, clientIds),
      ),
    );
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

// El llamador ya leyó la fila filtrada por organización y con FOR UPDATE en esta misma
// transacción, así que cero filas actualizadas no es una carrera: es un defecto de
// programación. Se lanza dentro de la transacción, que revierte (9.0.1, D-1).
function assertUpdatedOne(rows: unknown[], what: string): void {
  if (rows.length === 0) {
    throw new Error(`${what}: la fila no existe en esta organización`);
  }
}

export function updateClientValues(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
  values: Partial<ClientValues>,
): Promise<void | "phone_taken"> {
  return inSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .update(clients)
      .set(values)
      .where(
        and(
          eq(clients.organizationId, organizationId),
          eq(clients.id, clientId),
        ),
      )
      .returning({ id: clients.id });
    assertUpdatedOne(rows, "updateClientValues");
  });
}

export async function updateClientActive(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
  isActive: boolean,
): Promise<void> {
  const rows = await tx
    .update(clients)
    .set({ isActive })
    .where(
      and(eq(clients.organizationId, organizationId), eq(clients.id, clientId)),
    )
    .returning({ id: clients.id });
  assertUpdatedOne(rows, "updateClientActive");
}

// Lo que la resolución por servicio devuelve de un cliente (brief-12.1, D-9): sin teléfono.
export type ResolvedClientRow = {
  id: string;
  displayName: string;
  isActive: boolean;
};

// Alta por servicio (brief-12.1, D-10): con otra resolución del mismo teléfono en curso, espera en
// el índice único parcial y no inserta nada. El ON CONFLICT repite el predicado del índice
// `clients_organization_phone_unique` (convención de la 6.5.2). Devuelve la fila solo si insertó.
export async function insertClientIfPhoneAbsent(
  tx: DbTransaction,
  organizationId: string,
  values: { displayName: string; phoneE164: string },
): Promise<ResolvedClientRow | undefined> {
  const result = await tx.execute<{
    id: string;
    display_name: string;
    is_active: boolean;
  }>(sql`
    insert into clients (organization_id, display_name, phone_e164)
    values (${organizationId}, ${values.displayName}, ${values.phoneE164})
    on conflict (organization_id, phone_e164) where phone_e164 is not null
    do nothing
    returning id, display_name, is_active`);
  const row = result.rows[0];
  return row
    ? { id: row.id, displayName: row.display_name, isActive: row.is_active }
    : undefined;
}

export async function findResolvedClientByPhone(
  tx: DbTransaction,
  organizationId: string,
  phoneE164: string,
): Promise<ResolvedClientRow | undefined> {
  const rows = await tx
    .select({
      id: clients.id,
      displayName: clients.displayName,
      isActive: clients.isActive,
    })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        eq(clients.phoneE164, phoneE164),
      ),
    )
    .limit(1);
  return rows[0];
}

// Cliente de la organización con ese teléfono, activo o no (brief-6.5.2).
export async function findClientIdByPhoneE164(
  tx: DbTransaction,
  organizationId: string,
  phoneE164: string,
): Promise<string | null> {
  const rows = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        eq(clients.phoneE164, phoneE164),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

// Lo mismo, bloqueando la fila hasta el final de la transacción: serializa la resolución de la
// conversación vigente de un cliente (brief-12.2, D-8).
export async function lockClientIdByPhoneE164(
  tx: DbTransaction,
  organizationId: string,
  phoneE164: string,
): Promise<string | null> {
  const rows = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        eq(clients.phoneE164, phoneE164),
      ),
    )
    .for("update");
  return rows[0]?.id ?? null;
}
