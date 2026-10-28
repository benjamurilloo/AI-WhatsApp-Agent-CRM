import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorSummary, errorSummaryTitle } from "./error-summary";
import { FormActionBar } from "./form-action-bar";
import { activeBadgeClass, inactiveBadgeClass } from "./form-styles";
import { STATUS_TONE_CLASS, StatusBadge } from "./status-badge";

// Los patrones compartidos de la 24.1 (brief-24.1, D-6 y D-8).

describe("StatusBadge", () => {
  it("lleva el nombre y un ícono decorativo", () => {
    const html = renderToStaticMarkup(
      createElement(StatusBadge, {
        tone: "success",
        icon: "circleCheck",
        children: "Vigente",
      }),
    );
    expect(html).toContain("Vigente");
    expect(html).toContain('<svg aria-hidden="true"');
    expect(html).toContain("bg-success-soft text-on-success-soft");
  });

  it("cada tono usa solo tokens del tema", () => {
    for (const classes of Object.values(STATUS_TONE_CLASS)) {
      expect(classes).toMatch(/^bg-[a-z-]+ text-[a-z-]+$/);
      expect(classes).not.toMatch(/-(?:[1-9]00|50)\b/);
    }
  });

  it("las clases de estado activo e inactivo también llevan ícono", () => {
    expect(activeBadgeClass).toContain("badge-icon-check");
    expect(inactiveBadgeClass).toContain("badge-icon-minus");
  });
});

describe("ErrorSummary", () => {
  it("cuenta los campos a revisar", () => {
    expect(errorSummaryTitle(0)).toBe("No se pudo guardar");
    expect(errorSummaryTitle(1)).toBe("Revisá 1 campo para guardar");
    expect(errorSummaryTitle(3)).toBe("Revisá 3 campos para guardar");
  });

  it("enlaza cada error con su campo y se puede enfocar", () => {
    const html = renderToStaticMarkup(
      createElement(ErrorSummary, {
        id: "resumen",
        errors: [
          { field: "validUntil", message: "La fecha de fin es anterior." },
        ],
      }),
    );
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-labelledby="resumen-titulo"');
    expect(html).toContain("Revisá 1 campo para guardar");
    expect(html).toContain('href="#validUntil"');
    expect(html).toContain("La fecha de fin es anterior.");
  });

  it("un error sin campo se muestra como texto, sin enlace", () => {
    const html = renderToStaticMarkup(
      createElement(ErrorSummary, {
        id: "resumen",
        errors: [
          { field: null, message: "No pudimos guardar. Probá de nuevo." },
        ],
      }),
    );
    expect(html).toContain("No se pudo guardar");
    expect(html).toContain("No pudimos guardar. Probá de nuevo.");
    expect(html).not.toContain("<a ");
  });
});

describe("FormActionBar", () => {
  it("queda pegada abajo y marca el documento para reservar su alto", () => {
    const html = renderToStaticMarkup(
      createElement(FormActionBar, {
        children: createElement("button", null, "Guardar"),
      }),
    );
    expect(html).toContain("form-action-bar");
    expect(html).toContain("sticky bottom-0");
    expect(html).toContain("print:hidden");
    expect(html).toContain("Guardar");
  });
});
