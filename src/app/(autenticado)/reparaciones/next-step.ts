import type { ServiceOrderKind, ServiceOrderStatus } from "@/modules/service";

// El próximo paso de una orden (brief-24.9.1, V-3): qué le falta para avanzar. Es **derivación pura**
// del tipo, del estado y de si tiene presupuesto guardado, sin ninguna lectura nueva, y sale de las
// mismas transiciones que la ficha permite: SERVICE_ORDER_TRANSITIONS, OWN_UNIT_TRANSITIONS y
// WARRANTY_CLAIM_TRANSITIONS, en `src/modules/service/quote.ts`.
//
// **No ejecuta la transición** (AC-2): devuelve un texto, y la fila entera lleva a la ficha, que es
// donde cada paso se hace de verdad y donde está el enlace a la venta.
//
// `null` es un estado sin paso siguiente —cancelada, o terminada—, y la tabla lo dibuja como «—».
// Una unidad propia reparada ya terminó (brief-29.6.2, D-3) y un reclamo entregado también
// (brief-29.9.2, D-1): ninguno de los dos espera nada.

export type NextStepOrder = {
  kind: ServiceOrderKind;
  status: ServiceOrderStatus;
  // La venta de la entrega. «Ver venta» se ofrece solo cuando existe: una orden rechazada se
  // entrega sin cobrar nada y no deja venta que mirar.
  saleId: string | null;
};

const CUSTOMER_DEVICE: Record<ServiceOrderStatus, string | null> = {
  received: "Enviar al técnico",
  sent: "Presupuestar",
  quoted: "Aprobar o rechazar",
  approved: "Registrar reparación",
  // Una rechazada se devuelve igual: el equipo es del cliente y vuelve sin reparar.
  rejected: "Entregar",
  repaired: "Entregar",
  // Una entregada no espera nada; si la entrega dejó una venta, el texto lleva a mirarla.
  delivered: null,
  cancelled: null,
};

const OWN_UNIT: Record<ServiceOrderStatus, string | null> = {
  received: null,
  sent: "Registrar reparación",
  quoted: null,
  approved: null,
  rejected: null,
  repaired: null,
  delivered: null,
  cancelled: null,
};

const WARRANTY_CLAIM: Record<ServiceOrderStatus, string | null> = {
  received: "Enviar al técnico",
  // Un reclamo no se presupuesta ni se aprueba: del técnico sale reparado (brief-29.9.2, D-2).
  sent: "Registrar reparación",
  quoted: null,
  approved: null,
  rejected: null,
  repaired: "Entregar",
  delivered: null,
  cancelled: null,
};

const STEPS: Record<
  ServiceOrderKind,
  Record<ServiceOrderStatus, string | null>
> = {
  customer_device: CUSTOMER_DEVICE,
  own_unit: OWN_UNIT,
  warranty_claim: WARRANTY_CLAIM,
};

export function nextServiceOrderStep(order: NextStepOrder): string | null {
  if (
    order.kind === "customer_device" &&
    order.status === "delivered" &&
    order.saleId !== null
  ) {
    return "Ver venta";
  }
  return STEPS[order.kind][order.status];
}
