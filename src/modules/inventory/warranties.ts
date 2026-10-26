import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import { getProductsByIds } from "@/modules/catalog";
import {
  authorize,
  getOrganizationTimezone,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";
import { MAX_WARRANTY_DAYS, UNIT_SERIAL_PATTERN } from "./schema";
import * as unitRepository from "./unit-repository";
import { deriveWarranty, type Warranty } from "./warranty";
import * as warrantyRepository from "./warranty-repository";

// La garantía de una unidad vendida (ADR 0024, punto 11; brief-29.9): los días de la organización
// (unit_settings, de serialized_units), los propios de una unidad y la garantía derivada. No se guarda:
// se calcula al leer, con deriveWarranty. Cada escritura se audita.

export { MAX_WARRANTY_DAYS };

async function allowed(context: AuthContext): Promise<boolean> {
  return hasCapability(context.organizationId, "serialized_units");
}

const idSchema = z.uuid();

// Un entero de 0 a MAX_WARRANTY_DAYS, sin signo ni decimales.
const daysSchema = z
  .string()
  .trim()
  .regex(/^\d{1,4}$/)
  .transform(Number)
  .pipe(z.number().int().min(0).max(MAX_WARRANTY_DAYS));

export type WarrantySettings = { warrantyDays: number; isExample: boolean };

// Los días de la organización, para la pantalla de un admin. null si todavía no tiene fila.
export async function getUnitWarrantySettings(
  context: AuthContext,
): Promise<
  | { ok: true; settings: WarrantySettings | null }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const row = await warrantyRepository.findUnitSettings(context.organizationId);
  return {
    ok: true,
    settings: row
      ? { warrantyDays: row.warrantyDays, isExample: row.isExample }
      : null,
  };
}

export type WarrantySettingsResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | Failure<"VALIDATION_ERROR", { fields: ["warrantyDays"] }>;

// Guardar apaga la marca de ejemplo, también sin cambiar los días, como trade_in_settings.
export async function saveUnitWarrantySettings(
  context: AuthContext,
  input: { warrantyDays: string },
): Promise<WarrantySettingsResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const parsed = daysSchema.safeParse(input.warrantyDays);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["warrantyDays"] };
  }
  const values = { warrantyDays: parsed.data, isExample: false };
  const { organizationId, userId } = context;
  const write = (tx: DbTransaction) =>
    writeSettings(tx, organizationId, userId, values);
  const first = await repository.withTransaction(write);
  // Otro las creó a la vez: ahora existen, y se editan.
  return first === "taken"
    ? (repository.withTransaction(write) as Promise<WarrantySettingsResult>)
    : first;
}

async function writeSettings(
  tx: DbTransaction,
  organizationId: string,
  userId: string,
  values: warrantyRepository.UnitSettingsValues,
): Promise<WarrantySettingsResult | "taken"> {
  const current = await warrantyRepository.findUnitSettings(
    organizationId,
    tx,
    { forUpdate: true },
  );
  if (!current) {
    const id = await warrantyRepository.insertUnitSettings(
      tx,
      organizationId,
      values,
    );
    if (id === "taken") return "taken";
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "unit_settings",
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
  await warrantyRepository.updateUnitSettings(tx, organizationId, values);
  await recordAudit(tx, {
    organizationId,
    actorUserId: userId,
    entityType: "unit_settings",
    entityId: current.id,
    action: "update",
    diff: { before, after },
  });
  return { ok: true, changed: true };
}

// La copia del perfil (D-1): la llama solo el script de capacidades, dentro de su transacción
// (tests/guards/capability-reads.test.ts). Crea la fila si falta, de ejemplo; si existe, no la toca.
export async function applyUnitSettingsTemplate(
  tx: DbTransaction,
  input: { organizationId: string; actorUserId: string; warrantyDays: number },
): Promise<{ created: boolean }> {
  const { organizationId, actorUserId, warrantyDays } = input;
  const current = await warrantyRepository.findUnitSettings(
    organizationId,
    tx,
    { forUpdate: true },
  );
  if (current) return { created: false };
  const values = { warrantyDays, isExample: true };
  const id = await warrantyRepository.insertUnitSettings(
    tx,
    organizationId,
    values,
  );
  if (id === "taken") {
    throw new Error("Los días de garantía se crearon a la vez.");
  }
  await recordAudit(tx, {
    organizationId,
    actorUserId,
    entityType: "unit_settings",
    entityId: id,
    action: "create",
    diff: { before: null, after: { ...values, origen: "perfil" } },
  });
  return { created: true };
}

export type UnitWarrantyDaysResult =
  | { ok: true; changed: boolean; productId: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | Failure<"VALIDATION_ERROR", { fields: ["warrantyDays"] }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "unit_written_off" }>;

// Los días propios de una unidad (D-1). Vacío, los de la organización. En cualquier estado salvo dada
// de baja: también vendida, para una garantía extendida que se acordó al vender.
export async function setUnitWarrantyDays(
  context: AuthContext,
  unitId: string,
  input: { warrantyDays: string },
): Promise<UnitWarrantyDaysResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(unitId).success) return failure("NOT_FOUND");
  if (!(await allowed(context))) return failure("NOT_FOUND");
  let warrantyDays: number | null = null;
  if (input.warrantyDays.trim() !== "") {
    const parsed = daysSchema.safeParse(input.warrantyDays);
    if (!parsed.success) {
      return { ok: false, code: "VALIDATION_ERROR", fields: ["warrantyDays"] };
    }
    warrantyDays = parsed.data;
  }
  const { organizationId, userId } = context;
  return repository.withTransaction(
    async (tx): Promise<UnitWarrantyDaysResult> => {
      const [locked] = await unitRepository.lockUnits(tx, organizationId, [
        unitId.toLowerCase(),
      ]);
      if (!locked) return failure("NOT_FOUND");
      if (locked.status === "written_off") {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "unit_written_off",
        };
      }
      const current = (await unitRepository.findUnit(
        organizationId,
        locked.id,
        tx,
      ))!;
      if (current.warrantyDays === warrantyDays) {
        return { ok: true, changed: false, productId: current.productId };
      }
      await unitRepository.updateUnitWarrantyDays(
        tx,
        organizationId,
        locked.id,
        warrantyDays,
      );
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "stock_unit",
        entityId: locked.id,
        action: "update",
        diff: {
          before: { warranty_days: current.warrantyDays },
          after: { warranty_days: warrantyDays },
        },
      });
      return { ok: true, changed: true, productId: current.productId };
    },
  );
}

