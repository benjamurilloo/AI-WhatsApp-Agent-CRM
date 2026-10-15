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
import { failure, type Failure } from "@/shared/errors";
import { parsePhoneInput } from "@/shared/phone";
import { cuitDigits, parseCuitInput } from "./cuit";
import * as repository from "./repository";
import { SUPPLIER_FIELD_LIMITS } from "./schema";

// Casos de uso de los proveedores (ADR 0023, puntos 2, 10, 12 y 14; brief-22.2). Solo un admin los
// lee y los escribe (punto 12): un viewer recibe FORBIDDEN en todo, también en las lecturas. El
// agente no los lee: ningún contrato los incluye. En esta subfase purchasing depende solo de
// organizations y de audit, y ningún módulo depende de purchasing.
//
// La serialización (D-6): la edición, la desactivación y la reactivación leen el proveedor con
// FOR UPDATE y deciden con lo leído; el alta no toma bloqueos, porque la unicidad del nombre y del
// CUIT la asegura la base, y el 23505 se rescata por el nombre de la restricción.

export type Supplier = repository.SupplierRow;
export type SupplierStatusFilter = repository.SupplierStatusFilter;
export type SupplierRule = repository.SupplierUniqueRule;

export type SupplierField = "name" | "phone" | "email" | "cuit";

export type SupplierInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  cuit?: string | null;
};

// La página de la lista, como la de clientes (D-10).
export const SUPPLIERS_PAGE_SIZE = 25;

// El texto buscado se recorta y se acota, como en clientes.
const MAX_SEARCH_LENGTH = 100;

// Las reglas de la ficha (D-2 a D-4). Los textos se recortan antes de validar.
const supplierInputSchema = z.object({
  name: z.string().trim().min(1).max(SUPPLIER_FIELD_LIMITS.name),
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
  // La regla del email del cliente (brief-17.1, D-6): recortado, en minúsculas y hasta 254.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .nullish()
    .transform((value, ctx) => {
      if (!value) return null;
      if (
        value.length > SUPPLIER_FIELD_LIMITS.email ||
        !z.email().safeParse(value).success
      ) {
        ctx.addIssue({ code: "custom", message: "email inválido" });
        return z.NEVER;
      }
      return value;
    }),
  cuit: z
    .string()
    .nullish()
    .transform((value, ctx) => {
      const parsed = parseCuitInput(value);
      if (!parsed.ok) {
        ctx.addIssue({ code: "custom", message: "CUIT inválido" });
        return z.NEVER;
      }
      return parsed.cuit;
    }),
});

// El orden del formulario.
const SUPPLIER_FIELDS: SupplierField[] = ["name", "phone", "email", "cuit"];

export function validateSupplierInput(
  input: SupplierInput,
):
  | { ok: true; values: repository.SupplierValues }
  | Failure<"VALIDATION_ERROR", { fields: SupplierField[] }> {
  const parsed = supplierInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fields = new Set<SupplierField>();
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (SUPPLIER_FIELDS.includes(field as SupplierField)) {
      fields.add(field as SupplierField);
    }
  }
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    fields: SUPPLIER_FIELDS.filter((field) => fields.has(field)),
  };
}

const idSchema = z.uuid();

function ruleFailure(
  rule: SupplierRule,
): Failure<"BUSINESS_RULE_VIOLATION", { rule: SupplierRule }> {
  return { ok: false, code: "BUSINESS_RULE_VIOLATION", rule };
}

// Qué busca el texto (D-10): once dígitos, con o sin separadores, son un CUIT exacto; cualquier
// otra cosa, parte del nombre.
export function interpretSupplierSearch(
  text: string,
): repository.SupplierSearch {
  const trimmed = text.trim().slice(0, MAX_SEARCH_LENGTH);
  if (trimmed === "") return { kind: "none" };
  const digits = cuitDigits(trimmed);
  if (digits !== null) return { kind: "cuit", digits };
  return { kind: "name", text: trimmed };
}

export function supplierPageBounds(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / SUPPLIERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  return { page, pageCount, offset: (page - 1) * SUPPLIERS_PAGE_SIZE };
}

export type SupplierListQuery = {
  text: string;
  status: SupplierStatusFilter;
  page: number;
};

export type SupplierListResult =
  | {
      ok: true;
      suppliers: Supplier[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN">;

export async function listSuppliers(
  context: AuthContext,
  query: SupplierListQuery,
): Promise<SupplierListResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const search = interpretSupplierSearch(query.text);
  const total = await repository.countSuppliers(
    context.organizationId,
    query.status,
    search,
  );
  const { page, pageCount, offset } = supplierPageBounds(total, query.page);
  const rows =
    total === 0
      ? []
      : await repository.findSuppliers(
          context.organizationId,
          query.status,
          search,
          SUPPLIERS_PAGE_SIZE,
          offset,
        );
  return { ok: true, suppliers: rows, total, page, pageCount };
}

export type GetSupplierResult =
  | { ok: true; supplier: Supplier }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

// Un proveedor de otra organización da NOT_FOUND, como un cliente (brief-3.4, D-3).
export async function getSupplier(
  context: AuthContext,
  supplierId: string,
): Promise<GetSupplierResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(supplierId).success) {
    return failure("VALIDATION_ERROR");
  }
  const supplier = await repository.findSupplier(
    context.organizationId,
    supplierId.toLowerCase(),
  );
  return supplier ? { ok: true, supplier } : failure("NOT_FOUND");
}

