import type { Money } from "@/shared/money";

// La regla de la cotización de un usado (ADR 0024, punto 9; brief-29.7.3, D-4), sin base ni contexto:
//
//   valor orientativo = precio de referencia − Σ costo de cada reparación que necesita − margen
//
// y el rango: el valor y el valor menos el porcentaje, los dos redondeados hacia abajo a un múltiplo del
// paso (R-21). Montos en centésimas como bigint; el porcentaje, en centésimas de punto (10 % = 1000n).
// quoteTradeIn junta los datos y llama a esta función; las pruebas unitarias la recorren entera.

export type QuoteAmount = { amount: Money; currency: string };

export type QuoteRepair = {
  repairTypeId: string;
  name: string;
  // Null si el tipo no tiene costo para el modelo.
  cost: QuoteAmount | null;
};

export type QuoteRuleInput = {
  reference: QuoteAmount | null;
  margin: QuoteAmount | null;
  // Las reparaciones que necesita el equipo, sin repetir.
  repairs: QuoteRepair[];
  // La batería está bajo el umbral y la organización no eligió su reparación.
  batteryRepairMissing: boolean;
  rangePercent: bigint;
  roundingStep: QuoteAmount;
};

export type QuoteUnavailableReason =
  | "no_reference_price"
  | "no_margin"
  | "no_battery_repair_type"
  | "no_repair_cost"
  | "currency_mismatch"
  | "not_positive";

export type QuoteRuleResult =
  | {
      ok: true;
      currency: string;
      value: Money;
      low: Money;
      high: Money;
    }
  | { ok: false; reason: QuoteUnavailableReason; repairs?: string[] };

const PERCENT_FACTOR = 10_000n;

function floorToStep(amount: Money, step: Money): Money {
  return (amount / step) * step;
}

export function computeTradeInQuote(input: QuoteRuleInput): QuoteRuleResult {
  if (!input.reference) return { ok: false, reason: "no_reference_price" };
  if (!input.margin) return { ok: false, reason: "no_margin" };
  if (input.batteryRepairMissing) {
    return { ok: false, reason: "no_battery_repair_type" };
  }
  const withoutCost = input.repairs.filter((repair) => repair.cost === null);
  if (withoutCost.length > 0) {
    return {
      ok: false,
      reason: "no_repair_cost",
      repairs: withoutCost.map((repair) => repair.name),
    };
  }
  const currency = input.reference.currency;
  const amounts = [
    input.margin,
    input.roundingStep,
    ...input.repairs.map((repair) => repair.cost!),
  ];
  if (amounts.some((amount) => amount.currency !== currency)) {
    return { ok: false, reason: "currency_mismatch" };
  }
  const value =
    input.reference.amount -
    input.repairs.reduce((sum, repair) => sum + repair.cost!.amount, 0n) -
    input.margin.amount;
  const step = input.roundingStep.amount;
  const high = value > 0n ? floorToStep(value, step) : 0n;
  if (high <= 0n) return { ok: false, reason: "not_positive" };
  // El piso se calcula sobre el valor sin redondear, y se redondea hacia abajo como el techo.
  const low = floorToStep(
    (value * (PERCENT_FACTOR - input.rangePercent)) / PERCENT_FACTOR,
    step,
  );
  return { ok: true, currency, value, low, high };
}
