import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  hasActiveMovementFilters,
  movementFiltersHref,
  movementSign,
  parseMovementView,
  toHistoryFilters,
} from "./filters";

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";
const PRODUCT = "b3c5b1f4-0000-4000-8000-000000000001";

describe("parseMovementView", () => {
  it("sin parámetros muestra todo el historial", () => {
    expect(parseMovementView({})).toEqual(DEFAULT_VIEW);
  });

  it("lee tipo, período y página, y descarta valores desconocidos", () => {
    expect(parseMovementView({ tipo: "negativo", periodo: "30d" })).toEqual({
      ...DEFAULT_VIEW,
      type: "negativo",
      period: "30d",
    });
    expect(parseMovementView({ tipo: "otro", periodo: "siempre" })).toEqual(
      DEFAULT_VIEW,
    );
    expect(parseMovementView({ pagina: "0" }).page).toBe(1);
    expect(parseMovementView({ pagina: "4" }).page).toBe(4);
  });

  it("solo conserva las fechas escritas cuando el período es personalizado", () => {
    expect(
      parseMovementView({
        periodo: "personalizado",
        desde: " 2026-09-01 ",
        hasta: "2026-09-15",
      }),
    ).toMatchObject({
      period: "personalizado",
      from: "2026-09-01",
      to: "2026-09-15",
    });
    expect(
      parseMovementView({ periodo: "30d", desde: "2026-09-01" }),
    ).toMatchObject({ period: "30d", from: "", to: "" });
  });
});

describe("toHistoryFilters", () => {
  const now = new Date("2026-09-10T02:59:59Z"); // 9 de septiembre, 23:59 en Buenos Aires.

  it("todo el historial no limita el período", () => {
    expect(toHistoryFilters(DEFAULT_VIEW, BUENOS_AIRES, now)).toEqual({
      type: "all",
      from: "",
      to: "",
      page: 1,
    });
  });

  it("los atajos se resuelven en días de la zona de la organización, incluido hoy", () => {
    expect(
      toHistoryFilters({ ...DEFAULT_VIEW, period: "7d" }, BUENOS_AIRES, now),
    ).toMatchObject({ from: "2026-09-03", to: "2026-09-09" });
    expect(
      toHistoryFilters({ ...DEFAULT_VIEW, period: "30d" }, BUENOS_AIRES, now),
    ).toMatchObject({ from: "2026-08-11", to: "2026-09-09" });
    // En UTC el mismo instante ya es el día 10.
    expect(
      toHistoryFilters({ ...DEFAULT_VIEW, period: "7d" }, "UTC", now),
    ).toMatchObject({ from: "2026-09-04", to: "2026-09-10" });
  });

  it("el período personalizado pasa las fechas tal como se escribieron", () => {
    expect(
      toHistoryFilters(
        {
          ...DEFAULT_VIEW,
          period: "personalizado",
          from: "2026-02-30",
          to: "2026-09-15",
        },
        BUENOS_AIRES,
        now,
      ),
    ).toMatchObject({ from: "2026-02-30", to: "2026-09-15" });
  });

  it("traduce el tipo al valor del servicio", () => {
    expect(
      toHistoryFilters({ ...DEFAULT_VIEW, type: "positivo" }, "UTC", now).type,
    ).toBe("adjustment_positive");
    expect(
      toHistoryFilters({ ...DEFAULT_VIEW, type: "negativo" }, "UTC", now).type,
    ).toBe("adjustment_negative");
    // brief-19.3, D-7: las entregas de pedidos.
    expect(
      toHistoryFilters({ ...DEFAULT_VIEW, type: "entrega" }, "UTC", now).type,
    ).toBe("order_delivery");
    expect(parseMovementView({ tipo: "entrega" }).type).toBe("entrega");
    // brief-20.3, H-2: las ventas sin pedido.
    expect(
      toHistoryFilters({ ...DEFAULT_VIEW, type: "venta" }, "UTC", now).type,
    ).toBe("sale");
    expect(parseMovementView({ tipo: "venta" }).type).toBe("venta");
    // brief-20.4, D-7: la reposición de la anulación de una venta.
    expect(
      toHistoryFilters({ ...DEFAULT_VIEW, type: "anulacion" }, "UTC", now).type,
    ).toBe("sale_void");
    expect(parseMovementView({ tipo: "anulacion" }).type).toBe("anulacion");
    // brief-22.4, D-14: las entradas de las recepciones.
    expect(
      toHistoryFilters({ ...DEFAULT_VIEW, type: "recepcion" }, "UTC", now).type,
    ).toBe("goods_receipt");
    expect(parseMovementView({ tipo: "recepcion" }).type).toBe("recepcion");
  });

  // brief-22.4, D-14: la recepción suma, como el ajuste positivo y la anulación de una venta.
  it("el signo de cada tipo de movimiento", () => {
    for (const type of ["adjustment_positive", "sale_void", "goods_receipt"]) {
      expect(movementSign(type)).toBe("+");
    }
    for (const type of ["adjustment_negative", "order_delivery", "sale"]) {
      expect(movementSign(type)).toBe("−");
    }
  });
});

describe("movementFiltersHref", () => {
  it("omite los valores por defecto y vuelve a leerse igual", () => {
    expect(movementFiltersHref(PRODUCT, DEFAULT_VIEW)).toBe(
      `/productos/${PRODUCT}/movimientos`,
    );
    const view = {
      type: "negativo" as const,
      period: "personalizado" as const,
      from: "2026-09-01",
      to: "2026-09-15",
      page: 2,
    };
    const href = movementFiltersHref(PRODUCT, view);
    expect(href).toBe(
      `/productos/${PRODUCT}/movimientos?tipo=negativo&periodo=personalizado&desde=2026-09-01&hasta=2026-09-15&pagina=2`,
    );
    const query = Object.fromEntries(
      new URL(href, "http://localhost").searchParams,
    );
    expect(parseMovementView(query)).toEqual(view);
  });
});

describe("hasActiveMovementFilters", () => {
  it("la página no cuenta como filtro", () => {
    expect(hasActiveMovementFilters(DEFAULT_VIEW)).toBe(false);
    expect(hasActiveMovementFilters({ ...DEFAULT_VIEW, page: 3 })).toBe(false);
    expect(hasActiveMovementFilters({ ...DEFAULT_VIEW, period: "7d" })).toBe(
      true,
    );
    expect(
      hasActiveMovementFilters({ ...DEFAULT_VIEW, type: "positivo" }),
    ).toBe(true);
  });
});
