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
        supplierPayments: [],
        supplierPaymentVoids: [],
        tradeInPayments: [],
        tradeInPaymentVoids: [],
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
      supplierPayments: [],
      supplierPaymentVoids: [],
      tradeInPayments: [],
      tradeInPaymentVoids: [],
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
        supplierPayments: 0n,
        supplierPaymentVoids: 0n,
        tradeInPayments: 0n,
        tradeInPaymentVoids: 0n,
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
        supplierPayments: 0n,
        supplierPaymentVoids: 0n,
        tradeInPayments: 0n,
        tradeInPaymentVoids: 0n,
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
        supplierPayments: [],
        supplierPaymentVoids: [],
        tradeInPayments: [],
        tradeInPaymentVoids: [],
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
        supplierPayments: 0n,
        supplierPaymentVoids: 0n,
        tradeInPayments: 0n,
        tradeInPaymentVoids: 0n,
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
        supplierPayments: 0n,
        supplierPaymentVoids: 0n,
        tradeInPayments: 0n,
        tradeInPaymentVoids: 0n,
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
      supplierPayments: [],
      supplierPaymentVoids: [],
      tradeInPayments: [],
      tradeInPaymentVoids: [],
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
        supplierPayments: [],
        supplierPaymentVoids: [],
        tradeInPayments: [],
        tradeInPaymentVoids: [],
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
        supplierPayments: 0n,
        supplierPaymentVoids: 0n,
        tradeInPayments: 0n,
        tradeInPaymentVoids: 0n,
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
        supplierPayments: 0n,
        supplierPaymentVoids: 0n,
        tradeInPayments: 0n,
        tradeInPaymentVoids: 0n,
        contributions: 0n,
        withdrawals: 0n,
        expected: 2_000n,
      },
    ]);
  });

  // Desde la 29.7.2 (brief-29.7.2, D-5): los pagos de usados restan como los pagos a proveedores, y sus
  // anulaciones en la sesión suman, cada uno en su moneda.
  it("los pagos de usados en efectivo restan y sus anulaciones en la sesión suman", () => {
    const totals = computeCashTotals({
      opening: [{ currency: "USD", amount: "500.00" }],
      receipts: [],
      receiptVoids: [],
      refunds: [],
      refundVoids: [],
      supplierPayments: [{ currency: "USD", amount: "40.00" }],
      supplierPaymentVoids: [],
      tradeInPayments: [
        { currency: "USD", amount: "300.00" },
        { currency: "ARS", amount: "1000.00" },
      ],
      tradeInPaymentVoids: [{ currency: "USD", amount: "100.00" }],
      movements: [],
    });
    expect(
      totals.map((row) => ({
        currency: row.currency,
        tradeInPayments: row.tradeInPayments,
        tradeInPaymentVoids: row.tradeInPaymentVoids,
        expected: row.expected,
      })),
    ).toEqual([
      {
        currency: "ARS",
        tradeInPayments: 100_000n,
        tradeInPaymentVoids: 0n,
        expected: -100_000n,
      },
      {
        currency: "USD",
        tradeInPayments: 30_000n,
        tradeInPaymentVoids: 10_000n,
        expected: 50_000n - 4_000n - 30_000n + 10_000n,
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
        supplierPayments: [],
        supplierPaymentVoids: [],
        tradeInPayments: [],
        tradeInPaymentVoids: [],
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
        supplierPayments: 0n,
        supplierPaymentVoids: 0n,
        tradeInPayments: 0n,
        tradeInPaymentVoids: 0n,
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
        supplierPayments: [],
        supplierPaymentVoids: [],
        tradeInPayments: [],
        tradeInPaymentVoids: [],
        movements: [],
      }).map((row) => [row.currency, row.expected]),
    ).toEqual([["USD", 600n]]);
  });
});

describe("computeCashTotals con los pagos a proveedores (ADR 0023, punto 8; brief-22.6, D-9)", () => {
  it("esperado = … − pagos a proveedores en efectivo + pagos anulados en la sesión", () => {
    const totals = computeCashTotals({
      opening: [{ currency: "ARS", amount: "1000.00" }],
      receipts: [{ currency: "ARS", amount: "300.00" }],
      receiptVoids: [],
      refunds: [],
      refundVoids: [],
      supplierPayments: [
        { currency: "ARS", amount: "400.00" },
        { currency: "ARS", amount: "150.00" },
      ],
      supplierPaymentVoids: [{ currency: "ARS", amount: "150.00" }],
      tradeInPayments: [],
      tradeInPaymentVoids: [],
      movements: [{ kind: "withdrawal", currency: "ARS", amount: "100.00" }],
    });
    expect(totals).toEqual([
      {
        currency: "ARS",
        initial: 100_000n,
        receipts: 30_000n,
        receiptVoids: 0n,
        refunds: 0n,
        refundVoids: 0n,
        supplierPayments: 55_000n,
        supplierPaymentVoids: 15_000n,
        tradeInPayments: 0n,
        tradeInPaymentVoids: 0n,
        contributions: 0n,
        withdrawals: 10_000n,
        // 1000 + 300 − 100 − 550 + 150
        expected: 80_000n,
      },
    ]);
  });

  it("una moneda solo con pagos a proveedores tiene su fila, para que el cierre la cuente", () => {
    const totals = computeCashTotals({
      opening: [],
      receipts: [],
      receiptVoids: [],
      refunds: [],
      refundVoids: [],
      supplierPayments: [{ currency: "USD", amount: "20.00" }],
      supplierPaymentVoids: [{ currency: "EUR", amount: "5.00" }],
      tradeInPayments: [],
      tradeInPaymentVoids: [],
      movements: [],
    });
    expect(totals.map((row) => [row.currency, row.expected])).toEqual([
      ["EUR", 500n],
      ["USD", -2_000n],
    ]);
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
