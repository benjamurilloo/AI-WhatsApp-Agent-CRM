import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  knowledgeFiltersHref,
  parseKnowledgeFilters,
} from "./filters";

describe("filtros de la pantalla 11 (brief-11.2, D-7)", () => {
  it("sin parámetros son los de defecto: todas, sin texto, página 1", () => {
    expect(parseKnowledgeFilters({})).toEqual({
      text: "",
      status: "all",
      page: 1,
    });
  });

  it("lee texto, estado y página, y recorta el texto", () => {
    expect(
      parseKnowledgeFilters({
        q: "  envíos ",
        estado: "vencidas",
        pagina: "3",
      }),
    ).toEqual({ text: "envíos", status: "expired", page: 3 });
  });

  it("un valor desconocido vuelve al de defecto, sin error", () => {
    expect(parseKnowledgeFilters({ estado: "current", pagina: "0" })).toEqual({
      text: "",
      status: "all",
      page: 1,
    });
    expect(parseKnowledgeFilters({ estado: "__proto__" }).status).toBe("all");
    expect(parseKnowledgeFilters({ pagina: "-2" }).page).toBe(1);
  });

  it("acota el texto a 100 caracteres", () => {
    expect(parseKnowledgeFilters({ q: "a".repeat(150) }).text).toHaveLength(
      100,
    );
  });

  it("la URL canónica omite los valores de defecto, y cada estado vuelve a leerse igual", () => {
    expect(knowledgeFiltersHref({ text: "", status: "all", page: 1 })).toBe(
      "/informacion",
    );
    for (const status of [
      "current",
      "scheduled",
      "expired",
      "inactive",
    ] as const) {
      const href = knowledgeFiltersHref({ text: "pago", status, page: 2 });
      const params = Object.fromEntries(
        new URLSearchParams(href.split("?")[1]),
      );
      expect(parseKnowledgeFilters(params)).toEqual({
        text: "pago",
        status,
        page: 2,
      });
    }
  });

  it("la página no cuenta como filtro activo", () => {
    expect(hasActiveFilters({ text: "", status: "all", page: 4 })).toBe(false);
    expect(hasActiveFilters({ text: "x", status: "all", page: 1 })).toBe(true);
    expect(hasActiveFilters({ text: "", status: "current", page: 1 })).toBe(
      true,
    );
  });
});
