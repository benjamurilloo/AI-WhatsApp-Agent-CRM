import type {
  IssueSaleResult,
  IssueSaleWithoutOrderResult,
  SaleLineField,
  SaleLineRuleIssue,
  SaleVoidReason,
  VoidSaleResult,
} from "@/modules/sales";
import { formatQuantity } from "@/shared/quantity";
import {
  STATUS_LABEL,
  type OrderFormLine,
  type OrderFormValues,
} from "../pedidos/messages";

// Textos de las pantallas de ventas (brief-20.2; Screens.md §16 a §18; desde la 20.3, la venta sin
// pedido y la pantalla 19; desde la 20.4, la anulación y la pantalla 20).

export const FORBIDDEN_PAGE_MESSAGE = "No tenés permiso para ver esta página.";
export const SALE_NOT_FOUND_MESSAGE = "Esta venta no existe.";
export const NO_SALES_MESSAGE =
  "Todavía no hay ventas. Una venta se emite desde un pedido entregado o con «Nueva venta».";
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
// Una venta sin cliente (brief-20.3, D-7).
export const CONSUMER_TEXT = "Consumidor final";
// Una venta sin pedido, en la columna del pedido de la lista.
export const NO_ORDER_TEXT = "Sin pedido";
export const COUNTER_SALE_PRICES_NOTE =
  "Los productos se muestran con su nombre de hoy. Los precios y los totales son los vigentes al emitir la venta.";

export const SALE_NOTICE: Record<string, string> = {
  emitida: "Venta emitida.",
  anulada: "Venta anulada.",
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

// La venta sin pedido (brief-20.3, D-6 y D-9). El formulario es el del alta del pedido: sus
// valores tienen la misma forma.

export type SaleFormLine = OrderFormLine;
export type SaleFormValues = OrderFormValues;

export type SaleFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: SaleFormValues;
      message: string;
      // Errores por línea, por su posición entre las líneas enviadas (desde 1).
      lineErrors: Record<number, string>;
      clientError: string | null;
    };

type SaleRejection = Pick<
  Extract<SaleFormState, { status: "error" }>,
  "message" | "lineErrors" | "clientError"
>;

const SALE_LINE_FIELD_MESSAGE: Record<SaleLineField, string> = {
  product: "Elegí un producto de la lista.",
  quantity: "Escribí una cantidad mayor que cero, con hasta tres decimales.",
  expectedPrice: "Volvé a elegir el producto.",
};

function saleLineRuleMessage(
  rule: SaleLineRuleIssue["rule"],
  currency: string,
): string {
  return {
    inactive_product: "El producto está desactivado.",
    no_price: "El producto no tiene precio: fijalo antes de venderlo.",
    currency_mismatch: `El precio está en otra moneda que la primera línea (${currency}).`,
    duplicate_product:
      "El producto ya está en otra línea: sumá la cantidad ahí.",
    zero_total: "El total de la línea da cero: subí la cantidad.",
    amount_too_large: "El total de la línea es demasiado grande.",
  }[rule];
}

