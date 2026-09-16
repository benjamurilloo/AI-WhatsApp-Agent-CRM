import { describe, expect, it } from "vitest";
import {
  CONVERSATIONS_PAGE_SIZE,
  conversationPageBounds,
  decodeMessageCursor,
  encodeMessageCursor,
  validateConversationListFilters,
} from "./service";

const noFilters = {
  from: "",
  to: "",
  status: "all",
  channel: "all",
  clientId: "",
};

describe("validateConversationListFilters (brief-6.3)", () => {
  it("sin filtros no limita nada", () => {
    expect(validateConversationListFilters(noFilters)).toEqual({
      ok: true,
      values: {
        from: null,
        to: null,
        status: null,
        channel: null,
        clientId: null,
      },
    });
  });

  it("acepta cada filtro válido, recortando espacios", () => {
    expect(
      validateConversationListFilters({
        from: " 2026-09-01 ",
        to: "2026-09-16",
        status: "pending",
        channel: "whatsapp",
        clientId: " 5eed0000-0000-4000-8000-000100000001 ",
      }),
    ).toEqual({
      ok: true,
      values: {
        from: "2026-09-01",
        to: "2026-09-16",
        status: "pending",
        channel: "whatsapp",
        clientId: "5eed0000-0000-4000-8000-000100000001",
      },
    });
  });

  it("señala cada campo inválido", () => {
    expect(
      validateConversationListFilters({
        from: "2026-02-30",
        to: "ayer",
        status: "archived",
        channel: "telegram",
        clientId: "no-es-un-id",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["from", "to", "status", "channel", "clientId"],
    });
  });

  it("un período invertido marca las dos fechas; el mismo día es válido", () => {
    expect(
      validateConversationListFilters({
        ...noFilters,
        from: "2026-09-16",
        to: "2026-09-15",
      }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["from", "to"] });
    expect(
      validateConversationListFilters({
        ...noFilters,
        from: "2026-09-16",
        to: "2026-09-16",
      }).ok,
    ).toBe(true);
  });
});

describe("conversationPageBounds", () => {
  it("lleva una página fuera de rango a la última y una inválida a la primera", () => {
    expect(conversationPageBounds(60, 9)).toEqual({
      page: 3,
      pageCount: 3,
      offset: 2 * CONVERSATIONS_PAGE_SIZE,
    });
    expect(conversationPageBounds(60, Number.NaN).page).toBe(1);
    expect(conversationPageBounds(60, -2).page).toBe(1);
    expect(conversationPageBounds(0, 4)).toEqual({
      page: 1,
      pageCount: 1,
      offset: 0,
    });
  });
});

describe("cursor del timeline (D-2)", () => {
  const cursor = {
    sentAt: "2026-09-16T13:05:00.123456Z",
    id: "5eed0000-0000-4000-8000-000300000001",
  };

  it("ida y vuelta conserva los microsegundos y el id", () => {
    const text = encodeMessageCursor(cursor);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeMessageCursor(text)).toEqual(cursor);
  });

  it("rechaza cursores manipulados o con otra forma", () => {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    for (const text of [
      "",
      "no base64!",
      Buffer.from("{").toString("base64url"),
      encode([cursor.sentAt]),
      encode([cursor.sentAt, "no-es-un-id"]),
      encode(["2026-09-16T13:05:00Z", cursor.id]),
      encode(["2026-13-45T13:05:00.000000Z", cursor.id]),
      encode({ sentAt: cursor.sentAt, id: cursor.id }),
      "a".repeat(201),
    ]) {
      expect(decodeMessageCursor(text)).toBeNull();
    }
  });
});
