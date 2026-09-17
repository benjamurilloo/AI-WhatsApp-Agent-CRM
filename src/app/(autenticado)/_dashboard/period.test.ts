import { describe, expect, it } from "vitest";
import {
  dashboardHref,
  formatCalendarDay,
  parseDashboardView,
  periodInputFor,
} from "./period";

// Período del dashboard en la URL (brief-7.4, D-5).

const TODAY = "2026-09-17";

describe("parseDashboardView", () => {
  it("sin parámetros usa los últimos 30 días completos", () => {
    expect(parseDashboardView({})).toEqual({
      period: "30d",
      from: "",
      to: "",
    });
  });

  it("un período desconocido vuelve al de defecto", () => {
    expect(parseDashboardView({ periodo: "todo" }).period).toBe("30d");
    expect(parseDashboardView({ periodo: "" }).period).toBe("30d");
  });

  it("acepta los atajos y personalizado, recortando espacios", () => {
    expect(parseDashboardView({ periodo: " 90d " }).period).toBe("90d");
    expect(
      parseDashboardView({
        periodo: "personalizado",
        desde: " 2026-08-01 ",
        hasta: "2026-08-31",
      }),
    ).toEqual({
      period: "personalizado",
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("ignora las fechas si el período no es personalizado", () => {
    expect(parseDashboardView({ periodo: "7d", desde: "2026-01-01" })).toEqual({
      period: "7d",
      from: "",
      to: "",
    });
  });

  it("toma el primer valor de un parámetro repetido", () => {
    expect(parseDashboardView({ periodo: ["90d", "7d"] }).period).toBe("90d");
  });
});

describe("periodInputFor", () => {
  it("el atajo por defecto viaja vacío, para que lo calcule el módulo", () => {
    expect(periodInputFor({ period: "30d", from: "", to: "" }, TODAY)).toEqual({
      from: "",
      to: "",
    });
  });

  it("los otros atajos terminan ayer y no incluyen hoy", () => {
    expect(periodInputFor({ period: "7d", from: "", to: "" }, TODAY)).toEqual({
      from: "2026-09-10",
      to: "2026-09-16",
    });
    expect(periodInputFor({ period: "90d", from: "", to: "" }, TODAY)).toEqual({
      from: "2026-06-19",
      to: "2026-09-16",
    });
  });

  it("cruza meses y años", () => {
    expect(
      periodInputFor({ period: "7d", from: "", to: "" }, "2026-01-03"),
    ).toEqual({ from: "2025-12-27", to: "2026-01-02" });
  });

  it("personalizado pasa las fechas tal como llegaron, para que las valide el servicio", () => {
    expect(
      periodInputFor(
        { period: "personalizado", from: "2026-02-30", to: "" },
        TODAY,
      ),
    ).toEqual({ from: "2026-02-30", to: "" });
  });
});

describe("dashboardHref", () => {
  it("el período por defecto no ensucia la URL", () => {
    expect(dashboardHref({ period: "30d", from: "", to: "" })).toBe("/");
  });

  it("lleva el atajo y, en personalizado, solo las fechas escritas", () => {
    expect(dashboardHref({ period: "7d", from: "", to: "" })).toBe(
      "/?periodo=7d",
    );
    expect(
      dashboardHref({
        period: "personalizado",
        from: "2026-08-01",
        to: "2026-08-31",
      }),
    ).toBe("/?periodo=personalizado&desde=2026-08-01&hasta=2026-08-31");
    expect(
      dashboardHref({ period: "personalizado", from: "2026-08-01", to: "" }),
    ).toBe("/?periodo=personalizado&desde=2026-08-01");
  });
});

describe("formatCalendarDay", () => {
  it("muestra el día de calendario sin pasar por husos", () => {
    expect(formatCalendarDay("2026-08-13")).toBe("13/08/2026");
    expect(formatCalendarDay("2026-01-01")).toBe("01/01/2026");
  });

  it("devuelve el valor tal cual si no es un día completo", () => {
    expect(formatCalendarDay("")).toBe("");
  });
});
