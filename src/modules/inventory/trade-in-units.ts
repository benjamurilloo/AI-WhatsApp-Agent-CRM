import { recordAudit } from "@/modules/audit";
import { lockProductForStockChange } from "@/modules/catalog";
import type { DbTransaction } from "@/shared/db";
import { quantityFromDatabase, quantityToDatabase } from "@/shared/quantity";
import * as repository from "./repository";
import { computeBalanceAfter, type BalanceRule } from "./service";
import * as unitRepository from "./unit-repository";

// La unidad de un usado (ADR 0024, puntos 6 y 8; brief-29.7, D-2). tradeins las llama con su
// transacción: registerTradeInUnit al emitir el comprobante PU, y writeOffTradeInUnit al anularlo
// (U-3). Cada una se audita como stock_unit. tests/guards/unit-writes.test.ts fija el llamador de cada
// una.
//
// La unidad de un usado nace en revisión, fuera del saldo, con el valor reconocido como costo: entra al
// saldo recién al liberarla, con lo que ya hizo la 29.6.2. Mandarla a reparar, corregirla, liberarla y
// darla de baja desde la ficha siguen los caminos de siempre.

const ONE = 1000n;

export type RegisterTradeInUnitResult =
  | { ok: true; unitId: string }
  | {
      ok: false;
      reason:
        | "product_not_found"
        | "inactive_product"
        | "not_used_unit_product"
        | "grade_inactive"
        | "serial_taken";
    };

// El orden de bloqueo (D-4): tradeins ya bloqueó el cliente; acá, el producto FOR SHARE, el aviso de
// IMEI repetido, beforeInsert (el contador del PU, que toma tradeins) y la unidad. Un rechazo no
// escribe nada. Dos recepciones del mismo IMEI a la vez chocan en el índice único parcial: la segunda
// lanza, y tradeins lo traduce con isSerialTakenError.
export async function registerTradeInUnit(
  tx: DbTransaction,
  request: {
    organizationId: string;
    // El comprobante, como origen plano de la unidad (ADR 0024, R-16): tradeins elige su id antes.
    tradeInId: string;
    productId: string;
    serial: string;
    gradeId: string;
    batteryHealth: number;
    cost: string;
    costCurrency: string;
    beforeInsert: () => Promise<void>;
    createdBy: string;
  },
): Promise<RegisterTradeInUnitResult> {
  const { organizationId, createdBy } = request;
  const product = await lockProductForStockChange(
    tx,
    organizationId,
    request.productId,
  );
  if (product === "not_found") {
    return { ok: false, reason: "product_not_found" };
  }
  if (product.status === "inactive") {
    return { ok: false, reason: "inactive_product" };
  }
  if (
    product.tracking !== "unit" ||
    product.condition !== "used" ||
    product.isService
  ) {
    return { ok: false, reason: "not_used_unit_product" };
  }
  const grade = await unitRepository.findGrade(
    organizationId,
    request.gradeId,
    tx,
  );
  if (grade?.isActive !== true) return { ok: false, reason: "grade_inactive" };
  const taken = await unitRepository.findTakenSerials(tx, organizationId, [
    request.serial,
  ]);
  if (taken.length > 0) return { ok: false, reason: "serial_taken" };
  await request.beforeInsert();
  const unitId = await unitRepository.insertStockUnit(tx, {
    organizationId,
    productId: request.productId,
    serial: request.serial,
    gradeId: request.gradeId,
    batteryHealth: request.batteryHealth,
    cost: request.cost,
    costCurrency: request.costCurrency,
    price: null,
    originType: "trade_in",
    originId: request.tradeInId,
    status: "in_review",
    createdBy,
  });
  await recordAudit(tx, {
    organizationId,
    actorUserId: createdBy,
    entityType: "stock_unit",
    entityId: unitId,
    action: "create",
    diff: {
      before: null,
      after: {
        product_id: request.productId,
        serial: request.serial,
        status: "in_review",
        cost: request.cost,
        cost_currency: request.costCurrency,
        grade_id: request.gradeId,
        battery_health: request.batteryHealth,
        price: null,
        price_currency: null,
        origin: "trade_in",
      },
    },
  });
  return { ok: true, unitId };
}

export type WriteOffTradeInUnitResult =
  | { ok: true; from: "available" | "in_review" }
  | {
      ok: false;
      reason: "unit_not_in_shop";
      status: unitRepository.StockUnitStatus;
    }
  | { ok: false; reason: BalanceRule };

// La baja de la unidad de un usado anulado (D-2 y D-5): en revisión, sin movimiento, porque ya está
// fuera del saldo; disponible, el saldo baja en 1 con un movimiento unit_written_off que la nombra. En
// cualquier otro estado (en reparación, reservada, vendida o dada de baja) el usado no se anula, y se
// devuelve el estado. El orden de bloqueo: el producto FOR SHARE, la unidad FOR UPDATE, el saldo si
// estaba disponible, y reason, que toma el contador del APU. Un rechazo no escribe nada.
export async function writeOffTradeInUnit(
  tx: DbTransaction,
  request: {
    organizationId: string;
    unitId: string;
    reason: () => Promise<string>;
    createdBy: string;
  },
): Promise<WriteOffTradeInUnitResult> {
  const { organizationId, createdBy } = request;
  // El producto de una unidad no cambia nunca (trigger): se lee sin bloqueo, para bloquear en orden.
  const unit = await unitRepository.findUnit(
    organizationId,
    request.unitId,
    tx,
  );
  if (!unit) throw new Error("writeOffTradeInUnit: la unidad no existe");
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
  const status = locked!.status;
  if (status === "in_review") {
    const reason = await request.reason();
    await unitRepository.setUnitsWrittenOff(
      tx,
      organizationId,
      [unit.id],
      "in_review",
    );
    await auditWriteOff(tx, organizationId, createdBy, unit.id, {
      from: "in_review",
      reason,
    });
    return { ok: true, from: "in_review" };
  }
  if (status !== "available") {
    return { ok: false, reason: "unit_not_in_shop", status };
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
  await unitRepository.setUnitsWrittenOff(tx, organizationId, [unit.id]);
  await repository.applyStockChange(tx, {
    organizationId,
    productId: unit.productId,
    type: "unit_written_off",
    quantity: quantityToDatabase(ONE),
    balanceAfter: quantityToDatabase(computed.balanceAfter),
    reason,
    createdBy,
    unitId: unit.id,
  });
  await auditWriteOff(tx, organizationId, createdBy, unit.id, {
    from: "available",
    reason,
  });
  return { ok: true, from: "available" };
}

async function auditWriteOff(
  tx: DbTransaction,
  organizationId: string,
  actorUserId: string,
  unitId: string,
  change: { from: "available" | "in_review"; reason: string },
): Promise<void> {
  await recordAudit(tx, {
    organizationId,
    actorUserId,
    entityType: "stock_unit",
    entityId: unitId,
    action: "status_change",
    diff: {
      before: { status: change.from, reason: null },
      after: { status: "written_off", reason: change.reason },
    },
  });
}
