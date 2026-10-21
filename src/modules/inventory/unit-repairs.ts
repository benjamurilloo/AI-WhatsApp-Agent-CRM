import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import { lockProductForStockChange } from "@/modules/catalog";
import {
  authorize,
  hasCapability,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import { MAX_AMOUNT, moneyFromDatabase, moneyToDatabase } from "@/shared/money";
import { quantityFromDatabase, quantityToDatabase } from "@/shared/quantity";
import * as repository from "./repository";
import { computeBalanceAfter, type BalanceRule } from "./service";
import * as unitRepository from "./unit-repository";

// La reparación de una unidad propia (ADR 0024, puntos 6 y 10; brief-29.6.2, D-1 y D-2). Mandarla a
// reparar, volver de reparación y cancelar la reparación las llama service, con su transacción, desde
// la orden de una unidad propia; liberarla a la venta es una acción de un admin. Cada una cambia la
// unidad y el saldo juntos y se audita. tests/guards/unit-writes.test.ts fija el llamador de cada una.
//
// El orden de bloqueo (ADR 0024, punto 16; D-6): el producto FOR SHARE, la unidad FOR UPDATE y el
// saldo. Una unidad en reparación o en revisión está en el local y fuera del saldo: mandar a reparar
// una disponible baja el saldo, y liberarla lo sube.

const ONE = 1000n;
const idSchema = z.uuid();

// El producto de una unidad no cambia nunca (trigger): se lee sin bloqueo, para bloquear en orden.
// Devuelve la unidad leída otra vez con su bloqueo.
async function lockUnitInOrder(
  tx: DbTransaction,
  organizationId: string,
  unitId: string,
) {
  const unit = await unitRepository.findUnit(organizationId, unitId, tx);
  if (!unit) return null;
  const product = await lockProductForStockChange(
    tx,
    organizationId,
    unit.productId,
  );
  if (product === "not_found") {
    throw new Error("el producto de la unidad no existe");
  }
  await unitRepository.lockUnits(tx, organizationId, [unit.id]);
  // Se vuelve a leer con la unidad bloqueada: el estado y el costo de antes del bloqueo no valen.
  const current = (await unitRepository.findUnit(organizationId, unit.id, tx))!;
  return { unit: current, status: current.status };
}

// Lo que service necesita de una unidad antes de mandarla a reparar o de marcarla reparada: su
// producto, su IMEI, su estado y la moneda de su costo (U-1). service ya autorizó. Sin bloqueo: las
// escrituras vuelven a mirar el estado con la unidad bloqueada.
export type UnitForRepair = {
  id: string;
  productId: string;
  serial: string;
  status: unitRepository.StockUnitStatus;
  costCurrency: string;
};

export async function getUnitForRepair(
  organizationId: string,
  unitId: string,
): Promise<UnitForRepair | null> {
  if (!idSchema.safeParse(unitId).success) return null;
  const row = await unitRepository.findUnit(
    organizationId,
    unitId.toLowerCase(),
  );
  if (!row) return null;
  return {
    id: row.id,
    productId: row.productId,
    serial: row.serial,
    status: row.status,
    costCurrency: row.costCurrency,
  };
}

export type SendUnitToRepairResult =
  | { ok: true; productId: string; from: "available" | "in_review" }
  | { ok: false; reason: "not_found" | "unit_not_available" }
  | { ok: false; reason: BalanceRule };

// Mandar a reparar (D-2): available o in_review → in_repair. Si estaba disponible, el saldo baja en 1
// con un movimiento unit_to_repair que la nombra. El motivo es una función, como en sellStock: lleva
// el número de la orden, y el contador va después del saldo. Un rechazo no escribe nada, y quien llama
// revierte la transacción.
export async function sendUnitToRepair(
  tx: DbTransaction,
  request: {
    organizationId: string;
    unitId: string;
    reason: () => Promise<string>;
    createdBy: string;
  },
): Promise<SendUnitToRepairResult> {
  const { organizationId, createdBy } = request;
  const found = await lockUnitInOrder(tx, organizationId, request.unitId);
  if (!found) return { ok: false, reason: "not_found" };
  const { unit, status } = found;
  if (status !== "available" && status !== "in_review") {
    return { ok: false, reason: "unit_not_available" };
  }
  if (status === "in_review") {
    const reason = await request.reason();
    await unitRepository.setUnitsStatus(
      tx,
      organizationId,
      [unit.id],
      "in_review",
      "in_repair",
    );
    await auditStatus(tx, organizationId, createdBy, unit.id, {
      from: "in_review",
      to: "in_repair",
      reason,
    });
    return { ok: true, productId: unit.productId, from: "in_review" };
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
  if (!computed.ok) return { ok: false, reason: computed.rule };
  const reason = await request.reason();
  await unitRepository.setUnitsStatus(
    tx,
    organizationId,
    [unit.id],
    "available",
    "in_repair",
  );
  await repository.applyStockChange(tx, {
    organizationId,
    productId: unit.productId,
    type: "unit_to_repair",
    quantity: quantityToDatabase(ONE),
    balanceAfter: quantityToDatabase(computed.balanceAfter),
    reason,
    createdBy,
    unitId: unit.id,
  });
  await auditStatus(tx, organizationId, createdBy, unit.id, {
    from: "available",
    to: "in_repair",
    reason,
  });
  return { ok: true, productId: unit.productId, from: "available" };
}

export type ReturnUnitFromRepairResult =
  | { ok: true; cost: string }
  | { ok: false; reason: "cost_currency_mismatch" | "cost_limit" };

// Volver de reparación (D-2): in_repair → in_review, y lo que cobró el técnico se suma al costo de la
// unidad, en su moneda (U-1). No toca el saldo: la unidad sigue fuera. La suma se audita como
// cost_change, con la orden: es el historial del costo (ADR 0024, punto 6). Una unidad que no está en
// reparación es un defecto de quien llama, que tiene su orden abierta bloqueada.
export async function returnUnitFromRepair(
  tx: DbTransaction,
  request: {
    organizationId: string;
    unitId: string;
    amount: string;
    currency: string;
    reference: string;
    createdBy: string;
  },
): Promise<ReturnUnitFromRepairResult> {
  const { organizationId, createdBy } = request;
  const found = await lockUnitInOrder(tx, organizationId, request.unitId);
  if (found?.status !== "in_repair") {
    throw new Error("returnUnitFromRepair: la unidad no está en reparación");
  }
  const { unit } = found;
  if (unit.costCurrency !== request.currency) {
    return { ok: false, reason: "cost_currency_mismatch" };
  }
  const cost = moneyFromDatabase(unit.cost) + moneyFromDatabase(request.amount);
  if (cost > MAX_AMOUNT) return { ok: false, reason: "cost_limit" };
  const after = moneyToDatabase(cost);
  await unitRepository.setUnitRepaired(tx, organizationId, unit.id, after);
  await auditStatus(tx, organizationId, createdBy, unit.id, {
    from: "in_repair",
    to: "in_review",
    reason: request.reference,
  });
  await recordAudit(tx, {
    organizationId,
    actorUserId: createdBy,
    entityType: "stock_unit",
    entityId: unit.id,
    action: "cost_change",
    diff: {
      before: {
        cost: unit.cost,
        cost_currency: unit.costCurrency,
        reference: null,
      },
      after: {
        cost: after,
        cost_currency: unit.costCurrency,
        reference: request.reference,
      },
    },
  });
  return { ok: true, cost: after };
}

// Cancelar la reparación (D-2): in_repair → in_review, sin cambiar el costo. Es una función aparte de
// returnUnitFromRepair para que la guarda fije que el costo solo lo cambia marcar reparada.
export async function cancelUnitRepair(
  tx: DbTransaction,
  request: {
    organizationId: string;
    unitId: string;
    reference: string;
    createdBy: string;
  },
): Promise<void> {
  const { organizationId, createdBy } = request;
  const found = await lockUnitInOrder(tx, organizationId, request.unitId);
  if (found?.status !== "in_repair") {
    throw new Error("cancelUnitRepair: la unidad no está en reparación");
  }
  await unitRepository.setUnitsStatus(
    tx,
    organizationId,
    [found.unit.id],
    "in_repair",
    "in_review",
  );
  await auditStatus(tx, organizationId, createdBy, found.unit.id, {
    from: "in_repair",
    to: "in_review",
    reason: request.reference,
  });
}

export const RELEASE_REASON = "Liberada a la venta";

export type ReleaseUnitResult =
  | { ok: true; productId: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "unit_not_in_review" }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: BalanceRule }>;

type ReleaseRejection = Exclude<ReleaseUnitResult, { ok: true }>;

// Un rechazo con el saldo tomado se lanza, para revertir también la fila en 0 que pudo crear
// lockBalance (convención de la 19.3).
class ReleaseRejected extends Error {
  constructor(readonly result: ReleaseRejection) {
    super(result.code);
    this.name = "ReleaseRejected";
  }
}

// Liberar a la venta (D-2): in_review → available, y el saldo sube en 1 con un movimiento
// unit_released. Un admin, con serialized_units.
export async function releaseUnit(
  context: AuthContext,
  unitId: string,
): Promise<ReleaseUnitResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(unitId).success) return failure("VALIDATION_ERROR");
  const { organizationId, userId } = context;
  if (!(await hasCapability(organizationId, "serialized_units"))) {
    return failure("NOT_FOUND");
  }
  try {
    return await repository.withTransaction(async (tx) => {
      const found = await lockUnitInOrder(
        tx,
        organizationId,
        unitId.toLowerCase(),
      );
      if (!found) throw new ReleaseRejected(failure("NOT_FOUND"));
      const { unit, status } = found;
      if (status !== "in_review") {
        throw new ReleaseRejected({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "unit_not_in_review",
        });
      }
      const balance = await repository.lockBalance(
        tx,
        organizationId,
        unit.productId,
      );
      const computed = computeBalanceAfter(
        quantityFromDatabase(balance.onHand),
        "adjustment_positive",
        ONE,
        quantityFromDatabase(balance.reserved),
      );
      if (!computed.ok) {
        throw new ReleaseRejected({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: computed.rule,
        });
      }
      await unitRepository.setUnitsStatus(
        tx,
        organizationId,
        [unit.id],
        "in_review",
        "available",
      );
      await repository.applyStockChange(tx, {
        organizationId,
        productId: unit.productId,
        type: "unit_released",
        quantity: quantityToDatabase(ONE),
        balanceAfter: quantityToDatabase(computed.balanceAfter),
        reason: RELEASE_REASON,
        createdBy: userId,
        unitId: unit.id,
      });
      await auditStatus(tx, organizationId, userId, unit.id, {
        from: "in_review",
        to: "available",
        reason: null,
      });
      return { ok: true as const, productId: unit.productId };
    });
  } catch (error) {
    if (error instanceof ReleaseRejected) return error.result;
    throw error;
  }
}

async function auditStatus(
  tx: DbTransaction,
  organizationId: string,
  actorUserId: string,
  unitId: string,
  change: {
    from: unitRepository.StockUnitStatus;
    to: unitRepository.StockUnitStatus;
    reason: string | null;
  },
): Promise<void> {
  await recordAudit(tx, {
    organizationId,
    actorUserId,
    entityType: "stock_unit",
    entityId: unitId,
    action: "status_change",
    diff: {
      before: { status: change.from, reason: null },
      after: { status: change.to, reason: change.reason },
    },
  });
}
