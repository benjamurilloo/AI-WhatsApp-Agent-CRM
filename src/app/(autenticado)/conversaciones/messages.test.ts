import { describe, expect, it } from "vitest";
import {
  CONVERSATION_NOT_FOUND_MESSAGE,
  FORBIDDEN_ACTION_MESSAGE,
  FORMER_MEMBER_TEXT,
  periodHasError,
  startsDay,
  statusChangedMessage,
  statusChangeErrorMessage,
  statusUnchangedMessage,
  type TimelineItem,
} from "./messages";
import { toTimelineItems } from "./[conversationId]/timeline-items";

const BUENOS_AIRES = "America/Argentina/Buenos_Aires";

describe("textos de las pantallas 8 y 9 (brief-6.4)", () => {
  it("nombra el estado nuevo o el que ya tenía", () => {
    expect(statusChangedMessage("closed")).toBe("Estado cambiado a Cerrada.");
    expect(statusUnchangedMessage("open")).toBe(
      "La conversación ya estaba Abierta.",
    );
  });

  it("traduce cada rechazo del cambio de estado sin detalles internos", () => {
    expect(statusChangeErrorMessage("FORBIDDEN", "r-1")).toBe(
      FORBIDDEN_ACTION_MESSAGE,
    );
    expect(statusChangeErrorMessage("NOT_FOUND", "r-1")).toBe(
      CONVERSATION_NOT_FOUND_MESSAGE,
    );
    expect(statusChangeErrorMessage("VALIDATION_ERROR", "r-1")).toBe(
      "Elegí un estado válido.",
    );
    expect(statusChangeErrorMessage("INTERNAL", "r-1")).toContain("r-1");
  });

  it("señala el período solo si falla una de sus fechas", () => {
    expect(periodHasError(["from"])).toBe(true);
    expect(periodHasError(["to", "status"])).toBe(true);
    expect(periodHasError(["clientId"])).toBe(false);
  });
});

describe("timeline (pantalla 9)", () => {
  it("formatea en la zona de la organización y nombra la dirección con texto", () => {
    const items = toTimelineItems(
      [
        {
          type: "message",
          id: "a",
          direction: "inbound",
          // 23:30 del 9 en Buenos Aires.
          sentAt: new Date("2026-09-10T02:30:00Z"),
          body: "<b>Hola</b>",
          kind: null,
          sentBy: null,
        },
        {
          type: "message",
          id: "b",
          direction: "outbound",
          sentAt: new Date("2026-09-10T03:10:00Z"),
          body: null,
          kind: null,
          sentBy: null,
        },
      ],
      BUENOS_AIRES,
    );
    expect(items).toEqual([
      {
        type: "message",
        id: "a",
        direction: "inbound",
        directionLabel: "Cliente",
        kindLabel: null,
        senderLabel: null,
        day: "09/09/2026",
        time: "23:30",
        body: "<b>Hola</b>",
      },
      {
        type: "message",
        id: "b",
        direction: "outbound",
        directionLabel: "Negocio",
        kindLabel: null,
        senderLabel: null,
        day: "10/09/2026",
        time: "00:10",
        body: null,
      },
    ]);
  });

  it("FR-API-07: rotula el tipo original y el autor de una salida, y nada si no hay dato", () => {
    const at = new Date("2026-09-10T15:00:00Z");
    const items = toTimelineItems(
      [
        {
          type: "message",
          id: "a",
          direction: "inbound",
          sentAt: at,
          body: "hola",
          kind: "audio",
          sentBy: null,
        },
        {
          type: "message",
          id: "b",
          direction: "outbound",
          sentAt: at,
          body: "ok",
          kind: "text",
          sentBy: "agent",
        },
        {
          type: "message",
          id: "c",
          direction: "outbound",
          sentAt: at,
          body: "ya",
          kind: "image",
          sentBy: "person",
        },
        {
          type: "message",
          id: "d",
          direction: "outbound",
          sentAt: at,
          body: "v1",
          kind: null,
          sentBy: null,
        },
      ],
      BUENOS_AIRES,
    );
    expect(
      items.map((item) =>
        item.type === "message" ? [item.kindLabel, item.senderLabel] : [],
      ),
    ).toEqual([
      ["Audio (transcripción)", null],
      [null, "Agente"],
      ["Imagen", "Persona"],
      [null, null],
    ]);
  });

  it("brief-24.3: una nota lleva su autor, y la de alguien que ya no es miembro lo dice (D-5)", () => {
    const items = toTimelineItems(
      [
        {
          type: "note",
          id: "n1",
          author: { id: "u1", name: "Ana" },
          createdAt: new Date("2026-09-10T15:05:00Z"),
          body: "llamar",
        },
        {
          type: "note",
          id: "n2",
          author: { id: "u2", name: "" },
          createdAt: new Date("2026-09-10T15:06:00Z"),
          body: null,
        },
      ],
      BUENOS_AIRES,
    );
    expect(items).toEqual([
      {
        type: "note",
        id: "n1",
        author: "Ana",
        day: "10/09/2026",
        time: "12:05",
        body: "llamar",
      },
      {
        type: "note",
        id: "n2",
        author: FORMER_MEMBER_TEXT,
        day: "10/09/2026",
        time: "12:06",
        body: null,
      },
    ]);
  });

  it("pone un separador en el primer mensaje de cada día, también al unir páginas", () => {
    const item = (id: string, day: string): TimelineItem => ({
      type: "message",
      id,
      direction: "inbound",
      directionLabel: "Cliente",
      kindLabel: null,
      senderLabel: null,
      day,
      time: "10:00",
      body: "x",
    });
    const older = [item("1", "08/09/2026"), item("2", "09/09/2026")];
    const newer = [item("3", "09/09/2026"), item("4", "10/09/2026")];
    const joined = [...older, ...newer];
    expect(joined.map((_, index) => startsDay(joined, index))).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });
});
