import { describe, expect, it } from "vitest";
import { resolveMetricsPeriod } from "./service";

const TODAY = "2026-09-17";

describe("resolveMetricsPeriod (brief-7.1, D-2)", () => {
  it("sin fechas usa los últimos 30 días completos, sin hoy", () => {
    expect(resolveMetricsPeriod({ from: "", to: "" }, TODAY)).toEqual({
      ok: true,
      from: "2026-08-18",
      to: "2026-09-16",
      days: 30,
    });
  });

  it("cruza meses y años al calcular el valor por defecto", () => {
    expect(resolveMetricsPeriod({ from: " ", to: "" }, "2026-01-05")).toEqual({
      ok: true,
      from: "2025-12-06",
      to: "2026-01-04",
      days: 30,
    });
  });

  it("acepta un período válido, recortando espacios, incluido hoy", () => {
    expect(
      resolveMetricsPeriod({ from: " 2026-09-17 ", to: "2026-09-17" }, TODAY),
    ).toEqual({ ok: true, from: "2026-09-17", to: "2026-09-17", days: 1 });
  });

  it("acepta hasta 366 días y rechaza 367", () => {
    expect(
      resolveMetricsPeriod({ from: "2024-01-01", to: "2024-12-31" }, TODAY),
    ).toEqual({ ok: true, from: "2024-01-01", to: "2024-12-31", days: 366 });
    expect(
      resolveMetricsPeriod({ from: "2024-01-01", to: "2025-01-01" }, TODAY),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["from", "to"] });
  });

  it("rechaza fechas inválidas y una sola fecha", () => {
    expect(
      resolveMetricsPeriod({ from: "2026-02-30", to: "2026-09-01" }, TODAY),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["from"] });
    expect(resolveMetricsPeriod({ from: "2026-09-01", to: "" }, TODAY)).toEqual(
      { ok: false, code: "VALIDATION_ERROR", fields: ["to"] },
    );
    expect(resolveMetricsPeriod({ from: "ayer", to: "hoy" }, TODAY)).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["from", "to"],
    });
  });

  it("rechaza un período invertido", () => {
    expect(
      resolveMetricsPeriod({ from: "2026-09-10", to: "2026-09-09" }, TODAY),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["from", "to"] });
  });

  it("rechaza un fin posterior a hoy", () => {
    expect(
      resolveMetricsPeriod({ from: "2026-09-10", to: "2026-09-18" }, TODAY),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["to"] });
  });
});
