import { describe, expect, it } from "vitest";
import { estimatePurchaseLineTotal, sumPurchaseEstimates } from "./estimate";

// La estimación del formulario usa la lectura y el redondeo del servicio (brief-22.3, D-5).

describe("el total estimado de una línea", () => {
  it("lee el costo con los decimales de la moneda", () => {
    expect(estimatePurchaseLineTotal("1.500,50", "ARS", "2")).toBe("3001.00");
    expect(estimatePurchaseLineTotal("0,99", "ARS", "1,5")).toBe("1.49");
    // Sin decimales, el redondeo es al entero y el separador no se lee.
    expect(estimatePurchaseLineTotal("333", "CLP", "1,5")).toBe("500.00");
    expect(estimatePurchaseLineTotal("1.500", "CLP", "1")).toBeNull();
  });

  it("sin moneda, sin cantidad, sin costo o con total cero no estima", () => {
    expect(estimatePurchaseLineTotal("10", "", "1")).toBeNull();
    expect(estimatePurchaseLineTotal("10", "ARS", "")).toBeNull();
    expect(estimatePurchaseLineTotal("", "ARS", "1")).toBeNull();
    expect(estimatePurchaseLineTotal("0,01", "ARS", "0,001")).toBeNull();
  });

  it("la suma, con la escala de la base", () => {
    expect(sumPurchaseEstimates(["3001.00", "1.49"])).toBe("3002.49");
    expect(sumPurchaseEstimates([])).toBe("0.00");
  });
});
