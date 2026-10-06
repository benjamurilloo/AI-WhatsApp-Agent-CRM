import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  hasActiveFilters,
  parseProductFilters,
  productFiltersHref,
} from "./filters";

describe("parseProductFilters", () => {
  it("sin parámetros deja los filtros por defecto: solo activos", () => {
    expect(parseProductFilters({})).toEqual(DEFAULT_FILTERS);
  });

  it("traduce los valores de la URL", () => {
    expect(
      parseProductFilters({
        q: "  café  ",
        estado: "bajo",
        actividad: "todos",
        pagina: "3",
      }),
    ).toEqual({
      text: "café",
      stockStatus: "bajo_stock",
      activity: "all",
      page: 3,
      sort: "name_asc",
      pageSize: 25,
    });
  });

  it("brief-15.2: lee el orden y las filas por página; uno desconocido vuelve al de defecto", () => {
    expect(
      parseProductFilters({ orden: "precio-mayor", filas: "10" }),
    ).toMatchObject({
      sort: "price_desc",
      pageSize: 10,
    });
    expect(
      parseProductFilters({ orden: "inventado", filas: "30" }),
    ).toMatchObject({
      sort: "name_asc",
      pageSize: 25,
    });
    expect(parseProductFilters({ filas: ["50", "10"] }).pageSize).toBe(50);
  });

  it("un valor desconocido vuelve al de defecto, sin fallar", () => {
    expect(
      parseProductFilters({
        estado: "inventado",
        actividad: "inventado",
        pagina: "0",
      }),
    ).toEqual(DEFAULT_FILTERS);
    expect(parseProductFilters({ pagina: "-2" }).page).toBe(1);
    expect(parseProductFilters({ pagina: "9999999" }).page).toBe(1);
    expect(parseProductFilters({ pagina: "abc" }).page).toBe(1);
  });

  it("toma el primer valor si el parámetro viene repetido y acota el texto", () => {
    expect(parseProductFilters({ estado: ["sin", "bajo"] }).stockStatus).toBe(
      "sin_stock",
    );
    expect(parseProductFilters({ q: "a".repeat(200) }).text).toHaveLength(100);
  });
});

describe("productFiltersHref", () => {
  it("omite los valores por defecto", () => {
    expect(productFiltersHref(DEFAULT_FILTERS)).toBe("/productos");
    expect(productFiltersHref({ ...DEFAULT_FILTERS, page: 2 })).toBe(
      "/productos?pagina=2",
    );
  });

  it("escribe los filtros activos y vuelve a leerlos igual", () => {
    const filters = {
      text: "café molido",
      stockStatus: "disponible" as const,
      activity: "inactive" as const,
      page: 4,
      sort: "stock_asc" as const,
      pageSize: 50,
    };
    const href = productFiltersHref(filters);
    expect(href).toBe(
      "/productos?q=caf%C3%A9+molido&estado=disponible&actividad=inactivos&orden=stock-menor&filas=50&pagina=4",
    );
    const query = Object.fromEntries(
      new URL(href, "http://localhost").searchParams,
    );
    expect(parseProductFilters(query)).toEqual(filters);
  });
});

describe("hasActiveFilters", () => {
  it("brief-15.2: el orden y las filas no cuentan como filtro", () => {
    expect(
      hasActiveFilters({ ...DEFAULT_FILTERS, sort: "price_asc", pageSize: 10 }),
    ).toBe(false);
  });

  it("la página no cuenta como filtro", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, page: 5 })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, text: "café" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, activity: "all" })).toBe(
      true,
    );
    expect(
      hasActiveFilters({ ...DEFAULT_FILTERS, stockStatus: "sin_stock" }),
    ).toBe(true);
  });
});
