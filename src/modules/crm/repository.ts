import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import {
  clients,
  clientTagAssignments,
  clientTags,
  searchNormalized,
} from "./schema";
import type { ProvinceCode } from "./provinces";
import type { ClientKind } from "./schema";
import type { TagColor } from "./tag-colors";

// Acceso a clients. Toda consulta filtra por organization_id en SQL (brief-5.2).

type Executor = Db | DbTransaction;

// Los campos de la 17.1 (brief-17.1, D-2), todos opcionales.
export type ClientExtraValues = {
  email: string | null;
  kind: ClientKind | null;
  companyName: string | null;
  jobTitle: string | null;
  addressLine: string | null;
  city: string | null;
  province: ProvinceCode | null;
  postalCode: string | null;
  segment: string | null;
  // Desde la 29.7 (brief-29.7, D-6).
  documentNumber: string | null;
  instagram: string | null;
};

export type ClientRow = {
  id: string;
  displayName: string;
  phoneE164: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
} & ClientExtraValues;

// Campos editables, con el teléfono ya normalizado a E.164.
export type ClientValues = {
  displayName: string;
  phoneE164: string | null;
  notes: string | null;
} & ClientExtraValues;

const clientColumns = {
  id: clients.id,
  displayName: clients.displayName,
  phoneE164: clients.phoneE164,
  notes: clients.notes,
  email: clients.email,
  kind: clients.kind,
  companyName: clients.companyName,
  jobTitle: clients.jobTitle,
  addressLine: clients.addressLine,
  city: clients.city,
  // El CHECK clients_province solo admite los códigos de la lista.
  province: sql<ProvinceCode | null>`${clients.province}`,
  postalCode: clients.postalCode,
  segment: clients.segment,
  documentNumber: clients.documentNumber,
  instagram: clients.instagram,
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

// FOR SHARE, para el alta de un pedido (brief-19.2, D-3): espera a una desactivación en curso, que
// bloquea FOR UPDATE, y lee el estado ya confirmado.
export async function lockClientShared(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
): Promise<{ id: string; isActive: boolean } | undefined> {
  const rows = await tx
    .select({ id: clients.id, isActive: clients.isActive })
    .from(clients)
    .where(
      and(eq(clients.organizationId, organizationId), eq(clients.id, clientId)),
    )
    .limit(1)
    .for("share");
  return rows[0];
}

// Lo mismo por teléfono, para el pedido del agente (brief-19.4, D-7): el mismo modo compartido.
export async function lockClientSharedByPhoneE164(
  tx: DbTransaction,
  organizationId: string,
  phoneE164: string,
): Promise<{ id: string; isActive: boolean } | undefined> {
  const rows = await tx
    .select({ id: clients.id, isActive: clients.isActive })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        eq(clients.phoneE164, phoneE164),
      ),
    )
    .limit(1)
    .for("share");
  return rows[0];
}

// FOR NO KEY UPDATE, para la devolución desde la cuenta (brief-21.5, D-11 precisado): choca con el
// modo compartido de la emisión de una venta, que achica lo que está a favor, y no con las claves
// foráneas que apuntan al cliente.
export async function lockClientExclusive(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
): Promise<{ id: string } | undefined> {
  const rows = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(eq(clients.organizationId, organizationId), eq(clients.id, clientId)),
    )
    .limit(1)
    .for("no key update");
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

// Filtros de la lista más allá del texto y la actividad, ya validados por el servicio: la etiqueta
// (brief-16.1) y el tipo, la provincia y el segmento (brief-17.1, D-9). Nulo es «sin filtro».
export type ClientAttributeFilters = {
  tagId?: string | null;
  kind?: ClientKind | null;
  province?: ProvinceCode | null;
  segment?: string | null;
};

