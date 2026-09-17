import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDecimal,
  formatMinutes,
  formatPercentage,
} from "./format";

// Formato de los valores del dashboard (brief-7.4). El redondeo es de la presentación: los valores
// llegan sin redondear desde el servicio (brief-7.1, D-3).

describe("formatCount", () => {
  it("usa el separador de miles de es-AR y no inventa decimales", () => {
    expect(formatCount(1204)).toBe("1.204");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(97)).toBe("97");
  });
});

describe("formatDecimal", () => {
  it("muestra siempre un decimal, con coma", () => {
    expect(formatDecimal(14)).toBe("14,0");
    expect(formatDecimal(9.05)).toBe("9,1");
    expect(formatDecimal(2 / 3)).toBe("0,7");
  });
});

describe("formatPercentage", () => {
  it("redondea a un decimal y no muestra el valor crudo", () => {
    expect(formatPercentage((4 * 100) / 7)).toBe("57,1 %");
    expect(formatPercentage(100)).toBe("100,0 %");
    expect(formatPercentage(0)).toBe("0,0 %");
  });
});

describe("formatMinutes", () => {
  it("lleva la unidad, para que 12,4 no se lea como una cantidad", () => {
    expect(formatMinutes(12.44)).toBe("12,4 min");
    expect(formatMinutes(45)).toBe("45,0 min");
  });
});
