import { describe, expect, it } from "vitest";
import {
  computeUnitCostBase,
  parseUnitSerial,
  splitUnitSerials,
  validateUnitInput,
} from "./units";
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

// La base del margen de la pantalla de costos (brief-24.5.2-b, AC-4 y AC-5-b). Es una función pura
// sobre los grupos que agrega SQL, así que se prueba sin base.
describe("computeUnitCostBase", () => {
  const group = (currency: string, units: number, total: bigint) => ({
    status: "available" as const,
    currency,
    units,
    total,
  });

  it("sin disponibles no hay base, y dice que es por eso", () => {
    expect(computeUnitCostBase([])).toEqual({ ok: false, reason: "no_units" });
  });

  it("con una sola moneda devuelve el total y el promedio", () => {
    // 350 + 360 + 370 = 1.080 en tres unidades: el ejemplo de la lámina 13.
    expect(computeUnitCostBase([group("USD", 3, 108_000n)])).toEqual({
      ok: true,
      currency: "USD",
      units: 3,
      total: 108_000n,
      average: 36_000n,
    });
  });

  it("el promedio se redondea con el medio hacia afuera del cero, como el ADR 0019", () => {
    // 100,01 en dos unidades son 50,005: el medio va para arriba, a 50,01.
    const base = computeUnitCostBase([group("ARS", 2, 10_001n)]);
    expect(base).toMatchObject({ ok: true, average: 5_001n });
  });

  it("con dos monedas en la base no hay total ni promedio, y dice cuál es el motivo", () => {
    // Dos recepciones del mismo producto en monedas distintas. Sumarlas sería inventar un tipo de
    // cambio que el punto 5 del ADR 0019 no autoriza (brief-24.5.2-b, D-13).
    expect(
      computeUnitCostBase([
        group("ARS", 1, 95_000_00n),
        group("USD", 2, 71_000n),
      ]),
    ).toEqual({ ok: false, reason: "mixed_currency" });
  });

  it("en una moneda sin decimales el promedio no cae en una fracción que no existe", () => {
    // Dos unidades de 300.000 y 300.001 pesos chilenos. Redondeando solo a centésimos el promedio
    // daba 300.000,50, medio peso en una moneda que no tiene centavos; con la escala de la moneda
    // da 300.001, que es un monto que el CLP puede expresar (ADR 0019, punto 4).
    const base = computeUnitCostBase([group("CLP", 2, 60_000_100n)]);
    expect(base).toMatchObject({ ok: true, average: 30_000_100n });
  });
});
