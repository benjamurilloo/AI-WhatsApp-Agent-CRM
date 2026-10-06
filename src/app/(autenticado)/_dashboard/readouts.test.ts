import { describe, expect, it } from "vitest";
import {
  bucketLabel,
  bucketReadout,
  dailyReadout,
  dayWithWeekday,
  kindLabel,
  kindReadout,
} from "./readouts";

describe("textos de los gráficos (brief-15.3, D-4 a D-6)", () => {
  it("nombra el día con su día de la semana, sin correrlo por la zona horaria", () => {
    // El 12/09/2026 es sábado.
    expect(dayWithWeekday("2026-09-12")).toBe("Sáb 12/09/2026");
  });

  it("la lectura diaria sigue la serie elegida, en singular o plural", () => {
    const row = {
      day: "2026-09-12",
      started: 1,
      active: 4,
      inbound: 3,
      outbound: 2,
    };
    expect(dailyReadout(row, "conversaciones")).toBe(
      "Sáb 12/09/2026: 1 conversación iniciada",
    );
    expect(dailyReadout(row, "mensajes")).toBe(
      "Sáb 12/09/2026: 5 mensajes (3 entrantes, 2 salientes)",
    );
    expect(dailyReadout({ ...row, inbound: 2, outbound: 1 }, "mensajes")).toBe(
      "Sáb 12/09/2026: 3 mensajes (2 entrantes, 1 saliente)",
    );
  });

  it("los tipos tienen nombre, y los nulos son «Sin dato»", () => {
    expect(kindLabel("document")).toBe("Documento");
    expect(kindLabel(null)).toBe("Sin dato");
    expect(kindReadout({ kind: "audio", count: 2 }, 6)).toBe(
      "Audio: 2 mensajes (33,3 %)",
    );
  });

  it("los rangos se nombran como en el boceto", () => {
    const labels = [
      { fromMinutes: 0, toMinutes: 1 },
      { fromMinutes: 1, toMinutes: 5 },
      { fromMinutes: 5, toMinutes: 30 },
      { fromMinutes: 30, toMinutes: 60 },
      { fromMinutes: 60, toMinutes: null },
    ].map((bucket) => bucketLabel({ ...bucket, count: 0 }));
    expect(labels).toEqual([
      "Menos de 1 min",
      "1 a 5 min",
      "5 a 30 min",
      "30 a 60 min",
      "1 h o más",
    ]);
    expect(bucketReadout({ fromMinutes: 60, toMinutes: null, count: 1 })).toBe(
      "1 h o más: 1 conversación",
    );
  });
});
