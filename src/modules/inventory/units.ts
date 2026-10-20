import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import {
  getProduct,
  lockProductForStockChange,
  lockProductForTrackingChange,
  STOCK_TRACKINGS,
  writeProductTracking,
  type StockTracking,
} from "@/modules/catalog";
import {
  authorize,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import { failure, type Failure } from "@/shared/errors";
import {
  currencyDecimals,
  moneyToDatabase,
  parseMoneyInput,
} from "@/shared/money";
import { quantityFromDatabase, quantityToDatabase } from "@/shared/quantity";
import * as repository from "./repository";
import { UNIT_SERIAL_PATTERN } from "./schema";
import { computeBalanceAfter, type BalanceRule } from "./service";
import * as unitRepository from "./unit-repository";

// Las unidades fuera de pedidos y ventas (ADR 0024, punto 6; brief-29.5, D-3, D-4 y D-6): el cambio
// del seguimiento de un producto, el alta y la baja manual de una unidad, la corrección de su grado o
// su batería, y sus lecturas. Las escrituras son de un admin con la capacidad serialized_units; las
// lecturas, de los dos roles, y el costo solo lo ve un admin (FR-PROD-21).
//
// El orden de bloqueo (ADR 0024, punto 16; D-4): el producto FOR SHARE, la unidad FOR UPDATE, el saldo
// FOR UPDATE y los inserts. El cambio del seguimiento toma el producto FOR UPDATE.

const idSchema = z.uuid();
const serialPattern = new RegExp(UNIT_SERIAL_PATTERN);

// El IMEI o número de serie como lo escribió quien carga: se recorta; null si no tiene la forma.
export function parseUnitSerial(text: string): string | null {
  const value = text.trim();
  return serialPattern.test(value) ? value : null;
}

// Varios IMEI de un campo de texto, uno por renglón o separados por espacios, comas o punto y coma.
// Los vacíos no cuentan.
export function splitUnitSerials(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((serial) => serial.trim())
    .filter((serial) => serial !== "");
}

const ONE = 1000n;

async function serializedUnits(context: AuthContext): Promise<boolean> {
  return hasCapability(context.organizationId, "serialized_units");
}

// El seguimiento del stock de un producto (D-3). Pasar a «por unidad» exige la capacidad, y el cambio,
// en cualquier sentido, exige que el producto no tenga movimientos: sin ellos tampoco tiene saldo ni
// unidades. inventory comprueba y catalog escribe, en esta transacción.

export type ChangeTrackingResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "capability_required" | "has_movements" }
    >;

const trackingSchema = z.enum(STOCK_TRACKINGS);

export async function changeProductTracking(
  context: AuthContext,
  productId: string,
  tracking: string,
): Promise<ChangeTrackingResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const parsed = trackingSchema.safeParse(tracking);
  if (!idSchema.safeParse(productId).success || !parsed.success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId, userId } = context;
  if (parsed.data === "unit" && !(await serializedUnits(context))) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "capability_required",
    };
  }
  return repository.withTransaction(
    async (tx): Promise<ChangeTrackingResult> => {
      const product = await lockProductForTrackingChange(
        tx,
        organizationId,
        productId,
      );
      if (!product) return failure("NOT_FOUND");
      if (product.tracking === parsed.data) return { ok: true, changed: false };
      if (await repository.hasMovements(organizationId, productId, tx)) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "has_movements",
        };
      }
      await writeProductTracking(tx, organizationId, productId, parsed.data);
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "product",
        entityId: productId,
        action: "update",
        diff: {
          before: { tracking: product.tracking },
          after: { tracking: parsed.data },
        },
      });
      return { ok: true, changed: true };
    },
  );
}

// El alta manual de una unidad (D-4): se crea available, con su IMEI, su costo, su grado y su batería,
// y sube el saldo en 1 con un movimiento adjustment_positive que la nombra.

export type UnitInput = {
  serial: string;
  cost: string;
  currency: string;
  // Vacío: sin grado.
  gradeId: string;
  // Vacío: sin dato. De 0 a 100.
  batteryHealth: string;
};

export type UnitField = keyof UnitInput;

const UNIT_FIELDS: UnitField[] = [
  "serial",
  "cost",
  "currency",
  "gradeId",
  "batteryHealth",
];

type UnitValues = {
  serial: string;
  cost: string;
  currency: string;
  gradeId: string | null;
  batteryHealth: number | null;
};

const optionalId = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .refine((value) => value === "" || idSchema.safeParse(value).success)
  .transform((value) => (value === "" ? null : value));

