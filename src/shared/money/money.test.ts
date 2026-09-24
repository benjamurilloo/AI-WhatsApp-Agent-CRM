import { describe, expect, it } from "vitest";
import {
  acceptedCurrencies,
  currencyDecimals,
  formatMoney,
  MAX_AMOUNT,
  moneyFromDatabase,
  moneyToDatabase,
  parseMoneyInput,
} from "./index";

// Reglas de D-6 (brief-11.1, AC-8): cómo se escribe un monto según los decimales de su moneda.

function parse(value: string, currency: string) {
  const found = currencyDecimals(currency);
  if (!found.ok) throw new Error(`moneda rechazada: ${currency}`);
  return parseMoneyInput(value, found.decimals);
}

describe("currencyDecimals", () => {
  it("usa los decimales de Intl", () => {
    expect(currencyDecimals("CLP")).toEqual({ ok: true, decimals: 0 });
    expect(currencyDecimals("JPY")).toEqual({ ok: true, decimals: 0 });
    expect(currencyDecimals("USD")).toEqual({ ok: true, decimals: 2 });
    expect(currencyDecimals("ARS")).toEqual({ ok: true, decimals: 2 });
  });

  it("rechaza las monedas con tres decimales, como KWD", () => {
    for (const currency of ["KWD", "BHD", "JOD", "OMR", "TND", "LYD"]) {
      expect(currencyDecimals(currency)).toEqual({
        ok: false,
        reason: "too_many_decimals",
      });
    }
  });

  it("rechaza una moneda que Intl no conoce o mal escrita", () => {
    for (const currency of ["ZZZ", "usd", "US", "USDX", "", " USD"]) {
      expect(currencyDecimals(currency)).toEqual({
        ok: false,
        reason: "unknown",
      });
    }
  });

  it("la lista para elegir no tiene monedas rechazadas", () => {
    const accepted = acceptedCurrencies();
    expect(accepted).toContain("CLP");
    expect(accepted).toContain("USD");
    expect(accepted).not.toContain("KWD");
    expect(accepted.every((currency) => currencyDecimals(currency).ok)).toBe(
      true,
    );
  });
});

describe("parseMoneyInput", () => {
  it("rechaza «300.000» y «300,000» en CLP, sin adivinar: se escribe sin separadores", () => {
    expect(parse("300.000", "CLP")).toEqual({ ok: false, reason: "separator" });
    expect(parse("300,000", "CLP")).toEqual({ ok: false, reason: "separator" });
    expect(parse("300,5", "CLP")).toEqual({ ok: false, reason: "separator" });
  });

  it("acepta «300000» en CLP", () => {
    expect(parse("300000", "CLP")).toEqual({ ok: true, amount: 30_000_000n });
    expect(parse(" 300000 ", "CLP")).toEqual({ ok: true, amount: 30_000_000n });
  });

  it("acepta «1.234,5», «1,234.5» y «1234,50» en USD", () => {
    for (const value of ["1.234,5", "1,234.5", "1234,50", "1234.5", "1234,5"]) {
      expect(parse(value, "USD"), value).toEqual({
        ok: true,
        amount: 123_450n,
      });
    }
    expect(parse("1.234.567,89", "USD")).toEqual({
      ok: true,
      amount: 123_456_789n,
    });
    expect(parse("0,10", "USD")).toEqual({ ok: true, amount: 10n });
    expect(parse("15", "USD")).toEqual({ ok: true, amount: 1_500n });
  });

  it("rechaza más decimales de los que tiene la moneda: «1234,567» en USD", () => {
    expect(parse("1234,567", "USD")).toEqual({ ok: false, reason: "decimals" });
    // Ambiguo: mil doscientos treinta y cuatro, o uno con veintitrés.
    expect(parse("1.234", "USD")).toEqual({ ok: false, reason: "decimals" });
  });

  it("rechaza más de doce dígitos enteros y acepta el máximo de numeric(14, 2)", () => {
    expect(parse("999999999999,99", "USD")).toEqual({
      ok: true,
      amount: MAX_AMOUNT,
    });
    expect(parse("999999999999", "CLP")).toEqual({
      ok: true,
      amount: 99_999_999_999_900n,
    });
    expect(parse("1000000000000", "CLP")).toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(parse("1.000.000.000.000,00", "USD")).toEqual({
      ok: false,
      reason: "too_large",
    });
    // Los ceros a la izquierda no cuentan como dígitos.
    expect(parse("0000000000001", "CLP")).toEqual({ ok: true, amount: 100n });
  });

  it("rechaza cero, negativos y otras formas", () => {
    expect(parse("0", "USD")).toEqual({ ok: false, reason: "zero" });
    expect(parse("0,00", "USD")).toEqual({ ok: false, reason: "zero" });
    for (const value of [
      "",
      " ",
      "-5",
      "+5",
      "1e3",
      "abc",
      "1 000",
      "$100",
      "1,",
      ",5",
      "1.234.567",
      "1.23.456,7",
      "1,234,5",
      // Un grupo de miles no empieza en cero (revisión independiente de la 11.1, N-1).
      "0.000,5",
      "01.234,5",
    ]) {
      expect(parse(value, "USD"), value).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
  });
});

describe("montos de la base", () => {
  it("convierte ida y vuelta sin perder precisión", () => {
    for (const value of ["0.01", "1234.50", "300000.00", "999999999999.99"]) {
      expect(moneyToDatabase(moneyFromDatabase(value))).toBe(value);
    }
  });

  it("rechaza un valor que no tiene la escala de la base", () => {
    expect(() => moneyFromDatabase("10")).toThrow();
    expect(() => moneyFromDatabase("1.5")).toThrow();
    expect(() => moneyFromDatabase("-1.50")).toThrow();
  });
});

describe("formatMoney", () => {
  // Intl separa el símbolo con un espacio que no se corta (U+00A0).
  it("muestra con los decimales de la moneda y sin pasar por number", () => {
    expect(formatMoney("300000.00", "CLP")).toBe("CLP 300.000");
    expect(formatMoney("1234.50", "USD")).toBe("US$ 1.234,50");
    expect(formatMoney("1234.50", "ARS")).toBe("$ 1.234,50");
    // Con number, 1,15 en centésimas no da 115.
    expect(Number("1.15") * 100).not.toBe(115);
    expect(moneyFromDatabase("1.15")).toBe(115n);
    expect(formatMoney("999999999999.99", "USD")).toBe(
      "US$ 999.999.999.999,99",
    );
  });
});
