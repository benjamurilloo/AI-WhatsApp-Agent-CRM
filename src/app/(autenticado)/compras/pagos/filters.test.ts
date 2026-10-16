import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUPPLIER_PAYMENT_FILTERS,
  hasActiveSupplierPaymentFilters,
  parseSupplierPaymentFilters,
  supplierPaymentFiltersHref,
} from "./filters";

describe("los filtros de la lista de pagos (brief-22.6, D-13)", () => {
  it("sin parámetros, los de por omisión", () => {
    expect(parseSupplierPaymentFilters({})).toEqual(
      DEFAULT_SUPPLIER_PAYMENT_FILTERS,
    );
    expect(
      hasActiveSupplierPaymentFilters(DEFAULT_SUPPLIER_PAYMENT_FILTERS),
    ).toBe(false);
  });

  it("lee el estado, el proveedor, el número y la página", () => {
    expect(
      parseSupplierPaymentFilters({
        estado: "anulado",
        proveedor: " abc ",
        numero: "APP-000001",
        pagina: "3",
      }),
    ).toEqual({
      status: "voided",
      supplierId: "abc",
      number: "APP-000001",
      page: 3,
    });
    expect(parseSupplierPaymentFilters({ estado: "vigente" }).status).toBe(
      "current",
    );
  });

  it("un valor que no se entiende vuelve al de por omisión", () => {
    expect(
      parseSupplierPaymentFilters({ estado: "x", pagina: "0" }),
    ).toMatchObject({ status: "all", page: 1 });
    expect(parseSupplierPaymentFilters({ pagina: "-2" }).page).toBe(1);
  });

  it("la URL lleva solo lo que difiere del defecto, y vuelve a leerse igual", () => {
    expect(supplierPaymentFiltersHref(DEFAULT_SUPPLIER_PAYMENT_FILTERS)).toBe(
      "/compras/pagos",
    );
    const filters = {
      status: "current" as const,
      supplierId: "abc",
      number: "PP-1",
      page: 2,
    };
    const href = supplierPaymentFiltersHref(filters);
    expect(href).toBe(
      "/compras/pagos?proveedor=abc&numero=PP-1&estado=vigente&pagina=2",
    );
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseSupplierPaymentFilters(params)).toEqual(filters);
  });
});
