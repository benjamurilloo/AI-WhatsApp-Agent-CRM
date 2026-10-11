import { describe, expect, it } from "vitest";
import { MAX_AMOUNT } from "@/shared/money";
import { computeLineTotal, sumOrderTotal } from "./line-total";

// brief-19.2, AC-4: el total de línea con el redondeo del ADR 0019, punto 4.
describe("computeLineTotal", () => {
  it("multiplica precio por cantidad entera, sin redondeo", () => {
    // 1.234,50 × 3 = 3.703,50
    expect(computeLineTotal(123_450n, 3_000n, 2)).toEqual({
      ok: true,
      total: 370_350n,
    });
  });

  it("redondea con el medio hacia afuera del cero en una moneda con dos decimales", () => {
    // 0,05 × 0,5 = 0,025 → 0,03
    expect(computeLineTotal(5n, 500n, 2)).toEqual({ ok: true, total: 3n });
    // 0,05 × 0,3 = 0,015 → 0,02
    expect(computeLineTotal(5n, 300n, 2)).toEqual({ ok: true, total: 2n });
    // 0,05 × 0,1 = 0,005 → 0,01
    expect(computeLineTotal(5n, 100n, 2)).toEqual({ ok: true, total: 1n });
    // 0,03 × 0,1 = 0,003 → 0,00: el total en cero se rechaza
    expect(computeLineTotal(3n, 100n, 2)).toEqual({
      ok: false,
      reason: "zero_total",
    });
  });

  it("acepta cantidades con tres decimales", () => {
    // 1.000,00 × 1,234 = 1.234,00
    expect(computeLineTotal(100_000n, 1_234n, 2)).toEqual({
      ok: true,
      total: 123_400n,
    });
    // 999,99 × 0,001 = 0,99999 → 1,00
    expect(computeLineTotal(99_999n, 1n, 2)).toEqual({ ok: true, total: 100n });
  });

  it("redondea a pesos enteros en una moneda sin decimales (CLP)", () => {
    // 1.000 × 1,5 = 1.500
    expect(computeLineTotal(100_000n, 1_500n, 0)).toEqual({
      ok: true,
      total: 150_000n,
    });
    // 999 × 0,5 = 499,5 → 500
    expect(computeLineTotal(99_900n, 500n, 0)).toEqual({
      ok: true,
      total: 50_000n,
    });
    // 999 × 0,499 = 498,501 → 499
    expect(computeLineTotal(99_900n, 499n, 0)).toEqual({
      ok: true,
      total: 49_900n,
    });
    // 1 × 0,4 = 0,4 → 0
    expect(computeLineTotal(100n, 400n, 0)).toEqual({
      ok: false,
      reason: "zero_total",
    });
  });

  it("rechaza un total que no cabe en numeric(14, 2)", () => {
    expect(computeLineTotal(MAX_AMOUNT, 1_000n, 2)).toEqual({
      ok: true,
      total: MAX_AMOUNT,
    });
    expect(computeLineTotal(MAX_AMOUNT, 2_000n, 2)).toEqual({
      ok: false,
      reason: "amount_too_large",
    });
  });

  it("rechaza un precio o una cantidad que no es positiva, o decimales fuera de rango", () => {
    expect(() => computeLineTotal(0n, 1_000n, 2)).toThrow();
    expect(() => computeLineTotal(100n, 0n, 2)).toThrow();
    expect(() => computeLineTotal(100n, 1_000n, 3)).toThrow();
  });
});

describe("sumOrderTotal", () => {
  it("suma los totales de las líneas", () => {
    expect(sumOrderTotal([370_350n, 3n, 123_400n])).toBe(493_753n);
  });

  it("devuelve null si la suma no cabe en numeric(14, 2)", () => {
    expect(sumOrderTotal([MAX_AMOUNT, 0n])).toBe(MAX_AMOUNT);
    expect(sumOrderTotal([MAX_AMOUNT, 1n])).toBeNull();
  });
});
