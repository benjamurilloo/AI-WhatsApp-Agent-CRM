import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import {
  authorize,
  getMemberSummaries,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  normalizePhone,
  parsePhoneInput,
  phoneForRole,
  type ClientPhone,
} from "./phone";
import * as repository from "./repository";
import { DEFAULT_TAG_COLOR, isTagColor, type TagColor } from "./tag-colors";

// Casos de uso de clientes (brief-5.2): FR-CLI-01, 02, 03 y 05, con auditoría en la misma
// transacción (FR-AUD-01) y el teléfono enmascarado para viewer (FR-CLI-06). Desde la 16.1, sus
// etiquetas: FR-CLI-08 a 10.

export type ClientActivityFilter = repository.ActivityFilter;

// Una etiqueta tal como la muestra un cliente: activa o no (brief-16.1, D-8).
export type ClientTag = repository.ClientTagRow;

// El teléfono sale de crm ya resuelto para el rol: un viewer nunca recibe el número (D-2).
export type Client = Omit<repository.ClientRow, "phoneE164"> & {
  phone: ClientPhone;
  tags: ClientTag[];
};

function toClient(
  row: repository.ClientRow,
  context: AuthContext,
  tags: Map<string, ClientTag[]>,
): Client {
  const { phoneE164, ...rest } = row;
  return {
    ...rest,
    phone: phoneForRole(phoneE164, context.role),
    tags: tags.get(row.id) ?? [],
  };
}

export type ClientField = "displayName" | "phone" | "notes";

export type ClientInput = {
  displayName: string;
  phone?: string | null;
  notes?: string | null;
};

// Límites de brief-5.2, D-5. Los textos se recortan antes de validar; el teléfono, según D-1.
const clientInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    phone: z
      .string()
      .nullish()
      .transform((value, ctx) => {
        const parsed = parsePhoneInput(value);
        if (!parsed.ok) {
          ctx.addIssue({ code: "custom", message: "teléfono inválido" });
          return z.NEVER;
        }
        return parsed.phone;
      }),
    notes: z
      .string()
      .trim()
      .max(1000)
      .nullish()
      .transform((value) => (value ? value : null)),
  })
  .transform(({ displayName, phone, notes }): repository.ClientValues => ({
    displayName,
    phoneE164: phone,
    notes,
  }));

const CLIENT_FIELDS: ClientField[] = ["displayName", "phone", "notes"];
const VALUE_FIELDS: (keyof repository.ClientValues)[] = [
  "displayName",
  "phoneE164",
  "notes",
];

export function validateClientInput(
  input: ClientInput,
):
  | { ok: true; values: repository.ClientValues }
  | Failure<"VALIDATION_ERROR", { fields: ClientField[] }> {
  const parsed = clientInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fields = new Set<ClientField>();
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (CLIENT_FIELDS.includes(field as ClientField)) {
      fields.add(field as ClientField);
    }
  }
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: CLIENT_FIELDS.filter((field) => fields.has(field)),
  };
}

const clientIdSchema = z.uuid();
const tagIdSchema = z.uuid();

// Lecturas: admin y viewer. Un cliente de otra organización da NOT_FOUND (brief-3.4, D-3).

export async function getClient(
  context: AuthContext,
  clientId: string,
): Promise<
  | { ok: true; client: Client }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!clientIdSchema.safeParse(clientId).success) {
    return failure("VALIDATION_ERROR");
  }
  const row = await repository.findClient(context.organizationId, clientId);
  if (!row) return failure("NOT_FOUND");
  const tags = await repository.findTagsByClient(context.organizationId, [
    row.id,
  ]);
  return { ok: true, client: toClient(row, context, tags) };
}

export const CLIENTS_PAGE_SIZE = 25;

export type ClientListFilters = {
  text: string;
  activity: ClientActivityFilter;
  page: number;
  // Solo los clientes con esta etiqueta (FR-CLI-10). Un id inválido, ajeno o de una etiqueta
  // inactiva se ignora, como los demás filtros inválidos (brief-16.1, D-8 y D-9).
  tagId?: string | null;
};

