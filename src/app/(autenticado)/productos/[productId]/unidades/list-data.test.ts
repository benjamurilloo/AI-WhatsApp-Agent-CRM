import { describe, expect, it, vi } from "vitest";
import type { ProductUnitsResult } from "@/modules/inventory";
import { readUnitList } from "./list-data";

// La lectura de la lista de unidades (brief-24.5.2, I-2). La lectura entra como parámetro, así que
// el fallo se fuerza **sin mockear el módulo**: la prueba pasa una función que lanza. Es lo que
// vuelve alcanzable —y por lo tanto comprobable— la rama que anuncia «No disponible».

const page = (units: number): ProductUnitsResult => ({
  ok: true,
  tracking: "unit",
  units: Array.from({ length: units }, (_, i) => ({
    id: `u${i}`,
    serial: `3569380356438${i}`,
    status: "available" as const,
    grade: null,
    batteryHealth: null,
    cost: null,
    price: null,
    warrantyDays: null,
    origin: "manual" as const,
    createdAt: new Date("2026-10-20T10:00:00Z"),
    updatedAt: new Date("2026-10-20T10:00:00Z"),
  })),
  total: units,
  page: 1,
  pageCount: 1,
  search: "none",
  productHasUnits: units > 0,
});

describe("readUnitList", () => {
  it("devuelve la página y no reporta ningún error", async () => {
    const onError = vi.fn();
    const result = await readUnitList(async () => page(2), onError);

    expect(onError).not.toHaveBeenCalled();
    expect(result?.units).toHaveLength(2);
    expect(result?.total).toBe(2);
  });

  it("si la lectura lanza, devuelve null y reporta el error", async () => {
    const onError = vi.fn();
    const result = await readUnitList(() => {
      throw new Error("la base no responde");
    }, onError);

    // `null` y no una página vacía: una lista vacía se dibujaría como «este producto no tiene
    // unidades», que es una afirmación sobre el stock. Es lo que I-2 prohíbe.
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("un Failure del contrato también es «no se pudo leer», sin reportar un error", async () => {
    const onError = vi.fn();
    const result = await readUnitList(
      async () => ({ ok: false, code: "NOT_FOUND" }),
      onError,
    );

    expect(result).toBeNull();
    // Un `Failure` es una respuesta del contrato, no una excepción: no hay nada que loguear.
    expect(onError).not.toHaveBeenCalled();
  });

  it("una página legítimamente vacía no es un fallo", async () => {
    const result = await readUnitList(
      async () => page(0),
      () => {},
    );

    // La distinción es el punto: cero unidades con la lectura exitosa **no** es `null`, y la
    // pantalla lo dibuja como «todavía no tiene unidades», no como «no disponible».
    expect(result).not.toBeNull();
    expect(result?.units).toEqual([]);
    expect(result?.productHasUnits).toBe(false);
  });

  it("ningún resultado devuelve una lista vacía cuando la lectura falló", async () => {
    const outcomes = await Promise.all([
      readUnitList(
        () => {
          throw new Error("x");
        },
        () => {},
      ),
      readUnitList(
        async () => ({ ok: false, code: "FORBIDDEN" }),
        () => {},
      ),
    ]);

    for (const outcome of outcomes) {
      expect(outcome).toBeNull();
      expect(outcome?.units).toBeUndefined();
    }
  });
});
