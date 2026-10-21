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
import { isProvinceCode, PROVINCE_CODES, type ProvinceCode } from "./provinces";
import * as repository from "./repository";
import {
  CLIENT_FIELD_LIMITS,
  CLIENT_KINDS,
  DOCUMENT_NUMBER_PATTERN,
  INSTAGRAM_PATTERN,
  POSTAL_CODE_PATTERN,
  type ClientKind,
} from "./schema";
import { DEFAULT_TAG_COLOR, isTagColor, type TagColor } from "./tag-colors";

// Casos de uso de clientes (brief-5.2): FR-CLI-01, 02, 03 y 05, con auditoría en la misma
// transacción (FR-AUD-01) y el teléfono enmascarado para viewer (FR-CLI-06). Desde la 16.1, sus
// etiquetas: FR-CLI-08 a 10. Desde la 17.1, los campos ampliados: FR-CLI-12 a 14.

export type ClientActivityFilter = repository.ActivityFilter;

// Una etiqueta tal como la muestra un cliente: activa o no (brief-16.1, D-8).
export type ClientTag = repository.ClientTagRow;

// Los datos de contacto que un viewer no recibe, como el teléfono completo (brief-17.1, D-8). Desde
// la 29.7, también el DNI y el Instagram (brief-29.7, D-6).
export type ClientContact = {
  email: string | null;
  addressLine: string | null;
  postalCode: string | null;
  documentNumber: string | null;
  instagram: string | null;
};

// El teléfono sale de crm ya resuelto para el rol: un viewer nunca recibe el número (D-2). Desde la
// 17.1, tampoco el email, la calle ni el código postal, y desde la 29.7 el DNI y el Instagram:
// `contact` es null para un viewer.
export type Client = Omit<
  repository.ClientRow,
  | "phoneE164"
  | "email"
  | "addressLine"
  | "postalCode"
  | "documentNumber"
  | "instagram"
> & {
  phone: ClientPhone;
  contact: ClientContact | null;
  tags: ClientTag[];
};

function toClient(
  row: repository.ClientRow,
  context: AuthContext,
  tags: Map<string, ClientTag[]>,
): Client {
  const {
    phoneE164,
    email,
    addressLine,
    postalCode,
    documentNumber,
    instagram,
    ...rest
  } = row;
  return {
    ...rest,
    phone: phoneForRole(phoneE164, context.role),
    contact:
      context.role === "admin"
        ? { email, addressLine, postalCode, documentNumber, instagram }
        : null,
    tags: tags.get(row.id) ?? [],
  };
}

export type ClientField =
  | "displayName"
  | "phone"
  | "notes"
  | "email"
  | "kind"
  | "companyName"
  | "jobTitle"
  | "addressLine"
  | "city"
  | "province"
  | "postalCode"
  | "segment"
  | "documentNumber"
  | "instagram";

// Los campos de la 17.1 son opcionales también en la entrada: omitidos, quedan vacíos.
export type ClientInput = {
  displayName: string;
  phone?: string | null;
  notes?: string | null;
  email?: string | null;
  kind?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  addressLine?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  segment?: string | null;
  // Desde la 29.7 (brief-29.7, D-6).
  documentNumber?: string | null;
  instagram?: string | null;
};

// Texto opcional: se recorta, y vacío es nulo.
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));
}

// Un valor de una lista cerrada, o vacío.
function optionalChoice<T extends string>(
  isChoice: (value: string) => value is T,
) {
  return z
    .string()
    .nullish()
    .transform((value, ctx): T | null => {
      if (value == null || value === "") return null;
      if (!isChoice(value)) {
        ctx.addIssue({ code: "custom", message: "valor fuera de la lista" });
        return z.NEVER;
      }
      return value;
    });
}

const isClientKind = (value: string): value is ClientKind =>
  (CLIENT_KINDS as readonly string[]).includes(value);

