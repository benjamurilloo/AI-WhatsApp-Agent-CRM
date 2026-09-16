import { describe, expect, it } from "vitest";
import {
  formatQuantity,
  MAX_QUANTITY,
  parseQuantityInput,
  quantityFromDatabase,
  quantityToDatabase,
} from "./index";

describe("parseQuantityInput", () => {
  it("acepta enteros y hasta tres decimales, con punto o coma", () => {
    expect(parseQuantityInput("10")).toBe(10_000n);
    expect(parseQuantityInput("2,5")).toBe(2_500n);
    expect(parseQuantityInput("2.5")).toBe(2_500n);
    expect(parseQuantityInput("0.001")).toBe(1n);
    expect(parseQuantityInput(" 7,250 ")).toBe(7_250n);
    expect(parseQuantityInput("0")).toBe(0n);
  });

  it("acepta el máximo de numeric(14, 3) y rechaza lo que lo supera", () => {
    expect(parseQuantityInput("99999999999,999")).toBe(MAX_QUANTITY);
    expect(parseQuantityInput("100000000000")).toBeNull();
  });

  it("rechaza negativos, más de tres decimales y otros formatos", () => {
    for (const value of [
      "",
      " ",
      "-1",
      "+1",
      "1,2345",
      "1.",
      ",5",
      "1.000,5",
      "1e3",
      "abc",
      "1 000",
    ]) {
      expect(parseQuantityInput(value)).toBeNull();
    }
  });
});

describe("cantidades de la base", () => {
  it("convierte ida y vuelta sin perder precisión", () => {
    for (const value of [
      "0.000",
      "0.001",
      "10.000",
      "2.500",
      "99999999999.999",
    ]) {
      expect(quantityToDatabase(quantityFromDatabase(value))).toBe(value);
    }
    expect(quantityFromDatabase("-1.500")).toBe(-1_500n);
    expect(quantityToDatabase(-1_500n)).toBe("-1.500");
  });

  it("suma y compara exacto donde number no", () => {
    // Con number, 0,1 + 0,2 no es 0,3.
    expect(0.1 + 0.2 === 0.3).toBe(false);
    expect(quantityFromDatabase("0.100") + quantityFromDatabase("0.200")).toBe(
      quantityFromDatabase("0.300"),
    );
    expect(
      quantityFromDatabase("99999999999.999") >
        quantityFromDatabase("99999999999.998"),
    ).toBe(true);
  });

  it("rechaza un valor que no tiene la escala de la base", () => {
    expect(() => quantityFromDatabase("10")).toThrow();
    expect(() => quantityFromDatabase("1.5")).toThrow();
  });
});

describe("formatQuantity", () => {
  it("muestra con coma decimal y sin ceros finales", () => {
    expect(formatQuantity("2.500")).toBe("2,5");
    expect(formatQuantity("10.000")).toBe("10");
    expect(formatQuantity("0.000")).toBe("0");
    expect(formatQuantity("0.001")).toBe("0,001");
    expect(formatQuantity("6.750")).toBe("6,75");
    expect(formatQuantity("99999999999.999")).toBe("99999999999,999");
    expect(formatQuantity("-1.500")).toBe("-1,5");
  });

  it("rechaza un valor que no viene de la base", () => {
    expect(() => formatQuantity("2,5")).toThrow();
  });
});
