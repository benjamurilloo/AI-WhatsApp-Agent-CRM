import { describe, expect, it } from "vitest";
import {
  EMAIL_TAKEN_MESSAGE,
  FORBIDDEN_ACTION_MESSAGE,
  INVALID_EMAIL_MESSAGE,
  LAST_ADMIN_MESSAGE,
  MEMBER_NOT_FOUND_MESSAGE,
  memberChangeMessage,
  NAME_REQUIRED_MESSAGE,
  newMemberFieldError,
  noticeMessage,
  ROLE_REQUIRED_MESSAGE,
} from "./messages";

const REQUEST_ID = "6f1c1f1e-0000-4000-8000-000000000001";

describe("mensajes de la pantalla 10", () => {
  it("traduce cada código de un cambio de miembro", () => {
    expect(memberChangeMessage("BUSINESS_RULE_VIOLATION", REQUEST_ID)).toBe(
      LAST_ADMIN_MESSAGE,
    );
    expect(LAST_ADMIN_MESSAGE).toBe(
      "No podés quitar ni desactivar al último admin de la organización.",
    );
    expect(memberChangeMessage("FORBIDDEN", REQUEST_ID)).toBe(
      FORBIDDEN_ACTION_MESSAGE,
    );
    expect(memberChangeMessage("NOT_FOUND", REQUEST_ID)).toBe(
      MEMBER_NOT_FOUND_MESSAGE,
    );
    expect(memberChangeMessage("VALIDATION_ERROR", REQUEST_ID)).toBe(
      ROLE_REQUIRED_MESSAGE,
    );
  });

  it("un error inesperado lleva el request_id", () => {
    expect(memberChangeMessage("INTERNAL", REQUEST_ID)).toBe(
      `No pudimos guardar el cambio. Código: ${REQUEST_ID}`,
    );
  });

  it("el alta marca el primer campo inválido en el orden del formulario", () => {
    expect(newMemberFieldError(["email", "name", "role"])).toEqual({
      field: "name",
      message: NAME_REQUIRED_MESSAGE,
    });
    expect(newMemberFieldError(["role", "email"])).toEqual({
      field: "email",
      message: INVALID_EMAIL_MESSAGE,
    });
    expect(newMemberFieldError(["role"])).toEqual({
      field: "role",
      message: ROLE_REQUIRED_MESSAGE,
    });
    expect(EMAIL_TAKEN_MESSAGE).toBe("Ya existe un usuario con ese email.");
  });

  it("solo acepta avisos conocidos", () => {
    expect(noticeMessage("rol")).toBe("Rol actualizado.");
    expect(noticeMessage(["desactivado"])).toBe("Usuario desactivado.");
    expect(noticeMessage("reactivado")).toBe("Usuario reactivado.");
    expect(noticeMessage("<script>")).toBeNull();
    expect(noticeMessage("toString")).toBeNull();
    expect(noticeMessage(undefined)).toBeNull();
  });
});
