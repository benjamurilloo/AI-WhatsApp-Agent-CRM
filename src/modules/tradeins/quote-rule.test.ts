import { describe, expect, it } from "vitest";
import { computeTradeInQuote, type QuoteRuleInput } from "./quote-rule";

// La regla de la cotización de un usado (brief-29.7.3, D-4 y D-8): cada término, el redondeo hacia
// abajo en los dos extremos, el piso en cero, y cada motivo de «no hay cotización». Montos en
// centésimas: 50000n son 500,00.

const usd = (amount: bigint) => ({ amount, currency: "USD" });

function input(overrides: Partial<QuoteRuleInput> = {}): QuoteRuleInput {
  return {
    reference: usd(50000n),
    margin: usd(5000n),
    repairs: [],
    batteryRepairMissing: false,
    rangePercent: 1000n,
    roundingStep: usd(1000n),
    ...overrides,
  };
}

describe("computeTradeInQuote", () => {
  it("sin reparaciones: el precio menos el margen, y el rango del 10 % redondeado a 10", () => {
    // 500 − 50 = 450; piso 405 → 400; techo 450.
    expect(computeTradeInQuote(input())).toEqual({
      ok: true,
      currency: "USD",
      value: 45000n,
      low: 40000n,
      high: 45000n,
    });
  });

  it("resta el costo de cada reparación", () => {
    const result = computeTradeInQuote(
      input({
        repairs: [
          { repairTypeId: "a", name: "Batería", cost: usd(4000n) },
          { repairTypeId: "b", name: "Cámara", cost: usd(2550n) },
        ],
      }),
    );
    // 500 − 40 − 25,50 − 50 = 384,50; techo 380; piso 346,05 → 340.
    expect(result).toEqual({
      ok: true,
      currency: "USD",
      value: 38450n,
      low: 34000n,
      high: 38000n,
    });
  });

  it("redondea hacia abajo, nunca hacia arriba, con centavos", () => {
    const result = computeTradeInQuote(
      input({ reference: usd(50999n), roundingStep: usd(1000n) }),
    );
    // 509,99 − 50 = 459,99 → 450; piso 413,99 → 410.
    expect(result).toMatchObject({ ok: true, high: 45000n, low: 41000n });
  });

  it("con un rango del 0 %, los dos extremos son el valor redondeado", () => {
    expect(computeTradeInQuote(input({ rangePercent: 0n }))).toMatchObject({
      ok: true,
      low: 45000n,
      high: 45000n,
    });
  });

  it("el piso puede quedar en cero: el rango es «hasta» el techo", () => {
    // 500 − 50 − 440 = 10; piso 5 → 0 con el 50 %.
    const result = computeTradeInQuote(
      input({
        rangePercent: 5000n,
        repairs: [{ repairTypeId: "a", name: "Pantalla", cost: usd(44000n) }],
      }),
    );
    expect(result).toMatchObject({ ok: true, low: 0n, high: 1000n });
  });

  it.each([
    ["no_reference_price", { reference: null }],
    ["no_margin", { margin: null }],
    ["no_battery_repair_type", { batteryRepairMissing: true }],
    ["currency_mismatch", { margin: { amount: 5000n, currency: "ARS" } }],
    ["currency_mismatch", { roundingStep: { amount: 1000n, currency: "ARS" } }],
    ["not_positive", { margin: usd(50000n) }],
    // Un valor positivo que no llega al paso del redondeo tampoco es una cotización.
    ["not_positive", { margin: usd(49500n) }],
  ] as const)("no hay cotización: %s", (reason, overrides) => {
    expect(computeTradeInQuote(input(overrides))).toEqual({
      ok: false,
      reason,
    });
  });

  it("una reparación sin costo dice cuál falta", () => {
    expect(
      computeTradeInQuote(
        input({
          repairs: [
            { repairTypeId: "a", name: "Batería", cost: usd(4000n) },
            { repairTypeId: "b", name: "Face ID", cost: null },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: "no_repair_cost", repairs: ["Face ID"] });
  });

  it("un costo en otra moneda es currency_mismatch", () => {
    expect(
      computeTradeInQuote(
        input({
          repairs: [
            {
              repairTypeId: "a",
              name: "Batería",
              cost: { amount: 4000000n, currency: "ARS" },
            },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: "currency_mismatch" });
  });
});
