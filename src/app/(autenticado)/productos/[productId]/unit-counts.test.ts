import { describe, expect, it } from "vitest";
import type { UnitStatusCounts } from "@/modules/inventory";
import {
  outsideBalance,
  physicalUnits,
  readUnitCounts,
  unitCounters,
} from "./unit-counts";

const counts = (
  overrides: Partial<UnitStatusCounts> = {},
): UnitStatusCounts => ({
  available: 0,
  reserved: 0,
  sold: 0,
  written_off: 0,
  in_repair: 0,
  in_review: 0,
  ...overrides,
});

// El ejemplo del README de V2-05: cinco físicas, tres disponibles, una reservada y una en revisión.
const V2 = counts({ available: 3, reserved: 1, in_review: 1 });

describe("unitCounters (brief-24.5.1, D-6)", () => {
  it("son tres, en el orden de la v2, y ninguno es un total", () => {
    expect(unitCounters(V2)).toEqual([
      { key: "available", label: "Disponibles", total: 3 },
      { key: "reserved", label: "Reservadas", total: 1 },
      { key: "in_review", label: "En revisión", total: 1 },
    ]);
  });

  it("un estado en cero se muestra en cero: el producto tiene unidades, la lectura salió bien", () => {
    expect(unitCounters(counts({ available: 2 })).map((c) => c.total)).toEqual([
      2, 0, 0,
    ]);
  });

  it("las vendidas y las dadas de baja no son contadores del Resumen", () => {
    const withHistory = counts({ available: 1, sold: 40, written_off: 7 });
    expect(unitCounters(withHistory).map((c) => c.key)).toEqual([
      "available",
      "reserved",
      "in_review",
    ]);
  });
});

describe("physicalUnits (brief-24.5.1, D-6)", () => {
  it("el ejemplo de la v2: cinco físicas", () => {
    expect(physicalUnits(V2)).toBe(5);
  });

  it("no cuenta las vendidas ni las dadas de baja: salieron del local", () => {
    expect(physicalUnits(counts({ sold: 10, written_off: 3 }))).toBe(0);
    expect(
      physicalUnits(counts({ available: 2, in_repair: 1, sold: 10 })),
    ).toBe(3);
  });
});

describe("outsideBalance (brief-24.5.1, I-3)", () => {
  it("reparación y revisión están fuera del saldo", () => {
    expect(outsideBalance(V2)).toBe(1);
    expect(outsideBalance(counts({ in_repair: 2, in_review: 3 }))).toBe(5);
  });

  it("sin nada en reparación ni en revisión no hay nada que explicar", () => {
    expect(outsideBalance(counts({ available: 9, reserved: 4 }))).toBe(0);
  });

  it("el ejemplo de la v2: disponibles + reservadas da el saldo, y las físicas son más", () => {
    // El saldo del sistema son 4 (3 disponibles + 1 reservada); las físicas, 5.
    expect(V2.available + V2.reserved).toBe(4);
    expect(physicalUnits(V2)).toBe(5);
    // Por eso sumar los tres contadores (3 + 1 + 1 = 5) no da el saldo: no es un total válido.
    expect(unitCounters(V2).reduce((sum, c) => sum + c.total, 0)).not.toBe(
      V2.available + V2.reserved,
    );
  });
});

// AC-8 del brief-24.5.1: «si una lectura del Resumen falla, se anuncia "No disponible"; no se
// muestra cero. **Probado con la lectura forzada a fallar**». Lo que se fuerza acá es la lectura de
// verdad —una función que lanza y otra que devuelve un Failure—, no un mock del módulo: por eso
// `readUnitCounts` recibe la lectura como parámetro.
describe("readUnitCounts (brief-24.5.1, AC-8 e I-2)", () => {
  it("devuelve los recuentos cuando la lectura anda", async () => {
    const avisos: unknown[] = [];
    const result = await readUnitCounts(
      async () => ({ ok: true, tracking: "unit", counts: V2 }),
      (error) => avisos.push(error),
    );
    expect(result).toEqual(V2);
    expect(avisos, "una lectura que anda no avisa de ningún error").toEqual([]);
  });

  it("devuelve undefined en un producto por cantidad, que no es un fallo", async () => {
    const result = await readUnitCounts(
      async () => ({ ok: true, tracking: "quantity", counts: null }),
      () => {
        throw new Error("no se avisa de un error que no hubo");
      },
    );
    // undefined y null significan cosas distintas: acá no hay unidades que contar, y el Resumen no
    // dibuja ni los contadores ni el aviso de «No disponible».
    expect(result).toBeUndefined();
    expect(result).not.toBeNull();
  });

  it("si la lectura lanza, devuelve null y avisa del error", async () => {
    const roto = new Error('relation "stock_units" does not exist');
    const avisos: unknown[] = [];
    const result = await readUnitCounts(
      () => Promise.reject(roto),
      (error) => avisos.push(error),
    );
    // null, no un objeto de ceros: es la diferencia que I-2 protege.
    expect(result).toBeNull();
    expect(avisos, "el error se registra, no se traga").toEqual([roto]);
  });

  it("si la lectura rechaza con un Failure, devuelve null y no inventa ceros", async () => {
    const result = await readUnitCounts(
      async () => ({ ok: false, code: "FORBIDDEN" }),
      () => {},
    );
    expect(result).toBeNull();
  });

  it("ningún desenlace devuelve un recuento en cero, que es lo que I-2 prohíbe", async () => {
    const ceros = counts();
    for (const read of [
      () => Promise.reject(new Error("la base no responde")),
      async () => ({ ok: false as const, code: "VALIDATION_ERROR" as const }),
    ]) {
      const result = await readUnitCounts(read, () => {});
      expect(result).not.toEqual(ceros);
      expect(result).toBeNull();
    }
  });
});
