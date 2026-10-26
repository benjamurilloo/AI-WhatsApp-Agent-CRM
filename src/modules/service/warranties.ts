import { eq } from "drizzle-orm";
import { recordAudit } from "@/modules/audit";
import {
  deriveWarranty,
  MAX_WARRANTY_DAYS,
  type Warranty,
} from "@/modules/inventory";
import {
  authorize,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import { getDb, type Db, type DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import { serviceSettings } from "./schema";

// La garantía de una reparación entregada (ADR 0024, punto 11; brief-29.9): los días de la
// organización (service_settings, de repairs) y la garantía derivada de una orden customer_device
// reparada y entregada, desde delivered_at. No se guarda. La regla es la de inventory.

type Executor = Db | DbTransaction;

type SettingsRow = { id: string; warrantyDays: number; isExample: boolean };
type SettingsValues = Omit<SettingsRow, "id">;

export async function findServiceSettings(
  organizationId: string,
  executor: Executor = getDb(),
  options: { forUpdate?: boolean } = {},
): Promise<SettingsRow | undefined> {
  const query = executor
    .select({
      id: serviceSettings.id,
      warrantyDays: serviceSettings.warrantyDays,
      isExample: serviceSettings.isExample,
    })
    .from(serviceSettings)
    .where(eq(serviceSettings.organizationId, organizationId))
    .limit(1);
  const rows = options.forUpdate ? await query.for("update") : await query;
  return rows[0];
}

const SETTINGS_UNIQUE = "service_settings_organization_unique";

function uniqueViolationOf(error: unknown, constraint: string): boolean {
  for (
    let current: unknown = error;
    current;
    current = (current as { cause?: unknown }).cause
  ) {
    const candidate = current as { code?: string; constraint?: string };
    if (candidate.code === "23505" && candidate.constraint === constraint) {
      return true;
    }
  }
  return false;
}

async function insertServiceSettings(
  tx: DbTransaction,
  organizationId: string,
  values: SettingsValues,
): Promise<string | "taken"> {
  try {
    return await tx.transaction(async (savepoint) => {
      const rows = await savepoint
        .insert(serviceSettings)
        .values({ organizationId, ...values })
        .returning({ id: serviceSettings.id });
      return rows[0]!.id;
    });
  } catch (error) {
    if (uniqueViolationOf(error, SETTINGS_UNIQUE)) return "taken";
    throw error;
  }
}

async function updateServiceSettings(
  tx: DbTransaction,
  organizationId: string,
  values: SettingsValues,
): Promise<void> {
  const rows = await tx
    .update(serviceSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(serviceSettings.organizationId, organizationId))
    .returning({ id: serviceSettings.id });
  if (rows.length === 0) {
    throw new Error("updateServiceSettings: la organización no tiene valores");
  }
}

async function allowed(context: AuthContext): Promise<boolean> {
  return hasCapability(context.organizationId, "repairs");
}

const DAYS_PATTERN = /^\d{1,4}$/;

export type ServiceWarrantySettings = {
  warrantyDays: number;
  isExample: boolean;
};

export async function getServiceWarrantySettings(
  context: AuthContext,
): Promise<
  | { ok: true; settings: ServiceWarrantySettings | null }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const row = await findServiceSettings(context.organizationId);
  return {
    ok: true,
    settings: row
      ? { warrantyDays: row.warrantyDays, isExample: row.isExample }
      : null,
  };
}

export type ServiceWarrantySettingsResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | Failure<"VALIDATION_ERROR", { fields: ["warrantyDays"] }>;

// Guardar apaga la marca de ejemplo, también sin cambiar los días, como trade_in_settings.
export async function saveServiceWarrantySettings(
  context: AuthContext,
  input: { warrantyDays: string },
): Promise<ServiceWarrantySettingsResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const text = input.warrantyDays.trim();
  const days = DAYS_PATTERN.test(text) ? Number(text) : NaN;
  if (!(days >= 0 && days <= MAX_WARRANTY_DAYS)) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["warrantyDays"] };
  }
  const values = { warrantyDays: days, isExample: false };
  const { organizationId, userId } = context;
  const write = (tx: DbTransaction) =>
    writeSettings(tx, organizationId, userId, values);
  const first = await getDb().transaction(write);
  // Otro las creó a la vez: ahora existen, y se editan.
  return first === "taken"
    ? (getDb().transaction(write) as Promise<ServiceWarrantySettingsResult>)
    : first;
}

async function writeSettings(
  tx: DbTransaction,
  organizationId: string,
  userId: string,
  values: SettingsValues,
): Promise<ServiceWarrantySettingsResult | "taken"> {
  const current = await findServiceSettings(organizationId, tx, {
    forUpdate: true,
  });
  if (!current) {
    const id = await insertServiceSettings(tx, organizationId, values);
    if (id === "taken") return "taken";
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "service_settings",
      entityId: id,
      action: "create",
      diff: { before: null, after: values },
    });
    return { ok: true, changed: true };
  }
  const before: Record<string, number | boolean> = {};
  const after: Record<string, number | boolean> = {};
  for (const key of ["warrantyDays", "isExample"] as const) {
    if (current[key] !== values[key]) {
      before[key] = current[key];
      after[key] = values[key];
    }
  }
  if (Object.keys(after).length === 0) return { ok: true, changed: false };
  await updateServiceSettings(tx, organizationId, values);
  await recordAudit(tx, {
    organizationId,
    actorUserId: userId,
    entityType: "service_settings",
    entityId: current.id,
    action: "update",
    diff: { before, after },
  });
  return { ok: true, changed: true };
}

// La copia del perfil (D-1): la llama solo el script de capacidades, dentro de su transacción
// (tests/guards/capability-reads.test.ts). Crea la fila si falta, de ejemplo; si existe, no la toca.
export async function applyServiceSettingsTemplate(
  tx: DbTransaction,
  input: { organizationId: string; actorUserId: string; warrantyDays: number },
): Promise<{ created: boolean }> {
  const { organizationId, actorUserId, warrantyDays } = input;
  const current = await findServiceSettings(organizationId, tx, {
    forUpdate: true,
  });
  if (current) return { created: false };
  const values = { warrantyDays, isExample: true };
  const id = await insertServiceSettings(tx, organizationId, values);
  if (id === "taken") {
    throw new Error("Los días de garantía se crearon a la vez.");
  }
  await recordAudit(tx, {
    organizationId,
    actorUserId,
    entityType: "service_settings",
    entityId: id,
    action: "create",
    diff: { before: null, after: { ...values, origen: "perfil" } },
  });
  return { created: true };
}

type WarrantyOrder = {
  kind: "customer_device" | "own_unit" | "warranty_claim";
  status: string;
  repairedAt: Date | null;
  deliveredAt: Date | null;
};

// Tiene garantía solo la orden de un cliente, reparada y entregada. Una rechazada, una sin entregar o
// una unidad propia no tienen, y un reclamo tampoco: no da garantía propia ni reinicia la del equipo
// (brief-29.9.2, D-2).
export function hasServiceWarranty(
  order: WarrantyOrder,
): order is WarrantyOrder & { deliveredAt: Date } {
  return (
    order.kind === "customer_device" &&
    order.status === "delivered" &&
    order.repairedAt !== null &&
    order.deliveredAt !== null
  );
}

export function serviceOrderWarranty(
  order: WarrantyOrder,
  warrantyDays: number | null,
  timezone: string,
  now: Date,
): Warranty | null {
  if (!hasServiceWarranty(order)) return null;
  return deriveWarranty({
    startedAt: order.deliveredAt,
    days: warrantyDays,
    source: "settings",
    timezone,
    now,
  });
}