const optionalBattery = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{1,3}$/.test(value))
  .transform((value) => (value === "" ? null : Number(value)))
  .refine((value) => value === null || value <= 100);

function validateDetails(input: { gradeId: string; batteryHealth: string }) {
  const fields: UnitField[] = [];
  const grade = optionalId.safeParse(input.gradeId);
  if (!grade.success) fields.push("gradeId");
  const battery = optionalBattery.safeParse(input.batteryHealth);
  if (!battery.success) fields.push("batteryHealth");
  return {
    fields,
    gradeId: grade.success ? grade.data : null,
    batteryHealth: battery.success ? battery.data : null,
  };
}

export function validateUnitInput(
  input: UnitInput,
):
  | { ok: true; values: UnitValues }
  | Failure<"VALIDATION_ERROR", { fields: UnitField[] }> {
  const fields = new Set<UnitField>();
  const serial = parseUnitSerial(input.serial);
  if (serial === null) fields.add("serial");
  const currency = input.currency.trim();
  const decimals = currencyDecimals(currency);
  let cost: string | null = null;
  if (!decimals.ok) {
    fields.add("currency");
  } else {
    const amount = parseMoneyInput(input.cost, decimals.decimals);
    if (amount.ok) cost = moneyToDatabase(amount.amount);
    else fields.add("cost");
  }
  const details = validateDetails(input);
  for (const field of details.fields) fields.add(field);
  if (fields.size > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: UNIT_FIELDS.filter((field) => fields.has(field)),
    };
  }
  return {
    ok: true,
    values: {
      serial: serial!,
      cost: cost!,
      currency,
      gradeId: details.gradeId,
      batteryHealth: details.batteryHealth,
    },
  };
}

export type UnitBalanceRejection = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: BalanceRule }
>;

export type RegisterUnitResult =
  | { ok: true; unitId: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: UnitField[] }>
  | Failure<"CONFLICT", { field: "serial" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "inactive_product" | "not_unit_tracked" }
    >
  | UnitBalanceRejection;

type RegisterRejection = Exclude<RegisterUnitResult, { ok: true }>;

// Un rechazo con el saldo tomado se lanza, para revertir la transacción entera: también la fila en 0
// que pudo crear lockBalance (convención de la 19.3).
class UnitRejected extends Error {
  constructor(readonly result: RegisterRejection | WriteOffRejection) {
    super(result.code);
    this.name = "UnitRejected";
  }
}

async function checkGrade(
  organizationId: string,
  gradeId: string | null,
  executor?: Parameters<typeof unitRepository.findGrade>[2],
): Promise<boolean> {
  if (gradeId === null) return true;
  const grade = await unitRepository.findGrade(
    organizationId,
    gradeId,
    executor,
  );
  return grade?.isActive === true;
}

export async function registerUnit(
  context: AuthContext,
  productId: string,
  input: UnitInput,
): Promise<RegisterUnitResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(productId).success) {
    return failure("VALIDATION_ERROR");
  }
  if (!(await serializedUnits(context))) return failure("NOT_FOUND");
  const validated = validateUnitInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  const { organizationId, userId } = context;

  try {
    return await repository.withTransaction(async (tx) => {
      const product = await lockProductForStockChange(
        tx,
        organizationId,
        productId,
      );
      if (product === "not_found") throw new UnitRejected(failure("NOT_FOUND"));
      if (product.status === "inactive") {
        throw new UnitRejected({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "inactive_product",
        });
      }
      if (product.tracking !== "unit") {
        throw new UnitRejected({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "not_unit_tracked",
        });
      }
      if (!(await checkGrade(organizationId, values.gradeId, tx))) {
        throw new UnitRejected({
          ok: false,
          code: "VALIDATION_ERROR",
          fields: ["gradeId"],
        });
      }
      const taken = await unitRepository.findTakenSerials(tx, organizationId, [
        values.serial,
      ]);
      if (taken.length > 0) {
        throw new UnitRejected({
          ok: false,
          code: "CONFLICT",
          field: "serial",
        });
      }
      const balance = await repository.lockBalance(
        tx,
        organizationId,
        productId,
      );
      const computed = computeBalanceAfter(
        quantityFromDatabase(balance.onHand),
        "adjustment_positive",
        ONE,
        quantityFromDatabase(balance.reserved),
      );
      if (!computed.ok) {
        throw new UnitRejected({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: computed.rule,
        });
      }
      const unitId = await unitRepository.insertStockUnit(tx, {
        organizationId,
        productId,
        serial: values.serial,
        gradeId: values.gradeId,
        batteryHealth: values.batteryHealth,
        cost: values.cost,
        costCurrency: values.currency,
        originType: "manual",
        originId: null,
        createdBy: userId,
      });
      await repository.applyStockChange(tx, {
        organizationId,
        productId,
        type: "adjustment_positive",
        quantity: quantityToDatabase(ONE),
        balanceAfter: quantityToDatabase(computed.balanceAfter),
        reason: "Alta manual de una unidad",
        createdBy: userId,
        unitId,
      });
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "stock_unit",
        entityId: unitId,
        action: "create",
        diff: {
          before: null,
          after: {
            product_id: productId,
            serial: values.serial,
            status: "available",
            cost: values.cost,
            cost_currency: values.currency,
            grade_id: values.gradeId,
            battery_health: values.batteryHealth,
            origin: "manual",
          },
        },
      });
      return { ok: true as const, unitId };
    });
  } catch (error) {
    if (error instanceof UnitRejected) {
      return error.result as RegisterRejection;
    }
    // Dos altas simultáneas del mismo IMEI: la segunda choca en el índice único parcial (AC-4).
    if (unitRepository.isSerialTaken(error)) {
      return { ok: false, code: "CONFLICT", field: "serial" };
    }
    throw error;
  }
}

