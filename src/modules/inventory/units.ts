import { z } from "zod";
import {
  AUDIT_PAGE_SIZE,
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
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
  getMemberSummaries,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  currencyDecimals,
  divideRoundingHalfAwayFromZero,
  moneyFromDatabase,
  moneyToDatabase,
  parseMoneyInput,
  type Money,
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
      // service_product, desde la 29.6: el producto de servicio se lleva por cantidad (brief-29.6, D-5).
      { rule: "capability_required" | "has_movements" | "service_product" }
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
      if (product.isService) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "service_product",
        };
      }
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
  // El precio propio y su moneda, desde la 29.5.2 (brief-29.5.2, D-2): los dos vacíos, sin precio
  // propio; la unidad vale el precio del producto.
  price?: string;
  priceCurrency?: string;
};

export type UnitField = keyof UnitInput;

const UNIT_FIELDS: UnitField[] = [
  "serial",
  "cost",
  "currency",
  "gradeId",
  "batteryHealth",
  "price",
  "priceCurrency",
];

export type UnitPrice = { amount: string; currency: string };

type UnitValues = {
  serial: string;
  cost: string;
  currency: string;
  gradeId: string | null;
  batteryHealth: number | null;
  price: UnitPrice | null;
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

export type UnitDetailsInput = {
  gradeId: string;
  batteryHealth: string;
  price?: string;
  priceCurrency?: string;
};

// El precio propio: los dos campos vacíos, ninguno; si no, un monto mayor que cero en una moneda que se
// acepta, con sus decimales.
function validatePrice(input: { price?: string; priceCurrency?: string }): {
  fields: UnitField[];
  price: UnitPrice | null;
} {
  const amount = (input.price ?? "").trim();
  const currency = (input.priceCurrency ?? "").trim().toUpperCase();
  if (amount === "" && currency === "") return { fields: [], price: null };
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) return { fields: ["priceCurrency"], price: null };
  const parsed = parseMoneyInput(amount, decimals.decimals);
  if (!parsed.ok) return { fields: ["price"], price: null };
  return {
    fields: [],
    price: { amount: moneyToDatabase(parsed.amount), currency },
  };
}

function validateDetails(input: UnitDetailsInput) {
  const fields: UnitField[] = [];
  const grade = optionalId.safeParse(input.gradeId);
  if (!grade.success) fields.push("gradeId");
  const battery = optionalBattery.safeParse(input.batteryHealth);
  if (!battery.success) fields.push("batteryHealth");
  const price = validatePrice(input);
  fields.push(...price.fields);
  return {
    fields,
    gradeId: grade.success ? grade.data : null,
    batteryHealth: battery.success ? battery.data : null,
    price: price.price,
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
      price: details.price,
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
  // Desde la 24.5.2-b (D-9): el rechazo dice **cuál** unidad tiene ese IMEI, para que la pantalla
  // pueda ofrecer un enlace en vez de solo el error. `null` solo si la unidad desapareció entre el
  // choque y la consulta, que es posible y no vale la pena tratar distinto.
  | Failure<
      "CONFLICT",
      {
        field: "serial";
        existing: { unitId: string; productId: string } | null;
      }
    >
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
        const existing = await unitRepository.findUnitBySerial(
          organizationId,
          values.serial,
          tx,
        );
        throw new UnitRejected({
          ok: false,
          code: "CONFLICT",
          field: "serial",
          existing: existing
            ? { unitId: existing.id, productId: existing.productId }
            : null,
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
        price: values.price,
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
            price: values.price?.amount ?? null,
            price_currency: values.price?.currency ?? null,
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
      // La carrera: la transacción ya revirtió, así que la consulta va por fuera. Se busca igual,
      // para que este camino ofrezca el mismo enlace que el común y no sea un error más pobre.
      const existing = await unitRepository.findUnitBySerial(
        organizationId,
        values.serial,
      );
      return {
        ok: false,
        code: "CONFLICT",
        field: "serial",
        existing: existing
          ? { unitId: existing.id, productId: existing.productId }
          : null,
      };
    }
    throw error;
  }
}

// La baja manual de una unidad (D-4): available -> written_off, con su motivo, y baja el saldo en 1
// con un movimiento adjustment_negative que la nombra. No mira si el producto está activo: lo que
// entró tiene que poder salir. Un IMEI mal cargado se corrige con la baja y un alta nueva. Desde la
// 29.6.2, también una unidad en revisión, sin movimiento, porque ya está fuera del saldo
// (brief-29.6.2, U-2).

export const WRITE_OFF_REASON_MAX_LENGTH = 500;

export type WriteOffUnitResult =
  // from: el estado de antes, available o, desde la 29.6.2, in_review, que no mueve el saldo.
  | { ok: true; productId: string; from: "available" | "in_review" }
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
      // Una unidad en revisión ya está fuera del saldo: se da de baja sin movimiento (brief-29.6.2,
      // U-2).
      if (locked?.status === "in_review") {
        await unitRepository.setUnitsWrittenOff(
          tx,
          organizationId,
          [unit.id],
          "in_review",
        );
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "stock_unit",
          entityId: unit.id,
          action: "status_change",
          diff: {
            before: { status: "in_review", reason: null },
            after: { status: "written_off", reason: parsedReason.data },
          },
        });
        return {
          ok: true as const,
          productId: unit.productId,
          from: "in_review" as const,
        };
      }
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
      return {
        ok: true as const,
        productId: unit.productId,
        from: "available" as const,
      };
    });
  } catch (error) {
    if (error instanceof UnitRejected) {
      return error.result as WriteOffRejection;
    }
    throw error;
  }
}

