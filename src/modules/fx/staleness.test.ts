import { describe, expect, it } from "vitest";
import { isStale, weekdayMillisecondsBetween } from "./staleness";

// El aviso de antigüedad (ADR 0025, punto 4; brief-29.4, D-13): más de 24 horas sin contar sábados
// ni domingos, en la zona de la organización. 2026-10-16 es viernes.

const ZONE = "America/Argentina/Buenos_Aires";
const HOUR = 60 * 60 * 1000;
// Hora de Buenos Aires (UTC−3) como instante.
const at = (local: string) => new Date(`${local}-03:00`);

describe("weekdayMillisecondsBetween", () => {
  it("cuenta las horas de lunes a viernes", () => {
    expect(
      weekdayMillisecondsBetween(
        at("2026-10-14T09:00:00"),
        at("2026-10-15T09:00:00"),
        ZONE,
      ),
    ).toBe(24 * HOUR);
  });

  it("no cuenta el sábado ni el domingo, en la zona de la organización", () => {
    // Del viernes a las 18 al lunes a las 9: 6 horas del viernes y 9 del lunes.
    expect(
      weekdayMillisecondsBetween(
        at("2026-10-16T18:00:00"),
        at("2026-10-19T09:00:00"),
        ZONE,
      ),
    ).toBe(15 * HOUR);
  });
});

describe("isStale", () => {
  it("avisa pasadas 24 horas hábiles, no antes", () => {
    const since = at("2026-10-14T09:00:00");
    expect(isStale(since, at("2026-10-15T09:00:00"), ZONE)).toBe(false);
    expect(isStale(since, at("2026-10-15T09:10:00"), ZONE)).toBe(true);
  });

  it("una cotización del viernes a la tarde sigue vigente el lunes a la mañana", () => {
    expect(
      isStale(at("2026-10-16T18:00:00"), at("2026-10-19T12:00:00"), ZONE),
    ).toBe(false);
    expect(
      isStale(at("2026-10-16T18:00:00"), at("2026-10-19T18:10:00"), ZONE),
    ).toBe(true);
  });

  it("más de cuatro días corridos es viejo sin contar", () => {
    expect(
      isStale(at("2026-09-01T09:00:00"), at("2026-10-19T09:00:00"), ZONE),
    ).toBe(true);
  });
});