// Límites de brief-5.2, D-5. Los textos se recortan antes de validar; el teléfono, según D-1.
// Los campos de la 17.1 siguen D-6: el email en minúsculas, el código postal en mayúsculas.
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
    notes: optionalText(1000),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .nullish()
      .transform((value, ctx) => {
        if (!value) return null;
        if (
          value.length > CLIENT_FIELD_LIMITS.email ||
          !z.email().safeParse(value).success
        ) {
          ctx.addIssue({ code: "custom", message: "email inválido" });
          return z.NEVER;
        }
        return value;
      }),
    kind: optionalChoice(isClientKind),
    companyName: optionalText(CLIENT_FIELD_LIMITS.companyName),
    jobTitle: optionalText(CLIENT_FIELD_LIMITS.jobTitle),
    addressLine: optionalText(CLIENT_FIELD_LIMITS.addressLine),
    city: optionalText(CLIENT_FIELD_LIMITS.city),
    province: optionalChoice(isProvinceCode),
    postalCode: z
      .string()
      .trim()
      .toUpperCase()
      .nullish()
      .transform((value, ctx) => {
        if (!value) return null;
        if (!new RegExp(POSTAL_CODE_PATTERN).test(value)) {
          ctx.addIssue({ code: "custom", message: "código postal inválido" });
          return z.NEVER;
        }
        return value;
      }),
    segment: optionalText(CLIENT_FIELD_LIMITS.segment),
    // El DNI sin puntos ni espacios: «30.123.456» se guarda como 30123456 (brief-29.7, D-6).
    documentNumber: z
      .string()
      .nullish()
      .transform((value, ctx) => {
        const digits = (value ?? "").replace(/[.\s]/g, "");
        if (!digits) return null;
        if (!new RegExp(DOCUMENT_NUMBER_PATTERN).test(digits)) {
          ctx.addIssue({ code: "custom", message: "DNI inválido" });
          return z.NEVER;
        }
        return digits;
      }),
    // El usuario de Instagram, sin la @ si la trae.
    instagram: z
      .string()
      .trim()
      .nullish()
      .transform((value, ctx) => {
        const user = (value ?? "").replace(/^@/, "");
        if (!user) return null;
        if (!new RegExp(INSTAGRAM_PATTERN).test(user)) {
          ctx.addIssue({ code: "custom", message: "Instagram inválido" });
          return z.NEVER;
        }
        return user;
      }),
  })
  .transform(({ displayName, phone, ...rest }): repository.ClientValues => ({
    displayName,
    phoneE164: phone,
    ...rest,
  }));