// La corrección del grado o la batería de una unidad disponible (D-4), con auditoría. El costo no se
// corrige en la 29.5, y el IMEI no se edita nunca. No toca el saldo: solo bloquea la unidad. Desde la
// 29.5.2, también el precio propio (brief-29.5.2, D-2): sin los dos campos de precio, no cambia; con
// los dos vacíos, se quita. Desde la 29.6.2, también en una unidad en revisión, antes de liberarla
// (brief-29.6.2, U-3).

export type CorrectUnitResult =
  | { ok: true; changed: boolean; productId: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: UnitField[] }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "unit_not_available" }>;

export async function correctUnit(
  context: AuthContext,
  unitId: string,
  input: UnitDetailsInput,
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
    // Desde la 29.6.2, también una unidad en revisión, antes de liberarla (brief-29.6.2, U-3).
    if (locked.status !== "available" && locked.status !== "in_review") {
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
    if (input.price === undefined && input.priceCurrency === undefined) {
      details.price =
        current.price !== null && current.priceCurrency !== null
          ? { amount: current.price, currency: current.priceCurrency }
          : null;
    }
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
    // El precio se compara en la escala de la base, y se audita aparte, con price_change (ADR 0024,
    // R-24; brief-29.5.2, D-2).
    const priceChanged =
      (details.price?.amount ?? null) !== current.price ||
      (details.price?.currency ?? null) !== current.priceCurrency;
    if (Object.keys(after).length === 0 && !priceChanged) {
      return { ok: true, changed: false, productId: current.productId };
    }
    await unitRepository.updateUnitDetails(tx, organizationId, locked.id, {
      gradeId: details.gradeId,
      batteryHealth: details.batteryHealth,
      price: details.price,
    });
    if (Object.keys(after).length > 0) {
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "stock_unit",
        entityId: locked.id,
        action: "update",
        diff: { before, after },
      });
    }
    if (priceChanged) {
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "stock_unit",
        entityId: locked.id,
        action: "price_change",
        diff: {
          before: {
            price: current.price,
            price_currency: current.priceCurrency,
          },
          after: {
            price: details.price?.amount ?? null,
            price_currency: details.price?.currency ?? null,
          },
        },
      });
    }
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
  // El precio propio, para los dos roles (brief-29.5.2, D-8); null si no tiene.
  price: UnitPrice | null;
  // Los días de garantía propios (brief-29.9, D-1); null, los de la organización.
  warrantyDays: number | null;
  origin: unitRepository.StockUnitOrigin;
  createdAt: Date;
  updatedAt: Date;
};

// Los recuentos de unidades por estado, para el Resumen de la ficha (brief-24.5.1, D-6).
export type UnitStatusCounts = Record<unitRepository.StockUnitStatus, number>;

