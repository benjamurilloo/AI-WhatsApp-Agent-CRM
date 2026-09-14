import { z } from "zod";
import type { DbTransaction } from "@/shared/db";
import { insertAuditLog } from "./repository";
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
