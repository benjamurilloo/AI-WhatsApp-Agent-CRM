import { z } from "zod";
import {
  listEntityAuditLogs,
  recordAudit,
  type AuditLogEntry,
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

// Casos de uso de clientes (brief-5.2): FR-CLI-01, 02, 03 y 05, con auditoría en la misma
// transacción (FR-AUD-01) y el teléfono enmascarado para viewer (FR-CLI-06).

export type ClientActivityFilter = repository.ActivityFilter;

// El teléfono sale de crm ya resuelto para el rol: un viewer nunca recibe el número (D-2).
export type Client = Omit<repository.ClientRow, "phoneE164"> & {
  phone: ClientPhone;
};

function toClient(row: repository.ClientRow, context: AuthContext): Client {
  const { phoneE164, ...rest } = row;
  return { ...rest, phone: phoneForRole(phoneE164, context.role) };
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
  return { ok: true, client: toClient(row, context) };
}

export const CLIENTS_PAGE_SIZE = 25;

export type ClientListFilters = {
  text: string;
  activity: ClientActivityFilter;
  page: number;
};

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
  const total = await repository.countClients(
    context.organizationId,
    search,
    filters.activity,
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
        );
  return {
    ok: true,
    clients: rows.map((row) => toClient(row, context)),
    total,
    page,
    pageCount,
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
  return {
    ok: true,
    clients: unique.flatMap((id) => {
      const row = rows.get(id);
      return row ? [toClient(row, context)] : [];
    }),
  };
}

// Historial de auditoría del cliente (FR-AUD-02, brief-5.2, D-7), como listProductAudit: audit no
// autoriza ni conoce a auth; crm verifica el rol y la organización y compone el autor.

export type ClientAuditEntry = Omit<AuditLogEntry, "actorUserId"> & {
  actor: { id: string; name: string };
};

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
  const actors = new Map(
    (
      await getMemberSummaries(context.organizationId, [
        ...new Set(found.entries.map((entry) => entry.actorUserId)),
      ])
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    entries: found.entries.map(({ actorUserId, ...entry }) => ({
      ...entry,
      actor: { id: actorUserId, name: actors.get(actorUserId) ?? "" },
    })),
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
