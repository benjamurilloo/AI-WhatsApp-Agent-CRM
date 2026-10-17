import { describe, expect, it } from "vitest";
import { outlineButtonClass, secondaryButtonClass } from "./form-styles";

// brief-23.1, D-3: el secundario de los mockups existe aparte del neutro y usa solo tokens.
describe("outlineButtonClass", () => {
  it("es violeta sobre la superficie, con el radio de 12 px y foco visible", () => {
    for (const piece of [
      "border-primary",
      "text-primary",
      "bg-surface",
      "hover:bg-primary-soft",
      "rounded-xl",
      "focus-visible:outline-focus",
    ]) {
      expect(outlineButtonClass.split(" ")).toContain(piece);
    }
  });

  it("no usa la paleta por defecto de Tailwind", () => {
    expect(outlineButtonClass).not.toMatch(
      /(violet|purple|indigo|gray|slate|zinc|neutral)-\d/,
    );
  });

  it("no reemplaza al neutro, que sigue siendo el terciario de los mockups", () => {
    expect(secondaryButtonClass).not.toBe(outlineButtonClass);
    expect(secondaryButtonClass).toContain("text-foreground");
  });
});
