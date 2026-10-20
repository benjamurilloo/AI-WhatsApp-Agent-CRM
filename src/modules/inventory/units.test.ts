import { describe, expect, it } from "vitest";
import { parseUnitSerial, splitUnitSerials, validateUnitInput } from "./units";
import { LINE_SERIAL_PATTERN } from "@/shared/lines";
import { UNIT_SERIAL_PATTERN } from "./schema";

// La forma del IMEI y la validación del alta manual de una unidad (brief-29.5, D-2, D-4 y D-10).

describe("parseUnitSerial", () => {
  it.each([
    ["356938035643809", "356938035643809"],
    ["  F2LXK0ABCDEF  ", "F2LXK0ABCDEF"],
    ["abc-123", "abc-123"],
    ["A".repeat(32), "A".repeat(32)],
  ])("acepta %j", (text, expected) => {
    expect(parseUnitSerial(text)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "3569 3803",
    "-123",
    "A".repeat(33),
    "35693803564380é",
    "IMEI:123",
  ])("rechaza %j", (text) => {
    expect(parseUnitSerial(text)).toBeNull();
  });
});

describe("splitUnitSerials", () => {
  it("separa por renglón, espacios, comas o punto y coma, sin vacíos", () => {
    expect(splitUnitSerials("111\n222\r\n\n333, 444;555  666")).toEqual([
      "111",
      "222",
      "333",
      "444",
      "555",
      "666",
    ]);
  });

  it("un texto vacío no tiene IMEI", () => {
    expect(splitUnitSerials("  \n ")).toEqual([]);
  });
});

describe("validateUnitInput", () => {
  const valid = {
    serial: "356938035643809",
    cost: "450,50",
    currency: "USD",
    gradeId: "",
    batteryHealth: "",
  };

  it("acepta un alta con el costo en la escala de la base y sin grado ni batería", () => {
    expect(validateUnitInput(valid)).toEqual({
      ok: true,
      values: {
        serial: "356938035643809",
        cost: "450.50",
        currency: "USD",
        gradeId: null,
        batteryHealth: null,
        price: null,
      },
    });
  });

  // brief-29.5.2, D-2: el precio propio, opcional, con su moneda.
  it("acepta el precio propio con su moneda, o ninguno de los dos", () => {
    const result = validateUnitInput({
      ...valid,
      price: "1.234,5",
      priceCurrency: "usd",
    });
    expect(result.ok && result.values.price).toEqual({
      amount: "1234.50",
      currency: "USD",
    });
    expect(
      validateUnitInput({ ...valid, price: " ", priceCurrency: "" }),
    ).toMatchObject({ ok: true, values: { price: null } });
  });

  it("rechaza un precio sin moneda, una moneda sin precio o un precio en cero", () => {
    expect(validateUnitInput({ ...valid, price: "10" })).toMatchObject({
      fields: ["priceCurrency"],
    });
    expect(
      validateUnitInput({ ...valid, price: "", priceCurrency: "USD" }),
    ).toMatchObject({ fields: ["price"] });
    expect(
      validateUnitInput({ ...valid, price: "0", priceCurrency: "USD" }),
    ).toMatchObject({ fields: ["price"] });
  });

  it("acepta el grado en mayúsculas y la batería de 0 a 100", () => {
    const result = validateUnitInput({
      ...valid,
      gradeId: "0A1B2C3D-0000-4000-8000-000000000001",
      batteryHealth: "100",
    });
    expect(result.ok && result.values).toMatchObject({
      gradeId: "0a1b2c3d-0000-4000-8000-000000000001",
      batteryHealth: 100,
    });
  });

  it("marca cada campo inválido, en el orden del formulario", () => {
    expect(
      validateUnitInput({
        serial: "con espacio",
        cost: "0",
        currency: "XYZ",
        gradeId: "no-es-un-id",
        batteryHealth: "101",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["serial", "currency", "gradeId", "batteryHealth"],
    });
    expect(validateUnitInput({ ...valid, cost: "0" })).toMatchObject({
      fields: ["cost"],
    });
    expect(validateUnitInput({ ...valid, batteryHealth: "8,5" })).toMatchObject(
      { fields: ["batteryHealth"] },
    );
  });
});

// brief-29.5.2, D-5: las reglas de línea repiten la forma del IMEI, porque src/shared no importa
// inventory. Tienen que ser la misma.
describe("la forma del IMEI en las líneas de pedidos y ventas", () => {
  it("es la de stock_units", () => {
    expect(LINE_SERIAL_PATTERN.source).toBe(UNIT_SERIAL_PATTERN);
  });
});
