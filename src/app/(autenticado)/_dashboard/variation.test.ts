import { describe, expect, it } from "vitest";
import {
  includesToday,
  NO_CURRENT_DATA,
  NO_PREVIOUS_DATA,
  PREVIOUS_UNAVAILABLE,
  PREVIOUS_ZERO,
  variationOf,
} from "./variation";

describe("variationOf (brief-15.3, D-2)", () => {
  it("cantidades: porcentaje sobre el anterior, con el signo explícito", () => {
    expect(
      variationOf({ kind: "count", value: 15 }, { kind: "count", value: 12 }),
    ).toEqual({
      status: "change",
      direction: "up",
      text: "+25,0 % vs. período anterior",
    });
    expect(
      variationOf({ kind: "count", value: 9 }, { kind: "count", value: 12 }),
    ).toEqual({
      status: "change",
      direction: "down",
      text: "−25,0 % vs. período anterior",
    });
  });

  it("cantidades: con el anterior en 0 no hay porcentaje, nunca +∞ ni +100 %", () => {
    expect(
      variationOf({ kind: "count", value: 4 }, { kind: "count", value: 0 }),
    ).toEqual({ status: "none", reason: PREVIOUS_ZERO });
  });

  it("cero, o lo que redondea a cero, es «sin cambios»", () => {
    for (const [current, previous] of [
      [10, 10],
      [10_000, 10_004],
    ] as const) {
      expect(
        variationOf(
          { kind: "count", value: current },
          { kind: "count", value: previous },
        ),
      ).toEqual({
        status: "change",
        direction: "same",
        text: "Sin cambios vs. período anterior",
      });
    }
  });

  it("tasas: puntos porcentuales, no porcentaje del porcentaje", () => {
    expect(
      variationOf({ kind: "rate", value: 53.5 }, { kind: "rate", value: 50 }),
    ).toEqual({
      status: "change",
      direction: "up",
      text: "+3,5 p. p. vs. período anterior",
    });
    // Una tasa anterior en 0 sí se compara: es un valor, no un denominador.
    expect(
      variationOf({ kind: "rate", value: 2 }, { kind: "rate", value: 0 }),
    ).toMatchObject({
      status: "change",
      text: "+2,0 p. p. vs. período anterior",
    });
  });

  it("promedio y mediana: diferencia absoluta, con su unidad", () => {
    expect(
      variationOf(
        { kind: "amount", value: 2.5, unit: "min" },
        { kind: "amount", value: 2.9, unit: "min" },
      ),
    ).toEqual({
      status: "change",
      direction: "down",
      text: "−0,4 min vs. período anterior",
    });
    expect(
      variationOf({ kind: "amount", value: 9 }, { kind: "amount", value: 7.5 }),
    ).toMatchObject({ text: "+1,5 vs. período anterior" });
  });

  it("sin datos en un período: no hay comparación, y dice cuál", () => {
    expect(variationOf(null, { kind: "rate", value: 10 })).toEqual({
      status: "none",
      reason: NO_CURRENT_DATA,
    });
    expect(variationOf({ kind: "rate", value: 10 }, null)).toEqual({
      status: "none",
      reason: NO_PREVIOUS_DATA,
    });
  });

  it("«no disponible» no se dice «sin datos»: la variación lo nombra", () => {
    expect(
      variationOf({ kind: "rate", value: 10 }, { kind: "unavailable" }),
    ).toEqual({ status: "none", reason: PREVIOUS_UNAVAILABLE });
    expect(
      variationOf({ kind: "unavailable" }, { kind: "rate", value: 10 }),
    ).toEqual({ status: "none", reason: NO_CURRENT_DATA });
  });
});

describe("includesToday (brief-15.3, D-2)", () => {
  it("un período que termina hoy está incompleto y no se compara", () => {
    expect(includesToday("2026-10-06", "2026-10-06")).toBe(true);
  });
  it("uno que termina ayer, o antes, se compara", () => {
    expect(includesToday("2026-10-05", "2026-10-06")).toBe(false);
    expect(includesToday("2025-12-31", "2026-01-01")).toBe(false);
  });
});