function searchConditions(
  organizationId: string,
  search: ClientSearch,
  activity: ActivityFilter,
  {
    tagId = null,
    kind = null,
    province = null,
    segment = null,
  }: ClientAttributeFilters = {},
): SQL {
  const conditions: SQL[] = [eq(clients.organizationId, organizationId)];
  if (activity !== "all") {
    conditions.push(eq(clients.isActive, activity === "active"));
  }
  if (kind !== null) conditions.push(eq(clients.kind, kind));
  if (province !== null) conditions.push(eq(clients.province, province));
  // El segmento exacto, como la marca y la categoría de productos (brief-15.2, D-4).
  if (segment !== null) conditions.push(eq(clients.segment, segment));
  // Solo los clientes que tienen la etiqueta (brief-16.1, FR-CLI-10). El servicio ya comprobó
  // que es una etiqueta activa de la organización.
  // Con alias explícitos, como en findTagsWithClientCounts: Drizzle no califica las columnas.
  if (tagId !== null) {
    conditions.push(
      sql`exists (select 1 from client_tag_assignments a
                  where a.organization_id = ${organizationId}
                    and a.client_id = "clients"."id"
                    and a.tag_id = ${tagId})`,
    );
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
  attributes: ClientAttributeFilters = {},
): Promise<number> {
  const rows = await getDb()
    .select({ total: count() })
    .from(clients)
    .where(searchConditions(organizationId, search, activity, attributes));
  return rows[0]?.total ?? 0;
}

// Orden por nombre, con desempate estable por id (brief-5.2, D-4).
export function findClients(
  organizationId: string,
  search: ClientSearch,
  activity: ActivityFilter,
  limit: number,
  offset: number,
  attributes: ClientAttributeFilters = {},
): Promise<ClientRow[]> {
  return getDb()
    .select(clientColumns)
    .from(clients)
    .where(searchConditions(organizationId, search, activity, attributes))
    .orderBy(sql`lower(${clients.displayName})`, asc(clients.id))
    .limit(limit)
    .offset(offset);
}

// Todos los ids que cumplen los filtros, en el orden de nombre de findClients. Para que otro
// módulo componga el orden por última interacción sin JOIN (brief-6.3, D-1). El filtro por
// etiqueta se resuelve acá, así que conversations no conoce las etiquetas (brief-16.1); lo mismo
// el tipo, la provincia y el segmento (brief-17.1, D-9).
export async function findClientIdsByName(
  organizationId: string,
  search: ClientSearch,
  activity: ActivityFilter,
  attributes: ClientAttributeFilters = {},
): Promise<string[]> {
  const rows = await getDb()
    .select({ id: clients.id })
    .from(clients)
    .where(searchConditions(organizationId, search, activity, attributes))
    .orderBy(sql`lower(${clients.displayName})`, asc(clients.id));
  return rows.map((row) => row.id);
}

// Los segmentos, las provincias y los tipos que tiene algún cliente de la organización, para los filtros de
// la lista y las sugerencias del formulario (brief-17.1, D-5 y D-9). Con tope, como las marcas y
// las categorías de productos.
export const CLIENT_OPTIONS_LIMIT = 200;

export async function findDistinctClientValues(
  organizationId: string,
  column: "segment" | "province" | "kind",
): Promise<string[]> {
  const target =
    column === "segment"
      ? clients.segment
      : column === "province"
        ? clients.province
        : clients.kind;
  const rows = await getDb()
    .selectDistinct({ value: target })
    .from(clients)
    .where(and(eq(clients.organizationId, organizationId), isNotNull(target)))
    .orderBy(target)
    .limit(CLIENT_OPTIONS_LIMIT);
  return rows.map((row) => row.value!);
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

// Etiquetas de clientes (brief-16.1). Toda consulta filtra por organization_id; las claves
// compuestas lo garantizan además en la base (invariante 1).

export type TagRow = {
  id: string;
  name: string;
  color: TagColor;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TagValues = { name: string; color: TagColor };

const tagColumns = {
  id: clientTags.id,
  name: clientTags.name,
  // El CHECK client_tags_color solo admite la paleta.
  color: sql<TagColor>`${clientTags.color}`,
  isActive: clientTags.isActive,
  createdAt: clientTags.createdAt,
  updatedAt: clientTags.updatedAt,
};

const tagOrder = [sql`lower(${clientTags.name})`, asc(clientTags.id)];

// Serializa las escrituras del catálogo de una organización: el límite de etiquetas activas y
// «Crear las sugeridas» con el catálogo vacío se cuentan y se escriben sin que otra transacción
// se cruce (D-3, D-11). Se libera con la transacción.
export async function lockTagCatalog(
  tx: DbTransaction,
  organizationId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`client_tags:${organizationId}`}, 0))`,
  );
}

// `share` es para asignar: espera a una desactivación en curso, que bloquea con `update`,
// y lee el estado ya confirmado (revisión independiente de la 16.1.1, hallazgo 4).
export async function findTag(
  organizationId: string,
  tagId: string,
  executor: Executor = getDb(),
  { lock }: { lock?: "update" | "share" } = {},
): Promise<TagRow | undefined> {
  const query = executor
    .select(tagColumns)
    .from(clientTags)
    .where(
      and(
        eq(clientTags.organizationId, organizationId),
        eq(clientTags.id, tagId),
      ),
    )
    .limit(1);
  const rows = lock ? await query.for(lock) : await query;
  return rows[0];
}

// El catálogo con la cantidad de clientes activos que tiene cada etiqueta (pantalla 13, D-9).
export async function findTagsWithClientCounts(
  organizationId: string,
): Promise<(TagRow & { activeClients: number })[]> {
  return getDb()
    .select({
      ...tagColumns,
      // Con alias explícitos: en un select de una sola tabla, Drizzle no califica las columnas, y
      // organization_id quedaría ambiguo dentro de la subconsulta.
      activeClients: sql<number>`(
        select count(*)::int from client_tag_assignments a
          join clients c on c.organization_id = a.organization_id and c.id = a.client_id
        where a.organization_id = "client_tags"."organization_id"
          and a.tag_id = "client_tags"."id"
          and c.is_active)`,
    })
    .from(clientTags)
    .where(eq(clientTags.organizationId, organizationId))
    .orderBy(...tagOrder);
}

export function findActiveTags(
  organizationId: string,
  executor: Executor = getDb(),
): Promise<TagRow[]> {
  return executor
    .select(tagColumns)
    .from(clientTags)
    .where(
      and(
        eq(clientTags.organizationId, organizationId),
        eq(clientTags.isActive, true),
      ),
    )
    .orderBy(...tagOrder);
}

export async function countTags(
  tx: DbTransaction,
  organizationId: string,
  { activeOnly }: { activeOnly: boolean },
): Promise<number> {
  const conditions = [eq(clientTags.organizationId, organizationId)];
  if (activeOnly) conditions.push(eq(clientTags.isActive, true));
  const rows = await tx
    .select({ total: count() })
    .from(clientTags)
    .where(and(...conditions));
  return rows[0]?.total ?? 0;
}

function isTagNameUniqueViolation(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const source = e?.cause ?? e;
  return (
    source?.code === "23505" &&
    source.constraint === "client_tags_organization_name_lower_unique"
  );
}

// Como inSavepoint, para el nombre repetido de una etiqueta (D-2).
async function inTagSavepoint<T>(
  tx: DbTransaction,
  work: (savepoint: DbTransaction) => Promise<T>,
): Promise<T | "name_taken"> {
  try {
    return await tx.transaction(work);
  } catch (error) {
    if (isTagNameUniqueViolation(error)) return "name_taken";
    throw error;
  }
}

export function insertTag(
  tx: DbTransaction,
  organizationId: string,
  values: TagValues,
): Promise<string | "name_taken"> {
  return inTagSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .insert(clientTags)
      .values({ organizationId, ...values })
      .returning({ id: clientTags.id });
    return rows[0]!.id;
  });
}

export function updateTagValues(
  tx: DbTransaction,
  organizationId: string,
  tagId: string,
  values: Partial<TagValues>,
): Promise<void | "name_taken"> {
  return inTagSavepoint(tx, async (savepoint) => {
    const rows = await savepoint
      .update(clientTags)
      .set(values)
      .where(
        and(
          eq(clientTags.organizationId, organizationId),
          eq(clientTags.id, tagId),
        ),
      )
      .returning({ id: clientTags.id });
    assertUpdatedOne(rows, "updateTagValues");
  });
}

export async function updateTagActive(
  tx: DbTransaction,
  organizationId: string,
  tagId: string,
  isActive: boolean,
): Promise<void> {
  const rows = await tx
    .update(clientTags)
    .set({ isActive })
    .where(
      and(
        eq(clientTags.organizationId, organizationId),
        eq(clientTags.id, tagId),
      ),
    )
    .returning({ id: clientTags.id });
  assertUpdatedOne(rows, "updateTagActive");
}

// Lo que un cliente muestra de cada etiqueta: activa o no (D-8).
export type ClientTagRow = {
  id: string;
  name: string;
  color: TagColor;
  isActive: boolean;
};

// Las etiquetas de cada cliente pedido, por nombre. Un cliente sin etiquetas no aparece en el mapa.
export async function findTagsByClient(
  organizationId: string,
  clientIds: string[],
  executor: Executor = getDb(),
): Promise<Map<string, ClientTagRow[]>> {
  const byClient = new Map<string, ClientTagRow[]>();
  if (clientIds.length === 0) return byClient;
  const rows = await executor
    .select({
      clientId: clientTagAssignments.clientId,
      id: clientTags.id,
      name: clientTags.name,
      color: sql<TagColor>`${clientTags.color}`,
      isActive: clientTags.isActive,
    })
    .from(clientTagAssignments)
    .innerJoin(
      clientTags,
      and(
        eq(clientTags.organizationId, clientTagAssignments.organizationId),
        eq(clientTags.id, clientTagAssignments.tagId),
      ),
    )
    .where(
      and(
        eq(clientTagAssignments.organizationId, organizationId),
        inArray(clientTagAssignments.clientId, clientIds),
      ),
    )
    .orderBy(...tagOrder);
  for (const { clientId, ...tag } of rows) {
    const list = byClient.get(clientId);
    if (list) list.push(tag);
    else byClient.set(clientId, [tag]);
  }
  return byClient;
}

// Devuelve true solo si insertó: una etiqueta que el cliente ya tiene no escribe nada (D-6).
export async function insertAssignment(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
  tagId: string,
): Promise<boolean> {
  const rows = await tx
    .insert(clientTagAssignments)
    .values({ organizationId, clientId, tagId })
    .onConflictDoNothing()
    .returning({ tagId: clientTagAssignments.tagId });
  return rows.length > 0;
}

// Devuelve true solo si borró: quitar una etiqueta que el cliente no tiene no escribe nada (D-6).
export async function deleteAssignment(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
  tagId: string,
): Promise<boolean> {
  const rows = await tx
    .delete(clientTagAssignments)
    .where(
      and(
        eq(clientTagAssignments.organizationId, organizationId),
        eq(clientTagAssignments.clientId, clientId),
        eq(clientTagAssignments.tagId, tagId),
      ),
    )
    .returning({ tagId: clientTagAssignments.tagId });
  return rows.length > 0;
}
