import { describe, expect, it } from "vitest";
import { deriveWarranty, localDate } from "./warranty";

// La regla de la garantía (brief-29.9, D-2 y D-7): el vencimiento es la fecha local del inicio más los
// días, y cubre todo ese día en la zona de la organización.

const BA = "America/Argentina/Buenos_Aires";

function derive(
  startedAt: string,
  days: number | null,
  now: string,
  timezone = BA,
) {
  return deriveWarranty({
    startedAt: new Date(startedAt),
    days,
    source: "settings",
    timezone,
    now: new Date(now),
  });
}

describe("localDate", () => {
  it("da la fecha de la zona, no la de UTC", () => {
    // 01:00 UTC del 2 es todavía el 1 en Buenos Aires (UTC−3).
    expect(localDate(new Date("2026-10-02T01:00:00Z"), BA)).toBe("2026-10-01");
    expect(localDate(new Date("2026-10-02T01:00:00Z"), "UTC")).toBe(
      "2026-10-02",
    );
  });
});

describe("deriveWarranty", () => {
  it("sin días configurados no inventa un valor", () => {
    expect(
      derive("2026-10-01T15:00:00Z", null, "2026-10-02T15:00:00Z"),
    ).toEqual({ status: "not_configured" });
  });

  it("30 días desde el 1 vencen el 31 y cubren todo ese día", () => {
    const last = derive("2026-10-01T15:00:00Z", 30, "2026-11-01T02:59:59Z");
    expect(last).toMatchObject({ status: "in_warranty", endsOn: "2026-10-31" });
    // Las 00:00 del 1 de noviembre en Buenos Aires.
    const next = derive("2026-10-01T15:00:00Z", 30, "2026-11-01T03:00:00Z");
    expect(next).toMatchObject({ status: "expired", endsOn: "2026-10-31" });
  });

  it("el inicio es el día local, aunque en UTC ya sea el siguiente", () => {
    // 23:00 del 1 en Buenos Aires.
    expect(
      derive("2026-10-02T02:00:00Z", 30, "2026-10-02T12:00:00Z"),
    ).toMatchObject({ endsOn: "2026-10-31" });
    expect(
      derive("2026-10-02T02:00:00Z", 30, "2026-10-02T12:00:00Z", "UTC"),
    ).toMatchObject({ endsOn: "2026-11-01" });
  });

  it("con cero días vence el mismo día del inicio", () => {
    expect(
      derive("2026-10-01T15:00:00Z", 0, "2026-10-02T02:59:59Z"),
    ).toMatchObject({ status: "in_warranty", endsOn: "2026-10-01" });
    expect(
      derive("2026-10-01T15:00:00Z", 0, "2026-10-02T03:00:00Z"),
    ).toMatchObject({ status: "expired", endsOn: "2026-10-01" });
  });

  it("cruza el fin de mes y de año sin horas", () => {
    expect(
      derive("2026-12-15T15:00:00Z", 30, "2026-12-20T15:00:00Z"),
    ).toMatchObject({ endsOn: "2027-01-14" });
    expect(
      derive("2028-02-01T15:00:00Z", 28, "2028-02-01T15:00:00Z"),
    ).toMatchObject({ endsOn: "2028-02-29" });
  });

  it("devuelve el inicio, los días y su origen", () => {
    const warranty = deriveWarranty({
      startedAt: new Date("2026-10-01T15:00:00Z"),
      days: 90,
      source: "unit",
      timezone: BA,
      now: new Date("2026-10-01T15:00:00Z"),
    });
    expect(warranty).toEqual({
      status: "in_warranty",
      startedAt: new Date("2026-10-01T15:00:00Z"),
      days: 90,
      source: "unit",
      startsOn: "2026-10-01",
      endsOn: "2026-12-30",
    });
  });
});
