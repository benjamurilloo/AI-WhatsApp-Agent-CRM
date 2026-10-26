import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  authorize,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";
import {
  MAX_APPOINTMENT_CAPACITY,
  MAX_APPOINTMENT_REASONS,
  REASON_NAME_MAX_LENGTH,
  SLOT_MINUTES,
} from "./schema";

// La configuración de los turnos (ADR 0024, puntos 12 y 13; brief-29.10, D-2 y D-4): la duración de una
// franja, el cupo y los motivos. De la capacidad appointments: sin ella, nada de esto existe para nadie.
// Un admin la edita; un viewer ve los turnos, no la configuración. Cada escritura se audita. Un motivo
// no se borra: se desactiva, y sus turnos lo conservan.

export {
  MAX_APPOINTMENT_CAPACITY,
  MAX_APPOINTMENT_REASONS,
  REASON_NAME_MAX_LENGTH,
  SLOT_MINUTES,
};

const idSchema = z.uuid();

export async function appointmentsAllowed(
  context: AuthContext,
): Promise<boolean> {
  return hasCapability(context.organizationId, "appointments");
}

export async function requireAppointments(
  context: AuthContext,
  role?: "admin",
): Promise<{ ok: true } | Failure<"FORBIDDEN" | "NOT_FOUND">> {
  const signedIn = authorize(context, {});
  if (!signedIn.ok) return signedIn;
  if (!(await appointmentsAllowed(context))) return failure("NOT_FOUND");
  return role ? authorize(context, { role }) : { ok: true };
}

// La duración y el cupo.

export type AppointmentSettings = repository.SettingsValues;

export async function getAppointmentSettings(
  context: AuthContext,
): Promise<
  | { ok: true; settings: AppointmentSettings | null }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireAppointments(context, "admin");
  if (!allowed.ok) return allowed;
  const row = await repository.findAppointmentSettings(context.organizationId);
  return {
    ok: true,
    settings: row
      ? {
          slotMinutes: row.slotMinutes,
          capacity: row.capacity,
          isExample: row.isExample,
        }
      : null,
  };
}

export type AppointmentSettingsField = "slotMinutes" | "capacity";

export type AppointmentSettingsResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | Failure<"VALIDATION_ERROR", { fields: AppointmentSettingsField[] }>;

const WHOLE_NUMBER = /^\d{1,3}$/;

// Guardar apaga la marca de ejemplo, también sin cambiar los valores, como service_settings. Cambiar la
// duración o el cupo no mueve ningún turno (U-5).
export async function saveAppointmentSettings(
  context: AuthContext,
  input: { slotMinutes: string; capacity: string },
): Promise<AppointmentSettingsResult> {
  const allowed = await requireAppointments(context, "admin");
  if (!allowed.ok) return allowed;
  const minutesText = input.slotMinutes.trim();
  const capacityText = input.capacity.trim();
  const slotMinutes = WHOLE_NUMBER.test(minutesText)
    ? Number(minutesText)
    : NaN;
  const capacity = WHOLE_NUMBER.test(capacityText) ? Number(capacityText) : NaN;
  const fields: AppointmentSettingsField[] = [];
  if (!(SLOT_MINUTES as readonly number[]).includes(slotMinutes)) {
    fields.push("slotMinutes");
  }
  if (!(capacity >= 1 && capacity <= MAX_APPOINTMENT_CAPACITY)) {
    fields.push("capacity");
  }
  if (fields.length > 0) return { ok: false, code: "VALIDATION_ERROR", fields };
  const values = { slotMinutes, capacity, isExample: false };
  const { organizationId, userId } = context;
  const write = (tx: DbTransaction) =>
    writeSettings(tx, organizationId, userId, values);
  const first = await repository.withTransaction(write);
  // Otro las creó a la vez: ahora existen, y se editan.
  return first === "taken"
    ? (repository.withTransaction(write) as Promise<AppointmentSettingsResult>)
    : first;
}

async function writeSettings(
  tx: DbTransaction,
  organizationId: string,
  userId: string,
  values: repository.SettingsValues,
): Promise<AppointmentSettingsResult | "taken"> {
  const current = await repository.findAppointmentSettings(organizationId, tx, {
    forUpdate: true,
  });
  if (!current) {
    const id = await repository.insertAppointmentSettings(
      tx,
      organizationId,
      values,
    );
    if (id === "taken") return "taken";
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "appointment_settings",
      entityId: id,
      action: "create",
      diff: { before: null, after: values },
    });
    return { ok: true, changed: true };
  }
  const before: Record<string, number | boolean> = {};
  const after: Record<string, number | boolean> = {};
  for (const key of ["slotMinutes", "capacity", "isExample"] as const) {
    if (current[key] !== values[key]) {
      before[key] = current[key];
      after[key] = values[key];
    }
  }
  if (Object.keys(after).length === 0) return { ok: true, changed: false };
  await repository.updateAppointmentSettings(tx, organizationId, values);
  await recordAudit(tx, {
    organizationId,
    actorUserId: userId,
    entityType: "appointment_settings",
    entityId: current.id,
    action: "update",
    diff: { before, after },
  });
  return { ok: true, changed: true };
}

