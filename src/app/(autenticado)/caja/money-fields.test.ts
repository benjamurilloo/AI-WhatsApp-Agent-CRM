import { describe, expect, it } from "vitest";
import { amountReading, currencyLabel } from "./money-fields";

// Cómo se lee el monto de la caja (recorrido de la 21.2): con los separadores de miles de la
// moneda, y nada mientras no se entiende.
describe("amountReading", () => {
  it("muestra los separadores de miles", () => {
    expect(amountReading("100000", "ARS")).toMatch(/^\$\s100\.000,00$/);
    expect(amountReading("1.234,5", "ARS")).toMatch(/^\$\s1\.234,50$/);
  });

  it("respeta los decimales de la moneda", () => {
    expect(amountReading("7400", "CLP")).toMatch(/^CLP\s7\.400$/);
  });

  it("muestra el cero, que la apertura y el cierre admiten", () => {
    expect(amountReading("0", "ARS")).toMatch(/^\$\s0,00$/);
  });

  it("no muestra nada si el monto es ambiguo, inválido o falta la moneda", () => {
    expect(amountReading("100.000", "ARS")).toBeNull();
    expect(amountReading("abc", "ARS")).toBeNull();
    expect(amountReading("", "ARS")).toBeNull();
    expect(amountReading("100", "")).toBeNull();
  });
});

describe("currencyLabel", () => {
  it("lleva el código y el nombre en español", () => {
    expect(currencyLabel("USD")).toBe("USD — dólar estadounidense");
  });
});
