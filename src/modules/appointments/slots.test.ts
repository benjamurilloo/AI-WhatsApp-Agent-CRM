import { describe, expect, it } from "vitest";
import {
  addDays,
  buildBookingSlots,
  canTransition,
  isInsideHours,
  needsStarted,
  occupancy,
  overlaps,
  type AppointmentStatus,
} from "./slots";

// Las franjas y las transiciones de un turno (brief-29.10, D-2, D-3 y U-5).

describe("las franjas de un día", () => {
  it("salen de cada tramo, desde la apertura, y la última termina justo en el cierre", () => {
    expect(
      buildBookingSlots(
        [
          { opens: "09:00", closes: "10:30" },
          { opens: "16:00", closes: "17:00" },
        ],
        30,
      ),
    ).toEqual([
      { start: "09:00", end: "09:30" },
      { start: "09:30", end: "10:00" },
      { start: "10:00", end: "10:30" },
      { start: "16:00", end: "16:30" },
      { start: "16:30", end: "17:00" },
    ]);
  });

  it("un tramo que no alcanza para una franja no da ninguna, y lo que sobra al final se pierde", () => {
    expect(
      buildBookingSlots([{ opens: "09:00", closes: "09:45" }], 60),
    ).toEqual([]);
    expect(
      buildBookingSlots([{ opens: "09:00", closes: "10:20" }], 45),
    ).toEqual([{ start: "09:00", end: "09:45" }]);
  });

  it("un día cerrado no tiene franjas", () => {
    expect(buildBookingSlots([], 30)).toEqual([]);
  });

  it("una apertura que no está en la grilla corre la grilla de ese tramo", () => {
    expect(
      buildBookingSlots([{ opens: "09:15", closes: "10:15" }], 20).map(
        (slot) => slot.start,
      ),
    ).toEqual(["09:15", "09:35", "09:55"]);
  });

  it("un tramo que llega al final del día da la franja de las 23", () => {
    expect(
      buildBookingSlots([{ opens: "23:00", closes: "23:59" }], 15),
    ).toEqual([
      { start: "23:00", end: "23:15" },
      { start: "23:15", end: "23:30" },
      { start: "23:30", end: "23:45" },
    ]);
  });
});

describe("la ocupación", () => {
  const slots = buildBookingSlots([{ opens: "10:00", closes: "11:00" }], 30);

  it("cuentan el pedido y el confirmado; el cancelado, el atendido y el ausente no", () => {
    const statuses: AppointmentStatus[] = [
      "requested",
      "confirmed",
      "cancelled",
      "attended",
      "no_show",
    ];
    const taken = statuses.map((status) => ({
      start: "10:00",
      end: "10:30",
      status,
    }));
    expect(occupancy(slots, taken).map((slot) => slot.occupied)).toEqual([
      2, 0,
    ]);
  });

  it("un turno de otra duración ocupa cada franja que toca (U-5)", () => {
    const taken = [
      { start: "10:15", end: "10:45", status: "confirmed" as const },
    ];
    expect(occupancy(slots, taken).map((slot) => slot.occupied)).toEqual([
      1, 1,
    ]);
  });

  it("dos franjas que solo se tocan no se superponen", () => {
    expect(
      overlaps(
        { start: "10:00", end: "10:30" },
        { start: "10:30", end: "11:00" },
      ),
    ).toBe(false);
  });

  it("un turno fuera de los tramos vigentes está fuera de horario (U-5)", () => {
    const spans = [{ opens: "10:00", closes: "11:00" }];
    expect(isInsideHours({ start: "10:30", end: "11:00" }, spans)).toBe(true);
    expect(isInsideHours({ start: "10:45", end: "11:15" }, spans)).toBe(false);
    expect(isInsideHours({ start: "10:00", end: "10:30" }, [])).toBe(false);
  });
});

describe("las transiciones", () => {
  it("son las del trigger de la 0065, y ninguna otra", () => {
    const all: AppointmentStatus[] = [
      "requested",
      "confirmed",
      "cancelled",
      "attended",
      "no_show",
    ];
    const allowed = all.flatMap((from) =>
      all
        .filter((to) => canTransition(from, to))
        .map((to) => `${from} -> ${to}`),
    );
    expect(allowed).toEqual([
      "requested -> confirmed",
      "requested -> cancelled",
      "confirmed -> cancelled",
      "confirmed -> attended",
      "confirmed -> no_show",
    ]);
  });

  it("atendido y ausente necesitan que el turno haya empezado", () => {
    expect(needsStarted("attended")).toBe(true);
    expect(needsStarted("no_show")).toBe(true);
    expect(needsStarted("cancelled")).toBe(false);
    expect(needsStarted("confirmed")).toBe(false);
  });
});

describe("las fechas", () => {
  it("suman días en el calendario, con fin de mes, de año y bisiesto", () => {
    expect(addDays("2026-10-26", 90)).toBe("2027-01-24");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});
