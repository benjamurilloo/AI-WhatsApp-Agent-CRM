import { z } from "zod";
import type { AuthContext } from "@/modules/organizations";
import {
  findTradeInVoidNumber,
  isTradeInAlreadyVoidedError,
  requireTradeIns,
  TRADE_IN_VOID_REASONS,
  voidTradeInInCash,
  type VoidTradeInResult,
} from "@/modules/tradeins";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";

// La anulación de un usado recibido (ADR 0024, punto 8; brief-29.7, D-5, U-3 y U-4). Vive en cash desde
// esta subfase, aunque en la 29.7 solo compruebe la unidad: la 29.7.2 le suma que ningún cobro con
// «Permuta» ni pago de compra vigente use el usado, y esas comprobaciones necesitan el bloqueo de cobros.
// cash llama a tradeins, que escribe la anulación y llama a inventory para dar de baja la unidad: cash no
// depende de inventory (U-3).
//
// Solo admin, en READ COMMITTED: el bloqueo de cobros de la organización y, ya con él, todo lo demás en
// voidTradeInInCash.

const idSchema = z.uuid();

export type VoidTradeInCashResult =
  | VoidTradeInResult
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: ["reason"] }>;

type Rejection = Exclude<VoidTradeInResult, { ok: true }>;

// Un rechazo con el saldo tomado se lanza, para revertir también la fila en 0 que pudo crear el
// bloqueo del saldo (convención de la 19.3).
class Rejected extends Error {
  constructor(readonly result: Rejection) {
    super(result.code);
    this.name = "TradeInVoidRejected";
  }
}

export async function voidTradeIn(
  context: AuthContext,
  input: { tradeInId: string; reason: string },
): Promise<VoidTradeInCashResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(input.tradeInId).success) {
    return failure("VALIDATION_ERROR");
  }
  const reason = TRADE_IN_VOID_REASONS.find((value) => value === input.reason);
  if (!reason) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["reason"] };
  }
  const { organizationId, userId } = context;
  const tradeInId = input.tradeInId.toLowerCase();
  try {
    return await repository.withTransaction(async (tx) => {
      await repository.lockCash(tx, organizationId);
      const result = await voidTradeInInCash(tx, {
        organizationId,
        tradeInId,
        reason,
        createdBy: userId,
      });
      if (!result.ok) throw new Rejected(result);
      return result;
    });
  } catch (error) {
    if (error instanceof Rejected) return error.result;
    // La última defensa (D-5): una anulación doble que llegó hasta la base.
    if (!isTradeInAlreadyVoidedError(error)) throw error;
    const voidDisplayNumber = await findTradeInVoidNumber(
      organizationId,
      tradeInId,
    );
    if (voidDisplayNumber === null) throw error;
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "already_voided",
      voidDisplayNumber,
    };
  }
}
