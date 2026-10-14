import { describe, expect, it } from "vitest";
import { computeCashTotals, parseCashAmount } from "./totals";

describe("computeCashTotals (ADR 0022, punto 8; brief-21.2, D-4)", () => {
  it("sin nada no hay monedas", () => {
    expect(computeCashTotals({ opening: [], movements: [] })).toEqual([]);
  });

  it("esperado = inicial + aportes − retiros, por moneda y sin mezclarlas", () => {
    const totals = computeCashTotals({
      opening: [
        { currency: "USD", amount: "50.00" },
        { currency: "ARS", amount: "10000.00" },
      ],
      movements: [
        { kind: "contribution", currency: "ARS", amount: "2500.50" },
        { kind: "withdrawal", currency: "ARS", amount: "3000.00" },
        { kind: "withdrawal", currency: "USD", amount: "20.00" },
        { kind: "contribution", currency: "ARS", amount: "0.50" },
      ],
    });
    expect(totals).toEqual([
      {
        currency: "ARS",
        initial: 1_000_000n,
        contributions: 250_100n,
        withdrawals: 300_000n,
        expected: 950_100n,
      },
      {
        currency: "USD",
        initial: 5_000n,
        contributions: 0n,
        withdrawals: 2_000n,
        expected: 3_000n,
      },
    ]);
  });

  it("una moneda sin inicial cuenta con inicial cero", () => {
    expect(
      computeCashTotals({
        opening: [{ currency: "ARS", amount: "0.00" }],
        movements: [{ kind: "contribution", currency: "EUR", amount: "10.00" }],
      }),
    ).toEqual([
      {
        currency: "ARS",
        initial: 0n,
        contributions: 0n,
        withdrawals: 0n,
        expected: 0n,
      },
      {
        currency: "EUR",
        initial: 0n,
        contributions: 1_000n,
        withdrawals: 0n,
        expected: 1_000n,
      },
    ]);
  });

  it("las monedas salen en orden alfabético", () => {
    const totals = computeCashTotals({
      opening: [
        { currency: "USD", amount: "1.00" },
        { currency: "EUR", amount: "1.00" },
        { currency: "ARS", amount: "1.00" },
      ],
      movements: [],
    });
    expect(totals.map((row) => row.currency)).toEqual(["ARS", "EUR", "USD"]);
  });
});

describe("parseCashAmount (brief-21.2, H-2 y D-3)", () => {
  it("acepta el cero solo donde se permite", () => {
    for (const text of ["0", "000", "0,00", "0.0", " 0 "]) {
      expect(parseCashAmount(text, "ARS", { allowZero: true }), text).toEqual({
        ok: true,
        amount: 0n,
      });
    }
    expect(parseCashAmount("0", "ARS", { allowZero: false })).toEqual({
      ok: false,
      reason: "zero",
    });
    expect(parseCashAmount("0,00", "ARS", { allowZero: false })).toEqual({
      ok: false,
      reason: "zero",
    });
  });

  it("el cero respeta los decimales de la moneda", () => {
    // El peso chileno no tiene decimales: «0,00» se rechaza como cualquier separador.
    expect(parseCashAmount("0", "CLP", { allowZero: true })).toEqual({
      ok: true,
      amount: 0n,
    });
    expect(parseCashAmount("0,00", "CLP", { allowZero: true })).toEqual({
      ok: false,
      reason: "separator",
    });
    expect(parseCashAmount("0,000", "ARS", { allowZero: true })).toEqual({
      ok: false,
      reason: "decimals",
    });
  });

  it("cualquier otro monto lo lee el parser de los precios", () => {
    expect(parseCashAmount("1.234,50", "ARS", { allowZero: true })).toEqual({
      ok: true,
      amount: 123_450n,
    });
    expect(parseCashAmount("abc", "ARS", { allowZero: true })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(parseCashAmount("-5", "ARS", { allowZero: true })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rechaza una moneda que no se acepta", () => {
    expect(parseCashAmount("10", "XYZ", { allowZero: true })).toEqual({
      ok: false,
      reason: "currency",
    });
  });
});
