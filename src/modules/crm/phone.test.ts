import { describe, expect, it } from "vitest";
import { phoneForRole } from "./phone";

// La normalización y su test viven en src/shared/phone desde la 22.2 (brief-22.2, D-3).

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
