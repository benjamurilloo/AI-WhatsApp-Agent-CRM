import { describe, expect, it } from "vitest";
import {
  CLIENT_NOT_FOUND_MESSAGE,
  clientChangeMessage,
  clientFieldError,
  FORBIDDEN_ACTION_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  noticeMessage,
  NOTES_TOO_LONG_MESSAGE,
  PHONE_FORMAT_MESSAGE,
  PHONE_TAKEN_MESSAGE,
} from "./messages";

describe("clientFieldError", () => {
  it("elige el primer campo inválido en el orden del formulario", () => {
    expect(clientFieldError(["notes", "displayName"])).toEqual({
      field: "displayName",
      message: NAME_REQUIRED_MESSAGE,
    });
    expect(clientFieldError(["notes", "phone"])).toEqual({
      field: "phone",
      message: PHONE_FORMAT_MESSAGE,
    });
    expect(clientFieldError(["notes"])).toEqual({
      field: "notes",
      message: NOTES_TOO_LONG_MESSAGE,
    });
  });

  it("el mensaje del teléfono pide + y código de país (brief-5.2, D-1)", () => {
    expect(PHONE_FORMAT_MESSAGE).toContain("+");
    expect(PHONE_FORMAT_MESSAGE).toContain("código de país");
  });
});

describe("clientChangeMessage", () => {
  it("traduce cada código", () => {
    expect(clientChangeMessage("FORBIDDEN", "r")).toBe(
      FORBIDDEN_ACTION_MESSAGE,
    );
    expect(clientChangeMessage("NOT_FOUND", "r")).toBe(
      CLIENT_NOT_FOUND_MESSAGE,
    );
    expect(clientChangeMessage("VALIDATION_ERROR", "r")).toBe(
      CLIENT_NOT_FOUND_MESSAGE,
    );
    expect(clientChangeMessage("CONFLICT", "r")).toBe(PHONE_TAKEN_MESSAGE);
    expect(clientChangeMessage("INTERNAL", "abc")).toContain("abc");
  });

  it("el duplicado menciona a los clientes desactivados (brief-5.3, D-2)", () => {
    expect(PHONE_TAKEN_MESSAGE).toContain("desactivado");
    expect(PHONE_TAKEN_MESSAGE).toContain("reactivalo");
  });
});

describe("noticeMessage", () => {
  it("solo acepta avisos conocidos", () => {
    expect(noticeMessage("creado")).toBe("Cliente creado.");
    expect(noticeMessage(["reactivado", "x"])).toBe("Cliente reactivado.");
    expect(noticeMessage("toString")).toBeNull();
    expect(noticeMessage("<script>")).toBeNull();
    expect(noticeMessage(undefined)).toBeNull();
  });
});
