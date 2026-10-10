import { describe, expect, it } from "vitest";
import {
  computeMargin,
  divideRoundingHalfAwayFromZero,
  formatMarginAmount,
  formatPercentTenths,
} from "./margin";

// brief-18.2, AC-4: el margen, el recargo, los tres motivos sin margen, el margen negativo y una
// moneda sin decimales.

const ars = (amount: string) => ({ amount, currency: "ARS" });

describe("divideRoundingHalfAwayFromZero", () => {
  it("redondea el medio hacia afuera del cero, en los dos signos", () => {
    expect(divideRoundingHalfAwayFromZero(5n, 2n)).toBe(3n);
    expect(divideRoundingHalfAwayFromZero(-5n, 2n)).toBe(-3n);
    expect(divideRoundingHalfAwayFromZero(7n, 3n)).toBe(2n);
    expect(divideRoundingHalfAwayFromZero(-7n, 3n)).toBe(-2n);
    expect(divideRoundingHalfAwayFromZero(8n, 3n)).toBe(3n);
    expect(divideRoundingHalfAwayFromZero(0n, 3n)).toBe(0n);
  });

  it("rechaza un divisor no positivo", () => {
    expect(() => divideRoundingHalfAwayFromZero(1n, 0n)).toThrow();
  });
});

describe("computeMargin", () => {
  it("el ejemplo del ADR 0019: 121 contra 60,50 da 50 % y un recargo del 100 %", () => {
    expect(computeMargin(ars("121.00"), ars("60.50"))).toEqual({
      ok: true,
      currency: "ARS",
      amount: 6050n,
      marginTenths: 500n,
      markupTenths: 1000n,
    });
  });

  it("redondea el porcentaje a la décima, con el medio hacia afuera", () => {
    // 1/3 del precio: 33,333… % → 33,3 %; recargo 50 %.
    const third = computeMargin(ars("3.00"), ars("2.00"));
    expect(third).toMatchObject({ marginTenths: 333n, markupTenths: 500n });
    // 0,05 % exacto → se redondea hacia arriba: 2000 de precio, 1999 de costo.
    const half = computeMargin(ars("2000.00"), ars("1999.00"));
    expect(half).toMatchObject({ marginTenths: 1n, markupTenths: 1n });
  });

  it("un costo mayor que el precio da un margen negativo", () => {
    expect(computeMargin(ars("100.00"), ars("125.00"))).toEqual({
      ok: true,
      currency: "ARS",
      amount: -2500n,
      marginTenths: -250n,
      markupTenths: -200n,
    });
  });

  it("una moneda sin decimales (CLP) da el monto exacto", () => {
    const margin = computeMargin(
      { amount: "300000.00", currency: "CLP" },
      { amount: "210000.00", currency: "CLP" },
    );
    expect(margin).toEqual({
      ok: true,
      currency: "CLP",
      amount: 9000000n,
      marginTenths: 300n,
      markupTenths: 429n,
    });
    // Sin centavos que la moneda no tiene.
    if (margin.ok) {
      expect(formatMarginAmount(margin.amount, "CLP")).toMatch(/90\.000$/);
    }
  });

  it("sin precio, sin costo o con monedas distintas no hay margen", () => {
    expect(computeMargin(null, ars("1.00"))).toEqual({
      ok: false,
      reason: "no_price",
    });
    expect(computeMargin(null, null)).toEqual({
      ok: false,
      reason: "no_price",
    });
    expect(computeMargin(ars("1.00"), null)).toEqual({
      ok: false,
      reason: "no_cost",
    });
    expect(
      computeMargin(ars("1.00"), { amount: "1.00", currency: "USD" }),
    ).toEqual({ ok: false, reason: "currency_mismatch" });
  });
});

describe("formatos", () => {
  it("el porcentaje con un decimal, el signo y el separador de miles", () => {
    expect(formatPercentTenths(500n)).toBe("50,0 %");
    expect(formatPercentTenths(-125n)).toBe("−12,5 %");
    expect(formatPercentTenths(19000n)).toBe("1.900,0 %");
    expect(formatPercentTenths(0n)).toBe("0,0 %");
    expect(formatPercentTenths(-3n)).toBe("−0,3 %");
  });

  it("el monto con su signo", () => {
    expect(formatMarginAmount(-2500n, "ARS")).toMatch(/^−.*25,00$/);
    expect(formatMarginAmount(6050n, "ARS")).toMatch(/60,50$/);
  });
});
