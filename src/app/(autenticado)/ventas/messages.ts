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
  unitIssuesByLine,
  type OrderFormLine,
  type OrderFormValues,
} from "../pedidos/messages";

// Textos de las pantallas de ventas (brief-20.2; Screens.md §16 a §18; desde la 20.3, la venta sin
// pedido y la pantalla 19; desde la 20.4, la anulación y la pantalla 20).
// Desde la 24.6.2-b, los del listado con la forma de la lámina 01 y los de la ficha en pestañas.

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
export const COUNTER_SALE_PRICES_NOTE =
  "Los productos se muestran con su nombre de hoy. Los precios y los totales son los vigentes al emitir la venta.";

// El resumen del alta de mostrador (brief-24.6.2, D-3; lámina 02 de V2-09). Los tres avisos son
// los de la lámina y dicen lo que el ADR 0021 ya decide: la emisión saca el stock, el cobro es una
// operación aparte (ADR 0022) y una venta emitida no se edita, se anula.
export const BEFORE_ISSUE_TITLE = "Antes de emitir";
export const BEFORE_ISSUE_NOTES = [
  "Al emitir, el equipo pasa a vendido y sale del stock.",
  "El cobro se registra después.",
  "La venta emitida no se edita.",
] as const;
export const BEFORE_ISSUE_CHECK_NOTE =
  "Se comprueban disponibilidad y precios antes de emitir.";
export const LEAVE_SALE_LABEL = "Volver sin guardar";
// La aclaración que la lámina 02 de Ventas pone debajo de «Cantidad». Vive acá y no en
// `line-units.tsx`, que es el componente compartido, porque la lámina 02 de Pedidos no la dibuja y
// tocar el compartido cambiaría `/pedidos/nuevo`, que esta subfase no toca (brief-24.6.2, AC-10).
export const QUANTITY_FROM_UNITS_NOTE = "Derivada de la unidad seleccionada.";
// El recuento del resumen: equipos elegidos si hay alguno, y si no, las líneas con producto.
export function beforeIssueCountText(units: number, lines: number): string {
  if (units > 0) return units === 1 ? "1 equipo" : `${units} equipos`;
  if (lines === 0) return "Sin líneas cargadas";
  return lines === 1 ? "1 línea" : `${lines} líneas`;
}

// El bloque «Comprobantes a emitir» del resumen, cuando las líneas están en más de una moneda
// (brief-24.6.2-c, D-7). Con una sola moneda el bloque no aparece y el resumen queda como estaba.
// La etiqueta lleva el código de la moneda porque el monto de al lado ya trae su símbolo, y los
// montos **no se suman entre monedas** (ADR 0019; README del lote V2-09).
export const ISSUE_DOCUMENTS_TITLE = "Comprobantes a emitir";

export function issueDocumentLabel(currency: string, lines: number): string {
  return `${currency} · ${lines === 1 ? "1 línea" : `${lines} líneas`}`;
}

export function issueDocumentsNote(documents: number): string {
  return `Se emiten ${documents} comprobantes, uno por moneda, cada uno con su número y su cobro.`;
}

export const SALE_NOTICE: Record<string, string> = {
  emitida: "Venta emitida.",
  anulada: "Venta anulada.",
};

// El aviso del **listado** cuando una emisión de mostrador produjo más de un comprobante
// (brief-24.6.2-c, D-5): con dos monedas ya no hay «la» venta a la que llevar, así que el destino es
// la lista, que los muestra arriba. Los números llegan por la URL, así que se comprueba su forma
// antes de escribirlos en la página: cualquier otra cosa cae en el aviso genérico y no se imprime
// tal cual.
const SALE_NUMBER_IN_NOTICE = /^V-\d{6}$/;
const MAX_ISSUED_IN_NOTICE = 10;
const ISSUED_GENERIC_NOTICE = "Se emitieron los comprobantes.";

export function issuedSalesNotice(
  aviso: string | string[] | undefined,
  numbers: string | string[] | undefined,
): string | null {
  const key = Array.isArray(aviso) ? aviso[0] : aviso;
  if (key !== "emitidas") return null;
  const raw = Array.isArray(numbers) ? numbers[0] : numbers;
  const named = (raw ?? "").split(",").map((value) => value.trim());
  // **Cualquier** token que no tenga la forma de un número de venta manda al aviso genérico, y no
  // solo se descarta: descartarlo dejaría un recuento que no es el de lo que vino en la URL.
  // *Corregido el 2026-11-03*, por la revisión independiente (hallazgo 4), que encontró que la
  // primera versión filtraba.
  if (
    named.length < 2 ||
    named.length > MAX_ISSUED_IN_NOTICE ||
    named.some((value) => !SALE_NUMBER_IN_NOTICE.test(value))
  ) {
    return ISSUED_GENERIC_NOTICE;
  }
  const last = named[named.length - 1]!;
  const rest = named.slice(0, -1).join(", ");
  return `Se emitieron ${named.length} comprobantes, uno por moneda: ${rest} y ${last}.`;
}

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
  serials:
    "Revisá los IMEI: uno por renglón, sin repetir, con letras, dígitos o guiones.",
};

// Con el IMEI que la línea repite o escribió mal, lo nombra (brief-29.5.2, AC-1).
function saleLineFieldMessage(field: SaleLineField, serial?: string): string {
  if (field === "serials" && serial !== undefined) {
    return `Revisá el IMEI ${serial}: está repetido en la línea o tiene caracteres que no van (solo letras, dígitos y guiones).`;
  }
  return SALE_LINE_FIELD_MESSAGE[field];
}

