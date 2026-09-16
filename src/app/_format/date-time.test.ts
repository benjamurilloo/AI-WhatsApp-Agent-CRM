import { describe, expect, it } from "vitest";
import {
  calendarDayIn,
  formatFullDateTime,
  formatShortDateTime,
  shiftDays,
} from "./date-time";

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

describe("formato de fechas en la zona de la organización", () => {
  it("usa la zona indicada, no la del proceso", () => {
    // 02:59:59 UTC del 10 es el 9 a las 23:59 en Buenos Aires (UTC−3).
    const value = new Date("2026-09-10T02:59:59Z");
    expect(formatShortDateTime(value, BUENOS_AIRES)).toBe("09/09 23:59");
    expect(formatShortDateTime(value, "UTC")).toBe("10/09 02:59");
    expect(formatFullDateTime(value, BUENOS_AIRES)).toBe("09/09/2026 23:59");
  });

  it("muestra la hora en 24 horas, con dos dígitos", () => {
    expect(formatShortDateTime(new Date("2026-01-05T03:05:00Z"), "UTC")).toBe(
      "05/01 03:05",
    );
    expect(formatShortDateTime(new Date("2026-01-05T00:00:00Z"), "UTC")).toBe(
      "05/01 00:00",
    );
  });

  it("respeta un cambio de horario histórico", () => {
    // El 19/10/2008 Buenos Aires pasó a UTC−2: 01:30 UTC del 20 es todavía el 19.
    expect(
      formatShortDateTime(new Date("2008-10-20T01:30:00Z"), BUENOS_AIRES),
    ).toBe("19/10 23:30");
  });
});

describe("días de calendario", () => {
  it("toma el día en la zona de la organización", () => {
    const value = new Date("2026-09-10T02:59:59Z");
    expect(calendarDayIn(BUENOS_AIRES, value)).toBe("2026-09-09");
    expect(calendarDayIn("UTC", value)).toBe("2026-09-10");
  });

  it("corre días cruzando meses, años y años bisiestos", () => {
    expect(shiftDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDays("2026-09-15", -29)).toBe("2026-08-17");
    expect(shiftDays("2026-09-15", 0)).toBe("2026-09-15");
  });
});
