import { describe, expect, it } from "vitest";
import { daysSinceText } from "./stats";

const NOW = new Date("2026-10-05T15:00:00Z");

describe("daysSinceText", () => {
  it("menos de un día es hoy", () => {
    expect(daysSinceText(new Date("2026-10-05T01:00:00Z"), NOW)).toBe("Hoy");
    expect(daysSinceText(new Date("2026-10-04T15:00:01Z"), NOW)).toBe("Hoy");
  });

  it("cuenta días enteros, en singular y en plural", () => {
    expect(daysSinceText(new Date("2026-10-04T15:00:00Z"), NOW)).toBe("1 día");
    expect(daysSinceText(new Date("2026-09-23T10:00:00Z"), NOW)).toBe(
      "12 días",
    );
  });

  it("una fecha futura cuenta como hoy", () => {
    expect(daysSinceText(new Date("2026-10-06T00:00:00Z"), NOW)).toBe("Hoy");
  });
});
