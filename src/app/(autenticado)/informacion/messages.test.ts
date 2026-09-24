import { describe, expect, it } from "vitest";
import {
  formatCalendarDate,
  formatValidity,
  knowledgeFieldError,
  noticeMessage,
} from "./messages";

describe("vigencia en pantalla (FR-INFO-03)", () => {
  it("una fecha de calendario se muestra tal cual, sin pasar por una zona", () => {
    expect(formatCalendarDate("2026-12-24")).toBe("24/12/2026");
    expect(formatCalendarDate("2027-01-01")).toBe("01/01/2027");
  });

  it("describe cada forma de vigencia", () => {
    expect(formatValidity(null, null)).toBe("Sin límite");
    expect(formatValidity("2026-12-24", null)).toBe("Desde el 24/12/2026");
    expect(formatValidity(null, "2026-12-31")).toBe("Hasta el 31/12/2026");
    expect(formatValidity("2026-12-24", "2026-12-26")).toBe(
      "Del 24/12/2026 al 26/12/2026",
    );
    expect(formatValidity("2026-12-24", "2026-12-24")).toBe(
      "Solo el 24/12/2026",
    );
  });
});

describe("errores del formulario", () => {
  it("el primer campo inválido sigue el orden del formulario", () => {
    expect(knowledgeFieldError(["validUntil", "category"]).field).toBe(
      "category",
    );
    expect(knowledgeFieldError(["validUntil"])).toEqual({
      field: "validUntil",
      message:
        "Ingresá una fecha válida, igual o posterior a la de inicio, o dejala vacía.",
    });
  });
});

describe("avisos", () => {
  it("solo los valores conocidos producen un aviso", () => {
    expect(noticeMessage("creada")).toBe("Entrada creada.");
    expect(noticeMessage(["editada", "creada"])).toBe("Entrada actualizada.");
    expect(noticeMessage("constructor")).toBeNull();
    expect(noticeMessage(undefined)).toBeNull();
  });
});
