import type { SupplierStatementDocument } from "@/modules/cash";

// Textos de la cuenta del proveedor (brief-22.7, D-4, D-5 y D-7).

export const SUPPLIER_STATEMENT_TITLE = "Estado de cuenta";
export const SUPPLIER_ACCOUNT_ADMIN_ONLY_MESSAGE =
  "Solo un administrador puede ver la cuenta de un proveedor.";
export const SUPPLIER_NOT_FOUND_MESSAGE = "Este proveedor no existe.";
// La imputación se deriva en cada lectura: no es historia (H-6).
export const SUPPLIER_IMPUTATION_NOTE =
  "Según la cuenta de hoy: anular un pago o una recepción cambia a qué recepción se aplica cada peso.";
export const NO_SUPPLIER_MOVEMENTS_MESSAGE =
  "Este proveedor no tiene recepciones ni pagos.";
export const NOTHING_OWED_TEXT = "No se le debe nada.";
export const ACCOUNT_UNAVAILABLE_TEXT =
  "No se pudo leer la cuenta de este proveedor.";

export const SUPPLIER_DOCUMENT_KIND_LABEL: Record<
  SupplierStatementDocument["kind"],
  string
> = {
  goods_receipt: "Recepción",
  goods_receipt_void: "Anulación de recepción",
  payment: "Pago",
  payment_void: "Anulación de pago",
};

// A dónde lleva cada comprobante de la lista.
export function supplierDocumentHref(
  document: SupplierStatementDocument,
): string {
  switch (document.kind) {
    case "goods_receipt":
      return `/compras/recepciones/${document.id}`;
    case "goods_receipt_void":
      return `/compras/recepciones/${document.id}/anulacion`;
    case "payment":
      return `/compras/pagos/${document.id}`;
    case "payment_void":
      return `/compras/pagos/${document.id}/anulacion`;
  }
}

// El detalle de un pago: su destino.
export function supplierDestinationText(
  document: SupplierStatementDocument,
): string | null {
  const destination = document.destination;
  if (destination === null) return null;
  if (destination.target === "account") return "A cuenta";
  return `Por la recepción ${destination.ref?.displayNumber ?? ""}`.trim();
}
