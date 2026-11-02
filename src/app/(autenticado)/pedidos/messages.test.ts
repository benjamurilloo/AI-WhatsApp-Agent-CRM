import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@/modules/orders";
import {
  nextStepHint,
  orderNoticeMessage,
  orderOriginLabel,
  orderSummaryText,
  STATUS_LABEL,
  statusStripText,
  transitionRejection,
} from "./messages";

// Los textos de las transiciones del pedido (brief-19.3, D-5 y D-8) y, desde la 19.4, su origen.

const COFFEE = "c0ffee00-0000-4000-8000-000000000001";
const TEA = "c0ffee00-0000-4000-8000-000000000002";
const names = new Map([[COFFEE, "Café 250 g"]]);

describe("transitionRejection", () => {
  it("insufficient_stock nombra cada línea con lo pedido y lo disponible, o su número sin nombre", () => {
    expect(
      transitionRejection(
        "confirm",
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "insufficient_stock",
          lines: [
            {
              position: 1,
              productId: COFFEE,
              requested: "3.000",
              available: "2.500",
            },
            {
              position: 2,
              productId: TEA,
              requested: "1.000",
              available: "0.000",
            },
          ],
        },
        names,
      ),
    ).toEqual({
      message:
        "No hay stock disponible para confirmar el pedido. No se reservó nada.",
      details: [
        "Café 250 g: pide 3, hay 2,5 disponible.",
        "Línea 2: pide 1, hay 0 disponible.",
      ],
    });
  });

  it("inactive_product nombra los productos desactivados", () => {
    expect(
      transitionRejection(
        "confirm",
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "inactive_product",
          lines: [{ position: 1, productId: COFFEE }],
        },
        names,
      ).details,
    ).toEqual(["Café 250 g: desactivado."]);
  });

  it("invalid_transition dice el estado actual; FORBIDDEN, la transición", () => {
    expect(
      transitionRejection(
        "deliver",
        {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "invalid_transition",
          status: "cancelled",
        },
        names,
      ).message,
    ).toContain("ya está cancelado");
    expect(
      transitionRejection("deliver", { ok: false, code: "FORBIDDEN" }, names)
        .message,
    ).toBe("No tenés permiso para entregar pedidos.");
    expect(
      transitionRejection("confirm", { ok: false, code: "NOT_FOUND" }, names)
        .message,
    ).toBe("Este pedido no existe.");
  });
});

describe("orderNoticeMessage", () => {
  it("tiene un aviso por transición y nada para un valor desconocido", () => {
    expect(orderNoticeMessage("confirmado")).toContain("reservado");
    expect(orderNoticeMessage("entregado")).toContain("movimiento");
    expect(orderNoticeMessage("cancelado")).toBe("Pedido cancelado.");
    expect(orderNoticeMessage("otro")).toBeNull();
  });
});

describe("orderOriginLabel (brief-19.4, D-11)", () => {
  it("un pedido de la app es del equipo; uno del agente lleva el emisor si se conoce", () => {
    expect(orderOriginLabel(null)).toBe("Equipo");
    expect(orderOriginLabel(TEA)).toBe("Agente");
    expect(orderOriginLabel(TEA, new Map([[TEA, "agente-demo"]]))).toBe(
      "Agente · agente-demo",
    );
    expect(orderOriginLabel(TEA, new Map([[COFFEE, "otro"]]))).toBe("Agente");
  });
});

// La columna «Resumen» de la lámina 01 (brief-24.6.1, D-2). Lo que estas aserciones fijan no es el
// texto: es que el recuento **no mienta**. El de equipos solo aparece cuando hay unidades, porque
// un pedido por cantidad no tiene equipos; y con más de una línea se dice cuántas más hay en vez
// de callarlas, que es lo que haría un resumen que nombra la primera y se olvida del resto.
describe("orderSummaryText", () => {
  it("una línea con una unidad: el caso que dibuja la lámina", () => {
    expect(
      orderSummaryText({
        firstProductName: "iPhone 13",
        lineCount: 1,
        unitCount: 1,
      }),
    ).toBe("iPhone 13 · 1 equipo");
  });

  it("varias unidades de un mismo producto pluralizan el equipo", () => {
    expect(
      orderSummaryText({
        firstProductName: "iPhone 13",
        lineCount: 1,
        unitCount: 3,
      }),
    ).toBe("iPhone 13 · 3 equipos");
  });

  it("varias líneas dicen cuántas más hay, no solo la primera", () => {
    expect(
      orderSummaryText({
        firstProductName: "iPhone 13",
        lineCount: 3,
        unitCount: 4,
      }),
    ).toBe("iPhone 13 y 2 más · 4 equipos");
  });

  it("sin unidades cuenta líneas, no equipos: un pedido por cantidad no tiene equipos", () => {
    expect(
      orderSummaryText({
        firstProductName: "Café 250 g",
        lineCount: 1,
        unitCount: 0,
      }),
    ).toBe("Café 250 g · 1 línea");
    expect(
      orderSummaryText({
        firstProductName: "Café 250 g",
        lineCount: 2,
        unitCount: 0,
      }),
    ).toBe("Café 250 g y 1 más · 2 líneas");
  });

  it("un producto que no se pudo leer no deja la celda vacía", () => {
    expect(
      orderSummaryText({ firstProductName: null, lineCount: 1, unitCount: 1 }),
    ).toBe("Producto no disponible · 1 equipo");
  });
});

// La franja de estado y el siguiente paso (brief-24.6.1; láminas 03, 05, 06 y 07). Lo que se fija
// acá es que los cuatro estados estén cubiertos y que **entregado y cancelado no ofrezcan un
// siguiente paso**: si lo ofrecieran, la ficha dibujaría un botón para una transición que el
// servicio va a rechazar.
describe("statusStripText y nextStepHint", () => {
  it("cada estado dice su propia consecuencia sobre el stock, con su ícono", () => {
    // Las aserciones de la primera versión eran `not.toBe("")` sobre los tres campos: pasaban
    // con los textos **cruzados entre estados**, y sobre `icon` no podían fallar ni en
    // principio, porque es una unión de literales (revisión independiente, F-6). Ahora cada
    // estado tiene que decir lo suyo.
    const consecuencia: Record<OrderStatus, string> = {
      pending: "no reserva stock",
      confirmed: "está reservado para este pedido",
      delivered: "salida de stock ya está registrada",
      cancelled: "No reserva ni compromete stock",
    };
    const iconos = new Set<string>();
    for (const status of [
      "pending",
      "confirmed",
      "delivered",
      "cancelled",
    ] as const) {
      const strip = statusStripText(status);
      expect([status, strip.title]).toEqual([status, STATUS_LABEL[status]]);
      expect([status, strip.text.includes(consecuencia[status])]).toEqual([
        status,
        true,
      ]);
      iconos.add(strip.icon);
    }
    // Cuatro estados, cuatro íconos: si dos compartieran el suyo, la forma dejaría de
    // distinguirlos y solo quedaría el texto.
    expect(iconos.size).toBe(4);
  });

  it("la franja del pendiente dice que todavía no reserva", () => {
    expect(statusStripText("pending").text).toContain("no reserva stock");
  });

  it("solo pendiente y confirmado tienen siguiente paso", () => {
    expect(nextStepHint("pending")).toContain("reservará");
    expect(nextStepHint("confirmed")).toContain("No se puede deshacer");
    expect(nextStepHint("delivered")).toBeNull();
    expect(nextStepHint("cancelled")).toBeNull();
  });
});
