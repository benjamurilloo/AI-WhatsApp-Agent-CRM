import { describe, expect, it } from "vitest";
import { donutSegments } from "./donut-geometry";

describe("donutSegments (brief-15.3, D-4)", () => {
  it("sin total no dibuja nada", () => {
    expect(donutSegments([0, 0, 0])).toEqual([]);
  });

  it("salta los grupos en 0 y conserva el índice de cada grupo", () => {
    expect(donutSegments([2, 0, 1, 1]).map((segment) => segment.index)).toEqual(
      [0, 2, 3],
    );
  });

  it("la mitad arranca arriba y termina abajo, por la derecha", () => {
    const [half] = donutSegments([1, 1]);
    // Arriba del centro (60, 4), arco exterior hasta abajo (60, 116), sin arco grande.
    expect(half!.path).toBe(
      "M 60 4 A 56 56 0 0 1 60 116 L 60 96 A 36 36 0 0 0 60 24 Z",
    );
  });

  it("más de la mitad usa el arco grande", () => {
    const [big] = donutSegments([3, 1]);
    expect(big!.path).toContain("A 56 56 0 1 1");
  });

  it("un solo grupo con todo el total es una corona entera, en dos mitades", () => {
    const [ring] = donutSegments([0, 5, 0]);
    expect(ring!.index).toBe(1);
    expect(ring!.path.match(/M /g)).toHaveLength(2);
  });
});
