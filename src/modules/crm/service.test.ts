import { describe, expect, it } from "vitest";
import {
  CLIENTS_PAGE_SIZE,
  clientPageBounds,
  interpretSearch,
  validateClientInput,
} from "./service";

describe("validateClientInput (brief-5.2, D-5)", () => {
  it("recorta textos, normaliza el teléfono y guarda vacíos como null", () => {
    expect(
      validateClientInput({
        displayName: "  Ana Pérez ",
        phone: " +54 9 11 5555-1234 ",
        notes: "   ",
      }),
    ).toEqual({
      ok: true,
      values: {
        displayName: "Ana Pérez",
        phoneE164: "+5491155551234",
        notes: null,
      },
    });
    expect(validateClientInput({ displayName: "Ana" })).toEqual({
      ok: true,
      values: { displayName: "Ana", phoneE164: null, notes: null },
    });
  });

  it("acepta los máximos", () => {
    const result = validateClientInput({
      displayName: "a".repeat(200),
      notes: "n".repeat(1000),
    });
    expect(result.ok).toBe(true);
  });

  it("devuelve todos los campos inválidos, en orden", () => {
    expect(
      validateClientInput({
        displayName: "   ",
        phone: "011 5555-1234",
        notes: "n".repeat(1001),
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["displayName", "phone", "notes"],
    });
    expect(validateClientInput({ displayName: "a".repeat(201) })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["displayName"],
    });
  });
});

describe("interpretSearch (brief-5.2, D-3)", () => {
  it("sin texto no filtra", () => {
    expect(interpretSearch("  ")).toEqual({ kind: "all" });
  });

  it("un teléfono válido busca ese número exacto", () => {
    expect(interpretSearch(" +54 9 11 5555-1234 ")).toEqual({
      kind: "phone",
      e164: "+5491155551234",
    });
  });

  it("cualquier otro texto busca por prefijo de nombre", () => {
    for (const text of ["Ana", "5555", "011 5555-1234", "+54 Ana"]) {
      expect(interpretSearch(text)).toEqual({ kind: "name", prefix: text });
    }
  });
});

describe("clientPageBounds", () => {
  it("pagina de a 25 y lleva una página fuera de rango a la última", () => {
    expect(CLIENTS_PAGE_SIZE).toBe(25);
    expect(clientPageBounds(0, 3)).toEqual({
      page: 1,
      pageCount: 1,
      offset: 0,
    });
    expect(clientPageBounds(26, 2)).toEqual({
      page: 2,
      pageCount: 2,
      offset: 25,
    });
    expect(clientPageBounds(26, 9).page).toBe(2);
    expect(clientPageBounds(26, 0).page).toBe(1);
    expect(clientPageBounds(26, Number.NaN).page).toBe(1);
  });
});
