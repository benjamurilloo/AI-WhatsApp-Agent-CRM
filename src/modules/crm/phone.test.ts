import { describe, expect, it } from "vitest";
import { normalizePhone, parsePhoneInput, phoneForRole } from "./phone";

describe("normalizePhone (brief-5.2, D-1)", () => {
  it("quita espacios, guiones, puntos y paréntesis de un número internacional", () => {
    for (const text of [
      "+5491155551234",
      "+54 9 11 5555-1234",
      " +54 (9) 11.5555.1234 ",
      "+54-9-11-5555-1234",
      "+54 9 11 5555 1234",
    ]) {
      expect(normalizePhone(text)).toBe("+5491155551234");
    }
  });

  it("acepta los largos extremos de E.164", () => {
    expect(normalizePhone("+12")).toBe("+12");
    expect(normalizePhone("+123 456 789 012 345")).toBe("+123456789012345");
  });

  it("sin + no adivina el país", () => {
    for (const text of ["5491155551234", "011 5555-1234", "11 5555-1234"]) {
      expect(normalizePhone(text)).toBeNull();
    }
  });

  it("rechaza lo que no es E.164", () => {
    for (const text of [
      "",
      "+",
      "+1",
      "+0 11 5555-1234",
      "+1234567890123456",
      "+54 9 11 5555-123a",
      "+54 9 11 5555/1234",
      "++5491155551234",
      "+54+91155551234",
      "+54911５5551234",
      "Ana",
    ]) {
      expect(normalizePhone(text)).toBeNull();
    }
  });
});

describe("parsePhoneInput", () => {
  it("vacío o ausente es sin teléfono", () => {
    for (const value of [undefined, null, "", "   "]) {
      expect(parsePhoneInput(value)).toEqual({ ok: true, phone: null });
    }
  });

  it("normaliza un número válido y rechaza uno inválido", () => {
    expect(parsePhoneInput("+54 9 11 5555-1234")).toEqual({
      ok: true,
      phone: "+5491155551234",
    });
    expect(parsePhoneInput("011 5555-1234")).toEqual({ ok: false });
  });
});

describe("phoneForRole (brief-5.2, D-2)", () => {
  it("admin recibe el número completo", () => {
    expect(phoneForRole("+5491155551234", "admin")).toEqual({
      kind: "full",
      e164: "+5491155551234",
    });
  });

  it("viewer recibe solo los últimos 4 dígitos", () => {
    const phone = phoneForRole("+5491155551234", "viewer");
    expect(phone).toEqual({ kind: "masked", lastDigits: "1234" });
    expect(JSON.stringify(phone)).not.toContain("549115555");
  });

  it("un número de 4 dígitos o menos no entrega ningún dígito a viewer", () => {
    for (const e164 of ["+12", "+1234"]) {
      expect(phoneForRole(e164, "viewer")).toEqual({
        kind: "masked",
        lastDigits: "",
      });
    }
    expect(phoneForRole("+12345", "viewer")).toEqual({
      kind: "masked",
      lastDigits: "2345",
    });
  });

  it("sin teléfono es null para los dos roles", () => {
    expect(phoneForRole(null, "admin")).toBeNull();
    expect(phoneForRole(null, "viewer")).toBeNull();
  });
});
