import { z } from "zod";
import type { DbTransaction } from "@/shared/db";
import {
  countAuditLogs,
  findAuditLogs,
  insertAuditLog,
  type AuditLogQuery,
} from "./repository";
import { auditAction, auditEntityType } from "./schema";

// Registro de auditoría dentro de la transacción del cambio (brief-3.6, D-3 y D-4).

// Claves que nunca entran a la auditoría, aunque el productor las incluya por error (D-4).
const FORBIDDEN_KEY = /password|hash|token|secret/i;

const fieldsSchema = z.record(
  z.string().min(1),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

const entrySchema = z
  .strictObject({
    organizationId: z.uuid(),
    actorUserId: z.uuid(),
    entityType: z.enum(auditEntityType.enumValues),
    entityId: z.uuid(),
    action: z.enum(auditAction.enumValues),
    diff: z.strictObject({
      before: fieldsSchema.nullable(),
      after: fieldsSchema.nullable(),
    }),
  })
  .superRefine(({ action, diff: { before, after } }, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", path: ["diff"], message });

    const keys = [...Object.keys(before ?? {}), ...Object.keys(after ?? {})];
    if (keys.some((key) => FORBIDDEN_KEY.test(key))) {
      issue("clave prohibida");
    }

    if (action === "create") {
      if (before !== null || after === null || Object.keys(after).length === 0)
        issue("create lleva before en null y after con campos");
      return;
    }

    if (before === null || after === null) {
      issue("before y after son obligatorios fuera de create");
      return;
    }
    const beforeKeys = Object.keys(before).sort();
    const afterKeys = Object.keys(after).sort();
    const sameKeys =
      beforeKeys.length === afterKeys.length &&
      beforeKeys.every((key, i) => key === afterKeys[i]);
    if (!sameKeys || beforeKeys.length === 0) {
      issue("before y after llevan los mismos campos, al menos uno");
    } else if (beforeKeys.every((key) => before[key] === after[key])) {
      issue("ningún campo cambió");
    }
  });

export type AuditEntry = z.infer<typeof entrySchema>;
export type AuditEntityType = AuditEntry["entityType"];
export type AuditAction = AuditEntry["action"];

// Una entrada inválida es un error de programación del productor, no un error de dominio:
// se lanza y aborta la transacción. El mensaje nombra campos, nunca valores.
export class InvalidAuditEntryError extends Error {
  constructor(readonly problems: string[]) {
    super(`Entrada de auditoría inválida: ${problems.join("; ")}`);
    this.name = "InvalidAuditEntryError";
  }
}

export function validateAuditEntry(entry: unknown): AuditEntry {
  const result = entrySchema.safeParse(entry);
  if (!result.success) {
    throw new InvalidAuditEntryError(
      result.error.issues.map(
        (issue) =>
          `${issue.path.join(".") || "entrada"}: ${issue.code === "custom" ? issue.message : issue.code}`,
      ),
    );
  }
  return result.data;
}

export async function recordAudit(
  tx: DbTransaction,
  entry: AuditEntry,
): Promise<void> {
  await insertAuditLog(tx, validateAuditEntry(entry));
}

// Lectura del historial de una entidad (FR-AUD-02, brief-4.4, D-1). No recibe contexto ni
// verifica el rol: audit no importa organizations ni auth fuera de schema.ts, así que quien
// llama ya autorizó y compone el nombre del autor (catalog para productos).

export const AUDIT_PAGE_SIZE = 25;

export type AuditDiff = AuditEntry["diff"];

export type AuditLogEntry = {
  id: string;
  entityType: AuditEntityType;
  action: AuditAction;
  diff: AuditDiff;
  actorUserId: string;
  createdAt: Date;
};

export type AuditLogPage = {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageCount: number;
};

// Una página fuera de rango se lleva a la última; una no numérica o menor que 1, a la primera.
export function auditPageBounds(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  return { page, pageCount, offset: (page - 1) * AUDIT_PAGE_SIZE };
}

export async function listEntityAuditLogs(
  query: AuditLogQuery & { page: number },
): Promise<AuditLogPage> {
  const total = await countAuditLogs(query);
  const { page, pageCount, offset } = auditPageBounds(total, query.page);
  const rows =
    total === 0 ? [] : await findAuditLogs(query, AUDIT_PAGE_SIZE, offset);
  return {
    entries: rows.map((row) => ({ ...row, diff: row.diff as AuditDiff })),
    total,
    page,
    pageCount,
  };
}
