import { z } from "zod";
import {
  listEntityAuditLogs,
  recordAudit,
  type AuditLogEntry,
} from "@/modules/audit";
import {
  authorize,
  getMemberSummaries,
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
import { isCalendarDate } from "@/shared/calendar";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";

// Casos de uso de la información del negocio (brief-11.2): FR-INFO-01 (escrituras de admin,
// auditadas en la misma transacción), FR-INFO-02 (lista y búsqueda para cualquier rol) y
// FR-INFO-03 (vigencia en la zona de la organización).

export type KnowledgeEntry = repository.KnowledgeRow;
export type KnowledgeStatus = repository.KnowledgeStatus;
export type KnowledgeStatusFilter = repository.StatusFilter;
export const KNOWLEDGE_STATUSES: KnowledgeStatus[] = [
  "current",
  "scheduled",
  "expired",
  "inactive",
];

export type KnowledgeField = keyof repository.KnowledgeValues;

export type KnowledgeInput = {
  title: string;
  category: string;
  content: string;
  // Vacío o solo espacios: sin límite de ese lado (D-3).
  validFrom: string | null;
  validUntil: string | null;
};

const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || isCalendarDate(value));

// Límites de D-2. Los textos se recortan antes de validar; el contenido conserva sus saltos de
// línea interiores, normalizados a \n: un textarea los envía como CRLF (HTML, envío de
// formularios), y sin normalizar cada salto contaría doble en el límite y le llegaría al agente
// con un retorno de carro.
const knowledgeInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(100),
    content: z
      .string()
      .transform((value) => value.replace(/\r\n?/g, "\n"))
      .pipe(z.string().trim().min(1).max(4000)),
    validFrom: optionalDate,
    validUntil: optionalDate,
  })
  .superRefine((values, ctx) => {
    // Fechas YYYY-MM-DD: el orden de texto es el de calendario.
    if (
      values.validFrom !== null &&
      values.validUntil !== null &&
      values.validUntil < values.validFrom
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "termina antes de empezar",
      });
    }
  });

const KNOWLEDGE_FIELDS: KnowledgeField[] = [
  "title",
  "category",
  "content",
  "validFrom",
  "validUntil",
];

export function validateKnowledgeInput(
  input: KnowledgeInput,
):
  | { ok: true; values: repository.KnowledgeValues }
  | Failure<"VALIDATION_ERROR", { fields: KnowledgeField[] }> {
  const parsed = knowledgeInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fields = new Set<KnowledgeField>();
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (KNOWLEDGE_FIELDS.includes(field as KnowledgeField)) {
      fields.add(field as KnowledgeField);
    }
  }
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: KNOWLEDGE_FIELDS.filter((field) => fields.has(field)),
  };
}

const entryIdSchema = z.uuid();

// Lecturas: admin y viewer. Una entrada de otra organización da NOT_FOUND (brief-3.4, D-3).

export async function getKnowledgeEntry(
  context: AuthContext,
  entryId: string,
): Promise<
  | { ok: true; entry: KnowledgeEntry }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!entryIdSchema.safeParse(entryId).success) {
    return failure("VALIDATION_ERROR");
  }
  const timezone = await getOrganizationTimezone(context);
  const entry = await repository.findEntry(
    context.organizationId,
    entryId,
    timezone,
  );
  if (!entry) return failure("NOT_FOUND");
  return { ok: true, entry };
}

export const KNOWLEDGE_PAGE_SIZE = 25;

export type KnowledgeListResult =
  | {
      ok: true;
      entries: KnowledgeEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN">;

// Lista y búsqueda (FR-INFO-02). Con status "current" es la lectura de las vigentes (FR-INFO-03),
// la que la 11.3 va a exponer: el filtro de estado lo resuelve PostgreSQL con el día de la zona de
// la organización, así que una entrada programada, vencida o inactiva nunca sale como vigente.
export async function listKnowledgeEntries(
  context: AuthContext,
  filters: { text: string; status: KnowledgeStatusFilter; page: number },
): Promise<KnowledgeListResult> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const query: repository.EntryQuery = {
    organizationId: context.organizationId,
    timezone: await getOrganizationTimezone(context),
    text: filters.text.trim(),
    status: filters.status,
  };
  const total = await repository.countEntries(query);
  const pageCount = Math.max(1, Math.ceil(total / KNOWLEDGE_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const entries =
    total === 0
      ? []
      : await repository.findEntries(
          query,
          KNOWLEDGE_PAGE_SIZE,
          (page - 1) * KNOWLEDGE_PAGE_SIZE,
        );
  return { ok: true, entries, total, page, pageCount };
}

// Categorías ya usadas, para el formulario (D-2).
export async function listKnowledgeCategories(
  context: AuthContext,
): Promise<{ ok: true; categories: string[] } | Failure<"FORBIDDEN">> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const categories = await repository.findCategories(context.organizationId);
  return { ok: true, categories };
}

// Historial de auditoría de una entrada (FR-AUD-02). audit no autoriza ni conoce a auth:
// knowledge, dueño de la entrada, verifica el rol y la organización y compone el nombre del autor
// (brief-4.4, ajuste 1).

export type KnowledgeAuditEntry = Omit<AuditLogEntry, "actorUserId"> & {
  actor: { id: string; name: string };
};

export type KnowledgeAuditResult =
  | {
      ok: true;
      entries: KnowledgeAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function listKnowledgeAudit(
  context: AuthContext,
  entryId: string,
  page: number,
): Promise<KnowledgeAuditResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const found = await getKnowledgeEntry(context, entryId);
  if (!found.ok) return found;

  const logs = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["knowledge_entry"],
    entityId: found.entry.id,
    page,
  });
  const actors = new Map(
    (
      await getMemberSummaries(context.organizationId, [
        ...new Set(logs.entries.map((entry) => entry.actorUserId)),
      ])
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    entries: logs.entries.map(({ actorUserId, ...entry }) => ({
      ...entry,
      actor: { id: actorUserId, name: actors.get(actorUserId) ?? "" },
    })),
    total: logs.total,
    page: logs.page,
    pageCount: logs.pageCount,
  };
}

