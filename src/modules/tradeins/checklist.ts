import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  authorize,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import { listRepairTypes } from "@/modules/service";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";
import { CHECKLIST_ITEM_NAME_MAX_LENGTH, MAX_CHECKLIST_ITEMS } from "./schema";

// El checklist de un usado (ADR 0024, puntos 8 y 13; brief-29.7, D-3): los puntos que se revisan al
// recibir un equipo, cada uno obligatorio para aceptarlo o no. De la capacidad trade_ins: sin ella,
// nada de esto existe para nadie. Un admin lo edita; un viewer no lo ve fuera de una recepción. Cada
// escritura se audita como trade_in_checklist_item. Un punto no se borra: se desactiva, y la recepción
// guarda la copia de su nombre.

export { CHECKLIST_ITEM_NAME_MAX_LENGTH, MAX_CHECKLIST_ITEMS };

const idSchema = z.uuid();

export async function tradeInsAllowed(context: AuthContext): Promise<boolean> {
  return hasCapability(context.organizationId, "trade_ins");
}

export async function requireTradeIns(
  context: AuthContext,
  role?: "admin",
): Promise<{ ok: true } | Failure<"FORBIDDEN" | "NOT_FOUND">> {
  const signedIn = authorize(context, {});
  if (!signedIn.ok) return signedIn;
  if (!(await tradeInsAllowed(context))) return failure("NOT_FOUND");
  return role ? authorize(context, { role }) : { ok: true };
}

export type ChecklistItem = repository.ChecklistItemRow & {
  // Cuántas recepciones lo tienen en su resultado.
  uses: number;
};

// Los puntos de la organización, activos e inactivos, en su orden. Solo admin: es la configuración.
export async function listChecklistItems(
  context: AuthContext,
): Promise<
  { ok: true; items: ChecklistItem[] } | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const [items, uses] = await Promise.all([
    repository.findChecklistItems(context.organizationId),
    repository.countResultsByItem(context.organizationId),
  ]);
  return {
    ok: true,
    items: items.map((item) => ({ ...item, uses: uses.get(item.id) ?? 0 })),
  };
}

export type ChecklistItemInput = { name: string; isMandatory: boolean };
export type ChecklistItemField = "name";

const nameSchema = z.string().trim().min(1).max(CHECKLIST_ITEM_NAME_MAX_LENGTH);

export type ChecklistItemWriteResult =
  | { ok: true; itemId: string; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: ChecklistItemField[] }>
  | Failure<"CONFLICT", { field: "name" }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "checklist_full" }>;

const nameTaken: ChecklistItemWriteResult = {
  ok: false,
  code: "CONFLICT",
  field: "name",
};

const invalidName: ChecklistItemWriteResult = {
  ok: false,
  code: "VALIDATION_ERROR",
  fields: ["name"],
};

function auditItem(
  context: AuthContext,
  itemId: string,
  action: "create" | "update" | "deactivate" | "reactivate",
  before: Record<string, string | number | boolean> | null,
  after: Record<string, string | number | boolean>,
) {
  return {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    entityType: "trade_in_checklist_item" as const,
    entityId: itemId,
    action,
    diff: { before, after },
  };
}

// Un punto nuevo va al final de la lista.
export async function createChecklistItem(
  context: AuthContext,
  input: ChecklistItemInput,
): Promise<ChecklistItemWriteResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return invalidName;
  const { organizationId } = context;
  return repository.withTransaction(
    async (tx): Promise<ChecklistItemWriteResult> => {
      // La lista FOR UPDATE: dos altas a la vez no toman la misma posición.
      const existing = await repository.findChecklistItems(organizationId, tx, {
        lock: "update",
      });
      if (existing.length >= MAX_CHECKLIST_ITEMS) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "checklist_full",
        };
      }
      const values = {
        name: name.data,
        isMandatory: input.isMandatory,
        position:
          existing.reduce((max, item) => Math.max(max, item.position), -1) + 1,
        isActive: true,
      };
      const itemId = await repository.insertChecklistItem(tx, organizationId, {
        ...values,
        isExample: false,
      });
      if (itemId === "name_taken") return nameTaken;
      await recordAudit(tx, auditItem(context, itemId, "create", null, values));
      return { ok: true, itemId, changed: true };
    },
  );
}

