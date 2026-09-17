import { describe, expect, it } from "vitest";
import {
  BAR_GAP,
  BAR_WIDTH,
  CHART_HEIGHT,
  chartGeometry,
} from "./chart-geometry";

// Geometría del gráfico diario (brief-7.4, D-4): función pura, probada sin renderizar.

describe("chartGeometry", () => {
  it("ubica una barra por día, en orden y sin superponerlas", () => {
    const geometry = chartGeometry([
      { day: "2026-09-01", value: 5 },
      { day: "2026-09-02", value: 10 },
      { day: "2026-09-03", value: 0 },
    ]);
    expect(geometry.bars.map((bar) => bar.x)).toEqual([
      0,
      BAR_WIDTH + BAR_GAP,
      2 * (BAR_WIDTH + BAR_GAP),
    ]);
    expect(geometry.bars.every((bar) => bar.width === BAR_WIDTH)).toBe(true);
    expect(geometry.width).toBe(3 * (BAR_WIDTH + BAR_GAP) - BAR_GAP);
    expect(geometry.max).toBe(10);
  });

  it("escala contra el máximo y apoya las barras en la base", () => {
    const geometry = chartGeometry([
      { day: "2026-09-01", value: 10 },
      { day: "2026-09-02", value: 5 },
    ]);
    const [top, half] = geometry.bars;
    expect(top!.height).toBe(CHART_HEIGHT);
    expect(top!.y).toBe(0);
    expect(half!.height).toBe(CHART_HEIGHT / 2);
    expect(half!.y + half!.height).toBe(CHART_HEIGHT);
  });

  it("un día en 0 no dibuja barra, y un día con valor nunca queda invisible", () => {
    const geometry = chartGeometry([
      { day: "2026-09-01", value: 0 },
      { day: "2026-09-02", value: 1 },
      { day: "2026-09-03", value: 5000 },
    ]);
    expect(geometry.bars[0]!.height).toBe(0);
    expect(geometry.bars[1]!.height).toBeGreaterThan(0);
  });

  it("un período sin actividad no divide por cero", () => {
    const geometry = chartGeometry([
      { day: "2026-09-01", value: 0 },
      { day: "2026-09-02", value: 0 },
    ]);
    expect(geometry.max).toBe(0);
    expect(geometry.bars.every((bar) => bar.height === 0)).toBe(true);
  });

  it("con muchos días el ancho crece en lugar de comprimir las barras", () => {
    const days = Array.from({ length: 366 }, (_, index) => ({
      day: `d${index}`,
      value: index,
    }));
    const geometry = chartGeometry(days);
    expect(geometry.bars).toHaveLength(366);
    expect(geometry.width).toBe(366 * (BAR_WIDTH + BAR_GAP) - BAR_GAP);
  });

  it("sin puntos devuelve un lienzo mínimo", () => {
    const geometry = chartGeometry([]);
    expect(geometry.bars).toEqual([]);
    expect(geometry.width).toBe(BAR_WIDTH);
  });
});