// La moneda que nombra el mensaje es la de **su** línea, no la de la primera del formulario: desde
// la 24.6.2-c cada moneda tiene su comprobante, así que «la primera línea» no describe nada (D-3).
function saleLineRuleMessage(
  rule: SaleLineRuleIssue["rule"],
  currency: string,
  serial?: string,
): string {
  if (rule === "duplicate_unit" && serial !== undefined) {
    return `El IMEI ${serial} ya está en otra línea.`;
  }
  if (rule === "unit_currency_mismatch" && serial !== undefined) {
    return `La unidad con IMEI ${serial} tiene su precio en otra moneda que su línea (${currency}): corregí su precio.`;
  }
  return {
    inactive_product: "El producto está desactivado.",
    service_product:
      "Una reparación no se vende acá: se cobra al entregar su orden de servicio.",
    units_required:
      "Este producto se vende por unidad: escribí el IMEI de cada unidad, uno por renglón.",
    not_unit_tracked:
      "Este producto no se vende por unidad: borrá los IMEI y escribí la cantidad.",
    no_price: "El producto no tiene precio: fijalo antes de venderlo.",
    // `currency_mismatch` es **inalcanzable en esta pantalla** desde la 24.6.2-c: una línea en otra
    // moneda ya no choca con la primera, se va a su propio comprobante (D-3). El texto queda porque
    // el tipo del rechazo es compartido con el alta de un pedido, que sí la rechaza. **Si alguna vez
    // volviera a ser alcanzable acá, este texto habría que reescribirlo**: dice «la primera línea» y
    // `currency` es la moneda de su propia línea (revisión independiente, hallazgo 9).
    currency_mismatch: `El precio está en otra moneda que la primera línea (${currency}).`,
    unit_currency_mismatch: `Una unidad tiene su precio en otra moneda que su línea (${currency}): corregí su precio.`,
    duplicate_product:
      "El producto ya está en otra línea: sumá la cantidad ahí.",
    duplicate_unit: "Un IMEI de esta línea ya está en otra línea.",
    zero_total: "El total de la línea da cero: subí la cantidad.",
    amount_too_large: "El total de la línea es demasiado grande.",
  }[rule];
}

export function saleRejection(
  result: Exclude<IssueSaleWithoutOrderResult, { ok: true }>,
  // La moneda de la línea de una posición dada. Era `firstCurrency`, una sola para todas
  // (brief-24.6.2-c, D-3).
  currencyAt: (position: number) => string,
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
          saleLineFieldMessage(line.field, line.serial),
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
      if (result.rule === "units") {
        return {
          message: "Revisá los IMEI marcados. No se emitió nada.",
          lineErrors: unitIssuesByLine(result.units),
          clientError: null,
        };
      }
      return byLine(
        result.lines.map((line) => [
          line.position,
          saleLineRuleMessage(
            line.rule,
            currencyAt(line.position),
            line.serial,
          ),
        ]),
      );
    case "CONFLICT":
      return {
        message:
          result.prices.length === 1
            ? "Cambió el precio de un producto desde que lo elegiste. Revisá el precio nuevo y volvé a emitir la venta."
            : "Cambiaron los precios de algunos productos desde que los elegiste. Revisá los precios nuevos y volvé a emitir la venta.",
        lineErrors: Object.fromEntries(
          result.prices.map((line) => [
            line.position,
            line.lineTotal === null
              ? "El precio cambió."
              : "Cambió el precio de una unidad: revisá el total de la línea.",
          ]),
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
      // Desde la 29.7 (brief-29.7, U-2): el equipo vendido volvió al local como usado.
      if (result.rule === "unit_serial_back") {
        const serials = result.serials.join(", ");
        return {
          message: `No se puede anular: ${result.serials.length === 1 ? "el IMEI" : "los IMEI"} ${serials} ${result.serials.length === 1 ? "volvió" : "volvieron"} al local en otra unidad, como un usado recibido. La unidad vendida no puede volver con el mismo IMEI. No se anuló nada.`,
          existing: null,
        };
      }
      return {
        message:
          "No se puede reponer el stock: el saldo de algún producto superaría el máximo. No se anuló nada.",
        existing: null,
      };
  }
}

// ─── El listado con la forma de la lámina 01 de V2-09 (brief-24.6.2-b).

export const SALES_SUBTITLE = "Comprobantes y cobros";
// V-3 del brief: la lámina pide decirlo en la pantalla, no solo en el brief.
export const SALES_PERIOD_NOTE = "El período filtra la fecha de emisión.";
// La nota al pie de la lámina 01. Lo primero es la regla del ADR 0019 —un comprobante tiene una
// sola moneda, así que no hay un total único— y lo segundo, la del ADR 0022.
export const SALES_FOOTER_NOTE =
  "Importes por moneda. Emitir una venta y registrar su cobro son pasos separados.";
export const SALES_STATUS_NAV_LABEL = "Vigencia de las ventas";
export const SALES_STATUS_TAB_LABEL = {
  all: "Todas",
  current: "Vigentes",
  voided: "Anuladas",
} as const;
export const CURRENT_BADGE_TEXT = "Vigente";
// El origen de la lámina 01. Una venta de una orden de servicio lleva su número; una de un pedido
// enlaza al pedido **sin** su número, que es una diferencia declarada con la lámina.
export const COUNTER_ORIGIN_TEXT = "Mostrador";
export const ORDER_ORIGIN_TEXT = "Pedido";
// La situación de cobro, que no es la vigencia: una venta puede estar vigente y sin cobrar. La
// anulada no es un estado de cobro y no se presenta como una deuda saldada (README del lote).
export const SALE_PAYMENT_LABEL = {
  pending: "Pendiente",
  partial: "Parcial",
  collected: "Cobrada",
  voided: "Anulada",
} as const;
export type SalePaymentState = keyof typeof SALE_PAYMENT_LABEL;
