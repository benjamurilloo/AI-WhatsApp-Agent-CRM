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

// Los campos de la 17.2 vacíos: el producto de antes de la subfase.
const NO_OPERATION_VALUES = {
  barcode: null,
  weightKg: null,
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  location: null,
  shelf: null,
};

const valid = {
  sku: "CAF-250",
  name: "Café molido 250 g",
  description: "Tostado medio",
  unit: "unidad",
  reorderPoint: "10",
  brand: "Cafetal",
  category: "Almacén",
  condition: "new",
  ...NO_OPERATION_VALUES,
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
        brand: "  Cafetal ",
        category: " Almacén  ",
        condition: "refurbished",
        ...NO_OPERATION_VALUES,
      }),
    ).toEqual({
      ok: true,
      values: {
        sku: "CAF-250",
        name: "Café molido 250 g",
        description: "Tostado medio",
        unit: "kg",
        reorderPoint: "2.500",
        brand: "Cafetal",
        category: "Almacén",
        condition: "refurbished",
        ...NO_OPERATION_VALUES,
      },
    });
  });

  it("guarda una descripción vacía, ausente o solo con espacios como null", () => {
    for (const description of ["", "   ", null, undefined]) {
      const result = validateProductInput({ ...valid, description });
      expect(result.ok && result.values.description).toBeNull();
    }
  });

  // FR-PROD-10: marca y categoría son opcionales; vacías se guardan como null (brief-11.1, D-2).
  it("FR-PROD-10: guarda una marca o una categoría vacía o solo con espacios como null", () => {
    for (const value of ["", "   ", null]) {
      const result = validateProductInput({
        ...valid,
        brand: value,
        category: value,
      });
      expect(result.ok && result.values.brand).toBeNull();
      expect(result.ok && result.values.category).toBeNull();
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
        brand: "B".repeat(100),
        category: "C".repeat(100),
        condition: "new",
        barcode: "7".repeat(64),
        weightKg: "9999999,999",
        lengthCm: "9999999,9",
        widthCm: "9999999,9",
        heightCm: "9999999,9",
        location: "L".repeat(60),
        shelf: "E".repeat(30),
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
        brand: "B".repeat(101),
        category: "C".repeat(101),
        condition: "usado",
        barcode: "779 0001",
        weightKg: "0",
        lengthCm: "-1",
        widthCm: "1,25",
        heightCm: "abc",
        location: "L".repeat(61),
        shelf: "E".repeat(31),
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [
        "sku",
        "name",
        "description",
        "unit",
        "reorderPoint",
        "brand",
        "category",
        "condition",
        "barcode",
        "weightKg",
        "lengthCm",
        "widthCm",
        "heightCm",
        "location",
        "shelf",
      ],
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
      // FR-PROD-10: solo las dos condiciones del enum (brief-11.1, D-3).
      [{ condition: "" }, "condition"],
      [{ condition: "used" }, "condition"],
      [{ condition: "NEW" }, "condition"],
    ] as const) {
      expect(validateProductInput({ ...valid, ...override })).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: [field],
      });
    }
  });
});

// FR-PROD-14 (brief-17.2): los campos de operación, opcionales y con la escala de la base.
describe("validateProductInput: campos de operación (brief-17.2)", () => {
  it("FR-PROD-14: recorta y normaliza a la escala de la base, con coma o punto", () => {
    const result = validateProductInput({
      ...valid,
      barcode: "  7790001000017 ",
      weightKg: " 1,5 ",
      lengthCm: "30",
      widthCm: "20.5",
      heightCm: "007,0",
      location: "  Depósito ",
      shelf: " A-3 ",
    });
    expect(result.ok && result).toMatchObject({
      values: {
        barcode: "7790001000017",
        weightKg: "1.500",
        lengthCm: "30.0",
        widthCm: "20.5",
        heightCm: "7.0",
        location: "Depósito",
        shelf: "A-3",
      },
    });
  });

  it("FR-PROD-14: vacíos o solo con espacios se guardan como null", () => {
    for (const value of ["", "   ", null]) {
      const result = validateProductInput({
        ...valid,
        barcode: value,
        weightKg: value,
        lengthCm: value,
        widthCm: value,
        heightCm: value,
        location: value,
        shelf: value,
      });
      expect(result.ok && result.values).toMatchObject(NO_OPERATION_VALUES);
    }
  });

  it("FR-PROD-14: rechaza cada valor fuera de la forma, en su campo", () => {
    const dimensions = { lengthCm: "10", widthCm: "10", heightCm: "10" };
    for (const [override, field] of [
      [{ barcode: "779 0001" }, "barcode"],
      [{ barcode: "7".repeat(65) }, "barcode"],
      [{ weightKg: "0" }, "weightKg"],
      [{ weightKg: "0,000" }, "weightKg"],
      [{ weightKg: "-1" }, "weightKg"],
      [{ weightKg: "1,2345" }, "weightKg"],
      [{ weightKg: "10000000" }, "weightKg"],
      [{ weightKg: "1e3" }, "weightKg"],
      [{ weightKg: "1.000,5" }, "weightKg"],
      [{ ...dimensions, lengthCm: "0" }, "lengthCm"],
      [{ ...dimensions, widthCm: "1,25" }, "widthCm"],
      [{ ...dimensions, heightCm: "10000000" }, "heightCm"],
      [{ location: "L".repeat(61) }, "location"],
      [{ shelf: "E".repeat(31) }, "shelf"],
    ] as const) {
      expect(validateProductInput({ ...valid, ...override })).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: [field],
      });
    }
  });

  it("FR-PROD-14: largo, ancho y alto van juntos; marca los que faltan (D-5)", () => {
    expect(
      validateProductInput({
        ...valid,
        lengthCm: "10",
        widthCm: "",
        heightCm: null,
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["widthCm", "heightCm"],
    });
    expect(
      validateProductInput({ ...valid, lengthCm: "10", widthCm: "5" }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["heightCm"] });
    expect(
      validateProductInput({
        ...valid,
        lengthCm: "10",
        widthCm: "5",
        heightCm: "2",
      }).ok,
    ).toBe(true);
  });
});
