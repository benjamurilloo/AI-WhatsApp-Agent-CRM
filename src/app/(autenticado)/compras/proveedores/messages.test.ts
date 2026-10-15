import { describe, expect, it } from "vitest";
import { SUPPLIER_FIELD_LIMITS } from "@/modules/purchasing";
import {
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