// El id de etiqueta del filtro, si es de una etiqueta activa de la organización; si no, null.
async function resolveTagFilter(
  context: AuthContext,
  tagId: string | null | undefined,
): Promise<string | null> {
  if (!tagId || !tagIdSchema.safeParse(tagId).success) return null;
  const tag = await repository.findTag(context.organizationId, tagId);
  return tag?.isActive ? tag.id : null;
}

export type ClientPage = {
  clients: Client[];
  total: number;
  page: number;
  pageCount: number;
};

// Un texto que normaliza a E.164 busca ese teléfono exacto; si no, prefijo de nombre (D-3).
// La búsqueda por teléfono completo funciona igual para viewer (FR-CLI-06).
export function interpretSearch(text: string): repository.ClientSearch {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "all" };
  const e164 = normalizePhone(trimmed);
  if (e164 !== null) return { kind: "phone", e164 };
  return { kind: "name", prefix: trimmed };
}

// Una página fuera de rango se lleva a la última (brief-4.2).
export function clientPageBounds(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  return { page, pageCount, offset: (page - 1) * CLIENTS_PAGE_SIZE };
}

// La lista sale entera de clients: se filtra, ordena y pagina en SQL (hallazgo 9).
export async function searchClients(
  context: AuthContext,
  filters: ClientListFilters,
): Promise<({ ok: true } & ClientPage) | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const search = interpretSearch(filters.text);
  const tagId = await resolveTagFilter(context, filters.tagId);
  const total = await repository.countClients(
    context.organizationId,
    search,
    filters.activity,
    tagId,
  );
  const { page, pageCount, offset } = clientPageBounds(total, filters.page);
  const rows =
    total === 0
      ? []
      : await repository.findClients(
          context.organizationId,
          search,
          filters.activity,
          CLIENTS_PAGE_SIZE,
          offset,
          tagId,
        );
  const tags = await repository.findTagsByClient(
    context.organizationId,
    rows.map((row) => row.id),
  );
  return {
    ok: true,
    clients: rows.map((row) => toClient(row, context, tags)),
    total,
    page,
    pageCount,
  };
}

// Sugerencias del buscador de clientes (brief-15.2, D-6): prefijo de nombre, sin tildes ni
// mayúsculas, como la búsqueda del listado; solo activos y en orden de nombre. Devuelve el id y el
// nombre, nunca el teléfono, sea cual sea el rol. Un texto que parece teléfono no sugiere nada:
// esa búsqueda es exacta.
export const CLIENT_SUGGEST_LIMIT = 8;
export const CLIENT_SUGGEST_MIN_LENGTH = 2;

export type ClientSuggestion = { id: string; name: string };

export function looksLikePhone(text: string): boolean {
  return /^[\d\s+().-]+$/.test(text.trim());
}

export async function suggestClients(
  context: AuthContext,
  text: string,
): Promise<{ ok: true; clients: ClientSuggestion[] } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const trimmed = text.trim();
  const search = interpretSearch(trimmed);
  if (
    trimmed.length < CLIENT_SUGGEST_MIN_LENGTH ||
    looksLikePhone(trimmed) ||
    search.kind !== "name"
  ) {
    return { ok: true, clients: [] };
  }
  const rows = await repository.findClients(
    context.organizationId,
    search,
    "active",
    CLIENT_SUGGEST_LIMIT,
    0,
  );
  return {
    ok: true,
    clients: rows.map((row) => ({ id: row.id, name: row.displayName })),
  };
}

