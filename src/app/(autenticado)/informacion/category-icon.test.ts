import { describe, expect, it } from "vitest";
import { categoryIcon } from "./category-icon";

describe("categoryIcon", () => {
  it("reconoce las categorías de la demostración", () => {
    expect(categoryIcon("Envíos")).toBe("truck");
    expect(categoryIcon("Horarios")).toBe("clock");
    expect(categoryIcon("Pagos")).toBe("creditCard");
  });

  it("no distingue mayúsculas ni acentos", () => {
    expect(categoryIcon("UBICACIÓN")).toBe("mapPin");
    expect(categoryIcon("garantia")).toBe("shield");
    expect(categoryIcon("Cambios y devoluciones")).toBe("undo");
  });

  it("una categoría desconocida o vacía lleva el ícono de documento", () => {
    expect(categoryIcon("Promociones")).toBe("fileText");
    expect(categoryIcon("")).toBe("fileText");
  });
});
