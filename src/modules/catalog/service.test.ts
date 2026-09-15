import { describe, expect, it } from "vitest";
import { deriveStockStatus, validateProductInput } from "./service";

describe("deriveStockStatus (FR-PROD-05)", () => {
  it("saldo 0 es sin stock, aunque el punto de reposición sea 0", () => {
    expect(deriveStockStatus(0n, 10_000n)).toBe("sin_stock");
    expect(deriveStockStatus(0n, 0n)).toBe("sin_stock");
  });

  it("saldo igual al punto de reposición es bajo stock", () => {
    expect(deriveStockStatus(10_000n, 10_000n)).toBe("bajo_stock");
    expect(deriveStockStatus(2_500n, 2_500n)).toBe("bajo_stock");
  });

  it("una milésima por encima del punto es disponible", () => {
    expect(deriveStockStatus(10_001n, 10_000n)).toBe("disponible");
  });

  it("una milésima de saldo con punto mayor es bajo stock", () => {
    expect(deriveStockStatus(1n, 10_000n)).toBe("bajo_stock");
  });

  it("con punto 0, cualquier saldo positivo es disponible", () => {
    expect(deriveStockStatus(1n, 0n)).toBe("disponible");
    expect(deriveStockStatus(48_000n, 0n)).toBe("disponible");
  });
});

const valid = {
  sku: "CAF-250",
  name: "Café molido 250 g",
  description: "Tostado medio",
  unit: "unidad",
  reorderPoint: "10",
};

describe("validateProductInput (brief-4.2, D-4)", () => {
  it("recorta espacios y normaliza el punto de reposición a la escala de la base", () => {
    expect(
      validateProductInput({
        sku: "  CAF-250 ",
        name: " Café molido 250 g ",
        description: "  Tostado medio  ",
        unit: " kg ",
        reorderPoint: " 2,5 ",
      }),
    ).toEqual({
      ok: true,
      values: {
        sku: "CAF-250",
        name: "Café molido 250 g",
        description: "Tostado medio",
        unit: "kg",
        reorderPoint: "2.500",
      },
    });
  });

  it("guarda una descripción vacía, ausente o solo con espacios como null", () => {
    for (const description of ["", "   ", null, undefined]) {
      const result = validateProductInput({ ...valid, description });
      expect(result.ok && result.values.description).toBeNull();
    }
  });

  it("acepta los máximos de cada campo", () => {
    expect(
      validateProductInput({
        sku: "S".repeat(64),
        name: "N".repeat(200),
        description: "D".repeat(2000),
        unit: "U".repeat(32),
        reorderPoint: "99999999999,999",
      }).ok,
    ).toBe(true);
  });

  it("informa cada campo inválido, en el orden del formulario", () => {
    expect(
      validateProductInput({
        sku: "CAF 250",
        name: "   ",
        description: "D".repeat(2001),
        unit: "U".repeat(33),
        reorderPoint: "-1",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["sku", "name", "description", "unit", "reorderPoint"],
    });
  });

  it("rechaza SKU vacío o demasiado largo, y punto de reposición vacío o con 4 decimales", () => {
    for (const [override, field] of [
      [{ sku: "" }, "sku"],
      [{ sku: "S".repeat(65) }, "sku"],
      [{ name: "N".repeat(201) }, "name"],
      [{ unit: "" }, "unit"],
      [{ reorderPoint: "" }, "reorderPoint"],
      [{ reorderPoint: "1,2345" }, "reorderPoint"],
    ] as const) {
      expect(validateProductInput({ ...valid, ...override })).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: [field],
      });
    }
  });
});