// Los motivos.

export type AppointmentReason = repository.ReasonRow;

// Los de la organización, activos e inactivos, en su orden. Solo admin: es la configuración.
export async function listAppointmentReasons(
  context: AuthContext,
): Promise<
  | { ok: true; reasons: AppointmentReason[] }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireAppointments(context, "admin");
  if (!allowed.ok) return allowed;
  return {
    ok: true,
    reasons: await repository.findReasons(context.organizationId),
  };
}

export type ReasonWriteResult =
  | { ok: true; reasonId: string; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: ["name"] }>
  | Failure<"CONFLICT", { field: "name" }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "reasons_full" }>;

const nameSchema = z.string().trim().min(1).max(REASON_NAME_MAX_LENGTH);

const nameTaken: ReasonWriteResult = {
  ok: false,
  code: "CONFLICT",
  field: "name",
};

const invalidName: ReasonWriteResult = {
  ok: false,
  code: "VALIDATION_ERROR",
  fields: ["name"],
};

function auditReason(
  context: AuthContext,
  reasonId: string,
  action: "create" | "update" | "deactivate" | "reactivate",
  before: Record<string, string | number | boolean> | null,
  after: Record<string, string | number | boolean>,
) {
  return {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    entityType: "appointment_reason" as const,
    entityId: reasonId,
    action,
    diff: { before, after },
  };
}

// Un motivo nuevo va al final de la lista.
export async function createAppointmentReason(
  context: AuthContext,
  input: { name: string },
): Promise<ReasonWriteResult> {
  const allowed = await requireAppointments(context, "admin");
  if (!allowed.ok) return allowed;
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return invalidName;
  const { organizationId } = context;
  return repository.withTransaction(async (tx): Promise<ReasonWriteResult> => {
    // La lista FOR UPDATE: dos altas a la vez no toman la misma posición.
    const existing = await repository.findReasons(organizationId, tx, {
      lock: "update",
    });
    if (existing.length >= MAX_APPOINTMENT_REASONS) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "reasons_full",
      };
    }
    const values = {
      name: name.data,
      position:
        existing.reduce((max, item) => Math.max(max, item.position), -1) + 1,
      isActive: true,
    };
    const reasonId = await repository.insertReason(tx, organizationId, {
      ...values,
      isExample: false,
    });
    if (reasonId === "name_taken") return nameTaken;
    await recordAudit(
      tx,
      auditReason(context, reasonId, "create", null, values),
    );
    return { ok: true, reasonId, changed: true };
  });
}

