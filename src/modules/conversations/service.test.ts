import { describe, expect, it } from "vitest";
import {
  CONVERSATIONS_PAGE_SIZE,
  conversationPageBounds,
  decodeMessageCursor,
  encodeMessageCursor,
  orderClientIds,
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

  it("brief-15.2 D-2: pagina con el tamaño pedido", () => {
    expect(conversationPageBounds(60, 2, 10)).toEqual({
      page: 2,
      pageCount: 6,
      offset: 10,
    });
    expect(conversationPageBounds(60, 9, 50)).toEqual({
      page: 2,
      pageCount: 2,
      offset: 50,
    });
  });
});

describe("orderClientIds (brief-15.2, D-1)", () => {
  // crm entrega los ids en orden de nombre.
  const byName = ["ana", "beto", "carla", "dario"];
  const last = new Map([
    ["beto", new Date("2026-10-01T10:00:00Z")],
    ["dario", new Date("2026-10-03T10:00:00Z")],
    ["carla", new Date("2026-10-01T10:00:00Z")],
  ]);

  it("por última interacción: la más reciente primero, empates y sin fecha en orden de nombre", () => {
    expect(orderClientIds(byName, last, "last_interaction")).toEqual([
      "dario",
      "beto",
      "carla",
      "ana",
    ]);
  });

  it("por nombre, el orden de crm; por nombre inverso, al revés", () => {
    expect(orderClientIds(byName, last, "name_asc")).toEqual(byName);
    expect(orderClientIds(byName, last, "name_desc")).toEqual([
      "dario",
      "carla",
      "beto",
      "ana",
    ]);
  });

  it("no modifica la lista que recibe", () => {
    const ids = [...byName];
    orderClientIds(ids, last, "name_desc");
    orderClientIds(ids, last, "last_interaction");
    expect(ids).toEqual(byName);
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