// Para la lista por última interacción, que compone conversations (brief-6.3, D-1): todos los
// ids que cumplen los filtros, en orden de nombre, sin ningún dato del cliente.
export async function listClientOrderKeys(
  context: AuthContext,
  filters: Omit<ClientListFilters, "page">,
): Promise<{ ok: true; clientIds: string[] } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const clientIds = await repository.findClientIdsByName(
    context.organizationId,
    interpretSearch(filters.text),
    filters.activity,
    await resolveTagFilter(context, filters.tagId),
  );
  return { ok: true, clientIds };
}

// Clientes de la organización con esos ids, en el orden pedido y con el teléfono según el rol.
// Un id ajeno o inexistente no aparece.
export async function getClientsByIds(
  context: AuthContext,
  clientIds: string[],
): Promise<
  { ok: true; clients: Client[] } | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const unique = [...new Set(clientIds)];
  if (!unique.every((id) => clientIdSchema.safeParse(id).success)) {
    return failure("VALIDATION_ERROR");
  }
  const rows = new Map(
    (await repository.findClientsByIds(context.organizationId, unique)).map(
      (row) => [row.id, row],
    ),
  );
  const tags = await repository.findTagsByClient(context.organizationId, [
    ...rows.keys(),
  ]);
  return {
    ok: true,
    clients: unique.flatMap((id) => {
      const row = rows.get(id);
      return row ? [toClient(row, context, tags)] : [];
    }),
  };
}

// Historial de auditoría del cliente (FR-AUD-02, brief-5.2, D-7), como listProductAudit: audit no
// autoriza ni conoce a auth; crm verifica el rol y la organización y compone el autor.

export type ClientAuditEntry = NamedAuditLogEntry;

export type ClientAuditResult =
  | {
      ok: true;
      entries: ClientAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function listClientAudit(
  context: AuthContext,
  clientId: string,
  page: number,
): Promise<ClientAuditResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!clientIdSchema.safeParse(clientId).success) {
    return failure("VALIDATION_ERROR");
  }
  const client = await repository.findClient(context.organizationId, clientId);
  if (!client) return failure("NOT_FOUND");

  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["client"],
    entityId: client.id,
    page,
  });
  const names = new Map(
    (
      await getMemberSummaries(
        context.organizationId,
        auditUserIds(found.entries),
      )
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    entries: nameAuditActors(found.entries, names),
    total: found.total,
    page: found.page,
    pageCount: found.pageCount,
  };
}

// Escrituras: solo admin. El diff guarda el teléfono y las notas completos (D-6); solo admin lo lee.

export type CreateClientResult =
  | { ok: true; clientId: string }
  | Failure<"FORBIDDEN" | "CONFLICT">
  | Failure<"VALIDATION_ERROR", { fields: ClientField[] }>;

export async function createClient(
  context: AuthContext,
  input: ClientInput,
): Promise<CreateClientResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validateClientInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return repository.withTransaction(async (tx): Promise<CreateClientResult> => {
    const clientId = await repository.insertClient(
      tx,
      context.organizationId,
      values,
    );
    // También si el número es de un cliente inactivo: se reactiva el existente (brief-5.1, D-3).
    if (clientId === "phone_taken") return failure("CONFLICT");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "client",
      entityId: clientId,
      action: "create",
      diff: { before: null, after: { ...values, isActive: true } },
    });
    return { ok: true, clientId };
  });
}

// changed en false: el cliente ya estaba así; no se escribe ni se audita.
export type UpdateClientResult =
  | { ok: true; changed: boolean }
  // VALIDATION_ERROR sin fields: id inválido (brief-4.4, D-6). Con fields: el formulario.
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: ClientField[] }>;