// Escrituras: solo admin. Desde el bloqueo en adelante se usa el id que devuelve la base, no el de
// la entrada: z.uuid() acepta mayúsculas (revisión independiente de la 11.1, M-3).

export type CreateKnowledgeResult =
  | { ok: true; entryId: string }
  | Failure<"FORBIDDEN" | "CONFLICT">
  | Failure<"VALIDATION_ERROR", { fields: KnowledgeField[] }>;

export async function createKnowledgeEntry(
  context: AuthContext,
  input: KnowledgeInput,
): Promise<CreateKnowledgeResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validateKnowledgeInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return repository.withTransaction(
    async (tx): Promise<CreateKnowledgeResult> => {
      const entryId = await repository.insertEntry(
        tx,
        context.organizationId,
        values,
      );
      if (entryId === "title_taken") return failure("CONFLICT");
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "knowledge_entry",
        entityId: entryId,
        action: "create",
        diff: { before: null, after: { ...values, isActive: true } },
      });
      return { ok: true, entryId };
    },
  );
}

// changed en false: la entrada ya estaba así; no se escribe ni se audita.
export type UpdateKnowledgeResult =
  | { ok: true; changed: boolean }
  // VALIDATION_ERROR sin fields: id inválido (brief-4.4, D-6). Con fields: el formulario.
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: KnowledgeField[] }>;

export async function updateKnowledgeEntry(
  context: AuthContext,
  entryId: string,
  input: KnowledgeInput,
): Promise<UpdateKnowledgeResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!entryIdSchema.safeParse(entryId).success) {
    return failure("VALIDATION_ERROR");
  }
  const validated = validateKnowledgeInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  const timezone = await getOrganizationTimezone(context);

  return repository.withTransaction(
    async (tx): Promise<UpdateKnowledgeResult> => {
      const current = await repository.findEntry(
        context.organizationId,
        entryId,
        timezone,
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");

      const changedFields = KNOWLEDGE_FIELDS.filter(
        (field) => current[field] !== values[field],
      );
      if (changedFields.length === 0) return { ok: true, changed: false };

      const before = Object.fromEntries(
        changedFields.map((field) => [field, current[field]]),
      );
      const after = Object.fromEntries(
        changedFields.map((field) => [field, values[field]]),
      );
      const updated = await repository.updateEntryValues(
        tx,
        context.organizationId,
        current.id,
        after,
      );
      if (updated === "title_taken") return failure("CONFLICT");
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "knowledge_entry",
        entityId: current.id,
        action: "update",
        diff: { before, after },
      });
      return { ok: true, changed: true };
    },
  );
}

export type KnowledgeActiveResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

async function setKnowledgeActive(
  context: AuthContext,
  entryId: string,
  isActive: boolean,
): Promise<KnowledgeActiveResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!entryIdSchema.safeParse(entryId).success) {
    return failure("VALIDATION_ERROR");
  }
  const timezone = await getOrganizationTimezone(context);

  return repository.withTransaction(
    async (tx): Promise<KnowledgeActiveResult> => {
      const current = await repository.findEntry(
        context.organizationId,
        entryId,
        timezone,
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      if (current.isActive === isActive) return { ok: true, changed: false };

      await repository.updateEntryActive(
        tx,
        context.organizationId,
        current.id,
        isActive,
      );
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "knowledge_entry",
        entityId: current.id,
        action: isActive ? "reactivate" : "deactivate",
        diff: {
          before: { isActive: current.isActive },
          after: { isActive },
        },
      });
      return { ok: true, changed: true };
    },
  );
}

export function deactivateKnowledgeEntry(
  context: AuthContext,
  entryId: string,
): Promise<KnowledgeActiveResult> {
  return setKnowledgeActive(context, entryId, false);
}

export function reactivateKnowledgeEntry(
  context: AuthContext,
  entryId: string,
): Promise<KnowledgeActiveResult> {
  return setKnowledgeActive(context, entryId, true);
}
