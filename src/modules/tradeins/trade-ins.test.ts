import { describe, expect, it } from "vitest";
import {
  parseTradeInNumberSearch,
  validateTradeInInput,
  type TradeInInput,
} from "./trade-ins";

// La validación de la recepción de un usado (brief-29.7, D-4 y D-10), sin base.

const CLIENT = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const GRADE = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";

function input(overrides: Partial<TradeInInput> = {}): TradeInInput {
  return {
    clientId: CLIENT,
    productId: PRODUCT,
    serial: " 356000000000001 ",
    batteryHealth: "88",
    gradeId: GRADE,
    value: "250000,50",
    currency: "ars",
    destination: "sale_credit",
    passed: [ITEM.toUpperCase()],
    ...overrides,
  };
}

describe("validateTradeInInput", () => {
  it("normaliza lo que llega del formulario", () => {
    const result = validateTradeInInput(input());
    expect(result).toEqual({
      ok: true,
      values: {
        clientId: CLIENT,
        productId: PRODUCT,
        serial: "356000000000001",
        batteryHealth: 88,
        gradeId: GRADE,
        value: "250000.50",
        currency: "ARS",
        destination: "sale_credit",
        passed: new Set([ITEM]),
      },
    });
  });

  it("acepta la batería de 0 a 100", () => {
    expect(validateTradeInInput(input({ batteryHealth: "0" })).ok).toBe(true);
    expect(validateTradeInInput(input({ batteryHealth: "100" })).ok).toBe(true);
    for (const batteryHealth of ["", "101", "-1", "8.5", "abc"]) {
      expect(
        validateTradeInInput(input({ batteryHealth })),
        batteryHealth,
      ).toMatchObject({ ok: false, fields: ["batteryHealth"] });
    }
  });

  it("rechaza cada campo inválido, todos juntos y en el orden del formulario", () => {
    expect(
      validateTradeInInput({
        clientId: "x",
        productId: "",
        serial: "con espacio",
        batteryHealth: "200",
        gradeId: "",
        value: "10",
        currency: "XYZ",
        destination: "regalo",
        passed: [],
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [
        "client",
        "product",
        "serial",
        "batteryHealth",
        "grade",
        "currency",
        "destination",
      ],
    });
  });

  it("dice por qué no acepta el valor", () => {
    expect(validateTradeInInput(input({ value: "0" }))).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["value"],
      amount: "zero",
    });
    expect(
      validateTradeInInput(input({ value: "10,505", currency: "USD" })),
    ).toMatchObject({ fields: ["value"], amount: "decimals" });
  });
});

describe("parseTradeInNumberSearch", () => {
  it("lee el número con el prefijo PU, sin distinguir mayúsculas", () => {
    expect(parseTradeInNumberSearch("PU-000123")).toBe(123);
    expect(parseTradeInNumberSearch(" pu000123 ")).toBe(123);
    expect(parseTradeInNumberSearch("PU-0")).toBeNull();
    // Sin el prefijo es un IMEI, no un número.
    expect(parseTradeInNumberSearch("000123")).toBeNull();
  });
});
