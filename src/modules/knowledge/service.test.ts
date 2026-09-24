import { describe, expect, it } from "vitest";
import { validateKnowledgeInput } from "./service";

const valid = {
  title: "Horario de atención",
  category: "Horarios",
  content: "Lunes a viernes de 9 a 18.\nSábados de 9 a 13.",
  validFrom: null,
  validUntil: null,
};

describe("validateKnowledgeInput (FR-INFO-01, brief-11.2, D-2 y D-3)", () => {
  it("recorta los textos, conserva los saltos de línea interiores y deja las fechas vacías en nulo", () => {
    expect(
      validateKnowledgeInput({
        title: "  Horario de atención ",
        category: " Horarios  ",
        content: "  Lunes a viernes de 9 a 18.\nSábados de 9 a 13.\n ",
        validFrom: "  ",
        validUntil: "",
      }),
    ).toEqual({ ok: true, values: valid });
  });

  it("normaliza los saltos de línea a \\n: un textarea envía CRLF, y cada uno contaría doble en el límite", () => {
    const result = validateKnowledgeInput({
      ...valid,
      content: "Línea uno\r\nLínea dos\rLínea tres",
    });
    expect(result.ok && result.values.content).toBe(
      "Línea uno\nLínea dos\nLínea tres",
    );
    // 1333 líneas de dos letras: 5330 caracteres con CRLF, 3998 con \n.
    const lines = Array.from({ length: 1333 }, () => "ab").join("\r\n");
    expect(lines.length).toBe(5330);
    expect(validateKnowledgeInput({ ...valid, content: lines }).ok).toBe(true);
  });

  it("acepta una vigencia de un solo día y fechas de un solo lado", () => {
    const cases: [string | null, string | null][] = [
      ["2026-12-24", "2026-12-24"],
      ["2026-12-24", null],
      [null, "2026-12-31"],
    ];
    for (const [validFrom, validUntil] of cases) {
      expect(
        validateKnowledgeInput({ ...valid, validFrom, validUntil }).ok,
      ).toBe(true);
    }
  });

  it("rechaza los campos vacíos o de solo espacios", () => {
    expect(
      validateKnowledgeInput({
        ...valid,
        title: " ",
        category: "",
        content: "\n\n",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["title", "category", "content"],
    });
  });

  it("rechaza los textos que pasan los límites, y acepta el límite exacto", () => {
    expect(
      validateKnowledgeInput({
        ...valid,
        title: "t".repeat(201),
        category: "c".repeat(101),
        content: "x".repeat(4001),
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["title", "category", "content"],
    });
    expect(
      validateKnowledgeInput({
        ...valid,
        title: "t".repeat(200),
        category: "c".repeat(100),
        content: "x".repeat(4000),
      }).ok,
    ).toBe(true);
  });

  it.each(["2026-02-30", "24/12/2026", "2026-12-1", "0000-01-01", "mañana"])(
    "rechaza una fecha que no es de calendario: %s",
    (date) => {
      expect(
        validateKnowledgeInput({ ...valid, validFrom: date, validUntil: date }),
      ).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["validFrom", "validUntil"],
      });
    },
  );

  it("rechaza una vigencia que termina antes de empezar, en el campo del final", () => {
    expect(
      validateKnowledgeInput({
        ...valid,
        validFrom: "2026-12-26",
        validUntil: "2026-12-24",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["validUntil"],
    });
  });
});
