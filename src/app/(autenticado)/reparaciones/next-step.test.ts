import { describe, expect, it } from "vitest";
import type { ServiceOrderKind, ServiceOrderStatus } from "@/modules/service";
import { nextServiceOrderStep } from "./next-step";

// Las 24 combinaciones de tipo y estado, escritas a mano. La tabla está entera a propósito: si
// alguien agrega un estado o cambia una transición, este archivo tiene que cambiar con ella, y el
// que falte se ve como un caso que nadie escribió en vez de como un hueco silencioso.
const STATUSES: ServiceOrderStatus[] = [
  "received",
  "sent",
  "quoted",
  "approved",
  "rejected",
  "repaired",
  "delivered",
  "cancelled",
];

const ESPERADO: Record<
  ServiceOrderKind,
  Record<ServiceOrderStatus, string | null>
> = {
  customer_device: {
    received: "Enviar al técnico",
    sent: "Presupuestar",
    quoted: "Aprobar o rechazar",
    approved: "Registrar reparación",
    rejected: "Entregar",
    repaired: "Entregar",
    delivered: null,
    cancelled: null,
  },
  own_unit: {
    received: null,
    sent: "Registrar reparación",
    quoted: null,
    approved: null,
    rejected: null,
    repaired: null,
    delivered: null,
    cancelled: null,
  },
  warranty_claim: {
    received: "Enviar al técnico",
    sent: "Registrar reparación",
    quoted: null,
    approved: null,
    rejected: null,
    repaired: "Entregar",
    delivered: null,
    cancelled: null,
  },
};

describe("nextServiceOrderStep", () => {
  for (const kind of Object.keys(ESPERADO) as ServiceOrderKind[]) {
    for (const status of STATUSES) {
      it(`${kind} en ${status}`, () => {
        expect(nextServiceOrderStep({ kind, status, saleId: null })).toBe(
          ESPERADO[kind][status],
        );
      });
    }
  }

  // Los cinco pasos que dibuja la lámina 01 (AC-2), con los datos de la lámina.
  it("dibuja los cinco pasos de la lámina", () => {
    const paso = (
      kind: ServiceOrderKind,
      status: ServiceOrderStatus,
      saleId: string | null = null,
    ) => nextServiceOrderStep({ kind, status, saleId });
    expect(paso("customer_device", "repaired")).toBe("Entregar");
    expect(paso("customer_device", "sent")).toBe("Presupuestar");
    expect(paso("customer_device", "received")).toBe("Enviar al técnico");
    expect(paso("own_unit", "sent")).toBe("Registrar reparación");
    expect(paso("warranty_claim", "sent")).toBe("Registrar reparación");
    expect(paso("customer_device", "delivered", "una-venta")).toBe("Ver venta");
  });

  // «Ver venta» depende de que la venta exista, no de que la orden esté entregada: una orden
  // rechazada se entrega sin cobrar nada y no deja venta que mirar.
  it("no ofrece la venta cuando la entrega no dejó ninguna", () => {
    expect(
      nextServiceOrderStep({
        kind: "customer_device",
        status: "delivered",
        saleId: null,
      }),
    ).toBeNull();
  });

  // Un reclamo no se le cobra al cliente (brief-29.9.2, D-2): aunque trajera una venta pegada,
  // su próximo paso no es mirarla.
  it("no ofrece la venta de un reclamo entregado", () => {
    expect(
      nextServiceOrderStep({
        kind: "warranty_claim",
        status: "delivered",
        saleId: "una-venta",
      }),
    ).toBeNull();
  });
});
