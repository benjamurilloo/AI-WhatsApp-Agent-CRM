import type { IssueSaleResult } from "@/modules/sales";
import { STATUS_LABEL } from "../pedidos/messages";

// Textos de las pantallas de ventas (brief-20.2; Screens.md §16 a §18).

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const SALE_NOT_FOUND_MESSAGE = "Esta venta no existe.";
export const NO_SALES_MESSAGE =
  "Todavía no hay ventas. Una venta se emite desde un pedido entregado.";
export const NO_SALE_RESULTS_MESSAGE =
  "Ninguna venta coincide con estos filtros.";
export const INVALID_PERIOD_MESSAGE =
  "Revisá las fechas: tienen que ser días válidos, y «Desde» no puede ser posterior a «Hasta».";
// La venta no copia el nombre del producto (brief-20.2, H-3): se dice en la pantalla.
export const CURRENT_PRODUCT_NAME_NOTE =
  "Los productos se muestran con su nombre de hoy. Los precios y los totales son los del pedido entregado.";
// ADR 0019, punto 6: la leyenda de todo comprobante interno.
export const NOT_AN_INVOICE_LEGEND = "Documento no válido como factura";
export const UNKNOWN_PRODUCT_TEXT = "Producto no disponible";
export const UNKNOWN_CLIENT_TEXT = "Cliente no disponible";

export const SALE_NOTICE: Record<string, string> = {
  emitida: "Venta emitida.",
};

export function saleNoticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(SALE_NOTICE, key) ? SALE_NOTICE[key]! : null;
}

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos emitir la venta. Código: ${requestId}`;
}

// La emisión desde el detalle del pedido (brief-20.2, D-4).

export type IssueSaleState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      message: string;
      // La venta que ya tiene el pedido, para enlazarla.
      existing: { id: string; displayNumber: string } | null;
    };

export function issueSaleRejection(
  result: Exclude<IssueSaleResult, { ok: true }>,
): { message: string; existing: { id: string; displayNumber: string } | null } {
  switch (result.code) {
    case "FORBIDDEN":
      return {
        message: "Solo un administrador puede emitir una venta.",
        existing: null,
      };
    case "NOT_FOUND":
    case "VALIDATION_ERROR":
      return { message: "Este pedido no existe.", existing: null };
    case "BUSINESS_RULE_VIOLATION":
      if (result.rule === "already_sold") {
        return {
          message: `Este pedido ya tiene su venta, ${result.sale.displayNumber}.`,
          existing: {
            id: result.sale.id,
            displayNumber: result.sale.displayNumber,
          },
        };
      }
      return {
        message: `Solo se emite la venta de un pedido entregado, y este está ${STATUS_LABEL[
          result.status
        ].toLowerCase()}.`,
        existing: null,
      };
  }
}
