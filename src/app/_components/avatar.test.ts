import { describe, expect, it } from "vitest";
import { initialsOf } from "./avatar";

describe("initialsOf", () => {
  it("toma la inicial de las dos primeras palabras", () => {
    expect(initialsOf("Benjamín Murillo")).toBe("BM");
    expect(initialsOf("ana maría pérez")).toBe("AM");
  });

  it("con una sola palabra devuelve una letra", () => {
    expect(initialsOf("Lucía")).toBe("L");
  });

  it("ignora espacios de más y signos al principio de una palabra", () => {
    expect(initialsOf("  «Ana»   Pérez ")).toBe("AP");
  });

  it("sin letras devuelve un signo neutro", () => {
    expect(initialsOf("")).toBe("·");
    expect(initialsOf("   ")).toBe("·");
  });

  it("respeta las letras con tilde y la ñ", () => {
    expect(initialsOf("ñandú Óscar")).toBe("ÑÓ");
  });
});