// Un producto por cantidad no tiene unidades, así que no lleva recuentos: el tipo lo impide, para
// que la pantalla no pueda mostrar un cero donde no hay nada que contar (brief-24.5.1, I-2).
export type UnitStatusCountsResult =
  | { ok: true; tracking: "unit"; counts: UnitStatusCounts }
  | { ok: true; tracking: "quantity"; counts: null }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

// Cuántas unidades hay en cada estado. Los dos roles, como la ficha. Un estado sin filas vale cero:
// el producto se leyó bien y no hay unidades en ese estado, que no es lo mismo que no haber podido
// leerlo (brief-24.5.1, I-2 y D-6).
export async function countUnitsByStatus(
  context: AuthContext,
  productId: string,
): Promise<UnitStatusCountsResult> {
  const found = await getProduct(context, productId);
  if (!found.ok) return found;
  if (found.product.tracking !== "unit") {
    return { ok: true, tracking: "quantity", counts: null };
  }
  const totals = await unitRepository.countUnitsByStatus(
    context.organizationId,
    found.product.id,
  );
  const counts = Object.fromEntries(
    unitRepository.UNIT_STATUSES.map((status) => [
      status,
      totals.get(status) ?? 0,
    ]),
  ) as UnitStatusCounts;
  return { ok: true, tracking: "unit", counts };
}

// Los costos por unidad de un producto, para la pantalla de costos (brief-24.5.2-b, AC-1 a AC-5-b).
//
// **Solo un admin** (FR-PROD-21). La autorización vive acá y no en la pantalla: que la pestaña no
// se dibuje para un viewer es presentación, y la presentación no es la defensa. Es lo mismo que
// hace `catalog.getProductCostSummary` desde la 18.2.
//
// La base del margen son **las disponibles** (decisión del usuario del 2026-10-31). Las reservadas
// y las en revisión existen, tienen costo y se muestran aparte, pero no entran en el cálculo.

// El tope de filas de cada tabla (R-3). Las sumas **no** dependen de él: salen de una agregación
// en SQL sobre todas las filas. Vale 25, el mismo número que `UNITS_PAGE_SIZE`, para que las dos
// tablas de un producto muestren de a lo mismo; son constantes distintas porque significan cosas
// distintas —una pagina y la otra recorta— y alinearlas es una decisión, no una consecuencia.
export const UNIT_COST_ROWS_CAP = 25;

// Los estados que van en «Otras existencias»: las que hay pero no se cuentan.
const OTHER_STOCK_STATUSES = ["reserved", "in_review"] as const;

export type UnitCostTotals = {
  status: UnitStatus;
  currency: string;
  units: number;
  total: Money;
};

// La base, o el motivo por el que no hay un número. `mixed_currency` no es un borde raro: dos
// recepciones del mismo producto en monedas distintas lo producen, y entonces sumar sería inventar
// un tipo de cambio que el punto 5 del ADR 0019 no autoriza (brief-24.5.2-b, D-13).
export type UnitCostBase =
  | {
      ok: true;
      currency: string;
      units: number;
      total: Money;
      average: Money;
    }
  | { ok: false; reason: "no_units" | "mixed_currency" };

export type ProductUnitCosts = {
  base: UnitCostBase;
  // Las disponibles, hasta el tope, para la tabla por unidad.
  availableUnits: ProductUnit[];
  // Las reservadas y en revisión, hasta el tope, para «Otras existencias».
  otherUnits: ProductUnit[];
  // Los totales por moneda de las disponibles, sobre **todas** las filas. Con una sola moneda es
  // uno y coincide con `base`; con dos son dos y `base` no existe, que es justamente el caso en el
  // que la pantalla necesita estos números igual (D-13).
  availableTotals: UnitCostTotals[];
  // Lo mismo para las reservadas y en revisión, por estado y moneda.
  otherTotals: UnitCostTotals[];
  // Cuántas hay en total de cada tabla, para poder decir que se recortó.
  availableTotal: number;
  otherTotal: number;
};

