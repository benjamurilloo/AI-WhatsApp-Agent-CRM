import { describe, expect, it } from "vitest";
import { isCalendarDate, optionalCalendarDate } from "./index";

describe("isCalendarDate", () => {
  it("acepta fechas reales, también el 29 de febrero bisiesto", () => {
    for (const value of ["2026-09-16", "2024-02-29", "1000-01-01"]) {
      expect(isCalendarDate(value)).toBe(true);
    }
  });

  it("rechaza fechas inexistentes o con otro formato", () => {
    for (const value of [
      "2026-02-30",
      "2025-02-29",
      "2026-13-01",
      "0000-01-01",
      "2026-9-16",
      "16/09/2026",
      "2026-09-16T00:00",
      "",
    ]) {
      expect(isCalendarDate(value)).toBe(false);
    }
  });
});

describe("optionalCalendarDate", () => {
  it("recorta, deja vacío como null y rechaza lo inválido", () => {
    expect(optionalCalendarDate.parse(" 2026-09-16 ")).toBe("2026-09-16");
    expect(optionalCalendarDate.parse("  ")).toBeNull();
    expect(optionalCalendarDate.safeParse("2026-02-30").success).toBe(false);
  });
});
