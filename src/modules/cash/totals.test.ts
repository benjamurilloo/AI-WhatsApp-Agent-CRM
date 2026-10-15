import { describe, expect, it } from "vitest";
import { computeCashTotals, parseCashAmount } from "./totals";

describe("computeCashTotals (ADR 0022, punto 8; brief-21.2, D-4)", () => {
  it("sin nada no hay monedas", () => {
    expect(
      computeCashTotals({
        opening: [],
        receipts: [],
        receiptVoids: [],
        refunds: [],
        refundVoids: [],
        movements: [],
      }),
    ).toEqual([]);
  });

  it("esperado = inicial + aportes − retiros, por moneda y sin mezclarlas", () => {
    const totals = computeCashTotals({
      opening: [
        { currency: "USD", amount: "50.00" },
        { currency: "ARS", amount: "10000.00" },
      ],
      receipts: [],
      receiptVoids: [],
      refunds: [],
      refundVoids: [],
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
        receipts: 0n,
        receiptVoids: 0n,
        refunds: 0n,
        refundVoids: 0n,
        contributions: 250_100n,
        withdrawals: 300_000n,
        expected: 950_100n,
      },
      {
        currency: "USD",
        initial: 5_000n,
        receipts: 0n,
        receiptVoids: 0n,
        refunds: 0n,
        refundVoids: 0n,
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
        receipts: [],
        receiptVoids: [],
        refunds: [],
        refundVoids: [],
        movements: [{ kind: "contribution", currency: "EUR", amount: "10.00" }],
      }),
    ).toEqual([
      {
        currency: "ARS",
        initial: 0n,
        receipts: 0n,
        receiptVoids: 0n,
        refunds: 0n,
        refundVoids: 0n,
        contributions: 0n,
        withdrawals: 0n,
        expected: 0n,
      },
      {
        currency: "EUR",
        initial: 0n,
        receipts: 0n,
        receiptVoids: 0n,
        refunds: 0n,
        refundVoids: 0n,
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
      receipts: [],
      receiptVoids: [],
      refunds: [],
      refundVoids: [],
      movements: [],
    });
    expect(totals.map((row) => row.currency)).toEqual(["ARS", "EUR", "USD"]);
  });

  it("los cobros en efectivo suman a lo esperado de su moneda, y una moneda solo con cobros tiene su fila (brief-21.3, D-5)", () => {
    expect(
      computeCashTotals({
        opening: [{ currency: "ARS", amount: "100.00" }],
        receipts: [
          { currency: "ARS", amount: "250.00" },
          { currency: "ARS", amount: "50.50" },
          { currency: "USD", amount: "20.00" },
        ],
        receiptVoids: [],
        refunds: [],
        refundVoids: [],
        movements: [{ kind: "withdrawal", currency: "ARS", amount: "300.00" }],
      }),
    ).toEqual([
      {
        currency: "ARS",
        initial: 10_000n,
        receipts: 30_050n,
        receiptVoids: 0n,
        refunds: 0n,
        refundVoids: 0n,
        contributions: 0n,
        withdrawals: 30_000n,
        expected: 10_050n,
      },
      {
        currency: "USD",
        initial: 0n,
        receipts: 2_000n,
        receiptVoids: 0n,
        refunds: 0n,
        refundVoids: 0n,
        contributions: 0n,
        withdrawals: 0n,
        expected: 2_000n,
      },
    ]);
  });
});

describe("computeCashTotals con las anulaciones y las devoluciones (ADR 0022, puntos 7 y 8; brief-21.5, D-6)", () => {
  it("esperado = inicial + cobros − anulados en la sesión − devoluciones + devoluciones anuladas en la sesión + aportes − retiros", () => {
    expect(
      computeCashTotals({
        opening: [{ currency: "ARS", amount: "100.00" }],
        receipts: [
          { currency: "ARS", amount: "250.00" },
          { currency: "ARS", amount: "40.00" },
        ],
        receiptVoids: [{ currency: "ARS", amount: "40.00" }],
        refunds: [
          { currency: "ARS", amount: "30.00" },
          { currency: "ARS", amount: "5.00" },
        ],
        refundVoids: [{ currency: "ARS", amount: "5.00" }],
        movements: [
          { kind: "contribution", currency: "ARS", amount: "10.00" },
          { kind: "withdrawal", currency: "ARS", amount: "20.00" },
        ],
      }),
    ).toEqual([
      {
        currency: "ARS",
        initial: 10_000n,
        receipts: 29_000n,
        receiptVoids: 4_000n,
        refunds: 3_500n,
        refundVoids: 500n,
        contributions: 1_000n,
        withdrawals: 2_000n,
        expected: 31_000n,
      },
    ]);
  });

  it("una moneda solo con devoluciones tiene su fila, para que el cierre la cuente", () => {
    expect(
      computeCashTotals({
        opening: [],
        receipts: [{ currency: "USD", amount: "10.00" }],
        receiptVoids: [],
        refunds: [{ currency: "USD", amount: "4.00" }],
        refundVoids: [],
        movements: [],
      }).map((row) => [row.currency, row.expected]),
    ).toEqual([["USD", 600n]]);
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
