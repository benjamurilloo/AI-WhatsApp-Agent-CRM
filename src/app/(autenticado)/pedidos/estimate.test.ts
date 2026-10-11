import { describe, expect, it } from "vitest";
import { estimateLineTotal, sumEstimates } from "./estimate";

// Los casos de src/modules/orders/line-total.test.ts: la estimación del formulario tiene que dar
// lo mismo que el total que calcula orders (brief-19.2, D-7).
describe("estimateLineTotal", () => {
  it("precio por cantidad, con el redondeo del ADR 0019 en una moneda con dos decimales", () => {
    expect(estimateLineTotal("1234.50", "ARS", "3")).toBe("3703.50");
    expect(estimateLineTotal("0.05", "ARS", "0,5")).toBe("0.03");
    expect(estimateLineTotal("0.05", "ARS", "0.3")).toBe("0.02");
    expect(estimateLineTotal("0.05", "ARS", "0,1")).toBe("0.01");
    expect(estimateLineTotal("1000.00", "ARS", "1,234")).toBe("1234.00");
    expect(estimateLineTotal("999.99", "ARS", "0,001")).toBe("1.00");
  });

  it("en una moneda sin decimales (CLP)", () => {
    expect(estimateLineTotal("1000.00", "CLP", "1,5")).toBe("1500.00");
    expect(estimateLineTotal("999.00", "CLP", "0,5")).toBe("500.00");
    expect(estimateLineTotal("999.00", "CLP", "0,499")).toBe("499.00");
  });

  it("sin estimación si la cantidad no se entiende o el total da cero", () => {
    expect(estimateLineTotal("0.03", "ARS", "0,1")).toBeNull();
    expect(estimateLineTotal("1.00", "CLP", "0,4")).toBeNull();
    expect(estimateLineTotal("10.00", "ARS", "")).toBeNull();
    expect(estimateLineTotal("10.00", "ARS", "0")).toBeNull();
    expect(estimateLineTotal("10.00", "ARS", "1,2345")).toBeNull();
  });
});

describe("sumEstimates", () => {
  it("suma los subtotales", () => {
    expect(sumEstimates(["3703.50", "0.03"])).toBe("3703.53");
    expect(sumEstimates([])).toBe("0.00");
  });
});