// El nombre y si es obligatorio, juntos: es el formulario de la fila.
export async function updateChecklistItem(
  context: AuthContext,
  itemId: string,
  input: ChecklistItemInput,
): Promise<ChecklistItemWriteResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(itemId).success) return failure("VALIDATION_ERROR");
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return invalidName;
  const { organizationId } = context;
  return repository.withTransaction(
    async (tx): Promise<ChecklistItemWriteResult> => {
      const current = await repository.findChecklistItem(
        organizationId,
        itemId.toLowerCase(),
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      const before: Record<string, string | boolean> = {};
      const after: Record<string, string | boolean> = {};
      if (current.name !== name.data) {
        before.name = current.name;
        after.name = name.data;
      }
      if (current.isMandatory !== input.isMandatory) {
        before.isMandatory = current.isMandatory;
        after.isMandatory = input.isMandatory;
      }
      if (Object.keys(after).length === 0) {
        return { ok: true, itemId: current.id, changed: false };
      }
      const written = await repository.updateChecklistItem(
        tx,
        organizationId,
        current.id,
        after,
      );
      if (written === "name_taken") return nameTaken;
      await recordAudit(
        tx,
        auditItem(context, current.id, "update", before, after),
      );
      return { ok: true, itemId: current.id, changed: true };
    },
  );
}

// Desactivar un punto lo saca de las recepciones nuevas; las que lo tienen conservan su copia.
export async function setChecklistItemActive(
  context: AuthContext,
  itemId: string,
  isActive: boolean,
): Promise<ChecklistItemWriteResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(itemId).success) return failure("VALIDATION_ERROR");
  const { organizationId } = context;
  return repository.withTransaction(
    async (tx): Promise<ChecklistItemWriteResult> => {
      const current = await repository.findChecklistItem(
        organizationId,
        itemId.toLowerCase(),
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      if (current.isActive === isActive) {
        return { ok: true, itemId: current.id, changed: false };
      }
      await repository.updateChecklistItem(tx, organizationId, current.id, {
        isActive,
      });
      await recordAudit(
        tx,
        auditItem(
          context,
          current.id,
          isActive ? "reactivate" : "deactivate",
          { isActive: current.isActive },
          { isActive },
        ),
      );
      return { ok: true, itemId: current.id, changed: true };
    },
  );
}

// El tipo de reparación de un punto (brief-29.7.3, D-3): la reparación que necesita el equipo si el
// punto no pasa, para la cotización. Vacío lo saca. Solo con repairs: sin ella no hay tipos que elegir.
export type ChecklistItemRepairTypeResult =
  | { ok: true; itemId: string; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function setChecklistItemRepairType(
  context: AuthContext,
  itemId: string,
  repairTypeId: string,
): Promise<ChecklistItemRepairTypeResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(itemId).success) return failure("VALIDATION_ERROR");
  const typeText = repairTypeId.trim().toLowerCase();
  let typeId: string | null = null;
  if (typeText !== "") {
    if (!idSchema.safeParse(typeText).success) {
      return failure("VALIDATION_ERROR");
    }
    const types = await listRepairTypes(context);
    if (!types.ok || !types.types.some((type) => type.id === typeText)) {
      return failure("NOT_FOUND");
    }
    typeId = typeText;
  }
  const { organizationId } = context;
  return repository.withTransaction(
    async (tx): Promise<ChecklistItemRepairTypeResult> => {
      const current = await repository.findChecklistItem(
        organizationId,
        itemId.toLowerCase(),
        tx,
        { forUpdate: true },
      );
      if (!current) return failure("NOT_FOUND");
      if (current.repairTypeId === typeId) {
        return { ok: true, itemId: current.id, changed: false };
      }
      await repository.updateChecklistItem(tx, organizationId, current.id, {
        repairTypeId: typeId,
      });
      await recordAudit(tx, {
        organizationId,
        actorUserId: context.userId,
        entityType: "trade_in_checklist_item",
        entityId: current.id,
        action: "update",
        diff: {
          before: { repairTypeId: current.repairTypeId },
          after: { repairTypeId: typeId },
        },
      });
      return { ok: true, itemId: current.id, changed: true };
    },
  );
}

