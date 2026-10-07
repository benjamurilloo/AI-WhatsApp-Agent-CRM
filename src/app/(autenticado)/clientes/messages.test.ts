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
  SUGGESTED_TAGS_TAKEN_MESSAGE,
  TAG_CLIENT_LIMIT_MESSAGE,
  TAG_NAME_MESSAGE,
  TAG_NOT_FOUND_MESSAGE,
  TAG_ORGANIZATION_LIMIT_MESSAGE,
  tagChangeMessage,
  tagFieldError,
  tagNoticeMessage,
} from "./messages";
import { MAX_ACTIVE_TAGS, MAX_TAGS_PER_CLIENT } from "@/modules/crm";

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

  it("brief-16.1: avisa al poner y al quitar una etiqueta", () => {
    expect(noticeMessage("etiqueta-agregada")).toBe("Etiqueta agregada.");
    expect(noticeMessage("etiqueta-quitada")).toBe("Etiqueta quitada.");
  });
});

describe("etiquetas (brief-16.1)", () => {
  it("D-11: los mensajes de los límites dicen los mismos números que crm", () => {
    expect(TAG_ORGANIZATION_LIMIT_MESSAGE).toContain(`${MAX_ACTIVE_TAGS} `);
    expect(TAG_CLIENT_LIMIT_MESSAGE).toContain(`${MAX_TAGS_PER_CLIENT} `);
  });

  it("tagChangeMessage: el límite manda sobre el código", () => {
    expect(
      tagChangeMessage({ code: "VALIDATION_ERROR", limit: "client" }, "r"),
    ).toBe(TAG_CLIENT_LIMIT_MESSAGE);
    expect(
      tagChangeMessage(
        { code: "VALIDATION_ERROR", limit: "organization" },
        "r",
      ),
    ).toBe(TAG_ORGANIZATION_LIMIT_MESSAGE);
    expect(tagChangeMessage({ code: "NOT_FOUND" }, "r")).toBe(
      TAG_NOT_FOUND_MESSAGE,
    );
    expect(tagChangeMessage({ code: "FORBIDDEN" }, "r")).toBe(
      FORBIDDEN_ACTION_MESSAGE,
    );
    expect(tagChangeMessage({ code: "CONFLICT" }, "r")).toBe(
      SUGGESTED_TAGS_TAKEN_MESSAGE,
    );
    expect(tagChangeMessage({ code: "INTERNAL" }, "abc")).toContain("abc");
  });

  it("tagFieldError: el nombre primero", () => {
    expect(tagFieldError(["color", "name"])).toEqual({
      field: "name",
      message: TAG_NAME_MESSAGE,
    });
    expect(tagFieldError(["color"]).field).toBe("color");
  });

  it("tagNoticeMessage solo acepta avisos conocidos", () => {
    expect(tagNoticeMessage("sugeridas")).toBe("Etiquetas sugeridas creadas.");
    expect(tagNoticeMessage("desactivada")).toContain("la conservan");
    expect(tagNoticeMessage("toString")).toBeNull();
    expect(tagNoticeMessage(undefined)).toBeNull();
  });
});
