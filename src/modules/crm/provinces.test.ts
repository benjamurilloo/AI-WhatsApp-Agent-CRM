import { describe, expect, it } from "vitest";
import { isProvinceCode, PROVINCE_CODES, PROVINCES } from "./provinces";

// brief-17.1, D-4: la lista que comparten el CHECK, el servicio y los selectores.
describe("provincias", () => {
  it("son las 24 jurisdicciones, con códigos ISO 3166-2 de Argentina sin repetir", () => {
    expect(PROVINCE_CODES).toHaveLength(24);
    expect(new Set(PROVINCE_CODES).size).toBe(24);
    for (const code of PROVINCE_CODES) expect(code).toMatch(/^AR-[A-Z]$/);
    expect(new Set(Object.values(PROVINCES)).size).toBe(24);
  });

  it("reconoce solo los códigos de la lista", () => {
    expect(isProvinceCode("AR-C")).toBe(true);
    expect(isProvinceCode("AR-T")).toBe(true);
    expect(isProvinceCode("AR-I")).toBe(false);
    expect(isProvinceCode("ar-c")).toBe(false);
    expect(isProvinceCode("Córdoba")).toBe(false);
    expect(isProvinceCode(null)).toBe(false);
    expect(isProvinceCode("hasOwnProperty")).toBe(false);
  });
});
