import { describe, expect, it } from "vitest";
import {
  orderNoticeMessage,
  orderOriginLabel,
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
