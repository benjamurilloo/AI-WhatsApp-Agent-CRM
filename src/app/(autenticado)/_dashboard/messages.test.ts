import { describe, expect, it } from "vitest";
import {
  METRIC_ERROR_MESSAGE,
  metricStateText,
  NO_DATA_MESSAGE,
  UNAVAILABLE_MESSAGE,
} from "./messages";

// Los tres estados de una tarjeta (brief-7.4; brief-7.3, D-1): distintos entre sí, y ninguno es 0.

describe("metricStateText", () => {
  it('un denominador en cero dice "Sin datos"', () => {
    expect(metricStateText("no_data").message).toBe("Sin datos");
  });

  it('sin ingestión configurada dice "No disponible", no "Sin datos"', () => {
    const unavailable = metricStateText("unavailable");
    expect(unavailable.message).toBe("No disponible");
    expect(unavailable.message).not.toBe(NO_DATA_MESSAGE);
    expect(unavailable.hint).toContain("no está configurada");
  });

  it("cada estado tiene su explicación, y ninguno se presenta como 0", () => {
    for (const status of ["no_data", "unavailable"] as const) {
      const text = metricStateText(status);
      expect(text.hint).not.toBe("");
      expect(text.message).not.toBe("0");
    }
  });

  it("los tres textos de la tarjeta son distintos entre sí", () => {
    expect(
      new Set([NO_DATA_MESSAGE, UNAVAILABLE_MESSAGE, METRIC_ERROR_MESSAGE])
        .size,
    ).toBe(3);
  });
});
