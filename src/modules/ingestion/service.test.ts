import { describe, expect, it } from "vitest";
import { isOpaqueReference } from "./contract";
import { existingEventOutcome, recordIngestionEvent } from "./service";

// Partes del caso de uso de ingestión que no necesitan base (brief-6.5.2).

const stored = (
  status: "received" | "processed" | "failed",
  errorCode: string | null = null,
) => ({ id: "e", payloadHash: "abc", status, errorCode });

describe("existingEventOutcome", () => {
  it("responde duplicate solo con el mismo hash y el evento procesado", () => {
    expect(existingEventOutcome(stored("processed"), "abc")).toEqual({
      kind: "duplicate",
    });
  });

  it("repite el rechazo de un evento failed con el mismo hash", () => {
    expect(existingEventOutcome(stored("failed", "CONFLICT"), "abc")).toEqual({
      kind: "failed",
      errorCode: "CONFLICT",
    });
  });

  it("da conflicto con otro hash, cualquiera sea el estado", () => {
    for (const status of ["processed", "failed", "received"] as const) {
      expect(existingEventOutcome(stored(status, "CONFLICT"), "otro")).toEqual({
        kind: "conflict",
      });
    }
  });

  it("trata un evento sin cerrar como error inesperado", () => {
    expect(() => existingEventOutcome(stored("received"), "abc")).toThrow();
  });
});

describe("validación del source", () => {
  it("usa la regla de las referencias opacas del contrato", () => {
    expect(isOpaqueReference("emisor-de-prueba")).toBe(true);
    for (const bad of ["", " emisor", "emisor\n", "e".repeat(201), 42, null]) {
      expect(isOpaqueReference(bad), String(bad)).toBe(false);
    }
  });

  it("rechaza un source inválido antes de leer el cuerpo o tocar la base", async () => {
    expect(
      await recordIngestionEvent({ organizationId: "x", source: " " }, "{"),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["source"] });
  });

  it("rechaza un cuerpo inválido sin tocar la base", async () => {
    expect(
      await recordIngestionEvent(
        { organizationId: "x", source: "emisor" },
        "{",
      ),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["body"] });
  });
});
