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

  it("lee el estado, el proveedor, el número, la moneda y la página", () => {
    expect(
      parseSupplierPaymentFilters({
        estado: "anulado",
        proveedor: " abc ",
        numero: "APP-000001",
        moneda: " usd ",
        pagina: "3",
      }),
    ).toEqual({
      status: "voided",
      supplierId: "abc",
      number: "APP-000001",
      currency: "USD",
      page: 3,
      payment: "",
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
    // La moneda son tres letras: «pesos», «AR» o «ARSS» no filtran nada (brief-24.8.2, H-4).
    for (const moneda of ["pesos", "AR", "ARSS", "12$"]) {
      expect(parseSupplierPaymentFilters({ moneda }).currency).toBe("");
    }
  });

  it("el panel es un parámetro más, y no cuenta como filtro activo (D-2)", () => {
    const filters = parseSupplierPaymentFilters({ pago: " 7f3a " });
    expect(filters.payment).toBe("7f3a");
    expect(hasActiveSupplierPaymentFilters(filters)).toBe(false);
    // Abrirlo conserva los filtros y la página, y cerrarlo devuelve al mismo lugar.
    const open = {
      ...DEFAULT_SUPPLIER_PAYMENT_FILTERS,
      status: "voided" as const,
      currency: "ARS",
      page: 4,
      payment: "7f3a",
    };
    expect(supplierPaymentFiltersHref(open)).toBe(
      "/compras/pagos?estado=anulado&moneda=ARS&pagina=4&pago=7f3a",
    );
    expect(supplierPaymentFiltersHref({ ...open, payment: "" })).toBe(
      "/compras/pagos?estado=anulado&moneda=ARS&pagina=4",
    );
  });

  it("la URL lleva solo lo que difiere del defecto, y vuelve a leerse igual", () => {
    expect(supplierPaymentFiltersHref(DEFAULT_SUPPLIER_PAYMENT_FILTERS)).toBe(
      "/compras/pagos",
    );
    const filters = {
      status: "current" as const,
      supplierId: "abc",
      number: "PP-1",
      currency: "USD",
      page: 2,
      payment: "",
    };
    const href = supplierPaymentFiltersHref(filters);
    expect(href).toBe(
      "/compras/pagos?proveedor=abc&numero=PP-1&estado=vigente&moneda=USD&pagina=2",
    );
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseSupplierPaymentFilters(params)).toEqual(filters);
  });
});
