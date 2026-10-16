import { describe, expect, it } from "vitest";
import {
  DEFAULT_PURCHASE_ORDER_FILTERS,
  hasActivePurchaseOrderFilters,
  parsePurchaseOrderFilters,
  purchaseOrderFiltersHref,
} from "./filters";

// Los filtros de la lista de órdenes de compra en la URL (brief-22.3, D-11).

describe("los filtros en la URL", () => {
  it("lee el estado, el proveedor, el número y la página", () => {
    expect(
      parsePurchaseOrderFilters({
        estado: "canceladas",
        proveedor: " abc ",
        numero: "OC-000012",
        pagina: "3",
      }),
    ).toEqual({
      status: "cancelled",
      supplierId: "abc",
      number: "OC-000012",
      page: 3,
    });
  });

  it("un valor que no se entiende vuelve al de por omisión", () => {
    expect(
      parsePurchaseOrderFilters({ estado: "toString", pagina: "0" }),
    ).toEqual(DEFAULT_PURCHASE_ORDER_FILTERS);
    expect(parsePurchaseOrderFilters({ pagina: "-2" }).page).toBe(1);
    expect(
      parsePurchaseOrderFilters({ estado: ["abiertas", "x"] }).status,
    ).toBe("open");
  });

  it("la URL lleva solo lo que difiere del defecto, y se vuelve a leer igual", () => {
    expect(purchaseOrderFiltersHref(DEFAULT_PURCHASE_ORDER_FILTERS)).toBe(
      "/compras/ordenes",
    );
    const filters = {
      status: "open" as const,
      supplierId: "abc",
      number: "12",
      page: 2,
    };
    const href = purchaseOrderFiltersHref(filters);
    expect(href).toBe(
      "/compras/ordenes?estado=abiertas&proveedor=abc&numero=12&pagina=2",
    );
    const params = Object.fromEntries(
      new URL(href, "http://localhost").searchParams.entries(),
    );
    expect(parsePurchaseOrderFilters(params)).toEqual(filters);
  });

  it("la página no cuenta como filtro activo", () => {
    expect(
      hasActivePurchaseOrderFilters({
        ...DEFAULT_PURCHASE_ORDER_FILTERS,
        page: 4,
      }),
    ).toBe(false);
    expect(
      hasActivePurchaseOrderFilters({
        ...DEFAULT_PURCHASE_ORDER_FILTERS,
        status: "closed",
      }),
    ).toBe(true);
  });
});