export type WarrantyUnit = {
  id: string;
  productId: string;
  productName: string;
  serial: string;
  status: unitRepository.StockUnitStatus;
  // Solo de una unidad vendida; null en cualquier otro estado.
  warranty: Warranty | null;
};

function toWarrantyUnit(
  row: warrantyRepository.WarrantyUnitRow,
  productName: string,
  settings: warrantyRepository.UnitSettingsRow | undefined,
  timezone: string,
  now: Date,
): WarrantyUnit {
  let warranty: Warranty | null = null;
  if (row.status === "sold") {
    if (row.returned) warranty = { status: "returned" };
    // Una unidad sold siempre salió con un movimiento: sin él, el dato está roto y no hay inicio. No se
    // inventa uno ni se tira la página de la unidad o del cliente: queda sin garantía que mostrar.
    else if (row.soldAt !== null) {
      warranty = deriveWarranty({
        startedAt: row.soldAt,
        days: row.warrantyDays ?? settings?.warrantyDays ?? null,
        source: row.warrantyDays !== null ? "unit" : "settings",
        timezone,
        now,
      });
    }
  }
  return {
    id: row.id,
    productId: row.productId,
    productName,
    serial: row.serial,
    status: row.status,
    warranty,
  };
}

async function withWarranties(
  context: AuthContext,
  rows: warrantyRepository.WarrantyUnitRow[],
  now: Date,
): Promise<WarrantyUnit[]> {
  if (rows.length === 0) return [];
  const [settings, timezone, products] = await Promise.all([
    warrantyRepository.findUnitSettings(context.organizationId),
    getOrganizationTimezone(context),
    getProductsByIds(
      context,
      rows.map((row) => row.productId),
    ),
  ]);
  // El nombre lo da catalog: inventory no lee sus tablas (Overview).
  const names = new Map(
    products.ok
      ? products.products.map((product) => [product.id, product.name])
      : [],
  );
  return rows.map((row) =>
    toWarrantyUnit(
      row,
      names.get(row.productId) ?? "",
      settings,
      timezone,
      now,
    ),
  );
}

export type WarrantyUnitsResult =
  { ok: true; units: WarrantyUnit[] } | Failure<"FORBIDDEN" | "NOT_FOUND">;

// La garantía de unas unidades, para la ficha de un producto y la de un cliente (D-3). Los dos roles:
// es un dato de la venta, no un costo. Ids que no son de la organización no aparecen.
export async function getUnitWarranties(
  context: AuthContext,
  unitIds: string[],
  now: Date = new Date(),
): Promise<WarrantyUnitsResult> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const ids = unitIds.filter((id) => idSchema.safeParse(id).success);
  const rows = await warrantyRepository.findWarrantyUnitsByIds(
    context.organizationId,
    ids,
  );
  return { ok: true, units: await withWarranties(context, rows, now) };
}

// Todas las unidades con un IMEI, para la búsqueda (U-3). Un IMEI que no tiene la forma de uno no
// encuentra nada, sin error: la búsqueda recibe cualquier texto.
export async function findUnitsBySerial(
  context: AuthContext,
  serial: string,
  now: Date = new Date(),
): Promise<WarrantyUnitsResult> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!(await allowed(context))) return failure("NOT_FOUND");
  const trimmed = serial.trim();
  if (!new RegExp(UNIT_SERIAL_PATTERN).test(trimmed)) {
    return { ok: true, units: [] };
  }
  const rows = await warrantyRepository.findWarrantyUnitsBySerial(
    context.organizationId,
    trimmed,
  );
  return { ok: true, units: await withWarranties(context, rows, now) };
}
