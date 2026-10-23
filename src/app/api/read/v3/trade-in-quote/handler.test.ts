import { describe, expect, it } from "vitest";
import {
  parseAnswerIds,
  parseBatteryHealth,
  TRADE_IN_ANSWERS_MAX,
} from "./handler";

// Los validadores de la cotización, sin base (brief-29.8.3, §Pruebas; revisión independiente, NB-3).
// Los 400 completos, con el borde y la respuesta, están en la integración (test 4).

const ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const OTHER = "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9";

function ids(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  ).join(",");
}

describe("parseBatteryHealth", () => {
  it("acepta de 0 a 100, sin ceros a la izquierda", () => {
    for (const raw of ["0", "7", "79", "99", "100"]) {
      expect(parseBatteryHealth(raw)).toStrictEqual({
        ok: true,
        value: Number(raw),
      });
    }
  });

  it("rechaza lo ausente, lo vacío, lo fuera de rango y lo que no es un entero", () => {
    for (const raw of [
      null,
      "",
      "07",
      "00",
      "101",
      "-1",
      "8.5",
      " 80",
      "1e2",
      "abc",
    ]) {
      expect(parseBatteryHealth(raw)).toStrictEqual({
        ok: false,
        field: "battery_health",
      });
    }
  });
});

describe("parseAnswerIds", () => {
  it("ausente o vacía es una lista vacía", () => {
    expect(parseAnswerIds([], "passed")).toStrictEqual({ ok: true, value: [] });
    expect(parseAnswerIds([""], "failed")).toStrictEqual({
      ok: true,
      value: [],
    });
  });

  it("separa por coma, pasa a minúsculas y quita los repetidos", () => {
    expect(
      parseAnswerIds([`${ID.toUpperCase()},${OTHER},${ID}`], "passed"),
    ).toStrictEqual({ ok: true, value: [ID, OTHER] });
  });

  it("un parámetro repetido suma sus ids", () => {
    expect(parseAnswerIds([ID, "", OTHER], "failed")).toStrictEqual({
      ok: true,
      value: [ID, OTHER],
    });
  });

  it("un id sin forma de uuid o un hueco entre comas es un 400 con su campo", () => {
    for (const values of [
      ["no-es-un-id"],
      [`${ID},`],
      [`${ID},,${OTHER}`],
      [`,${ID}`],
      [`${ID}, ${OTHER}`],
    ]) {
      expect(parseAnswerIds(values, "failed")).toStrictEqual({
        ok: false,
        field: "failed",
      });
    }
  });

  it("el tope cuenta todas las apariciones, antes de quitar los repetidos", () => {
    expect(parseAnswerIds([ids(TRADE_IN_ANSWERS_MAX)], "passed").ok).toBe(true);
    expect(
      parseAnswerIds([ids(TRADE_IN_ANSWERS_MAX + 1)], "passed"),
    ).toStrictEqual({ ok: false, field: "passed" });
    expect(
      parseAnswerIds([ids(TRADE_IN_ANSWERS_MAX), ID], "passed"),
    ).toStrictEqual({ ok: false, field: "passed" });
    expect(
      parseAnswerIds(
        Array.from({ length: TRADE_IN_ANSWERS_MAX + 1 }, () => ID),
        "passed",
      ),
    ).toStrictEqual({ ok: false, field: "passed" });
  });
});
