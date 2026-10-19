import { describe, expect, it } from "vitest";
import { exchangeRateFromDatabase } from "@/shared/money";
import { isLargeChange, referenceTotal, type ExchangeSetup } from "./service";

// El total de referencia y la confirmación de una carga que se mueve mucho (ADR 0025, puntos 4, 6 y
// 7; brief-29.4, D-4, D-7 y D-8).

const setup: ExchangeSetup = {
  mainCurrency: "USD",
  quoteCurrency: "ARS",
  current: {
    id: "00000000-0000-4000-8000-000000000001",
    baseCurrency: "USD",
    quoteCurrency: "ARS",
    rate: exchangeRateFromDatabase("1600.000000"),
    source: "manual",
    recordedBy: "00000000-0000-4000-8000-000000000002",
    recordedAt: new Date("2026-10-18T12:00:00Z"),
    stale: false,
  },
};

describe("referenceTotal", () => {
  it("suma en la principal, convirtiendo la otra con la vigente", () => {
    expect(
      referenceTotal(setup, [
        { currency: "USD", amount: 10_000n },
        { currency: "ARS", amount: 16_000_000n },
      ]),
    ).toMatchObject({ currency: "USD", total: 20_000n, unconverted: [] });
  });

  it("no convierte una tercera moneda: la nombra aparte", () => {
    expect(
      referenceTotal(setup, [
        { currency: "ARS", amount: 160_000n },
        { currency: "EUR", amount: 500n },
      ]),
    ).toMatchObject({ total: 100n, unconverted: ["EUR"] });
  });

  it("es null sin moneda principal, sin vigente o con todo en la principal", () => {
    expect(referenceTotal(null, [{ currency: "ARS", amount: 1n }])).toBeNull();
    expect(
      referenceTotal({ ...setup, current: null }, [
        { currency: "ARS", amount: 1n },
      ]),
    ).toBeNull();
    expect(
      referenceTotal(setup, [{ currency: "USD", amount: 100n }]),
    ).toBeNull();
  });

  it("un monto en pesos que da menos de un centavo suma cero", () => {
    expect(
      referenceTotal(setup, [{ currency: "ARS", amount: 1n }]),
    ).toMatchObject({ total: 0n });
  });
});

describe("isLargeChange", () => {
  const rate = (text: string) => exchangeRateFromDatabase(text);
  it("más de un 10 % para arriba o para abajo", () => {
    expect(isLargeChange(rate("1000.000000"), rate("1100.000000"))).toBe(false);
    expect(isLargeChange(rate("1000.000000"), rate("1100.000001"))).toBe(true);
    expect(isLargeChange(rate("1000.000000"), rate("899.999999"))).toBe(true);
    expect(isLargeChange(rate("1000.000000"), rate("900.000000"))).toBe(false);
  });
});