export async function renameAppointmentReason(
  context: AuthContext,
  reasonId: string,
  input: { name: string },
): Promise<ReasonWriteResult> {
  const allowed = await requireAppointments(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(reasonId).success) return failure("VALIDATION_ERROR");
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return invalidName;
  const { organizationId } = context;
  return repository.withTransaction(async (tx): Promise<ReasonWriteResult> => {
    const current = await repository.findReason(
      organizationId,
      reasonId.toLowerCase(),
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");
    if (current.name === name.data) {
      return { ok: true, reasonId: current.id, changed: false };
    }
    const written = await repository.updateReason(
      tx,
      organizationId,
      current.id,
      {
        name: name.data,
      },
    );
    if (written === "name_taken") return nameTaken;
    await recordAudit(
      tx,
      auditReason(
        context,
        current.id,
        "update",
        { name: current.name },
        { name: name.data },
      ),
    );
    return { ok: true, reasonId: current.id, changed: true };
  });
}

// Desactivar un motivo lo saca de los turnos nuevos; los que lo tienen lo conservan.
export async function setAppointmentReasonActive(
  context: AuthContext,
  reasonId: string,
  isActive: boolean,
): Promise<ReasonWriteResult> {
  const allowed = await requireAppointments(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(reasonId).success) return failure("VALIDATION_ERROR");
  const { organizationId } = context;
  return repository.withTransaction(async (tx): Promise<ReasonWriteResult> => {
    const current = await repository.findReason(
      organizationId,
      reasonId.toLowerCase(),
      tx,
      { forUpdate: true },
    );
    if (!current) return failure("NOT_FOUND");
    if (current.isActive === isActive) {
      return { ok: true, reasonId: current.id, changed: false };
    }
    await repository.updateReason(tx, organizationId, current.id, { isActive });
    await recordAudit(
      tx,
      auditReason(
        context,
        current.id,
        isActive ? "reactivate" : "deactivate",
        { isActive: current.isActive },
        { isActive },
      ),
    );
    return { ok: true, reasonId: current.id, changed: true };
  });
}

export type MoveDirection = "up" | "down";

// Sube o baja un motivo un lugar, con el molde del checklist: la lista se renumera de 0 en adelante, y
// cada motivo cuya posición guardada cambia queda auditado.
export async function moveAppointmentReason(
  context: AuthContext,
  reasonId: string,
  direction: MoveDirection,
): Promise<ReasonWriteResult> {
  const allowed = await requireAppointments(context, "admin");
  if (!allowed.ok) return allowed;
  if (
    !idSchema.safeParse(reasonId).success ||
    (direction !== "up" && direction !== "down")
  ) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const id = reasonId.toLowerCase();
  return repository.withTransaction(async (tx): Promise<ReasonWriteResult> => {
    const reasons = await repository.findReasons(organizationId, tx, {
      lock: "update",
    });
    const index = reasons.findIndex((reason) => reason.id === id);
    if (index < 0) return failure("NOT_FOUND");
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= reasons.length) {
      return { ok: true, reasonId: id, changed: false };
    }
    const order = reasons.map((reason) => reason.id);
    [order[index], order[target]] = [order[target]!, order[index]!];
    for (const [position, otherId] of order.entries()) {
      const reason = reasons.find((candidate) => candidate.id === otherId)!;
      if (reason.position !== position) {
        await repository.updateReason(tx, organizationId, otherId, {
          position,
        });
        await recordAudit(
          tx,
          auditReason(
            context,
            otherId,
            "update",
            { position: reason.position },
            { position },
          ),
        );
      }
    }
    return { ok: true, reasonId: id, changed: true };
  });
}

// La copia del perfil (ADR 0024, punto 13; D-1 y U-3). La llama solo el script de capacidades, con el
// admin que nombró, dentro de su transacción: no autoriza nada. Crea los valores si faltan, de ejemplo,
// y los motivos que la organización no tiene, por nombre. tests/guards/capability-reads.test.ts fija
// que nada de src/ fuera de appointments la nombra.
export async function applyAppointmentsTemplate(
  tx: DbTransaction,
  input: {
    organizationId: string;
    actorUserId: string;
    slotMinutes: number;
    capacity: number;
    reasons: readonly string[];
  },
): Promise<{ settingsCreated: boolean; created: string[]; skipped: string[] }> {
  const { organizationId, actorUserId } = input;
  let settingsCreated = false;
  const current = await repository.findAppointmentSettings(organizationId, tx, {
    forUpdate: true,
  });
  if (!current) {
    const values = {
      slotMinutes: input.slotMinutes,
      capacity: input.capacity,
      isExample: true,
    };
    const id = await repository.insertAppointmentSettings(
      tx,
      organizationId,
      values,
    );
    if (id === "taken") {
      throw new Error("Los valores de los turnos se crearon a la vez.");
    }
    await recordAudit(tx, {
      organizationId,
      actorUserId,
      entityType: "appointment_settings",
      entityId: id,
      action: "create",
      diff: { before: null, after: { ...values, origen: "perfil" } },
    });
    settingsCreated = true;
  }
  const existing = await repository.findReasons(organizationId, tx, {
    lock: "update",
  });
  const names = new Set(existing.map((reason) => reason.name.toLowerCase()));
  let position =
    existing.reduce((max, reason) => Math.max(max, reason.position), -1) + 1;
  const created: string[] = [];
  const skipped: string[] = [];
  for (const name of input.reasons) {
    if (names.has(name.toLowerCase())) {
      skipped.push(name);
      continue;
    }
    const values = {
      name,
      position: position++,
      isActive: true,
      isExample: true,
    };
    const reasonId = await repository.insertReason(tx, organizationId, values);
    if (reasonId === "name_taken") {
      throw new Error(`motivo repetido en la plantilla: ${name}`);
    }
    await recordAudit(tx, {
      organizationId,
      actorUserId,
      entityType: "appointment_reason",
      entityId: reasonId,
      action: "create",
      diff: { before: null, after: { ...values, origen: "perfil" } },
    });
    names.add(name.toLowerCase());
    created.push(name);
  }
  return { settingsCreated, created, skipped };
}
