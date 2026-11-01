import { describe, expect, it, vi } from "vitest";
import type { ProductUnitCostsResult } from "@/modules/inventory";
import { readUnitCosts } from "./cost-data";

// La lectura de los costos por unidad (brief-24.5.2-b, I-2 y AC-11). La lectura entra como
// parámetro, así que el fallo se fuerza **sin mockear el módulo**: la prueba pasa una función que
// lanza. Es lo que vuelve alcanzable —y por lo tanto comprobable— la rama que anuncia
// «No disponible».

const costs = (): ProductUnitCostsResult => ({
  ok: true,
  tracking: "unit",
  costs: {
    base: {
      ok: true,
      currency: "USD",
      units: 3,
      total: 108_000n,
      average: 36_000n,
    },
    availableUnits: [],
    otherUnits: [],
    availableTotals: [],
    otherTotals: [],
    availableTotal: 3,
    otherTotal: 0,
  },
});

describe("readUnitCosts", () => {
  it("devuelve los costos cuando la lectura anda", async () => {
    const onError = vi.fn();
    const read = await readUnitCosts(() => Promise.resolve(costs()), onError);
    expect(read).toMatchObject({
      ok: true,
      tracking: "unit",
      costs: { availableTotal: 3 },
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it("una lectura que lanza se convierte en «no se pudo leer», y se registra", async () => {
    const onError = vi.fn();
    const boom = new Error("la base no responde");
    const read = await readUnitCosts(() => Promise.reject(boom), onError);
    expect(read).toEqual({ ok: false });
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it("una lectura que lanza de forma síncrona también", async () => {
    const onError = vi.fn();
    const read = await readUnitCosts(() => {
      throw new Error("explotó antes de la promesa");
    }, onError);
    expect(read).toEqual({ ok: false });
    expect(onError).toHaveBeenCalledOnce();
  });

  it("un Failure del contrato es «no se pudo leer», no un vacío", async () => {
    const onError = vi.fn();
    const read = await readUnitCosts(
      () => Promise.resolve({ ok: false, code: "FORBIDDEN" as const }),
      onError,
    );
    expect(read).toEqual({ ok: false });
    // No se registra: no es una falla inesperada, es el contrato diciendo que no.
    expect(onError).not.toHaveBeenCalled();
  });

  it("un producto por cantidad NO es un fallo: es un resultado legítimo", async () => {
    // La diferencia que I-2 protege. Si los dos casos devolvieran lo mismo, la pantalla diría «no
    // pudimos leer los costos» de un producto que simplemente no tiene unidades.
    const onError = vi.fn();
    const read = await readUnitCosts(
      () => Promise.resolve({ ok: true, tracking: "quantity", costs: null }),
      onError,
    );
    expect(read).toEqual({ ok: true, tracking: "quantity", costs: null });
    expect(onError).not.toHaveBeenCalled();
  });
});