export async function updateClient(
  context: AuthContext,
  clientId: string,
  input: ClientInput,
): Promise<UpdateClientResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!clientIdSchema.safeParse(clientId).success) {
    return failure("VALIDATION_ERROR");
  }
  const validated = validateClientInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return repository.withTransaction(async (tx): Promise<UpdateClientResult> => {
    const current = await repository.findClient(
      context.organizationId,
      clientId,
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");

    const changedFields = VALUE_FIELDS.filter(
      (field) => current[field] !== values[field],
    );
    if (changedFields.length === 0) return { ok: true, changed: false };

    const before = Object.fromEntries(
      changedFields.map((field) => [field, current[field]]),
    );
    const after = Object.fromEntries(
      changedFields.map((field) => [field, values[field]]),
    );
    const updated = await repository.updateClientValues(
      tx,
      context.organizationId,
      clientId,
      after,
    );
    if (updated === "phone_taken") return failure("CONFLICT");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "client",
      entityId: clientId,
      action: "update",
      diff: { before, after },
    });
    return { ok: true, changed: true };
  });
}

export type ClientActiveResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

async function setClientActive(
  context: AuthContext,
  clientId: string,
  isActive: boolean,
): Promise<ClientActiveResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!clientIdSchema.safeParse(clientId).success) {
    return failure("VALIDATION_ERROR");
  }

  return repository.withTransaction(async (tx): Promise<ClientActiveResult> => {
    const current = await repository.findClient(
      context.organizationId,
      clientId,
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");
    if (current.isActive === isActive) return { ok: true, changed: false };

    // Reactivar no puede chocar: el número de un inactivo no lo toma nadie (hallazgo 10).
    await repository.updateClientActive(
      tx,
      context.organizationId,
      clientId,
      isActive,
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "client",
      entityId: clientId,
      action: isActive ? "reactivate" : "deactivate",
      diff: {
        before: { isActive: current.isActive },
        after: { isActive },
      },
    });
    return { ok: true, changed: true };
  });
}

export function deactivateClient(
  context: AuthContext,
  clientId: string,
): Promise<ClientActiveResult> {
  return setClientActive(context, clientId, false);
}

export function reactivateClient(
  context: AuthContext,
  clientId: string,
): Promise<ClientActiveResult> {
  return setClientActive(context, clientId, true);
}

// Etiquetas de clientes (brief-16.1). El catálogo (FR-CLI-08) y las asignaciones (FR-CLI-09) son
// escrituras de admin (D-5), auditadas en la misma transacción (D-7). Leer el catálogo y las
// etiquetas de cada cliente es para cualquier rol (FR-CLI-10).

// Límites de D-11: mantienen usables el selector, la fila de la lista y el filtro.
export const MAX_ACTIVE_TAGS = 50;
export const MAX_TAGS_PER_CLIENT = 10;

// Las sugeridas de D-3, en el orden en que se ofrecen.
export const SUGGESTED_TAGS: readonly { name: string; color: TagColor }[] = [
  { name: "Interesado", color: "blue" },
  { name: "Quiere señar", color: "green" },
  { name: "Reclamo", color: "red" },
  { name: "No interesado", color: "gray" },
];

export type TagField = "name" | "color";

export type TagInput = { name: string; color?: string | null };

export type Tag = repository.TagRow;
export type TagWithClientCount = Tag & { activeClients: number };

const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  // Sin color elegido, gris (D-4). Un valor fuera de la paleta es un error del campo.
  color: z
    .string()
    .nullish()
    .transform((value) => value || DEFAULT_TAG_COLOR)
    .refine(isTagColor),
});

const TAG_FIELDS: TagField[] = ["name", "color"];

export function validateTagInput(
  input: TagInput,
):
  | { ok: true; values: repository.TagValues }
  | Failure<"VALIDATION_ERROR", { fields: TagField[] }> {
  const parsed = tagInputSchema.safeParse(input);
  if (parsed.success) {
    return {
      ok: true,
      values: { name: parsed.data.name, color: parsed.data.color as TagColor },
    };
  }
  const fields = new Set<TagField>();
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (TAG_FIELDS.includes(field as TagField)) fields.add(field as TagField);
  }
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: TAG_FIELDS.filter((field) => fields.has(field)),
  };
}

// El límite alcanzado, con qué límite fue (D-11).
type LimitFailure = Failure<
  "VALIDATION_ERROR",
  { limit: "organization" | "client" }
