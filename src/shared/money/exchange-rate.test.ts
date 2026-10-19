import { describe, expect, it } from "vitest";
import {
  convertMoney,
  exchangeRateFromDatabase,
  exchangeRateToDatabase,
  formatExchangeRate,
  MAX_AMOUNT,
  MAX_EXCHANGE_RATE,
  MIN_EXCHANGE_RATE,
  parseExchangeRateInput,
  type ExchangeRate,
  type Money,
} from "./index";

// La cotización y la conversión (ADR 0025, punto 3; brief-29.4, D-5 y D-13).

const rate = (text: string): ExchangeRate => exchangeRateFromDatabase(text);

describe("parseExchangeRateInput", () => {
  it("lee la coma como decimal y el punto como miles", () => {
    expect(parseExchangeRateInput("1565")).toEqual({
      ok: true,
      rate: rate("1565.000000"),
    });
    expect(parseExchangeRateInput("1.565")).toEqual({
      ok: true,
      rate: rate("1565.000000"),
    });
    expect(parseExchangeRateInput(" 1.565,5 ")).toEqual({
      ok: true,
      rate: rate("1565.500000"),
    });
    expect(parseExchangeRateInput("1565,123456")).toEqual({
      ok: true,
      rate: rate("1565.123456"),
    });
    expect(parseExchangeRateInput("1")).toEqual({
      ok: true,
      rate: MIN_EXCHANGE_RATE,
    });
  });

  it("rechaza lo que no es una cotización", () => {
    for (const value of ["", "abc", "1565.5", "1,565.50", "15.65", "-1", "1,"]) {
      expect(parseExchangeRateInput(value)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(parseExchangeRateInput("1565,1234567")).toEqual({
      ok: false,
      reason: "decimals",
    });
    expect(parseExchangeRateInput("1234567890123")).toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(parseExchangeRateInput("0,999999")).toEqual({
      ok: false,
      reason: "below_one",
    });
    expect(parseExchangeRateInput("0")).toEqual({
      ok: false,
      reason: "below_one",
    });
  });
});

describe("cotizaciones de la base", () => {
  it("convierte ida y vuelta sin perder precisión", () => {
    for (const value of [
      "1.000000",
      "1565.000000",
      "1565.123456",
      "999999999999.999999",
    ]) {
      expect(exchangeRateToDatabase(exchangeRateFromDatabase(value))).toBe(
        value,
      );
    }
    expect(exchangeRateFromDatabase("999999999999.999999")).toBe(
      MAX_EXCHANGE_RATE,
    );
  });

  it("rechaza otra escala y una cotización menor que 1", () => {
    expect(() => exchangeRateFromDatabase("1565.50")).toThrow();
    expect(() => exchangeRateFromDatabase("-1.000000")).toThrow();
    expect(() => exchangeRateToDatabase(MIN_EXCHANGE_RATE - 1n)).toThrow();
    expect(() => exchangeRateToDatabase(MAX_EXCHANGE_RATE + 1n)).toThrow();
  });
});

describe("formatExchangeRate", () => {
  it("muestra entre dos y seis decimales, sin pasar por number", () => {
    expect(formatExchangeRate(rate("1565.000000"))).toBe("1.565,00");
    expect(formatExchangeRate(rate("1565.500000"))).toBe("1.565,50");
    expect(formatExchangeRate(rate("1565.123456"))).toBe("1.565,123456");
    expect(formatExchangeRate(rate("999999999999.999999"))).toBe(
      "999.999.999.999,999999",
    );
  });
});

describe("convertMoney", () => {
  it("multiplica hacia la otra moneda y divide hacia la principal", () => {
    // USD 100,00 a 1.565 = ARS 156.500,00, y de vuelta.
    expect(
      convertMoney({
        amount: 10_000n,
        rate: rate("1565.000000"),
        direction: "to_quote",
        targetDecimals: 2,
      }),
    ).toEqual({ ok: true, amount: 15_650_000n });
    expect(
      convertMoney({
        amount: 15_650_000n,
        rate: rate("1565.000000"),
        direction: "to_base",
        targetDecimals: 2,
      }),
    ).toEqual({ ok: true, amount: 10_000n });
  });

  it("redondea con el medio hacia afuera del cero, a los decimales del destino", () => {
    // ARS 100,00 / 1.600 = USD 0,0625 → 0,06; ARS 104,00 / 1.600 = 0,065 → 0,07.
    expect(
      convertMoney({
        amount: 10_000n,
        rate: rate("1600.000000"),
        direction: "to_base",
        targetDecimals: 2,
      }),
    ).toEqual({ ok: true, amount: 6n });
    expect(
      convertMoney({
        amount: 10_400n,
        rate: rate("1600.000000"),
        direction: "to_base",
        targetDecimals: 2,
      }),
    ).toEqual({ ok: true, amount: 7n });
    // Hacia una moneda sin decimales: USD 1,00 a 1,5 = 1,5 → 2 unidades enteras.
    expect(
      convertMoney({
        amount: 100n,
        rate: rate("1.500000"),
        direction: "to_quote",
        targetDecimals: 0,
      }),
    ).toEqual({ ok: true, amount: 200n });
  });

  it("rechaza un resultado de cero y uno que no cabe en numeric(14, 2)", () => {
    expect(
      convertMoney({
        amount: 1n,
        rate: rate("1565.000000"),
        direction: "to_base",
        targetDecimals: 2,
      }),
    ).toEqual({ ok: false, reason: "zero" });
    expect(
      convertMoney({
        amount: MAX_AMOUNT,
        rate: rate("2.000000"),
        direction: "to_quote",
        targetDecimals: 2,
      }),
    ).toEqual({ ok: false, reason: "too_large" });
  });

  it("no acepta montos ni cotizaciones fuera de rango", () => {
    expect(() =>
      convertMoney({
        amount: 0n,
        rate: MIN_EXCHANGE_RATE,
        direction: "to_quote",
        targetDecimals: 2,
      }),
    ).toThrow();
    expect(() =>
      convertMoney({
        amount: 100n,
        rate: MIN_EXCHANGE_RATE - 1n,
        direction: "to_quote",
        targetDecimals: 2,
      }),
    ).toThrow();
    expect(() =>
      convertMoney({
        amount: 100n,
        rate: MIN_EXCHANGE_RATE,
        direction: "to_quote",
        targetDecimals: 3,
      }),
    ).toThrow();
  });
});

// Generador propio con semilla fija (mulberry32), como el de imputation.test.ts: cada corrida ve
// los mismos casos, y un caso que falla se reproduce con su semilla. Sin fast-check, para no sumar
// una dependencia (brief-29.4, D-5).
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Un bigint de hasta `digits` cifras, con más peso en los chicos: los bordes están ahí.
  const big = (digits: number): bigint => {
    const length = 1 + Math.floor(next() * digits);
    let text = "";
    for (let index = 0; index < length; index += 1) {
      text += Math.floor(next() * 10).toString();
    }
    return BigInt(text);
  };
  return { next, big };
}

const SEED = 20261018;
const CASES = 5_000;

describe("convertMoney: propiedades (ADR 0025, punto 3)", () => {
  it("nunca se aleja más de media unidad mínima del valor exacto", () => {
    const { big } = random(SEED);
    for (let index = 0; index < CASES; index += 1) {
      const amount = (big(10) % MAX_AMOUNT) + 1n;
      const value = MIN_EXCHANGE_RATE + (big(12) % 10_000_000_000n);
      for (const direction of ["to_quote", "to_base"] as const) {
        const result = convertMoney({
          amount,
          rate: value,
          direction,
          targetDecimals: 2,
        });
        if (!result.ok) continue;
        // El exacto es numerator / denominator, en centésimos. |converted − exacto| ≤ ½ ⇔
        // |2·(converted·denominator − numerator)| ≤ denominator.
        const [numerator, denominator] =
          direction === "to_quote"
            ? [amount * value, 1_000_000n]
            : [amount * 1_000_000n, value];
        const difference = result.amount * denominator - numerator;
        const twice = (difference < 0n ? -difference : difference) * 2n;
        expect(twice <= denominator, `semilla ${SEED}, caso ${index}`).toBe(
          true,
        );
      }
    }
  });

  it("con cotización ≥ 1 y los mismos decimales, la vuelta de la principal da el mismo monto", () => {
    const { big } = random(SEED + 1);
    for (let index = 0; index < CASES; index += 1) {
      const amount: Money = (big(8) % 10_000_000_000n) + 1n;
      const value = MIN_EXCHANGE_RATE + (big(10) % 5_000_000_000n);
      const there = convertMoney({
        amount,
        rate: value,
        direction: "to_quote",
        targetDecimals: 2,
      });
      if (!there.ok) continue;
      const back = convertMoney({
        amount: there.amount,
        rate: value,
        direction: "to_base",
        targetDecimals: 2,
      });
      expect(back, `semilla ${SEED + 1}, caso ${index}`).toEqual({
        ok: true,
        amount,
      });
    }
  });
});
