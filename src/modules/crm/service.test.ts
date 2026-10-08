import { describe, expect, it } from "vitest";
import {
  CLIENTS_PAGE_SIZE,
  clientPageBounds,
  interpretSearch,
  SUGGESTED_TAGS,
  validateClientInput,
  validateTagInput,
} from "./service";
import { TAG_COLORS } from "./tag-colors";

describe("validateTagInput (brief-16.1, D-2 y D-4)", () => {
  it("recorta el nombre y sin color usa gris", () => {
    expect(validateTagInput({ name: "  Reclamo  " })).toEqual({
      ok: true,
      values: { name: "Reclamo", color: "gray" },
    });
    expect(validateTagInput({ name: "Reclamo", color: "" })).toMatchObject({
      ok: true,
      values: { color: "gray" },
    });
  });

  it("acepta los seis colores de la paleta y ningún otro", () => {
    for (const color of TAG_COLORS) {
      expect(validateTagInput({ name: "X", color }).ok, color).toBe(true);
    }
    expect(validateTagInput({ name: "X", color: "pink" })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["color"],
    });
  });

  it("rechaza el nombre vacío y el de más de 40 caracteres", () => {
    expect(validateTagInput({ name: "   " })).toMatchObject({
      fields: ["name"],
    });
    expect(validateTagInput({ name: "x".repeat(40) }).ok).toBe(true);
    expect(validateTagInput({ name: "x".repeat(41) })).toMatchObject({
      fields: ["name"],
    });
  });

  it("las sugeridas son válidas y tienen nombres distintos (D-3)", () => {
    for (const tag of SUGGESTED_TAGS) {
      expect(validateTagInput(tag).ok, tag.name).toBe(true);
    }
    const names = SUGGESTED_TAGS.map((tag) => tag.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

// Los campos de la 17.1 sin valor (brief-17.1).
const NO_EXTRA_VALUES = {
  email: null,
  kind: null,
  companyName: null,
  jobTitle: null,
  addressLine: null,
  city: null,
  province: null,
  postalCode: null,
  segment: null,
};

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
        ...NO_EXTRA_VALUES,
      },
    });
    expect(validateClientInput({ displayName: "Ana" })).toEqual({
      ok: true,
      values: {
        displayName: "Ana",
        phoneE164: null,
        notes: null,
        ...NO_EXTRA_VALUES,
      },
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