>;

function limitFailure(limit: "organization" | "client"): LimitFailure {
  return { ok: false, code: "VALIDATION_ERROR", limit };
}

export async function listClientTags(
  context: AuthContext,
): Promise<{ ok: true; tags: TagWithClientCount[] } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  return {
    ok: true,
    tags: await repository.findTagsWithClientCounts(context.organizationId),
  };
}

// Las que se ofrecen para asignar y para filtrar: solo activas (D-8).
export async function listActiveClientTags(
  context: AuthContext,
): Promise<{ ok: true; tags: Tag[] } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  return {
    ok: true,
    tags: await repository.findActiveTags(context.organizationId),
  };
}

export type CreateTagResult =
  | { ok: true; tagId: string }
  | Failure<"FORBIDDEN" | "CONFLICT">
  | Failure<"VALIDATION_ERROR", { fields: TagField[] }>
  | LimitFailure;

export async function createClientTag(
  context: AuthContext,
  input: TagInput,
): Promise<CreateTagResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validateTagInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return repository.withTransaction(async (tx): Promise<CreateTagResult> => {
    await repository.lockTagCatalog(tx, context.organizationId);
    const active = await repository.countTags(tx, context.organizationId, {
      activeOnly: true,
    });
    if (active >= MAX_ACTIVE_TAGS) return limitFailure("organization");
    const tagId = await repository.insertTag(
      tx,
      context.organizationId,
      values,
    );
    if (tagId === "name_taken") return failure("CONFLICT");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "client_tag",
      entityId: tagId,
      action: "create",
      diff: { before: null, after: { ...values, isActive: true } },
    });
    return { ok: true, tagId };
  });
}

// «Crear las sugeridas» (D-3): solo con el catálogo vacío, contando también las inactivas, y las
// cuatro en una transacción. Con alguna etiqueta ya creada, CONFLICT y no escribe nada.
export async function createSuggestedClientTags(
  context: AuthContext,
): Promise<{ ok: true; created: number } | Failure<"FORBIDDEN" | "CONFLICT">> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;

  return repository.withTransaction(async (tx) => {
    await repository.lockTagCatalog(tx, context.organizationId);
    const existing = await repository.countTags(tx, context.organizationId, {
      activeOnly: false,
    });
    if (existing > 0) return failure("CONFLICT");
    for (const values of SUGGESTED_TAGS) {
      const tagId = await repository.insertTag(
        tx,
        context.organizationId,
        values,
      );
      // Con el catálogo vacío y bloqueado, un nombre repetido es un defecto de programación.
      if (tagId === "name_taken") {
        throw new Error("nombre repetido en las etiquetas sugeridas");
      }
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "client_tag",
        entityId: tagId,
        action: "create",
        diff: { before: null, after: { ...values, isActive: true } },
      });
    }
    return { ok: true as const, created: SUGGESTED_TAGS.length };
  });
}

export type UpdateTagResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: TagField[] }>;

export async function updateClientTag(
  context: AuthContext,
  tagId: string,
  input: TagInput,
): Promise<UpdateTagResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!tagIdSchema.safeParse(tagId).success) {
    return failure("VALIDATION_ERROR");
  }
  const validated = validateTagInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return repository.withTransaction(async (tx): Promise<UpdateTagResult> => {
    const current = await repository.findTag(
      context.organizationId,
      tagId,
      tx,
      { lock: "update" },
    );
    if (!current) return failure("NOT_FOUND");

    const changedFields = TAG_FIELDS.filter(
      (field) => current[field] !== values[field],
    );
    if (changedFields.length === 0) return { ok: true, changed: false };

    const before = Object.fromEntries(
      changedFields.map((field) => [field, current[field]]),
    );
    const after = Object.fromEntries(
      changedFields.map((field) => [field, values[field]]),
    );
    const updated = await repository.updateTagValues(
      tx,
      context.organizationId,
      current.id,
      after,
    );
    if (updated === "name_taken") return failure("CONFLICT");
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "client_tag",
      entityId: current.id,
      action: "update",
      diff: { before, after },
    });
    return { ok: true, changed: true };
  });
}

