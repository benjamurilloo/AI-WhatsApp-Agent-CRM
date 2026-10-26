import { describe, expect, it } from "vitest";
import { hasServiceWarranty, serviceOrderWarranty } from "./warranties";

// La garantía de una orden (brief-29.9, D-2 y D-7): solo la de un cliente, reparada y entregada, desde
// delivered_at y con los días de la organización.

const delivered = {
  kind: "customer_device" as const,
  status: "delivered",
  repairedAt: new Date("2026-10-01T12:00:00Z"),
  deliveredAt: new Date("2026-10-01T15:00:00Z"),
};
const now = new Date("2026-10-05T15:00:00Z");
const BA = "America/Argentina/Buenos_Aires";

describe("serviceOrderWarranty", () => {
  it("una orden reparada y entregada tiene garantía desde la entrega", () => {
    expect(serviceOrderWarranty(delivered, 30, BA, now)).toMatchObject({
      status: "in_warranty",
      source: "settings",
      endsOn: "2026-10-31",
    });
  });

  it("una rechazada, una sin entregar o una unidad propia no tienen", () => {
    const cases = [
      { ...delivered, repairedAt: null },
      { ...delivered, status: "repaired", deliveredAt: null },
      { ...delivered, kind: "own_unit" as const },
    ];
    for (const order of cases) {
      expect(hasServiceWarranty(order)).toBe(false);
      expect(serviceOrderWarranty(order, 30, BA, now)).toBeNull();
    }
  });

  it("sin días configurados, la garantía no está configurada", () => {
    expect(serviceOrderWarranty(delivered, null, BA, now)).toEqual({
      status: "not_configured",
    });
  });
});
