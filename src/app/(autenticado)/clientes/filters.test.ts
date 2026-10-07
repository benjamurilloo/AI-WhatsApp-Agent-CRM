import { describe, expect, it } from "vitest";
import {
  clientFiltersHref,
  DEFAULT_FILTERS,
  hasActiveFilters,
  parseClientFilters,
} from "./filters";

describe("parseClientFilters", () => {
  it("sin parámetros usa los valores por defecto", () => {
    expect(parseClientFilters({})).toEqual(DEFAULT_FILTERS);
  });

  it("lee texto, actividad y página", () => {
    expect(
      parseClientFilters({
        q: "  +54 9 11 5555-1234 ",
        actividad: "todos",
        pagina: "3",
      }),
    ).toEqual({
      text: "+54 9 11 5555-1234",
      activity: "all",
      page: 3,
      sort: "last_interaction",
      pageSize: 25,
      tagId: null,
    });
    expect(parseClientFilters({ actividad: "inactivos" }).activity).toBe(
      "inactive",
    );
  });

  it("reemplaza valores desconocidos o inválidos por los de defecto", () => {
    expect(
      parseClientFilters({
        actividad: "toString",
        pagina: "0",
      }),
    ).toEqual(DEFAULT_FILTERS);
    for (const pagina of ["-1", "1.5", "abc", "10000000"]) {
      expect(parseClientFilters({ pagina }).page).toBe(1);
    }
  });

  it("brief-15.2: lee el orden y las filas por página; uno desconocido vuelve al de defecto", () => {
    expect(
      parseClientFilters({ orden: "nombre-za", filas: "50" }),
    ).toMatchObject({
      sort: "name_desc",
      pageSize: 50,
    });
    expect(parseClientFilters({ orden: "toString", filas: "0" })).toMatchObject(
      {
        sort: "last_interaction",
        pageSize: 25,
      },
    );
  });

  it("toma el primer valor repetido y acota el texto", () => {
    expect(parseClientFilters({ q: ["Ana", "Bruno"] }).text).toBe("Ana");
    expect(parseClientFilters({ q: "a".repeat(150) }).text).toHaveLength(100);
  });

  it("FR-CLI-10: lee la etiqueta con forma de id; cualquier otra cosa no filtra (brief-16.1)", () => {
    const tagId = "3f1702be-6f4e-8135-830d-dd1c5d574187";
    expect(parseClientFilters({ etiqueta: tagId }).tagId).toBe(tagId);
    expect(parseClientFilters({ etiqueta: tagId.toUpperCase() }).tagId).toBe(
      tagId,
    );
    for (const etiqueta of ["", "reclamo", `${tagId}x`, "toString"]) {
      expect(parseClientFilters({ etiqueta }).tagId).toBeNull();
    }
  });
});

describe("clientFiltersHref", () => {
  it("omite los valores por defecto", () => {
    expect(clientFiltersHref(DEFAULT_FILTERS)).toBe("/clientes");
  });

  it("codifica el texto, incluido el + de un teléfono", () => {
    expect(
      clientFiltersHref({ text: "+54 9", activity: "inactive", page: 2 }),
    ).toBe("/clientes?q=%2B54+9&actividad=inactivos&pagina=2");
  });

  it("es la inversa de parseClientFilters", () => {
    const filters = {
      text: "Ana Pérez",
      activity: "all",
      page: 4,
      sort: "name_asc",
      pageSize: 10,
      tagId: "3f1702be-6f4e-8135-830d-dd1c5d574187",
    } as const;
    const href = clientFiltersHref(filters);
    expect(href).toBe(
      "/clientes?q=Ana+P%C3%A9rez&actividad=todos&orden=nombre&filas=10&etiqueta=3f1702be-6f4e-8135-830d-dd1c5d574187&pagina=4",
    );
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseClientFilters(params)).toEqual(filters);
  });
});

describe("hasActiveFilters", () => {
  it("la página sola no cuenta como filtro", () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, page: 3 })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, text: "Ana" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, activity: "all" })).toBe(
      true,
    );
    expect(
      hasActiveFilters({
        ...DEFAULT_FILTERS,
        tagId: "3f1702be-6f4e-8135-830d-dd1c5d574187",
      }),
    ).toBe(true);
  });
});