const CLIENT_FIELDS: ClientField[] = [
  "displayName",
  "phone",
  "notes",
  "email",
  "kind",
  "companyName",
  "jobTitle",
  "addressLine",
  "city",
  "province",
  "postalCode",
  "segment",
  "documentNumber",
  "instagram",
];
const VALUE_FIELDS: (keyof repository.ClientValues)[] = [
  "displayName",
  "phoneE164",
  "notes",
  "email",
  "kind",
  "companyName",
  "jobTitle",
  "addressLine",
  "city",
  "province",
  "postalCode",
  "segment",
  "documentNumber",
  "instagram",
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
  // Tipo, provincia y segmento (FR-CLI-14, brief-17.1, D-9). Un tipo o una provincia fuera de la
  // lista se ignoran; el segmento filtra por el valor exacto, como la marca de un producto.
  kind?: ClientKind | null;
  province?: string | null;
  segment?: string | null;
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

async function resolveAttributeFilters(
  context: AuthContext,
  filters: Omit<ClientListFilters, "page">,
): Promise<repository.ClientAttributeFilters> {
  const segment = filters.segment?.trim();
  return {
    tagId: await resolveTagFilter(context, filters.tagId),
    kind: filters.kind && isClientKind(filters.kind) ? filters.kind : null,
    province:
      filters.province && isProvinceCode(filters.province)
        ? filters.province
        : null,
    segment:
      segment && segment.length <= CLIENT_FIELD_LIMITS.segment ? segment : null,
  };
}

// Los valores con que se filtra la lista y se sugiere el segmento (brief-17.1, D-5 y D-9): los que
// ya tiene algún cliente de la organización. Admin y viewer, que ven el segmento y la provincia.
export type ClientFilterOptions = {
  segments: string[];
  provinces: ProvinceCode[];
  kinds: ClientKind[];
};

export async function listClientFilterOptions(
  context: AuthContext,
): Promise<({ ok: true } & ClientFilterOptions) | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const [segments, provinces, kinds] = await Promise.all([
    repository.findDistinctClientValues(context.organizationId, "segment"),
    repository.findDistinctClientValues(context.organizationId, "province"),
    repository.findDistinctClientValues(context.organizationId, "kind"),
  ]);
  return {
    ok: true,
    segments,
    // En el orden de la lista, el mismo del formulario, y no en el de los códigos.
    provinces: PROVINCE_CODES.filter((code) => provinces.includes(code)),
    kinds: CLIENT_KINDS.filter((kind) => kinds.includes(kind)),
  };
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
  const attributes = await resolveAttributeFilters(context, filters);
  const total = await repository.countClients(
    context.organizationId,
    search,
    filters.activity,
    attributes,
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
          attributes,
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
    await resolveAttributeFilters(context, filters),
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

type TagChangeActor = { actorUserId: string } | { actorCredentialId: string };

type TagChangeOutcome =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "tag_not_found" | "client_tag_limit" };

// Las reglas de poner y quitar, en un solo lugar para la ficha y para la ingestión (brief-16.2,
// invariante 2). El cliente ya llega bloqueado por quien llama: dos cambios simultáneos del mismo
// cliente no pasan juntos el límite de D-11. La etiqueta se lee con FOR SHARE al poner, para
// esperar a una desactivación en curso (revisión independiente de la 16.1.1, hallazgo 4). El diff
// lleva el nombre que la etiqueta tenía en ese momento (D-7).
async function applyClientTagChange(
  tx: DbTransaction,
  input: {
    organizationId: string;
    actor: TagChangeActor;
    clientId: string;
    tagId: string;
    assign: boolean;
  },
): Promise<TagChangeOutcome> {
  const { organizationId, clientId, assign } = input;
  const tag = await repository.findTag(organizationId, input.tagId, tx, {
    lock: assign ? "share" : undefined,
  });
  if (!tag) return { ok: false, reason: "tag_not_found" };

  let changed: boolean;
  if (assign) {
    const current =
      (await repository.findTagsByClient(organizationId, [clientId], tx)).get(
        clientId,
      ) ?? [];
    if (current.some((assigned) => assigned.id === tag.id)) {
      return { ok: true, changed: false };
    }
    // Una inactiva no se pone (D-8); la que un cliente ya tiene sí se puede quitar.
    if (!tag.isActive) return { ok: false, reason: "tag_not_found" };
    if (current.length >= MAX_TAGS_PER_CLIENT) {
      return { ok: false, reason: "client_tag_limit" };
    }
    changed = await repository.insertAssignment(
      tx,
      organizationId,
      clientId,
      tag.id,
    );
  } else {
    changed = await repository.deleteAssignment(
      tx,
      organizationId,
      clientId,
      tag.id,
    );
  }
  if (!changed) return { ok: true, changed: false };

  await recordAudit(tx, {
    organizationId,
    ...input.actor,
    entityType: "client",
    entityId: clientId,
    action: "tag_change",
    diff: assign
      ? { before: { tag: null }, after: { tag: tag.name } }
      : { before: { tag: tag.name }, after: { tag: null } },
  });
  return { ok: true, changed: true };
}

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
      const outcome = await applyClientTagChange(tx, {
        organizationId: context.organizationId,
        actor: { actorUserId: context.userId },
        clientId: client.id,
        tagId,
        assign,
      });
      if (outcome.ok) return outcome;
      return outcome.reason === "client_tag_limit"
        ? limitFailure("client")
        : failure("NOT_FOUND");
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

// El cliente de un pedido nuevo, para orders (brief-19.2, D-3; ADR 0020, punto 3): se bloquea en
// modo compartido antes que los productos, en la transacción del alta. orders ya autorizó.
export async function lockClientForOrder(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
): Promise<"active" | "inactive" | "not_found"> {
  if (!clientIdSchema.safeParse(clientId).success) return "not_found";
  const client = await repository.lockClientShared(
    tx,
    organizationId,
    clientId,
  );
  if (!client) return "not_found";
  return client.isActive ? "active" : "inactive";
}

// El cliente del pedido que deja el agente (brief-19.4, D-7): como lockClientForOrder, pero por el
// teléfono del evento, ya en E.164 canónico. orders recibe la transacción de ingestion.
export async function lockClientForOrderByPhone(
  tx: DbTransaction,
  organizationId: string,
  phoneE164: string,
): Promise<
  { status: "active" | "inactive"; clientId: string } | { status: "not_found" }
> {
  const client = await repository.lockClientSharedByPhoneE164(
    tx,
    organizationId,
    phoneE164,
  );
  if (!client) return { status: "not_found" };
  return {
    status: client.isActive ? "active" : "inactive",
    clientId: client.id,
  };
}

// El cliente de una devolución desde su cuenta, para cash (brief-21.5, D-11 precisado): en modo
// exclusivo, para que una venta emitida en paralelo, que lo toma en modo compartido, espere o sea
// esperada, y lo que está a favor no se lea antes de que la venta lo absorba. cash ya autorizó.
export async function lockClientForRefund(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
): Promise<"found" | "not_found"> {
  if (!clientIdSchema.safeParse(clientId).success) return "not_found";
  const client = await repository.lockClientExclusive(
    tx,
    organizationId,
    clientId,
  );
  return client ? "found" : "not_found";
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

// Poner o quitar una etiqueta desde la ingestión (brief-16.2, D-1 a D-6). La transacción y el ledger
// son de ingestion, que la llama; el cliente se busca por teléfono y se bloquea, como en
// lockClientByPhone, y las reglas son las de la ficha (applyClientTagChange). El actor es la
// credencial (invariante 4). Un cliente desactivado se puede etiquetar, como en la ficha (D-6).
export type IngestedTagRule =
  "client_not_found" | "tag_not_found" | "client_tag_limit";

export type IngestedTagChangeResult =
  { ok: true; changed: boolean } | { ok: false; rule: IngestedTagRule };

export async function changeClientTagByPhone(
  tx: DbTransaction,
  input: {
    organizationId: string;
    credentialId: string;
    // Ya validados por el contrato: E.164 canónico y uuid.
    phoneE164: string;
    tagId: string;
    assign: boolean;
  },
): Promise<IngestedTagChangeResult> {
  const clientId = await repository.lockClientIdByPhoneE164(
    tx,
    input.organizationId,
    input.phoneE164,
  );
  if (!clientId) return { ok: false, rule: "client_not_found" };
  const outcome = await applyClientTagChange(tx, {
    organizationId: input.organizationId,
    actor: { actorCredentialId: input.credentialId },
    clientId,
    tagId: input.tagId,
    assign: input.assign,
  });
  return outcome.ok ? outcome : { ok: false, rule: outcome.reason };
}

// El catálogo activo para la API de lectura (brief-16.2, D-7): sin usuario, por la organización de
// la credencial. Solo id y nombre, por nombre; nunca datos de un cliente (invariante 6).
export async function listActiveTagsForService(
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const tags = await repository.findActiveTags(organizationId);
  return tags.map((tag) => ({ id: tag.id, name: tag.name }));
}