// La baja manual de una unidad (D-4): available -> written_off, con su motivo, y baja el saldo en 1
// con un movimiento adjustment_negative que la nombra. No mira si el producto está activo: lo que
// entró tiene que poder salir. Un IMEI mal cargado se corrige con la baja y un alta nueva.

export const WRITE_OFF_REASON_MAX_LENGTH = 500;

export type WriteOffUnitResult =
  | { ok: true; productId: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: ["reason"] }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "unit_not_available" }>
  | UnitBalanceRejection;

type WriteOffRejection = Exclude<WriteOffUnitResult, { ok: true }>;

const reasonSchema = z.string().trim().min(1).max(WRITE_OFF_REASON_MAX_LENGTH);

export async function writeOffUnit(
  context: AuthContext,
  unitId: string,
  reason: string,
): Promise<WriteOffUnitResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(unitId).success) return failure("VALIDATION_ERROR");
  if (!(await serializedUnits(context))) return failure("NOT_FOUND");
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["reason"] };
  }
  const { organizationId, userId } = context;
  // El producto de la unidad no cambia nunca (trigger): se lee sin bloqueo, para bloquear en orden.
  const unit = await unitRepository.findUnit(
    organizationId,
    unitId.toLowerCase(),
  );
  if (!unit) return failure("NOT_FOUND");

  try {
    return await repository.withTransaction(async (tx) => {
      const product = await lockProductForStockChange(
        tx,
        organizationId,
        unit.productId,
      );
      if (product === "not_found") {
        throw new Error("el producto de la unidad no existe");
      }
      const [locked] = await unitRepository.lockUnits(tx, organizationId, [
        unit.id,
      ]);
      if (locked?.status !== "available") {
        throw new UnitRejected({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "unit_not_available",
        });
      }
      const balance = await repository.lockBalance(
        tx,
        organizationId,
        unit.productId,
      );
      const computed = computeBalanceAfter(
        quantityFromDatabase(balance.onHand),
        "adjustment_negative",
        ONE,
        quantityFromDatabase(balance.reserved),
      );
      if (!computed.ok) {
        throw new UnitRejected({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: computed.rule,
        });
      }
      await unitRepository.setUnitsWrittenOff(tx, organizationId, [unit.id]);
      await repository.applyStockChange(tx, {
        organizationId,
        productId: unit.productId,
        type: "adjustment_negative",
        quantity: quantityToDatabase(ONE),
        balanceAfter: quantityToDatabase(computed.balanceAfter),
        reason: parsedReason.data,
        createdBy: userId,
        unitId: unit.id,
      });
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "stock_unit",
        entityId: unit.id,
        action: "status_change",
        diff: {
          before: { status: "available", reason: null },
          after: { status: "written_off", reason: parsedReason.data },
        },
      });
      return { ok: true as const, productId: unit.productId };
    });
  } catch (error) {
    if (error instanceof UnitRejected) {
      return error.result as WriteOffRejection;
    }
    throw error;
  }
}

// La corrección del grado o la batería de una unidad disponible (D-4), con auditoría. El costo no se
// corrige en la 29.5, y el IMEI no se edita nunca. No toca el saldo: solo bloquea la unidad.

export type CorrectUnitResult =
  | { ok: true; changed: boolean; productId: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: UnitField[] }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "unit_not_available" }>;

