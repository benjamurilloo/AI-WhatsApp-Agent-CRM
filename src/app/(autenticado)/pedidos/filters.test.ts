import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORDER_FILTERS,
  hasActiveOrderFilters,
  orderFiltersHref,
  parseOrderFilters,
} from "./filters";

describe("filtros de la lista de pedidos", () => {
  it("sin parámetros, los de por omisión", () => {
    expect(parseOrderFilters({})).toEqual(DEFAULT_ORDER_FILTERS);
    expect(hasActiveOrderFilters(DEFAULT_ORDER_FILTERS)).toBe(false);
    expect(orderFiltersHref(DEFAULT_ORDER_FILTERS)).toBe("/pedidos");
  });

  it("lee estado, cliente, número y página, y vuelve a armar la URL", () => {
    const filters = parseOrderFilters({
      estado: "cancelados",
      cliente: "c0ffee00-0000-4000-8000-000000000001",
      numero: " P-000123 ",
      pagina: "2",
    });
    expect(filters).toEqual({
      status: "cancelled",
      clientId: "c0ffee00-0000-4000-8000-000000000001",
      number: "P-000123",
      page: 2,
    });
    expect(hasActiveOrderFilters(filters)).toBe(true);
    expect(orderFiltersHref(filters)).toBe(
      "/pedidos?estado=cancelados&cliente=c0ffee00-0000-4000-8000-000000000001&numero=P-000123&pagina=2",
    );
  });

  it("un valor que no se entiende vuelve al de por omisión", () => {
    expect(
      parseOrderFilters({ estado: "raro", pagina: "0", numero: ["7", "8"] }),
    ).toEqual({ ...DEFAULT_ORDER_FILTERS, number: "7" });
    expect(parseOrderFilters({ pagina: "-1" }).page).toBe(1);
  });
});