export type TagActiveResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | LimitFailure;

// Desactivar no toca a los clientes que ya la tienen: la conservan, como inactiva (D-8).
async function setTagActive(
  context: AuthContext,
  tagId: string,
  isActive: boolean,
): Promise<TagActiveResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!tagIdSchema.safeParse(tagId).success) {
    return failure("VALIDATION_ERROR");
  }

  return repository.withTransaction(async (tx): Promise<TagActiveResult> => {
    // Reactivar suma una activa: se cuenta con el catálogo bloqueado, como el alta (D-11).
    await repository.lockTagCatalog(tx, context.organizationId);
    const current = await repository.findTag(
      context.organizationId,
      tagId,
      tx,
      { lock: "update" },
    );
    if (!current) return failure("NOT_FOUND");
    if (current.isActive === isActive) return { ok: true, changed: false };
    if (isActive) {
      const active = await repository.countTags(tx, context.organizationId, {
        activeOnly: true,
      });
      if (active >= MAX_ACTIVE_TAGS) return limitFailure("organization");
    }

    await repository.updateTagActive(
      tx,
      context.organizationId,
      current.id,
      isActive,
    );
    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      entityType: "client_tag",
      entityId: current.id,
      action: isActive ? "reactivate" : "deactivate",
      diff: { before: { isActive: current.isActive }, after: { isActive } },
    });
    return { ok: true, changed: true };
  });
}

export function deactivateClientTag(
  context: AuthContext,
  tagId: string,
): Promise<TagActiveResult> {
  return setTagActive(context, tagId, false);
}

export function reactivateClientTag(
  context: AuthContext,
  tagId: string,
): Promise<TagActiveResult> {
  return setTagActive(context, tagId, true);
}

// changed en false: el cliente ya tenía (o ya no tenía) la etiqueta; no se escribe ni se audita.
export type ClientTagChangeResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | LimitFailure;

// Poner y quitar bloquean la fila del cliente: dos cambios simultáneos del mismo cliente no pasan
// juntos el límite de D-11. El diff lleva el nombre que la etiqueta tenía en ese momento (D-7).
async function changeClientTag(
  context: AuthContext,
  clientId: string,
  tagId: string,
  assign: boolean,
): Promise<ClientTagChangeResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (
    !clientIdSchema.safeParse(clientId).success ||
    !tagIdSchema.safeParse(tagId).success
  ) {
    return failure("VALIDATION_ERROR");
  }

  return repository.withTransaction(
    async (tx): Promise<ClientTagChangeResult> => {
      const client = await repository.findClient(
        context.organizationId,
        clientId,
        tx,
        { forUpdate: true },
      );
      if (!client) return failure("NOT_FOUND");
      const tag = await repository.findTag(context.organizationId, tagId, tx, {
        lock: assign ? "share" : undefined,
      });
      if (!tag) return failure("NOT_FOUND");

      let changed: boolean;
      if (assign) {
        const current =
          (
            await repository.findTagsByClient(
              context.organizationId,
              [client.id],
              tx,
            )
          ).get(client.id) ?? [];
        if (current.some((assigned) => assigned.id === tag.id)) {
          return { ok: true, changed: false };
        }
        // Una inactiva no se pone (D-8); la que un cliente ya tiene sí se puede quitar.
        if (!tag.isActive) return failure("NOT_FOUND");
        if (current.length >= MAX_TAGS_PER_CLIENT) {
          return limitFailure("client");
        }
        changed = await repository.insertAssignment(
          tx,
          context.organizationId,
          client.id,
          tag.id,
        );
      } else {
        changed = await repository.deleteAssignment(
          tx,
          context.organizationId,
          client.id,
          tag.id,
        );
      }
      if (!changed) return { ok: true, changed: false };

      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "client",
        entityId: client.id,
        action: "tag_change",
        diff: assign
          ? { before: { tag: null }, after: { tag: tag.name } }
          : { before: { tag: tag.name }, after: { tag: null } },
      });
      return { ok: true, changed: true };
    },
  );
}

