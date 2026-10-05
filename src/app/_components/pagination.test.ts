import { describe, expect, it } from "vitest";
import { pageItems, shownRangeText } from "./pagination";

describe("pageItems", () => {
  it("con pocas páginas las muestra todas", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("al principio saltea el final", () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, "gap", 20]);
  });

  it("en el medio saltea los dos lados", () => {
    expect(pageItems(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
  });

  it("al final saltea el principio", () => {
    expect(pageItems(20, 20)).toEqual([1, "gap", 17, 18, 19, 20]);
  });

  it("siempre incluye la página actual, la primera y la última", () => {
    for (let count = 1; count <= 30; count += 1) {
      for (let page = 1; page <= count; page += 1) {
        const items = pageItems(page, count);
        expect(items).toContain(page);
        expect(items[0]).toBe(1);
        expect(items.at(-1)).toBe(count);
      }
    }
  });
});

describe("shownRangeText", () => {
  it("calcula el rango de la página", () => {
    expect(
      shownRangeText({
        page: 2,
        pageSize: 25,
        shown: 1,
        total: 26,
        singular: "conversación",
        plural: "conversaciones",
      }),
    ).toBe("Mostrando 26 a 26 de 26 conversaciones");
  });

  it("usa el singular con un solo resultado", () => {
    expect(
      shownRangeText({
        page: 1,
        pageSize: 25,
        shown: 1,
        total: 1,
        singular: "cliente",
        plural: "clientes",
      }),
    ).toBe("Mostrando 1 a 1 de 1 cliente");
  });
});
