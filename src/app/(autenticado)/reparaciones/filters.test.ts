import { describe, expect, it } from "vitest";
import {
  hasActiveServiceOrderFilters,
  parseServiceOrderFilters,
  serviceOrderFiltersHref,
} from "./filters";

// El filtro por técnico de la lista de reparaciones (brief-24.8.2-b, D-5): lo que lee y lo que
// escribe en la URL. Que filtre de verdad lo prueba la integración; acá está el contrato del
// parámetro «tecnico», que es el que arma «Ver reparaciones» en la ficha del proveedor.
const TECNICO = "7f3e1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

describe("el filtro por técnico en la URL (D-5)", () => {
  it("sin el parámetro, no filtra por técnico y los filtros siguen inactivos", () => {
    const filters = parseServiceOrderFilters({});
    expect(filters.technicianId).toBe("");
    expect(hasActiveServiceOrderFilters(filters)).toBe(false);
    expect(serviceOrderFiltersHref(filters)).toBe("/reparaciones");
  });

  it("con el parámetro, lo lee, lo cuenta como filtro activo y lo devuelve a la URL", () => {
    const filters = parseServiceOrderFilters({ tecnico: TECNICO });
    expect(filters.technicianId).toBe(TECNICO);
    expect(hasActiveServiceOrderFilters(filters)).toBe(true);
    expect(serviceOrderFiltersHref(filters)).toBe(
      `/reparaciones?tecnico=${TECNICO}`,
    );
  });

  it("convive con el estado, el tipo, el número y la página", () => {
    const filters = parseServiceOrderFilters({
      estado: "reparadas",
      tipo: "clientes",
      buscar: "OS-000123",
      tecnico: TECNICO,
      pagina: "3",
    });
    expect(filters.technicianId).toBe(TECNICO);
    const href = serviceOrderFiltersHref(filters);
    expect(href).toContain("estado=reparadas");
    expect(href).toContain("tipo=clientes");
    expect(href).toContain("buscar=OS-000123");
    expect(href).toContain(`tecnico=${TECNICO}`);
    expect(href).toContain("pagina=3");
  });

  it("recorta un id larguísimo y no deja pasar un arreglo repetido entero", () => {
    expect(
      parseServiceOrderFilters({ tecnico: "x".repeat(200) }).technicianId,
    ).toHaveLength(36);
    expect(
      parseServiceOrderFilters({ tecnico: [TECNICO, "otro"] }).technicianId,
    ).toBe(TECNICO);
  });

  it("un id en blanco no filtra ni ensucia la URL", () => {
    const filters = parseServiceOrderFilters({ tecnico: "   " });
    expect(hasActiveServiceOrderFilters(filters)).toBe(false);
    expect(serviceOrderFiltersHref(filters)).toBe("/reparaciones");
  });
});

// El buscador de la 24.9.1 (D-3 y AC-7): el parámetro se llama «buscar» y acepta un número de orden
// o un modelo. Que encuentre de verdad por modelo lo prueba la integración; acá está el contrato de
// la URL, que es lo que la tabla y los cuatro contadores comparten.
describe("el buscador del listado (24.9.1, D-3)", () => {
  it("sin el parámetro, no busca nada y los filtros siguen inactivos", () => {
    const filters = parseServiceOrderFilters({});
    expect(filters.text).toBe("");
    expect(hasActiveServiceOrderFilters(filters)).toBe(false);
  });

  it("lee un modelo igual que un número y lo devuelve a la URL", () => {
    const filters = parseServiceOrderFilters({ buscar: "iPhone 13" });
    expect(filters.text).toBe("iPhone 13");
    expect(hasActiveServiceOrderFilters(filters)).toBe(true);
    expect(serviceOrderFiltersHref(filters)).toBe(
      "/reparaciones?buscar=iPhone+13",
    );
  });

  it("recorta un texto larguísimo y toma el primero de un arreglo repetido", () => {
    expect(
      parseServiceOrderFilters({ buscar: "x".repeat(200) }).text,
    ).toHaveLength(60);
    expect(parseServiceOrderFilters({ buscar: ["uno", "dos"] }).text).toBe(
      "uno",
    );
  });

  it("un texto en blanco no filtra ni ensucia la URL", () => {
    const filters = parseServiceOrderFilters({ buscar: "   " });
    expect(hasActiveServiceOrderFilters(filters)).toBe(false);
    expect(serviceOrderFiltersHref(filters)).toBe("/reparaciones");
  });
});