export function saleRejection(
  result: Exclude<IssueSaleWithoutOrderResult, { ok: true }>,
  firstCurrency: string,
): SaleRejection {
  const none = { lineErrors: {}, clientError: null };
  const byLine = (entries: [number, string][]): SaleRejection => ({
    message: "Revisá las líneas marcadas.",
    lineErrors: Object.fromEntries(entries),
    clientError: null,
  });
  switch (result.code) {
    case "FORBIDDEN":
      return {
        ...none,
        message: "Solo un administrador puede emitir una venta.",
      };
    case "VALIDATION_ERROR":
      if (result.reason === "client") {
        return {
          message: "Revisá el cliente.",
          lineErrors: {},
          clientError:
            "Elegí un cliente de la lista, o dejalo vacío para «Consumidor final».",
        };
      }
      if (result.reason === "no_lines") {
        return {
          ...none,
          message: "Agregá al menos una línea con producto y cantidad.",
        };
      }
      if (result.reason === "too_many_lines") {
        return { ...none, message: "Una venta tiene como máximo 50 líneas." };
      }
      return byLine(
        result.lines.map((line) => [
          line.position,
          SALE_LINE_FIELD_MESSAGE[line.field],
        ]),
      );
    case "NOT_FOUND":
      if (result.target === "client") {
        return {
          message: "Revisá el cliente.",
          lineErrors: {},
          clientError: "El cliente ya no existe.",
        };
      }
      return byLine(
        result.lines.map((line) => [
          line.position,
          "El producto ya no existe.",
        ]),
      );
    case "BUSINESS_RULE_VIOLATION":
      if (result.rule === "inactive_client") {
        return {
          message: "Revisá el cliente.",
          lineErrors: {},
          clientError:
            "El cliente está desactivado: reactivalo, o dejá el cliente vacío para «Consumidor final».",
        };
      }
      if (result.rule === "total_too_large") {
        return {
          ...none,
          message: "El total de la venta es demasiado grande.",
        };
      }
      if (result.rule === "insufficient_stock") {
        return {
          message:
            "No alcanza el stock disponible de las líneas marcadas. No se emitió nada.",
          lineErrors: Object.fromEntries(
            result.lines.map((line) => [
              line.position,
              `Disponible: ${formatQuantity(line.available)}. Pediste ${formatQuantity(line.requested)}.`,
            ]),
          ),
          clientError: null,
        };
      }
      return byLine(
        result.lines.map((line) => [
          line.position,
          saleLineRuleMessage(line.rule, firstCurrency),
        ]),
      );
    case "CONFLICT":
      return {
        message:
          result.prices.length === 1
            ? "Cambió el precio de un producto desde que lo elegiste. Revisá el precio nuevo y volvé a emitir la venta."
            : "Cambiaron los precios de algunos productos desde que los elegiste. Revisá los precios nuevos y volvé a emitir la venta.",
        lineErrors: Object.fromEntries(
          result.prices.map((line) => [line.position, "El precio cambió."]),
        ),
        clientError: null,
      };
  }
}

// La anulación (brief-20.4, D-2, D-6 y D-7).

export const VOIDED_BADGE_TEXT = "Anulada";

export const VOID_REASON_LABEL: Record<SaleVoidReason, string> = {
  data_entry_error: "Error de carga",
  not_completed: "Operación no concretada",
  wrong_client: "Cliente equivocado",
  other: "Otro",
};

// Lo que pasa con el stock, dicho antes de confirmar (D-7).
export const VOID_RESTOCK_NOTE =
  "Se repone el stock de cada línea, con un movimiento «Anulación de venta».";
export const VOID_ORDER_NOTE =
  "El stock no cambia: el pedido sigue entregado y se puede emitir otra venta.";

export type VoidSaleState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      message: string;
      // La anulación que ya tiene la venta, para enlazarla.
      existing: { displayNumber: string } | null;
    };

export function voidUnexpectedErrorMessage(requestId: string): string {
  return `No pudimos anular la venta. Código: ${requestId}`;
}

export function voidSaleRejection(
  result: Exclude<VoidSaleResult, { ok: true }>,
): { message: string; existing: { displayNumber: string } | null } {
  switch (result.code) {
    case "FORBIDDEN":
      return {
        message: "Solo un administrador puede anular una venta.",
        existing: null,
      };
    case "NOT_FOUND":
      return { message: "Esta venta no existe.", existing: null };
    case "VALIDATION_ERROR":
      return { message: "Elegí el motivo de la anulación.", existing: null };
    case "BUSINESS_RULE_VIOLATION":
      if (result.rule === "already_voided") {
        return {
          message: `Esta venta ya está anulada, por ${result.saleVoid.displayNumber}.`,
          existing: { displayNumber: result.saleVoid.displayNumber },
        };
      }
      return {
        message:
          "No se puede reponer el stock: el saldo de algún producto superaría el máximo. No se anuló nada.",
        existing: null,
      };
  }
}
