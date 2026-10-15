import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUPPLIER_FILTERS,
  hasActiveFilters,
  parseSupplierFilters,
  supplierFiltersHref,
} from "./filters";

// La lista de proveedores en la URL (brief-22.2, D-10).

describe("parseSupplierFilters", () => {
  it("sin parámetros, los de defecto", () => {
    expect(parseSupplierFilters({})).toEqual(DEFAULT_SUPPLIER_FILTERS);
  });

  it("lee el texto, el estado y la página", () => {
    expect(
      parseSupplierFilters({ q: "  norte ", estado: "todos", pagina: "3" }),
    ).toEqual({ text: "norte", status: "all", page: 3 });
    expect(parseSupplierFilters({ estado: "inactivos" }).status).toBe(
      "inactive",
    );
  });

  it("un valor desconocido se reemplaza por el de defecto", () => {
    expect(parseSupplierFilters({ estado: "borrados", pagina: "-2" })).toEqual(
      DEFAULT_SUPPLIER_FILTERS,
    );
    expect(parseSupplierFilters({ pagina: "1.5" }).page).toBe(1);
    expect(parseSupplierFilters({ estado: "constructor" }).status).toBe(
      "active",
    );
  });

  it("acota el texto a 100 caracteres", () => {
    expect(parseSupplierFilters({ q: "a".repeat(150) }).text).toHaveLength(100);
  });
});

describe("supplierFiltersHref", () => {
  it("lleva solo lo que difiere del defecto", () => {
    expect(supplierFiltersHref(DEFAULT_SUPPLIER_FILTERS)).toBe(
      "/compras/proveedores",
    );
    expect(
      supplierFiltersHref({ text: "Ávila & hijos", status: "all", page: 2 }),
    ).toBe("/compras/proveedores?q=%C3%81vila+%26+hijos&estado=todos&pagina=2");
  });

  it("vuelve a leerse igual", () => {
    const filters = { text: "norte", status: "inactive" as const, page: 4 };
    const href = supplierFiltersHref(filters);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseSupplierFilters(params)).toEqual(filters);
  });

  it("hasActiveFilters mira el texto y el estado, no la página", () => {
    expect(hasActiveFilters({ ...DEFAULT_SUPPLIER_FILTERS, page: 3 })).toBe(
      false,
    );
    expect(hasActiveFilters({ ...DEFAULT_SUPPLIER_FILTERS, text: "x" })).toBe(
      true,
    );
  });
});
