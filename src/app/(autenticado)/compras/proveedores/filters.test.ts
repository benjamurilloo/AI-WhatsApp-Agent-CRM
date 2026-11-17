import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUPPLIER_FILTERS,
  hasActiveFilters,
  parseSupplierFilters,
  supplierFiltersHref,
} from "./filters";

// La lista de proveedores en la URL (brief-22.2, D-10). El tipo, desde la 24.8.2-b (D-3).

describe("parseSupplierFilters", () => {
  it("sin parámetros, los de defecto", () => {
    expect(parseSupplierFilters({})).toEqual(DEFAULT_SUPPLIER_FILTERS);
  });

  it("lee el texto, el estado, el tipo y la página", () => {
    expect(
      parseSupplierFilters({
        q: "  norte ",
        estado: "todos",
        tipo: "tecnicos",
        pagina: "3",
      }),
    ).toEqual({ text: "norte", status: "all", type: "technician", page: 3 });
    expect(parseSupplierFilters({ estado: "inactivos" }).status).toBe(
      "inactive",
    );
    expect(parseSupplierFilters({ tipo: "proveedores" }).type).toBe("supplier");
    expect(parseSupplierFilters({ tipo: "todos" }).type).toBe("all");
  });

  it("un valor desconocido se reemplaza por el de defecto", () => {
    expect(parseSupplierFilters({ estado: "borrados", pagina: "-2" })).toEqual(
      DEFAULT_SUPPLIER_FILTERS,
    );
    expect(parseSupplierFilters({ pagina: "1.5" }).page).toBe(1);
    expect(parseSupplierFilters({ estado: "constructor" }).status).toBe(
      "active",
    );
    // «constructor» existe en todo objeto: el filtro mira sus propias claves, no la cadena de
    // prototipos.
    expect(parseSupplierFilters({ tipo: "constructor" }).type).toBe("all");
    expect(parseSupplierFilters({ tipo: "mecanicos" }).type).toBe("all");
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
      supplierFiltersHref({
        text: "Ávila & hijos",
        status: "all",
        type: "all",
        page: 2,
      }),
    ).toBe("/compras/proveedores?q=%C3%81vila+%26+hijos&estado=todos&pagina=2");
    expect(
      supplierFiltersHref({ ...DEFAULT_SUPPLIER_FILTERS, type: "technician" }),
    ).toBe("/compras/proveedores?tipo=tecnicos");
  });

  it("sin tipo es lo mismo que «todos»: la URL no lo nombra", () => {
    expect(supplierFiltersHref({ text: "", status: "active", page: 1 })).toBe(
      "/compras/proveedores",
    );
  });

  it("vuelve a leerse igual", () => {
    const filters = {
      text: "norte",
      status: "inactive" as const,
      type: "supplier" as const,
      page: 4,
    };
    const href = supplierFiltersHref(filters);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseSupplierFilters(params)).toEqual(filters);
  });

  it("hasActiveFilters mira el texto, el estado y el tipo, no la página", () => {
    expect(hasActiveFilters({ ...DEFAULT_SUPPLIER_FILTERS, page: 3 })).toBe(
      false,
    );
    expect(hasActiveFilters({ ...DEFAULT_SUPPLIER_FILTERS, text: "x" })).toBe(
      true,
    );
    expect(
      hasActiveFilters({ ...DEFAULT_SUPPLIER_FILTERS, type: "technician" }),
    ).toBe(true);
    // Sin el campo, el filtro no está activo: es lo mismo que «todos».
    expect(hasActiveFilters({ text: "", status: "active", page: 1 })).toBe(
      false,
    );
  });
});
