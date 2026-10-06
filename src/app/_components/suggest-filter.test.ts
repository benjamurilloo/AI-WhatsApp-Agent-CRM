import { describe, expect, it } from "vitest";
import { filterSuggestions, normalizeForSuggest } from "./suggest-filter";

const CATEGORIES = ["Almacén", "Bebidas", "Celulares", "Notebooks", "Tablets"];

describe("normalizeForSuggest", () => {
  it("quita tildes, mayúsculas y espacios de los extremos", () => {
    expect(normalizeForSuggest("  ALMACÉN ")).toBe("almacen");
    expect(normalizeForSuggest("Ñandú")).toBe("nandu");
  });
});

describe("filterSuggestions", () => {
  it("sin texto devuelve la lista entera, en su orden", () => {
    expect(filterSuggestions(CATEGORIES, "")).toEqual(CATEGORIES);
    expect(filterSuggestions(CATEGORIES, "   ")).toEqual(CATEGORIES);
  });

  it("encuentra sin tildes ni mayúsculas", () => {
    expect(filterSuggestions(CATEGORIES, "ALMACEN")).toEqual(["Almacén"]);
    expect(filterSuggestions(CATEGORIES, "almacén")).toEqual(["Almacén"]);
  });

  it("primero las que empiezan con el texto, después las que lo contienen", () => {
    expect(filterSuggestions(CATEGORIES, "b")).toEqual([
      "Bebidas",
      "Notebooks",
      "Tablets",
    ]);
    expect(filterSuggestions(CATEGORIES, "ta")).toEqual(["Tablets"]);
  });

  it("sin coincidencias devuelve una lista vacía", () => {
    expect(filterSuggestions(CATEGORIES, "xyz")).toEqual([]);
    expect(filterSuggestions([], "a")).toEqual([]);
  });
});