export async function correctUnit(
  context: AuthContext,
  unitId: string,
  input: { gradeId: string; batteryHealth: string },
): Promise<CorrectUnitResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(unitId).success) return failure("VALIDATION_ERROR");
  if (!(await serializedUnits(context))) return failure("NOT_FOUND");
  const details = validateDetails(input);
  if (details.fields.length > 0) {
    return { ok: false, code: "VALIDATION_ERROR", fields: details.fields };
  }
  const { organizationId, userId } = context;
  return repository.withTransaction(async (tx): Promise<CorrectUnitResult> => {
    const [locked] = await unitRepository.lockUnits(tx, organizationId, [
      unitId.toLowerCase(),
    ]);
    if (!locked) return failure("NOT_FOUND");
    if (locked.status !== "available") {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_not_available",
      };
    }
    const current = (await unitRepository.findUnit(
      organizationId,
      locked.id,
      tx,
    ))!;
    if (
      details.gradeId !== current.gradeId &&
      !(await checkGrade(organizationId, details.gradeId, tx))
    ) {
      return { ok: false, code: "VALIDATION_ERROR", fields: ["gradeId"] };
    }
    const before: Record<string, string | number | null> = {};
    const after: Record<string, string | number | null> = {};
    if (details.gradeId !== current.gradeId) {
      before.grade_id = current.gradeId;
      after.grade_id = details.gradeId;
    }
    if (details.batteryHealth !== current.batteryHealth) {
      before.battery_health = current.batteryHealth;
      after.battery_health = details.batteryHealth;
    }
    if (Object.keys(after).length === 0) {
      return { ok: true, changed: false, productId: current.productId };
    }
    await unitRepository.updateUnitDetails(tx, organizationId, locked.id, {
      gradeId: details.gradeId,
      batteryHealth: details.batteryHealth,
    });
    await recordAudit(tx, {
      organizationId,
      actorUserId: userId,
      entityType: "stock_unit",
      entityId: locked.id,
      action: "update",
      diff: { before, after },
    });
    return { ok: true, changed: true, productId: current.productId };
  });
}

// Las unidades de un producto, para su ficha (D-6). Los dos roles; el costo, solo un admin
// (FR-PROD-21). getProduct resuelve la autorización, el id y la organización.

export type UnitStatus = unitRepository.StockUnitStatus;

export type ProductUnit = {
  id: string;
  serial: string;
  status: UnitStatus;
  grade: { id: string; name: string } | null;
  batteryHealth: number | null;
  // null para un viewer.
  cost: { amount: string; currency: string } | null;
  origin: unitRepository.StockUnitOrigin;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductUnitsResult =
  | { ok: true; tracking: StockTracking; units: ProductUnit[] }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

function toProductUnit(
  row: unitRepository.StockUnitRow,
  withCost: boolean,
): ProductUnit {
  return {
    id: row.id,
    serial: row.serial,
    status: row.status,
    grade:
      row.gradeId && row.gradeName
        ? { id: row.gradeId, name: row.gradeName }
        : null,
    batteryHealth: row.batteryHealth,
    cost: withCost ? { amount: row.cost, currency: row.costCurrency } : null,
    origin: row.originType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listProductUnits(
  context: AuthContext,
  productId: string,
): Promise<ProductUnitsResult> {
  const found = await getProduct(context, productId);
  if (!found.ok) return found;
  const rows = await unitRepository.findUnitsOfProduct(
    context.organizationId,
    found.product.id,
  );
  const withCost = context.role === "admin";
  return {
    ok: true,
    tracking: found.product.tracking,
    units: rows.map((row) => toProductUnit(row, withCost)),
  };
}

// Una unidad, para la página de su baja o su corrección. Los dos roles, como la ficha.
export async function getUnit(
  context: AuthContext,
  unitId: string,
): Promise<
  | { ok: true; unit: ProductUnit & { productId: string } }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(unitId).success) return failure("VALIDATION_ERROR");
  const row = await unitRepository.findUnit(
    context.organizationId,
    unitId.toLowerCase(),
  );
  if (!row) return failure("NOT_FOUND");
  return {
    ok: true,
    unit: {
      ...toProductUnit(row, context.role === "admin"),
      productId: row.productId,
    },
  };
}

// Los IMEI de unas unidades, para el detalle de una recepción (purchasing ya autorizó). Una unidad de
// otra organización no vuelve.
export async function getUnitSerials(
  organizationId: string,
  unitIds: string[],
): Promise<Map<string, string>> {
  const rows = await unitRepository.findUnitsByIds(organizationId, unitIds);
  return new Map(rows.map((row) => [row.id, row.serial]));
}