export type SupplierAuditEntry = NamedAuditLogEntry;

export type SupplierAuditResult =
  | {
      ok: true;
      entries: SupplierAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function listSupplierAudit(
  context: AuthContext,
  supplierId: string,
  page: number,
): Promise<SupplierAuditResult> {
  const found = await getSupplier(context, supplierId);
  if (!found.ok) return found;
  const audit = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["supplier"],
    entityId: found.supplier.id,
    page,
  });
  const names = new Map(
    (
      await getMemberSummaries(
        context.organizationId,
        auditUserIds(audit.entries),
      )
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    entries: nameAuditActors(audit.entries, names),
    total: audit.total,
    page: audit.page,
    pageCount: audit.pageCount,
  };
}

// Escrituras: solo admin (D-5). El diff lleva el teléfono, el email y el CUIT de un proveedor que
// puede ser una persona física (D-8; ADR 0023, punto 14): lo acepta el ADR hasta que se construya
// el vaciado. Ningún rechazo escribe ni audita (D-7).

export type CreateSupplierResult =
  | { ok: true; supplierId: string }
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR", { fields: SupplierField[] }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: SupplierRule }>;

export async function createSupplier(
  context: AuthContext,
  input: SupplierInput,
): Promise<CreateSupplierResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validateSupplierInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;

  return repository.withTransaction(
    async (tx): Promise<CreateSupplierResult> => {
      const inserted = await repository.insertSupplier(
        tx,
        context.organizationId,
        values,
      );
      // También contra un inactivo: se reactiva el existente (D-2 y D-4).
      if (typeof inserted === "string") return ruleFailure(inserted);
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "supplier",
        entityId: inserted.id,
        action: "create",
        diff: { before: null, after: { ...values, isActive: true } },
      });
      return { ok: true, supplierId: inserted.id };
    },
  );
}

// changed en false: el proveedor ya estaba así; no se escribe ni se audita.
export type UpdateSupplierResult =
  | { ok: true; changed: boolean }
  // VALIDATION_ERROR sin fields: el id no es un uuid. Con fields: el formulario.
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: SupplierField[] }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: SupplierRule }>;

const VALUE_FIELDS: (keyof repository.SupplierValues)[] = [
  "name",
  "phone",
  "email",
  "cuit",
];

export async function updateSupplier(
  context: AuthContext,
  supplierId: string,
  input: SupplierInput,
): Promise<UpdateSupplierResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(supplierId).success) {
    return failure("VALIDATION_ERROR");
  }
  const validated = validateSupplierInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  const id = supplierId.toLowerCase();

  return repository.withTransaction(
    async (tx): Promise<UpdateSupplierResult> => {
      // FOR UPDATE: una edición simultánea espera, y el «antes» de la auditoría es lo que dejó la
      // anterior (ADR 0023, punto 10; D-6).
      const current = await repository.findSupplier(
        context.organizationId,
        id,
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
      const updated = await repository.updateSupplierValues(
        tx,
        context.organizationId,
        id,
        after,
      );
      if (typeof updated === "string") return ruleFailure(updated);
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "supplier",
        entityId: id,
        action: "update",
        diff: { before, after },
      });
      return { ok: true, changed: true };
    },
  );
}

export type SupplierActiveResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

async function setSupplierActive(
  context: AuthContext,
  supplierId: string,
  isActive: boolean,
): Promise<SupplierActiveResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(supplierId).success) {
    return failure("VALIDATION_ERROR");
  }
  const id = supplierId.toLowerCase();

  return repository.withTransaction(
    async (tx): Promise<SupplierActiveResult> => {
      const current = await repository.findSupplier(
        context.organizationId,
        id,
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      if (current.isActive === isActive) return { ok: true, changed: false };

      // Reactivar no puede chocar: el nombre y el CUIT de un inactivo no los toma nadie (D-2, D-4).
      await repository.updateSupplierActive(
        tx,
        context.organizationId,
        id,
        isActive,
      );
      await recordAudit(tx, {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        entityType: "supplier",
        entityId: id,
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

// Desactivar no bloquea nada todavía: lo que un proveedor desactivado no recibe lo aplican la 22.3,
// la 22.4 y la 22.6 (ADR 0023, punto 2).
export function deactivateSupplier(
  context: AuthContext,
  supplierId: string,
): Promise<SupplierActiveResult> {
  return setSupplierActive(context, supplierId, false);
}

// La reactivación no la nombra el punto 15 del ADR; la suma D-5, porque el nombre único también
// frente a los inactivos no deja volver a dar de alta uno desactivado por error (H-3).
export function reactivateSupplier(
  context: AuthContext,
  supplierId: string,
): Promise<SupplierActiveResult> {
  return setSupplierActive(context, supplierId, true);
}
