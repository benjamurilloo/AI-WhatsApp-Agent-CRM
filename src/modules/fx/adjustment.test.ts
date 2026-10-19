import { describe, expect, it } from "vitest";
import {
  adjustmentFromDatabase,
  adjustmentToDatabase,
  formatAdjustment,
  parseAdjustmentInput,
} from "./adjustment";

// El ajuste con signo (brief-29.4.2, D-9): cero y negativos se aceptan, y nunca pasa por number.

describe("parseAdjustmentInput", () => {
  it.each([
    ["10", 1000n],
    ["0", 0n],
    ["-5,50", -550n],
    ["  16,5 ", 1650n],
    ["1.000", 100000n],
    ["-1.000,25", -100025n],
    ["007", 700n],
  ])("lee «%s»", (text, expected) => {
    expect(parseAdjustmentInput(text)).toEqual({
      ok: true,
      adjustment: expected,
    });
  });

  it.each([
    ["", "invalid"],
    ["diez", "invalid"],
    ["+10", "invalid"],
    ["10.5", "invalid"],
    ["1,5e3", "invalid"],
    ["--1", "invalid"],
    ["1,234", "decimals"],
    ["1234567890123", "too_large"],
  ])("rechaza «%s» por %s", (text, reason) => {
    expect(parseAdjustmentInput(text)).toEqual({ ok: false, reason });
  });
});

describe("la base", () => {
  it.each([
    ["10.00", 1000n],
    ["0.00", 0n],
    ["-5.50", -550n],
    ["-0.01", -1n],
  ])("ida y vuelta de «%s»", (text, value) => {
    expect(adjustmentFromDatabase(text)).toBe(value);
    expect(adjustmentToDatabase(value)).toBe(text);
  });

  it("rechaza otro formato y un valor fuera de numeric(14, 2)", () => {
    expect(() => adjustmentFromDatabase("10")).toThrow();
    expect(() => adjustmentToDatabase(10n ** 15n)).toThrow();
  });
});

describe("formatAdjustment", () => {
  it("con coma decimal, puntos de miles y signo solo si es negativo", () => {
    expect(formatAdjustment(1000n)).toBe("10,00");
    expect(formatAdjustment(-550n)).toBe("-5,50");
    expect(formatAdjustment(100000n)).toBe("1.000,00");
  });
});
