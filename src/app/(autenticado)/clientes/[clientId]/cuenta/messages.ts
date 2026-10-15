import type { StatementDocument } from "@/modules/cash";

// Textos de la cuenta corriente (brief-21.6, D-4 a D-8).

export const STATEMENT_TITLE = "Estado de cuenta";
export const CLIENT_NOT_FOUND_MESSAGE = "Este cliente no existe.";
export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const UNNAMED_CLIENT_TEXT = "Cliente sin nombre";
// La imputación se deriva en cada lectura: no es historia (H-5).
export const IMPUTATION_NOTE =
  "Según la cuenta de hoy: anular un cobro, una venta o una devolución cambia a qué venta se aplica cada peso.";
export const NO_MOVEMENTS_MESSAGE = "Este cliente no tiene ventas ni cobros.";

export const DOCUMENT_KIND_LABEL: Record<StatementDocument["kind"], string> = {
  sale: "Venta",
  sale_void: "Anulación de venta",
  receipt: "Cobro",
  receipt_void: "Anulación de cobro",
  refund: "Devolución",
  refund_void: "Anulación de devolución",
};

// A dónde lleva cada comprobante de la lista.
export function documentHref(document: StatementDocument): string {
  switch (document.kind) {
    case "sale":
    case "sale_void":
      return `/ventas/${document.id}`;
    case "receipt":
    case "receipt_void":
      return `/cobros/${document.id}`;
    case "refund":
    case "refund_void":
      return `/devoluciones/${document.id}`;
  }
}

// El detalle de un cobro: su destino.
export function destinationText(document: StatementDocument): string | null {
  const destination = document.destination;
  if (destination === null) return null;
  if (destination.target === "account") return "A cuenta";
  if (destination.target === "sale") {
    return `Por la venta ${destination.ref?.displayNumber ?? ""}`.trim();
  }
  return `Seña del pedido ${destination.ref?.displayNumber ?? ""}`.trim();
}

// Lo que pasó a la cuenta de un pedido cancelado o de una venta anulada (D-8; hallazgo del recorrido
// de la 21.5): no se afirma un saldo a favor que puede no existir.
export const TO_ACCOUNT_RULE_TEXT =
  "Se aplica primero a sus ventas con saldo, y lo que sobra queda a favor.";
