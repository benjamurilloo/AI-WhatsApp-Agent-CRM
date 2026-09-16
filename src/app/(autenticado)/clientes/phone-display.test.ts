import { describe, expect, it } from "vitest";
import { phoneDisplay } from "./phone-display";

describe("phoneDisplay (brief-5.3, D-1)", () => {
  it("admin ve el número tal como está guardado", () => {
    expect(phoneDisplay({ kind: "full", e164: "+5491155551234" }, "—")).toEqual(
      { visible: "+5491155551234", spoken: "+5491155551234" },
    );
  });

  it("viewer ve los últimos 4 dígitos, con texto para lector de pantalla", () => {
    expect(
      phoneDisplay({ kind: "masked", lastDigits: "1234" }, "Sin teléfono"),
    ).toEqual({
      visible: "•••• 1234",
      spoken: "Teléfono enmascarado, termina en 1234",
    });
  });

  it("un enmascarado sin dígitos no muestra ninguno", () => {
    expect(phoneDisplay({ kind: "masked", lastDigits: "" }, "—")).toEqual({
      visible: "••••",
      spoken: "Teléfono enmascarado",
    });
  });

  it("sin teléfono usa el texto de cada vista", () => {
    expect(phoneDisplay(null, "—")).toEqual({
      visible: "—",
      spoken: "Sin teléfono",
    });
    expect(phoneDisplay(null, "Sin teléfono").visible).toBe("Sin teléfono");
  });
});
