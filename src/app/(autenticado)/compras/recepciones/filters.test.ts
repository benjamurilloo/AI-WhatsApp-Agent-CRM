import { describe, expect, it } from "vitest";
import {
  DEFAULT_GOODS_RECEIPT_FILTERS,
  goodsReceiptFiltersHref,
  hasActiveGoodsReceiptFilters,
  parseGoodsReceiptFilters,
} from "./filters";

// Los filtros de la lista de recepciones en la URL (brief-22.4, D-12).

describe("los filtros de la lista de recepciones", () => {
  it("lee el proveedor, el número y la página", () => {
    expect(
      parseGoodsReceiptFilters({
        proveedor: " abc ",
        numero: ["RC-000012", "x"],
        pagina: "3",
      }),
    ).toEqual({ supplierId: "abc", number: "RC-000012", page: 3 });
  });

  it("un valor que no se entiende vuelve al de por omisión", () => {
    expect(parseGoodsReceiptFilters({ pagina: "0" })).toEqual(
      DEFAULT_GOODS_RECEIPT_FILTERS,
    );
    expect(parseGoodsReceiptFilters({ pagina: "-1" }).page).toBe(1);
    expect(parseGoodsReceiptFilters({ numero: "1".repeat(30) }).number).toBe(
      "1".repeat(20),
    );
  });

  it("la URL lleva solo lo que difiere del defecto", () => {
    expect(goodsReceiptFiltersHref(DEFAULT_GOODS_RECEIPT_FILTERS)).toBe(
      "/compras/recepciones",
    );
    expect(
      goodsReceiptFiltersHref({ supplierId: "p", number: "rc12", page: 2 }),
    ).toBe("/compras/recepciones?proveedor=p&numero=rc12&pagina=2");
  });

  it("dice si hay algún filtro activo", () => {
    expect(hasActiveGoodsReceiptFilters(DEFAULT_GOODS_RECEIPT_FILTERS)).toBe(
      false,
    );
    expect(
      hasActiveGoodsReceiptFilters({
        ...DEFAULT_GOODS_RECEIPT_FILTERS,
        number: "1",
      }),
    ).toBe(true);
    expect(
      hasActiveGoodsReceiptFilters({
        ...DEFAULT_GOODS_RECEIPT_FILTERS,
        page: 4,
      }),
    ).toBe(false);
  });
});