export type MoveDirection = "up" | "down";

// Sube o baja un punto un lugar, con el molde de los grados (brief-29.5, D-5): la lista se renumera
// de 0 en adelante, y cada punto cuya posición guardada cambia queda auditado.
export async function moveChecklistItem(
  context: AuthContext,
  itemId: string,
  direction: MoveDirection,
): Promise<ChecklistItemWriteResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (
    !idSchema.safeParse(itemId).success ||
    (direction !== "up" && direction !== "down")
  ) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const id = itemId.toLowerCase();
  return repository.withTransaction(
    async (tx): Promise<ChecklistItemWriteResult> => {
      const items = await repository.findChecklistItems(organizationId, tx, {
        lock: "update",
      });
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) return failure("NOT_FOUND");
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= items.length) {
        return { ok: true, itemId: id, changed: false };
      }
      const order = items.map((item) => item.id);
      [order[index], order[target]] = [order[target]!, order[index]!];
      for (const [position, otherId] of order.entries()) {
        const item = items.find((candidate) => candidate.id === otherId)!;
        if (item.position !== position) {
          await repository.updateChecklistItem(tx, organizationId, otherId, {
            position,
          });
          await recordAudit(
            tx,
            auditItem(
              context,
              otherId,
              "update",
              { position: item.position },
              { position },
            ),
          );
        }
      }
      return { ok: true, itemId: id, changed: true };
    },
  );
}

// La copia del checklist de un perfil de rubro (ADR 0024, punto 13; D-1 y D-3). La llama solo el
// script de capacidades, con el admin que nombró, dentro de la transacción que activa trade_ins: no
// autoriza nada. Un punto que la organización ya tiene, por nombre, se saltea.
// tests/guards/capability-reads.test.ts fija que nada de src/ fuera de tradeins la nombra.
export type ChecklistTemplateItem = { name: string; isMandatory: boolean };

export async function applyChecklistTemplate(
  tx: DbTransaction,
  input: {
    organizationId: string;
    actorUserId: string;
    items: readonly ChecklistTemplateItem[];
  },
): Promise<{ created: string[]; skipped: string[] }> {
  const { organizationId, actorUserId } = input;
  const existing = await repository.findChecklistItems(organizationId, tx, {
    lock: "update",
  });
  const names = new Set(existing.map((item) => item.name.toLowerCase()));
  let position =
    existing.reduce((max, item) => Math.max(max, item.position), -1) + 1;
  const created: string[] = [];
  const skipped: string[] = [];
  for (const template of input.items) {
    if (names.has(template.name.toLowerCase())) {
      skipped.push(template.name);
      continue;
    }
    const values = {
      name: template.name,
      isMandatory: template.isMandatory,
      position: position++,
      isActive: true,
      isExample: true,
    };
    const itemId = await repository.insertChecklistItem(
      tx,
      organizationId,
      values,
    );
    if (itemId === "name_taken") {
      throw new Error(`punto repetido en la plantilla: ${template.name}`);
    }
    await recordAudit(tx, {
      organizationId,
      actorUserId,
      entityType: "trade_in_checklist_item",
      entityId: itemId,
      action: "create",
      diff: { before: null, after: { ...values, origen: "perfil" } },
    });
    names.add(template.name.toLowerCase());
    created.push(template.name);
  }
  return { created, skipped };
}
