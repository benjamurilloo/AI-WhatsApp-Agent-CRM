import { describe, expect, it } from "vitest";
import {
  slotsText,
  toSlots,
  validateDaySlots,
  validateExceptionInput,
  validateWeekInput,
  type DaySlotsInput,
  type WeekInput,
} from "./hours-service";

const CLOSED: DaySlotsInput = {
  opens1: "",
  closes1: "",
  opens2: "",
  closes2: "",
};
const SPLIT: DaySlotsInput = {
  opens1: "09:00",
  closes1: "13:00",
  opens2: "16:00",
  closes2: "20:00",
};

describe("validateDaySlots (FR-INFO-04, brief-17.4, D-2)", () => {
  it("acepta un día cerrado, uno de un tramo y uno cortado, y recorta los espacios", () => {
    expect(validateDaySlots(CLOSED)).toEqual({
      opens1: null,
      closes1: null,
      opens2: null,
      closes2: null,
    });
    expect(
      validateDaySlots({ ...CLOSED, opens1: " 00:00", closes1: "23:59 " }),
    ).toEqual({
      opens1: "00:00",
      closes1: "23:59",
      opens2: null,
      closes2: null,
    });
    expect(validateDaySlots(SPLIT)).toEqual(SPLIT);
  });

  it.each([
    ["un tramo invertido", { ...CLOSED, opens1: "13:00", closes1: "09:00" }],
    [
      "un tramo de duración cero",
      { ...CLOSED, opens1: "09:00", closes1: "09:00" },
    ],
    ["una apertura sin cierre", { ...CLOSED, opens1: "09:00" }],
    [
      "un segundo tramo sin el primero",
      { ...CLOSED, opens2: "16:00", closes2: "20:00" },
    ],
    ["un segundo tramo que pisa al primero", { ...SPLIT, opens2: "12:00" }],
    [
      "un segundo tramo que empalma con el primero",
      { ...SPLIT, opens2: "13:00" },
    ],
    ["las 24:00", { ...CLOSED, opens1: "20:00", closes1: "24:00" }],
    [
      "una hora sin cero inicial",
      { ...CLOSED, opens1: "9:00", closes1: "13:00" },
    ],
    ["segundos", { ...CLOSED, opens1: "09:00:00", closes1: "13:00" }],
  ])("rechaza %s", (_, input) => {
    expect(validateDaySlots(input)).toBeUndefined();
  });
});

describe("validateWeekInput", () => {
  it("informa cada día inválido, en orden", () => {
    const week = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7].map((day) => [day, CLOSED]),
    ) as WeekInput;
    expect(
      validateWeekInput({
        ...week,
        2: { ...CLOSED, opens1: "x", closes1: "13:00" },
        7: { ...SPLIT, closes2: "" },
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["day2", "day7"],
    });
    const ok = validateWeekInput({ ...week, 1: SPLIT });
    expect(ok.ok && ok.week).toHaveLength(7);
  });
});

describe("validateExceptionInput", () => {
  it("deja el motivo vacío en nulo y recorta la fecha", () => {
    expect(
      validateExceptionInput({ ...CLOSED, date: " 2026-12-25 ", reason: "  " }),
    ).toEqual({
      ok: true,
      values: {
        date: "2026-12-25",
        reason: null,
        opens1: null,
        closes1: null,
        opens2: null,
        closes2: null,
      },
    });
  });

  it("informa la fecha, los tramos y el motivo, en ese orden", () => {
    expect(
      validateExceptionInput({
        ...CLOSED,
        opens1: "10:00",
        date: "25/12/2026",
        reason: "x".repeat(101),
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["date", "slots", "reason"],
    });
  });
});

describe("toSlots y slotsText", () => {
  it("convierten los tramos de un día, y un día cerrado queda vacío", () => {
    const day = validateDaySlots(SPLIT)!;
    expect(toSlots(day)).toEqual([
      { opens: "09:00", closes: "13:00" },
      { opens: "16:00", closes: "20:00" },
    ]);
    expect(slotsText(day)).toBe("09:00-13:00,16:00-20:00");
    expect(slotsText(validateDaySlots(CLOSED)!)).toBe("");
  });
});