export type ProductUnitCostsResult =
  // Un producto por cantidad no tiene unidades: el tipo lo impide en vez de devolver ceros
  // (brief-24.5.1, I-2; brief-24.5.2-b, AC-8).
  | { ok: true; tracking: "quantity"; costs: null }
  | { ok: true; tracking: "unit"; costs: ProductUnitCosts }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function getProductUnitCosts(
  context: AuthContext,
  productId: string,
): Promise<ProductUnitCostsResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const found = await getProduct(context, productId);
  if (!found.ok) return found;
  if (found.product.tracking !== "unit") {
    return { ok: true, tracking: "quantity", costs: null };
  }

  const { organizationId } = context;
  const id = found.product.id;
  const [groups, availableRows, otherRows] = await Promise.all([
    unitRepository.sumUnitCostsByStatus(organizationId, id),
    unitRepository.findUnitsOfProductByStatuses(
      organizationId,
      id,
      ["available"],
      UNIT_COST_ROWS_CAP,
    ),
    unitRepository.findUnitsOfProductByStatuses(
      organizationId,
      id,
      OTHER_STOCK_STATUSES,
      UNIT_COST_ROWS_CAP,
    ),
  ]);

  const totalsOf = (statuses: readonly UnitStatus[]): UnitCostTotals[] =>
    groups
      .filter((group) => statuses.includes(group.status))
      .map((group) => ({
        status: group.status,
        currency: group.currency,
        units: group.units,
        total: moneyFromDatabase(group.total),
      }));

  const availableTotals = totalsOf(["available"]);
  const otherTotals = totalsOf(OTHER_STOCK_STATUSES);
  const sumUnits = (totals: UnitCostTotals[]) =>
    totals.reduce((units, total) => units + total.units, 0);

  return {
    ok: true,
    tracking: "unit",
    costs: {
      base: computeUnitCostBase(availableTotals),
      availableUnits: availableRows.map((row) => toProductUnit(row, true)),
      otherUnits: otherRows.map((row) => toProductUnit(row, true)),
      availableTotals,
      otherTotals,
      availableTotal: sumUnits(availableTotals),
      otherTotal: sumUnits(otherTotals),
    },
  };
}

// Sin disponibles no hay base; con más de una moneda tampoco, y se dice cuál de las dos cosas pasó.
//
// El promedio se redondea **a los decimales de la moneda** y con el medio hacia afuera del cero:
// las dos mitades del punto 4 del ADR 0019, no solo el modo. Redondear solo a centésimos daba, con
// dos unidades de 300.000 y 300.001 pesos chilenos, un promedio de 300.000,50 — media unidad de una
// moneda que no tiene centavos—, y entonces la tira de la fórmula mostraba operandos que no
// reproducen su resultado. Es el mismo `step` que `convertMoney` ya usa en `shared/money`.
// Lo encontró la revisión independiente de esta subfase (su B-3). En `bigint` en todos los pasos:
// el dinero no pasa por `number`.
export function computeUnitCostBase(totals: UnitCostTotals[]): UnitCostBase {
  if (totals.length === 0) return { ok: false, reason: "no_units" };
  if (totals.length > 1) return { ok: false, reason: "mixed_currency" };
  const only = totals[0]!;
  const decimals = currencyDecimals(only.currency);
  // Centésimos por cada unidad que la moneda puede expresar: 1 con dos decimales, 100 sin ninguno.
  // Una moneda que el proyecto no acepta no llega hasta acá —el costo se guarda con una aceptada—;
  // si llegara, se redondea a centésimos, que es la escala con la que la columna guarda.
  const step = decimals.ok ? 10n ** BigInt(2 - decimals.decimals) : 1n;
  return {
    ok: true,
    currency: only.currency,
    units: only.units,
    total: only.total,
    average:
      divideRoundingHalfAwayFromZero(only.total, BigInt(only.units) * step) *
      step,
  };
}

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
    price:
      row.price !== null && row.priceCurrency !== null
        ? { amount: row.price, currency: row.priceCurrency }
        : null,
    warrantyDays: row.warrantyDays,
    origin: row.originType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const UNITS_PAGE_SIZE = 25;

// El mínimo del sufijo de IMEI, que no es decorativo: con menos caracteres la búsqueda dejaría
// enumerar identificadores tipeando un dígito (brief-24.5.2, D-7).
export const UNIT_SEARCH_MIN_LENGTH = 4;

const unitSearchSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^[A-Za-z0-9-]{${UNIT_SEARCH_MIN_LENGTH},}$`));

// Qué pasó con la búsqueda. Distingue «no buscó» de «buscó con menos de cuatro caracteres», porque
// una lista sin filtrar tiene que poder decir **por qué** no filtró, en vez de devolver todo como si
// la búsqueda se hubiera aplicado (brief-24.5.2, D-7 y AC-3).
export type UnitSearchState = "none" | "applied" | "too_short";

// Lo que la lista de unidades necesita saber de la URL. `status` en null es «todas».
export type UnitListQuery = {
  status: unitRepository.StockUnitStatus | null;
  serial: string;
  page: number;
};

export type ProductUnitsPage = {
  tracking: StockTracking;
  units: ProductUnit[];
  total: number;
  page: number;
  pageCount: number;
  search: UnitSearchState;
  // Si el producto tiene unidades ignorando los filtros: distingue «sin resultados» de «sin
  // unidades», como la pantalla de Movimientos desde su hallazgo 9.
  productHasUnits: boolean;
};

export type ProductUnitsResult =
  | ({ ok: true } & ProductUnitsPage)
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

// Las unidades de un producto, **paginadas**, con el filtro por estado y la búsqueda por sufijo de
// IMEI aplicados en SQL (brief-24.5.2, D-5, D-7 y D-8). Los dos roles, como la ficha; un viewer las
// recibe sin el costo (FR-PROD-21).
//
// Hasta la 24.5.2 esta lectura traía **todas** las unidades del producto sin `LIMIT` (H-6, que es el
// H-2 de la 24.5.1). El tercer parámetro es obligatorio a propósito: con un valor por omisión, un
// llamador nuevo heredaría el tope sin enterarse, y el riesgo de esta lectura es justamente recortar
// filas en silencio (R-1 del brief).
export async function listProductUnits(
  context: AuthContext,
  productId: string,
  query: UnitListQuery,
): Promise<ProductUnitsResult> {
  const found = await getProduct(context, productId);
  if (!found.ok) return found;

  const parsed = unitSearchSchema.safeParse(query.serial);
  const typed = query.serial.trim().length > 0;
  const search: UnitSearchState = parsed.success
    ? "applied"
    : typed
      ? "too_short"
      : "none";
  const serialSuffix = parsed.success ? parsed.data : null;

  const filter: unitRepository.UnitQuery = {
    organizationId: context.organizationId,
    productId: found.product.id,
    status: query.status,
    serialSuffix,
  };
  const total = await unitRepository.countUnitsOfProduct(filter);
  const pageCount = Math.max(1, Math.ceil(total / UNITS_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const rows = await unitRepository.findUnitsPageOfProduct(
    filter,
    UNITS_PAGE_SIZE,
    (page - 1) * UNITS_PAGE_SIZE,
  );
  const withCost = context.role === "admin";

  // Sin filtros, el total ya responde si el producto tiene unidades: no se gasta otra consulta.
  const filtered = query.status !== null || serialSuffix !== null;
  const productHasUnits =
    total > 0 ||
    (filtered &&
      (await unitRepository.countUnitsOfProduct({
        ...filter,
        status: null,
        serialSuffix: null,
      })) > 0);

  return {
    ok: true,
    tracking: found.product.tracking,
    units: rows.map((row) => toProductUnit(row, withCost)),
    total,
    page,
    pageCount,
    search,
    productHasUnits,
  };
}

export const UNIT_AUDIT_PAGE_SIZE = AUDIT_PAGE_SIZE;

export type UnitAuditResult =
  | {
      ok: true;
      entries: NamedAuditLogEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

// La auditoría de una unidad, para el Historial de su panel (brief-24.5.2, D-3 y D-10). Es la única
// fuente del motivo de una baja **desde `in_review`**: esa baja no es un movimiento de stock, porque
// la unidad ya estaba fuera del saldo (U-2 de la 29.6.2), así que su motivo vive solo acá.
//
// **Solo `admin`** (D-10 e I-9): `SecurityModel.md` reserva la auditoría a `admin`, y el mismo
// `authorize` lo pone `catalog.listProductAudit`. Autoriza **en el servicio**, no en la
// presentación: a un viewer le responde FORBIDDEN, y ocultarle el bloque es además, no en lugar de.
//
// Como manda el Overview, la lectura de `audit` no autoriza ni compone nombres: eso lo hace el
// módulo dueño de la entidad, que acá es `inventory`. El nombre del autor se compone con
// `getMemberSummaries` de `organizations`, por ids y sin `JOIN`.
export async function listUnitAudit(
  context: AuthContext,
  unitId: string,
  page: number,
): Promise<UnitAuditResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(unitId).success) return failure("VALIDATION_ERROR");
  if (!(await hasCapability(context.organizationId, "serialized_units"))) {
    return failure("NOT_FOUND");
  }
  // La unidad tiene que ser de la organización antes de leer su auditoría: si no, un id ajeno
  // devolvería las entradas de una unidad que no es suya.
  const row = await unitRepository.findUnit(
    context.organizationId,
    unitId.toLowerCase(),
  );
  if (!row) return failure("NOT_FOUND");

  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["stock_unit"],
    entityId: row.id,
    page,
  });
  const names = new Map(
    (
      await getMemberSummaries(
        context.organizationId,
        auditUserIds(found.entries),
      )
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    entries: nameAuditActors(found.entries, names),
    total: found.total,
    page: found.page,
    pageCount: found.pageCount,
  };
}

// El tope del historial de movimientos de una unidad. No pagina: una unidad tiene pocos movimientos,
// y el panel dice el tope y cuántos trajo para no presentar una mitad como si fuera todo (R-2).
export const UNIT_MOVEMENTS_LIMIT = 50;

export type UnitMovement = {
  id: string;
  type: repository.StockMovementType;
  quantity: string;
  reason: string;
  createdAt: Date;
  // Compuesto por ids con getMemberSummaries, sin JOIN, como StockMovement.
  author: { id: string; name: string };
};

export type UnitMovementsResult =
  | { ok: true; movements: UnitMovement[]; limit: number }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

// Los movimientos de una unidad. **Los dos roles**, como `listStockMovements`: un movimiento de
// stock no es auditoría, y el modelo de seguridad reserva a `admin` la auditoría, no los
// movimientos (brief-24.5.2, H-12 y D-10). Esto es lo que hace que un viewer sí vea el motivo de una
// baja desde `available`, que vive en el movimiento, y no el de una baja desde `in_review`.
export async function listUnitMovements(
  context: AuthContext,
  unitId: string,
): Promise<UnitMovementsResult> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(unitId).success) return failure("VALIDATION_ERROR");
  if (!(await hasCapability(context.organizationId, "serialized_units"))) {
    return failure("NOT_FOUND");
  }
  const row = await unitRepository.findUnit(
    context.organizationId,
    unitId.toLowerCase(),
  );
  if (!row) return failure("NOT_FOUND");

  const rows = await repository.findUnitMovements(
    context.organizationId,
    row.id,
    UNIT_MOVEMENTS_LIMIT,
  );
  const names = new Map(
    (
      await getMemberSummaries(context.organizationId, [
        ...new Set(rows.map((movement) => movement.createdBy)),
      ])
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    limit: UNIT_MOVEMENTS_LIMIT,
    movements: rows.map((movement) => ({
      id: movement.id,
      type: movement.type,
      quantity: movement.quantity,
      reason: movement.reason,
      createdAt: movement.createdAt,
      author: {
        id: movement.createdBy,
        name: names.get(movement.createdBy) ?? "",
      },
    })),
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

// Las unidades disponibles de un producto, para elegirlas en un pedido o una venta (brief-29.5.2,
// D-5): el IMEI, el grado, la batería y el precio propio, sin el costo. Los dos roles, como la ficha;
// solo un admin crea pedidos y ventas.
export type AvailableUnit = {
  id: string;
  serial: string;
  grade: string | null;
  batteryHealth: number | null;
  price: UnitPrice | null;
};

export async function listAvailableUnits(
  context: AuthContext,
  productId: string,
): Promise<
  | { ok: true; units: AvailableUnit[] }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const found = await getProduct(context, productId);
  if (!found.ok) return found;
  if (found.product.tracking !== "unit") return { ok: true, units: [] };
  const rows = await unitRepository.findAvailableUnitsOfProduct(
    context.organizationId,
    found.product.id,
  );
  return {
    ok: true,
    units: rows.map((row) => {
      const unit = toProductUnit(row, false);
      return {
        id: unit.id,
        serial: unit.serial,
        grade: unit.grade?.name ?? null,
        batteryHealth: unit.batteryHealth,
        price: unit.price,
      };
    }),
  };
}

// Las unidades disponibles de un producto, para la API de lectura v3 (brief-29.8, D-3). La organización
// sale de la credencial y no hay rol. **Sin el IMEI, el costo ni el origen**: el agente nunca los lee
// (ADR 0024, punto 14). Sin la capacidad serialized_units, ninguna. Quien llama ya comprobó que el
// producto es activo, de la organización y por unidad; el precio es el propio, o null.
export type ServiceAvailableUnit = {
  id: string;
  grade: string | null;
  batteryHealth: number | null;
  price: UnitPrice | null;
};

export async function listAvailableUnitsForService(
  organizationId: string,
  productId: string,
): Promise<ServiceAvailableUnit[]> {
  if (!idSchema.safeParse(productId).success) return [];
  if (!(await hasCapability(organizationId, "serialized_units"))) return [];
  const rows = await unitRepository.findAvailableUnitsOfProduct(
    organizationId,
    productId,
  );
  return rows.map((row) => ({
    id: row.id,
    grade: row.gradeName,
    batteryHealth: row.batteryHealth,
    price:
      row.price !== null && row.priceCurrency !== null
        ? { amount: row.price, currency: row.priceCurrency }
        : null,
  }));
}

// Las unidades del pedido del agente, por id (brief-29.8, D-7): orders ya bloqueó los productos y pasa
// su transacción. Se leen sin bloquearlas, como el alta del pedido de la pantalla: un pendiente no
// reserva, y confirmar vuelve a mirarlas. Por posición: las unidades de la línea, en el orden de sus
// ids, o null si alguna no existe, es de otra organización o de otro producto, o no está available, sin
// distinguir. orders decide en qué orden responde cada regla.
export type AgentLineUnits = {
  position: number;
  productId: string;
  unitIds: string[];
};

export type AgentUnit = { id: string; price: UnitPrice | null };

export async function resolveAgentLineUnits(
  tx: DbTransaction,
  organizationId: string,
  lines: AgentLineUnits[],
): Promise<Map<number, AgentUnit[] | null>> {
  const ids = lines.flatMap((line) =>
    line.unitIds.map((id) => id.toLowerCase()),
  );
  const found = await unitRepository.findUnitsByIdsIn(tx, organizationId, ids);
  const byId = new Map(found.map((unit) => [unit.id.toLowerCase(), unit]));
  const result = new Map<number, AgentUnit[] | null>();
  for (const line of lines) {
    const resolved: AgentUnit[] = [];
    for (const unitId of line.unitIds) {
      const unit = byId.get(unitId.toLowerCase());
      if (
        !unit ||
        unit.productId !== line.productId ||
        unit.status !== "available"
      ) {
        break;
      }
      resolved.push({
        id: unit.id,
        price:
          unit.price !== null && unit.priceCurrency !== null
            ? { amount: unit.price, currency: unit.priceCurrency }
            : null,
      });
    }
    result.set(
      line.position,
      resolved.length === line.unitIds.length ? resolved : null,
    );
  }
  return result;
}

// El IMEI y el estado de unas unidades, para el detalle de un pedido o de una venta y sus comprobantes
// (brief-29.5.2, D-5): orders y sales ya autorizaron. Una unidad de otra organización no vuelve. Desde
// la 29.6.2, con su producto, para la orden de una unidad propia (brief-29.6.2, D-7).
export type UnitSummary = {
  serial: string;
  status: UnitStatus;
  productId: string;
  // Desde la 24.6.1 (brief-24.6.1, D-6): el grado y la salud de la batería, que la ficha del
  // pedido en el teléfono muestra como chips. No cuestan nada: `findUnitsByIds` ya trae las dos
  // columnas en su selección y ya une con `unit_grades`, así que esto solo deja de descartarlas.
  // El grado es null si la unidad no tiene o si el rubro no usa grados.
  gradeName: string | null;
  batteryHealth: number | null;
};

export async function getUnitSummaries(
  organizationId: string,
  unitIds: string[],
): Promise<Map<string, UnitSummary>> {
  const rows = await unitRepository.findUnitsByIds(organizationId, unitIds);
  return new Map(
    rows.map((row) => [
      row.id,
      {
        serial: row.serial,
        status: row.status,
        productId: row.productId,
        gradeName: row.gradeName,
        batteryHealth: row.batteryHealth,
      },
    ]),
  );
}
