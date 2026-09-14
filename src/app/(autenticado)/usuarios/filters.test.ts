import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  hasActiveFilters,
  memberFiltersHref,
  parseMemberFilters,
} from "./filters";

describe("parseMemberFilters", () => {
  it("sin parámetros usa los valores por defecto: todos los roles, activos, página 1", () => {
    expect(parseMemberFilters({})).toEqual(DEFAULT_FILTERS);
    expect(DEFAULT_FILTERS).toEqual({ role: "all", status: "active", page: 1 });
  });

  it("lee rol, estado y página válidos", () => {
    expect(
      parseMemberFilters({ rol: "viewer", estado: "inactivos", pagina: "3" }),
    ).toEqual({ role: "viewer", status: "inactive", page: 3 });
    expect(parseMemberFilters({ rol: "admin", estado: "todos" })).toEqual({
      role: "admin",
      status: "all",
      page: 1,
    });
  });

  it("reemplaza valores inválidos por los de defecto", () => {
    for (const params of [
      { rol: "owner", estado: "borrados", pagina: "0" },
      { rol: "toString", estado: "constructor", pagina: "-2" },
      { rol: "", estado: "", pagina: "1.5" },
      { pagina: "abc" },
      { pagina: "99999999" },
    ]) {
      expect(parseMemberFilters(params)).toEqual(DEFAULT_FILTERS);
    }
  });

  it("con un parámetro repetido toma el primero", () => {
    expect(parseMemberFilters({ rol: ["admin", "viewer"] })).toMatchObject({
      role: "admin",
    });
  });
});

describe("memberFiltersHref y hasActiveFilters", () => {
  it("omite los valores por defecto", () => {
    expect(memberFiltersHref(DEFAULT_FILTERS)).toBe("/usuarios");
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
  });

  it("lleva a la URL lo que difiere y vuelve a leerse igual", () => {
    const filters = { role: "viewer", status: "all", page: 2 } as const;
    const href = memberFiltersHref(filters);
    expect(href).toBe("/usuarios?rol=viewer&estado=todos&pagina=2");
    const params = Object.fromEntries(
      new URLSearchParams(href.split("?")[1]).entries(),
    );
    expect(parseMemberFilters(params)).toEqual(filters);
    expect(hasActiveFilters(filters)).toBe(true);
  });
});
