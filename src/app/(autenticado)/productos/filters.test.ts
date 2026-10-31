import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  hasActiveFilters,
  parseProductFilters,
  productFiltersHref,
  catalogReturnHref,
  MAX_COLLAPSED,
  NO_MODEL_PARAM,
  parseCollapsedModels,
  productHref,
  toggleGroupHref,
} from "./filters";
import { NO_MODEL_GROUP } from "@/modules/inventory";

describe("parseProductFilters", () => {
  it("brief-29.2: lee el modelo; un valor que no es un id no filtra", () => {
    const id = "5eed0000-0000-4000-8210-000000000001";
    expect(parseProductFilters({ modelo: id }).modelId).toBe(id);
    expect(parseProductFilters({ modelo: "iphone" }).modelId).toBe("");
    expect(hasActiveFilters(parseProductFilters({ modelo: id }))).toBe(true);
  });

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
      brand: "",
      category: "",
      modelId: "",
      groupByModel: false,
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

  it("brief-15.2: lee la categoría y la marca tal como vienen, recortadas y acotadas", () => {
    expect(
      parseProductFilters({ categoria: " Notebooks ", marca: "Arkon" }),
    ).toMatchObject({ category: "Notebooks", brand: "Arkon" });
    expect(parseProductFilters({ categoria: "", marca: "  " })).toEqual(
      DEFAULT_FILTERS,
    );
    expect(parseProductFilters({ marca: "b".repeat(200) }).brand).toHaveLength(
      100,
    );
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
      brand: "Arkon",
      category: "Notebooks & tablets",
      modelId: "5eed0000-0000-4000-8210-000000000001",
      groupByModel: true,
      page: 4,
      sort: "stock_asc" as const,
      pageSize: 50,
    };
    const href = productFiltersHref(filters);
    expect(href).toBe(
      "/productos?q=caf%C3%A9+molido&estado=disponible&actividad=inactivos&categoria=Notebooks+%26+tablets&marca=Arkon&modelo=5eed0000-0000-4000-8210-000000000001&agrupar=modelo&orden=stock-menor&filas=50&pagina=4",
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

  it("brief-29.2: agrupar por modelo tampoco; un valor desconocido no agrupa", () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, groupByModel: true })).toBe(
      false,
    );
    expect(parseProductFilters({ agrupar: "marca" }).groupByModel).toBe(false);
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
    expect(
      hasActiveFilters({ ...DEFAULT_FILTERS, category: "Notebooks" }),
    ).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, brand: "Arkon" })).toBe(true);
  });
});

// Los grupos cerrados y la vuelta al catálogo (brief-24.5.1, D-3, D-5, AC-2 y AC-10).
describe("los grupos cerrados del catálogo agrupado (brief-24.5.1, D-3)", () => {
  const MODEL_A = "5eed0000-0000-4000-8210-00000000000a";
  const MODEL_B = "5eed0000-0000-4000-8210-00000000000b";
  const grouped = { ...DEFAULT_FILTERS, groupByModel: true };

  it("sin el parámetro no hay ninguno cerrado: los grupos arrancan abiertos", () => {
    expect(parseCollapsedModels({})).toEqual(new Set());
  });

  it("lee uno, varios, y descarta lo que no es un id", () => {
    expect(parseCollapsedModels({ cerrado: MODEL_A })).toEqual(
      new Set([MODEL_A]),
    );
    expect(parseCollapsedModels({ cerrado: [MODEL_A, MODEL_B] })).toEqual(
      new Set([MODEL_A, MODEL_B]),
    );
    expect(parseCollapsedModels({ cerrado: ["iphone", MODEL_A] })).toEqual(
      new Set([MODEL_A]),
    );
  });

  it("el grupo sin modelo también se puede cerrar, con su propio valor", () => {
    expect(parseCollapsedModels({ cerrado: NO_MODEL_PARAM })).toEqual(
      new Set([NO_MODEL_GROUP]),
    );
    expect(productFiltersHref(grouped, [NO_MODEL_GROUP])).toBe(
      "/productos?agrupar=modelo&cerrado=sin-modelo",
    );
  });

  it("una URL fabricada con miles de valores se acota", () => {
    const many = Array.from(
      { length: MAX_COLLAPSED + 50 },
      (_, index) =>
        `5eed0000-0000-4000-8210-${String(index).padStart(12, "0")}`,
    );
    expect(parseCollapsedModels({ cerrado: many }).size).toBe(MAX_COLLAPSED);
  });

  it("sin agrupar no se escriben en la URL: no significan nada", () => {
    expect(productFiltersHref(DEFAULT_FILTERS, [MODEL_A])).toBe("/productos");
  });

  it("el chevron cierra el abierto y abre el cerrado, sin perder lo demás", () => {
    const filters = { ...grouped, text: "iphone", page: 2 };
    const open = new Set<string>();
    const closed = toggleGroupHref(filters, open, MODEL_A);
    expect(closed).toBe(
      `/productos?q=iphone&agrupar=modelo&pagina=2&cerrado=${MODEL_A}`,
    );
    expect(toggleGroupHref(filters, new Set([MODEL_A]), MODEL_A)).toBe(
      "/productos?q=iphone&agrupar=modelo&pagina=2",
    );
    // Cerrar un segundo grupo conserva el primero.
    expect(toggleGroupHref(filters, new Set([MODEL_A]), MODEL_B)).toBe(
      `/productos?q=iphone&agrupar=modelo&pagina=2&cerrado=${MODEL_A}&cerrado=${MODEL_B}`,
    );
  });
});

describe("volver al catálogo con su contexto (brief-24.5.1, D-5)", () => {
  const MODEL_A = "5eed0000-0000-4000-8210-00000000000a";
  const PRODUCT = "11110000-0000-4000-8210-000000000001";

  it("sin filtros ni página, el enlace del producto no lleva ?desde=", () => {
    expect(productHref(PRODUCT, DEFAULT_FILTERS)).toBe(`/productos/${PRODUCT}`);
  });

  it("con filtros, el enlace lleva la query del catálogo codificada", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      text: "iphone 13",
      groupByModel: true,
      page: 3,
    };
    expect(productHref(PRODUCT, filters, [MODEL_A])).toBe(
      `/productos/${PRODUCT}?desde=${encodeURIComponent(
        `q=iphone+13&agrupar=modelo&pagina=3&cerrado=${MODEL_A}`,
      )}`,
    );
  });

  it("la vuelta reconstruye filtros, página y grupos cerrados", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      text: "iphone 13",
      groupByModel: true,
      page: 3,
    };
    const href = productHref(PRODUCT, filters, [MODEL_A]);
    const desde = decodeURIComponent(href.split("desde=")[1]!);
    expect(catalogReturnHref({ desde })).toBe(
      `/productos?q=iphone+13&agrupar=modelo&pagina=3&cerrado=${MODEL_A}`,
    );
  });

  it("sin ?desde= vuelve al catálogo limpio", () => {
    expect(catalogReturnHref({})).toBe("/productos");
  });

  it("una ?desde= fabricada no puede mandar a otra ruta ni colar parámetros ajenos", () => {
    expect(
      catalogReturnHref({ desde: "../../otra-ruta?x=1&redirect=http://ajeno" }),
    ).toBe("/productos");
    expect(catalogReturnHref({ desde: "q=hola&veneno=1" })).toBe(
      "/productos?q=hola",
    );
  });
});
