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
      clientText: "",
      number: "P-000123",
      page: 2,
    });
    expect(hasActiveOrderFilters(filters)).toBe(true);
    expect(orderFiltersHref(filters)).toBe(
      "/pedidos?estado=cancelados&cliente=c0ffee00-0000-4000-8000-000000000001&numero=P-000123&pagina=2",
    );
  });

  it("brief-19.3: confirmados y entregados van y vuelven por la URL", () => {
    for (const [param, status] of [
      ["confirmados", "confirmed"],
      ["entregados", "delivered"],
    ] as const) {
      const filters = parseOrderFilters({ estado: param });
      expect(filters.status).toBe(status);
      expect(orderFiltersHref(filters)).toBe(`/pedidos?estado=${param}`);
    }
  });

  // El buscador de clientes de la 24.6.1 (brief-24.6.1, D-11) manda dos parámetros: el id, que es
  // exacto, y lo que se escribió, que es lo único que llega sin JavaScript. Estas tres aserciones
  // fijan la regla de precedencia, que es donde un combobox con campo oculto se rompe.
  describe("brief-24.6.1, D-11: el buscador de clientes", () => {
    it("con id, el nombre no viaja en la URL: sería redundante", () => {
      const filters = parseOrderFilters({
        cliente: "c0ffee00-0000-4000-8000-000000000001",
        clienteNombre: "Nadia Castro",
      });
      expect(filters.clientId).toBe("c0ffee00-0000-4000-8000-000000000001");
      expect(filters.clientText).toBe("Nadia Castro");
      expect(orderFiltersHref(filters)).toBe(
        "/pedidos?cliente=c0ffee00-0000-4000-8000-000000000001",
      );
    });

    it("sin id, el nombre viaja y vuelve: es el recorrido sin JavaScript", () => {
      const filters = parseOrderFilters({ clienteNombre: " Nadia Castro " });
      expect(filters.clientId).toBe("");
      expect(filters.clientText).toBe("Nadia Castro");
      expect(orderFiltersHref(filters)).toBe(
        "/pedidos?clienteNombre=Nadia+Castro",
      );
    });

    it("un nombre solo ya cuenta como filtro activo", () => {
      expect(
        hasActiveOrderFilters(parseOrderFilters({ clienteNombre: "Nadia" })),
      ).toBe(true);
    });
  });

  it("un valor que no se entiende vuelve al de por omisión", () => {
    expect(
      parseOrderFilters({ estado: "raro", pagina: "0", numero: ["7", "8"] }),
    ).toEqual({ ...DEFAULT_ORDER_FILTERS, number: "7" });
    expect(parseOrderFilters({ pagina: "-1" }).page).toBe(1);
  });
});
