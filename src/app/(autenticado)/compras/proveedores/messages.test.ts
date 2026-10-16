import { describe, expect, it } from "vitest";
import { SUPPLIER_FIELD_LIMITS } from "@/modules/purchasing";
import {
  CUIT_CHECK_DIGIT_MESSAGE,
  CUIT_FORMAT_MESSAGE,
  CUIT_TAKEN_MESSAGE,
  EMAIL_FORMAT_MESSAGE,
  NAME_MESSAGE,
  NAME_TAKEN_MESSAGE,
  noticeMessage,
  supplierFieldError,
  supplierRuleError,
} from "./messages";

// Los textos de proveedores (brief-22.2, D-7). Los límites que dicen van escritos, porque los usan
// componentes de cliente: el test fija que coincidan con los de la tabla.

describe("los mensajes del formulario", () => {
  it("los límites coinciden con los de la tabla", () => {
    expect(NAME_MESSAGE).toContain(`${SUPPLIER_FIELD_LIMITS.name} caracteres`);
    expect(EMAIL_FORMAT_MESSAGE).toContain(
      `${SUPPLIER_FIELD_LIMITS.email} caracteres`,
    );
  });

  it("el primer campo inválido en el orden del formulario", () => {
    expect(supplierFieldError(["cuit", "email"]).field).toBe("email");
    expect(supplierFieldError(["cuit"]).field).toBe("cuit");
    expect(supplierFieldError([]).field).toBe("name");
  });

  // brief-22.3, D-12.
  it("el CUIT dice si falló la forma o el dígito verificador", () => {
    expect(supplierFieldError(["cuit"], "format")).toEqual({
      field: "cuit",
      message: CUIT_FORMAT_MESSAGE,
    });
    expect(supplierFieldError(["cuit"], "check_digit")).toEqual({
      field: "cuit",
      message: CUIT_CHECK_DIGIT_MESSAGE,
    });
    expect(CUIT_FORMAT_MESSAGE).toBe(
      "Ingresá un CUIT de 11 dígitos, con o sin guiones, por ejemplo 20-12345678-6.",
    );
    expect(CUIT_CHECK_DIGIT_MESSAGE).toBe(
      "El dígito verificador no corresponde a este CUIT. Revisá el último número.",
    );
    // El campo anterior va primero, con su mensaje, aunque el CUIT tenga razón.
    expect(supplierFieldError(["email", "cuit"], "check_digit")).toEqual({
      field: "email",
      message: EMAIL_FORMAT_MESSAGE,
    });
  });

  it("un repetido va al campo que repite", () => {
    expect(supplierRuleError("duplicate_name")).toEqual({
      field: "name",
      message: NAME_TAKEN_MESSAGE,
    });
    expect(supplierRuleError("duplicate_cuit")).toEqual({
      field: "cuit",
      message: CUIT_TAKEN_MESSAGE,
    });
  });
});

describe("los avisos", () => {
  it("solo los conocidos", () => {
    expect(noticeMessage("creado")).toBe("Proveedor creado.");
    expect(noticeMessage(["reactivado", "x"])).toBe("Proveedor reactivado.");
    expect(noticeMessage("toString")).toBeNull();
    expect(noticeMessage(undefined)).toBeNull();
  });
});