export function assignClientTag(
  context: AuthContext,
  clientId: string,
  tagId: string,
): Promise<ClientTagChangeResult> {
  return changeClientTag(context, clientId, tagId, true);
}

export function removeClientTag(
  context: AuthContext,
  clientId: string,
  tagId: string,
): Promise<ClientTagChangeResult> {
  return changeClientTag(context, clientId, tagId, false);
}

// Resolución del cliente por teléfono para un servicio (brief-12.1, D-5 a D-10). La transacción y
// el ledger de idempotencia son de ingestion, que la llama; crm crea y audita con la credencial
// como actor (FR-AUD-03). Nunca renombra, reactiva ni crea otro: un cliente existente, activo o no,
// se devuelve tal cual y sin escribir nada.

export const UNNAMED_CLIENT_LABEL = "Sin nombre";

export type ResolvedClient = repository.ResolvedClientRow;

export async function resolveClientByPhone(
  tx: DbTransaction,
  input: {
    organizationId: string;
    credentialId: string;
    phoneE164: string;
    // Ya validado por el contrato. null: se crea como «Sin nombre», nunca con el teléfono (D-5).
    displayName: string | null;
  },
): Promise<ResolvedClient> {
  const values = {
    displayName: input.displayName ?? UNNAMED_CLIENT_LABEL,
    phoneE164: input.phoneE164,
  };
  const created = await repository.insertClientIfPhoneAbsent(
    tx,
    input.organizationId,
    values,
  );
  if (created) {
    await recordAudit(tx, {
      organizationId: input.organizationId,
      actorCredentialId: input.credentialId,
      entityType: "client",
      entityId: created.id,
      action: "create",
      diff: {
        before: null,
        after: { ...values, notes: null, isActive: true },
      },
    });
    return created;
  }
  const existing = await repository.findResolvedClientByPhone(
    tx,
    input.organizationId,
    input.phoneE164,
  );
  if (!existing) {
    throw new Error("cliente ausente después del conflicto por teléfono");
  }
  return existing;
}

// Lectura sin escritura para el reenvío de una resolución ya procesada (D-9): si el teléfono ya no
// pertenece a ningún cliente, null. Un reenvío nunca crea.
export async function findResolvedClientByPhone(
  tx: DbTransaction,
  organizationId: string,
  phoneE164: string,
): Promise<ResolvedClient | null> {
  return (
    (await repository.findResolvedClientByPhone(
      tx,
      organizationId,
      phoneE164,
    )) ?? null
  );
}

// Para la ingestión, que no tiene usuario (brief-6.5.2): exige una transacción, así que una
// pantalla no puede usarla, y devuelve solo el id, sin datos personales. El teléfono ya viene en
// E.164 canónico (contrato v1); cualquier otra forma no coincide con ningún cliente.
export function findClientIdByPhone(
  tx: DbTransaction,
  organizationId: string,
  phoneE164: string,
): Promise<string | null> {
  return repository.findClientIdByPhoneE164(tx, organizationId, phoneE164);
}

// Como findClientIdByPhone, pero bloquea al cliente hasta el final de la transacción recibida.
// conversations la usa para que dos mensajes simultáneos del mismo cliente no abran dos
// conversaciones (brief-12.2, D-8), como lockProductForStockChange en catalog.
export function lockClientByPhone(
  tx: DbTransaction,
  organizationId: string,
  phoneE164: string,
): Promise<string | null> {
  return repository.lockClientIdByPhoneE164(tx, organizationId, phoneE164);
}
