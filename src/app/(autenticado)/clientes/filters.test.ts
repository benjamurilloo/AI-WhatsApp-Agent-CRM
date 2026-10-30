import { describe, expect, it } from "vitest";
import {
  clientFiltersHref,
  DEFAULT_FILTERS,
  hasActiveFilters,
  interactionFilter,
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
      kind: null,
      province: null,
      segment: null,
      interaction: null,
      view: "all",
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
      kind: "company",
      province: "AR-S",
      segment: "Mayorista norte",
    } as const;
    const href = clientFiltersHref(filters);
    expect(href).toBe(
      "/clientes?q=Ana+P%C3%A9rez&actividad=todos&orden=nombre&filas=10&etiqueta=3f1702be-6f4e-8135-830d-dd1c5d574187&tipo=empresa&provincia=AR-S&segmento=Mayorista+norte&pagina=4",
    );
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseClientFilters(params)).toEqual({
      ...filters,
      interaction: null,
      view: "all",
    });
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

describe("tipo, provincia y segmento (brief-17.1, D-9)", () => {
  it("FR-CLI-14: lee el tipo, la provincia y el segmento de la URL", () => {
    expect(
      parseClientFilters({
        tipo: "persona",
        provincia: "ar-x",
        segmento: "  Minorista ",
      }),
    ).toMatchObject({ kind: "person", province: "AR-X", segment: "Minorista" });
  });

  it("un valor desconocido no filtra", () => {
    for (const tipo of ["", "consumidor-final", "person", "toString"]) {
      expect(parseClientFilters({ tipo }).kind).toBeNull();
    }
    for (const provincia of ["", "Córdoba", "AR-", "AR-XX"]) {
      expect(parseClientFilters({ provincia }).province).toBeNull();
    }
    for (const segmento of ["", "   ", "x".repeat(61)]) {
      expect(parseClientFilters({ segmento }).segment).toBeNull();
    }
  });

  it("cuentan como filtros activos", () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, kind: "person" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, province: "AR-C" })).toBe(
      true,
    );
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, segment: "Mayorista" })).toBe(
      true,
    );
  });
});

// La vista y la última interacción de la 24.4.2 (brief-24.4.2, D-1 y D-4).
describe("la vista y la última interacción", () => {
  it("se leen de la URL y un valor desconocido vale el de defecto", () => {
    expect(parseClientFilters({ vista: "con-saldo" }).view).toBe(
      "with_balance",
    );
    expect(parseClientFilters({ vista: "con-reparaciones" }).view).toBe(
      "with_repairs",
    );
    for (const vista of ["", "toString", "saldo"]) {
      expect(parseClientFilters({ vista }).view).toBe("all");
    }
    expect(parseClientFilters({ interaccion: "7-dias" }).interaction).toBe(
      "7d",
    );
    expect(parseClientFilters({ interaccion: "sin" }).interaction).toBe("none");
    for (const interaccion of ["", "hoy", "constructor"]) {
      expect(parseClientFilters({ interaccion }).interaction).toBeNull();
    }
  });

  it("van y vuelven por el enlace, sin los valores por defecto", () => {
    const href = clientFiltersHref({
      ...DEFAULT_FILTERS,
      view: "with_balance",
      interaction: "30d",
    });
    expect(href).toBe("/clientes?vista=con-saldo&interaccion=30-dias");
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseClientFilters(params)).toEqual({
      ...DEFAULT_FILTERS,
      view: "with_balance",
      interaction: "30d",
    });
    expect(clientFiltersHref({ ...DEFAULT_FILTERS, view: "all" })).toBe(
      "/clientes",
    );
  });

  it("la interacción es un filtro y la vista no", () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, interaction: "7d" })).toBe(
      true,
    );
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, view: "with_balance" })).toBe(
      false,
    );
  });

  it("el período se cuenta hacia atrás desde ahora", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    expect(interactionFilter(null, now)).toBeNull();
    expect(interactionFilter("none", now)).toBe("none");
    expect(interactionFilter("7d", now)).toEqual({
      since: new Date("2026-10-22T12:00:00Z"),
    });
    expect(interactionFilter("30d", now)).toEqual({
      since: new Date("2026-09-29T12:00:00Z"),
    });
  });
});
