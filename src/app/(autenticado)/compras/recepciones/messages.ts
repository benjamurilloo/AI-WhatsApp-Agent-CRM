import type {
  CreateGoodsReceiptResult,
  GoodsReceiptLineRuleIssue,
  GoodsReceiptSerialRule,
  GoodsReceiptVoidReason,
  GoodsReceiptVoidShortage,
  PurchaseOrderLineRule,
  VoidGoodsReceiptResult,
} from "@/modules/purchasing";
import { formatQuantity } from "@/shared/quantity";
import {
  byQuantity,
  lineFieldMessage,
  lineRuleMessage,
  STATUS_LABEL,
} from "../ordenes/messages";

// Textos de las pantallas de recepciones (brief-22.4, D-10 y D-11), derivados de la taxonomía de
// errores, como los de la orden de compra. Las líneas reusan los de la orden: son las mismas reglas.

export const GOODS_RECEIPT_NOT_FOUND_MESSAGE = "Esta recepción no existe.";
export const NO_GOODS_RECEIPTS_MESSAGE = "Todavía no hay recepciones.";
export const NO_GOODS_RECEIPT_RESULTS_MESSAGE =
  "Ninguna recepción coincide con estos filtros.";
// La lista, con la forma de la lámina 01 (brief-24.8.1-b, V-3 y V-8).
export const CURRENT_BADGE_TEXT = "Vigente";
export const ORDER_FILTER_HINT =
  "La orden de compra es opcional: se puede recibir mercadería sin ninguna.";
export const RECEIPTS_LIST_NOTE =
  "La orden es opcional. Registrar una recepción incorpora stock; el pago se registra aparte.";

export const NO_SUPPLIER_GOODS_RECEIPTS_MESSAGE =
  "Este proveedor no tiene recepciones.";
export const ORDER_NOT_RECEIVABLE_MESSAGE =
  "Esta orden de compra no existe o ya no está abierta: no recibe mercadería.";
// La recepción no copia el nombre del producto ni los datos del proveedor (punto 14).
export const CURRENT_DATA_NOTE =
  "Los productos y el proveedor se muestran con sus datos de hoy. Las cantidades, los costos y los totales son los del día de la recepción.";

// La advertencia de D-7: el producto se vende en otra moneda, y el margen no se calcula entre
// monedas distintas. Desde la 24.8.1-b lleva el texto de la lámina 03 en dos renglones
// (brief-24.8.1-b, V-22): el primero dice el hecho y el segundo, la consecuencia.
export type CurrencyWarning = { title: string; detail: string };

export function currencyWarning(
  priceCurrency: string | null,
  currency: string,
): CurrencyWarning | null {
  return priceCurrency && currency && priceCurrency !== currency
    ? {
        title: `El precio de venta está en ${priceCurrency}.`,
        detail: `Con un costo en ${currency} no se calcula el margen entre monedas.`,
      }
    : null;
}

export function unexpectedErrorMessage(requestId: string): string {
  return `No pudimos guardar la recepción. Código: ${requestId}`;
}

// El alta: lo que el formulario envió, para volver a mostrarlo, y por qué se rechazó. Con orden,
// cada fila es una línea de la orden; sin orden, una que eligió quien carga.

export type GoodsReceiptFormLine = {
  // Con orden, la línea de la orden; sin orden, vacío.
  orderLineId: string;
  productId: string;
  // Lo que se ve del producto: «Nombre (SKU)», o lo que escribió quien carga.
  productText: string;
  quantity: string;
  unitCost: string;
  // La moneda del precio vigente, para la advertencia (D-7); vacía si no tiene precio.
  priceCurrency: string;
  // Desde la 29.5: los IMEI escritos, y si el producto se lleva por unidad («unit»), cuando se sabe.
  serials: string;
  tracking: string;
};

export type GoodsReceiptFormValues = {
  orderId: string;
  supplierId: string;
  supplierText: string;
  currency: string;
  supplierReference: string;
  lines: GoodsReceiptFormLine[];
};

// El paso 2 del alta (brief-24.8.1-b, V-10), con lo que se va a registrar. El recuento de los IMEI
// lo hace el servidor con la misma regla que usa purchasing al registrar (V-15): sin JavaScript, en
// el paso 1 no hay recuento vivo.
export type GoodsReceiptReviewLine = {
  // La posición en el formulario, desde 1: la misma que usan los errores por línea.
  position: number;
  productText: string;
  quantity: string;
  unitCost: string;
  serials: string[];
};

export type GoodsReceiptFormState =
  | { status: "idle" }
  // Volver del paso 2 al paso 1: lo cargado vuelve tal cual, sin validar nada.
  | { status: "edit"; requestId: string; values: GoodsReceiptFormValues }
  | {
      status: "review";
      requestId: string;
      values: GoodsReceiptFormValues;
      lines: GoodsReceiptReviewLine[];
    }
  | {
      status: "error";
      requestId: string;
      values: GoodsReceiptFormValues;
      message: string;
      // Errores por línea, por su posición en el formulario (desde 1).
      lineErrors: Record<number, string>;
      // El error del IMEI duplicado, en el campo de su línea (V-37), por la misma posición.
      serialErrors: Record<number, string>;
      supplierError: string | null;
      currencyError: string | null;
      referenceError: string | null;
    };

export type GoodsReceiptRejection = Pick<
  Extract<GoodsReceiptFormState, { status: "error" }>,
  | "message"
  | "lineErrors"
  | "serialErrors"
  | "supplierError"
  | "currencyError"
  | "referenceError"
>;

const REVIEW_LINES = "Revisá las líneas marcadas.";

const NONE = {
  lineErrors: {},
  serialErrors: {},
  supplierError: null,
  currencyError: null,
  referenceError: null,
};

export const SUPPLIER_REFERENCE_HINT =
  "Opcional: el número del remito o de la factura, hasta 40 letras, números, espacios, guiones o barras.";

// Los IMEI de un producto por unidad (brief-29.5, D-6).
export const SERIALS_HINT =
  "Solo para productos que se llevan por unidad: un IMEI o número de serie por unidad, uno por renglón.";

// El IMEI duplicado, con el texto de la tarjeta 17-2 (brief-24.8.1-b, V-37). «Revisar IMEI» no se
// dibuja: llevaría a una búsqueda de unidades por IMEI que no existe como pantalla.
export function serialTakenFieldError(count: number): string {
  return count === 1
    ? "Ya está activo en otra unidad."
    : "Ya están activos en otras unidades.";
}

export const SERIAL_TAKEN_NOTE =
  "Este IMEI ya se encuentra registrado y activo en otra unidad. Verificá el equipo o ingresá otro IMEI.";

// El alta en dos pasos, con la forma de las láminas 02, 03 y 05 (brief-24.8.1-b, V-10 a V-24).
export const RECEIPT_STEP_LABELS = ["Mercadería", "Revisión"] as const;
export const RECEIPT_SUMMARY_TITLE = "Resumen de la recepción";
export const RECEIPT_REVIEW_BUTTON = "Revisar recepción";
export const RECEIPT_NO_PAYMENT_NOTE = "No registra un pago.";
export const RECEIPT_CLOSES_ORDER_NOTE =
  "Esta recepción completaría la orden y la cerraría.";
export const RECEIPT_SALE_PRICE_NOTE = "El precio de venta no cambia.";
export const RECEIPT_REVIEW_HINT =
  "Revisá lo que se va a registrar. Nada se guardó todavía.";

// El recuadro de la lámina 03 (V-21): lo que pasa al registrar, con el costo cuando hay una sola
// línea, que es el único caso en que el costo vigente nuevo es un número y no «el de cada línea».
export function receiptEffectNote(units: string, cost: string | null): string {
  const incoming = `Al registrar, se incorporan ${units} ${byQuantity(units, "unidad", "unidades")}`;
  return cost
    ? `${incoming} y el costo vigente del producto pasa a ${cost}. ${RECEIPT_SALE_PRICE_NOTE}`
    : `${incoming} y el costo vigente de cada producto pasa al costo recibido. ${RECEIPT_SALE_PRICE_NOTE}`;
}

const SERIAL_RULE_MESSAGE: Record<GoodsReceiptSerialRule, string> = {
  serials_count:
    "Este producto se lleva por unidad: escribí un IMEI por cada unidad recibida, y la cantidad sin decimales.",
  serial_format:
    "Un IMEI o número de serie tiene de 1 a 32 letras, números o guiones, sin espacios.",
  serial_repeated: "Hay un IMEI repetido en la recepción.",
  serials_not_allowed:
    "Este producto se lleva por cantidad: no lleva IMEI. Borralos para recibirlo.",
};

export function lineRuleIssueMessage(issue: GoodsReceiptLineRuleIssue): string {
  if (issue.rule === "exceeds_pending") {
    return `Falta recibir ${formatQuantity(issue.pending)}: no se puede recibir más que eso con esta orden.`;
  }
  if (Object.hasOwn(SERIAL_RULE_MESSAGE, issue.rule)) {
    return SERIAL_RULE_MESSAGE[issue.rule as GoodsReceiptSerialRule];
  }
  return lineRuleMessage(issue.rule as PurchaseOrderLineRule);
}

function validationRejection(
  result: Extract<CreateGoodsReceiptResult, { code: "VALIDATION_ERROR" }>,
  currency: string,
): GoodsReceiptRejection {
  switch (result.reason) {
    case "purchase_order":
      return { ...NONE, message: ORDER_NOT_RECEIVABLE_MESSAGE };
    case "supplier":
      return {
        ...NONE,
        message: "Revisá el proveedor.",
        supplierError: "Elegí un proveedor de la lista.",
      };
    case "currency":
      return {
        ...NONE,
        message: "Revisá la moneda.",
        currencyError: "Elegí la moneda de la recepción.",
      };
    case "supplier_reference":
      return {
        ...NONE,
        message: "Revisá la referencia del proveedor.",
        referenceError:
          "Escribí hasta 40 letras, números, espacios, guiones o barras.",
      };
    case "no_lines":
      return {
        ...NONE,
        message: "Cargá al menos una línea con cantidad y costo.",
      };
    case "too_many_lines":
      return {
        ...NONE,
        message: "Una recepción tiene como máximo 50 líneas.",
      };
    case "lines":
      return {
        ...NONE,
        message: REVIEW_LINES,
        lineErrors: Object.fromEntries(
          result.lines.map((issue) => [
            issue.position,
            lineFieldMessage(issue, currency),
          ]),
        ),
      };
  }
}

function notFoundRejection(
  result: Extract<CreateGoodsReceiptResult, { code: "NOT_FOUND" }>,
): GoodsReceiptRejection {
  switch (result.target) {
    case "supplier":
      return {
        ...NONE,
        message: "Revisá el proveedor.",
        supplierError: "El proveedor ya no existe.",
      };
    case "purchase_order":
      return { ...NONE, message: ORDER_NOT_RECEIVABLE_MESSAGE };
    case "products":
    case "order_lines":
      return {
        ...NONE,
        message: REVIEW_LINES,
        lineErrors: Object.fromEntries(
          result.lines.map((line) => [
            line.position,
            result.target === "products"
              ? "El producto ya no existe."
              : "Esta línea no es de la orden.",
          ]),
        ),
      };
  }
}

// Un mensaje general y, si corresponde, uno por línea, para el proveedor, la moneda o la referencia.
// Las posiciones son las de las líneas enviadas (desde 1); quien llama las lleva a las del
// formulario. `sent` son las líneas enviadas, en orden: su producto, para stock_limit, y sus IMEI,
// para señalar el duplicado en su campo (V-37).
export function goodsReceiptRejection(
  result: Exclude<CreateGoodsReceiptResult, { ok: true }>,
  currency: string,
  sent: { productId: string; serials: string[] }[],
): GoodsReceiptRejection {
  switch (result.code) {
    case "FORBIDDEN":
      return {
        ...NONE,
        message: "No tenés permiso para registrar recepciones.",
      };
    case "VALIDATION_ERROR":
      return validationRejection(result, currency);
    case "NOT_FOUND":
      return notFoundRejection(result);
    case "BUSINESS_RULE_VIOLATION":
      switch (result.rule) {
        case "inactive_supplier":
          return {
            ...NONE,
            message: "Revisá el proveedor.",
            supplierError:
              "El proveedor está desactivado: reactivalo para registrarle una recepción.",
          };
        case "order_not_open":
          return {
            ...NONE,
            message: `La orden ya está ${STATUS_LABEL[result.status].toLowerCase()}: no recibe más mercadería.`,
          };
        case "total_too_large":
          return {
            ...NONE,
            message: "El total de la recepción es demasiado grande.",
          };
        case "stock_limit":
          return {
            ...NONE,
            message: REVIEW_LINES,
            lineErrors: Object.fromEntries(
              sent.flatMap(({ productId }, index) =>
                result.productIds.includes(productId)
                  ? [
                      [
                        index + 1,
                        "Con esta cantidad, el stock del producto pasaría el máximo que se puede guardar.",
                      ],
                    ]
                  : [],
              ),
            ),
          };
        case "line_rules":
          return {
            ...NONE,
            message: REVIEW_LINES,
            lineErrors: Object.fromEntries(
              result.lines.map((issue) => [
                issue.position,
                lineRuleIssueMessage(issue),
              ]),
            ),
          };
        // El IMEI duplicado, con el texto y la forma de la tarjeta 17-2 (V-37): el error va en el
        // campo de la línea que lo escribió, y el mensaje general nombra cuáles son. Si la carga
        // perdió una carrera, no hay campo que señalar: el IMEI que mandó era válido al escribirlo.
        case "serials_taken":
          if (result.serials.length === 0) {
            return {
              ...NONE,
              message:
                "Otra carga registró uno de estos IMEI al mismo tiempo. Revisá las unidades del producto y volvé a intentar.",
            };
          }
          return {
            ...NONE,
            message: `${result.serials.length === 1 ? "Este IMEI ya está registrado y activo en otra unidad" : "Estos IMEI ya están registrados y activos en otras unidades"}: ${result.serials.join(", ")}.`,
            serialErrors: Object.fromEntries(
              sent.flatMap(({ serials }, index) => {
                const taken = serials.filter((serial) =>
                  result.serials.includes(serial),
                );
                return taken.length > 0
                  ? [[index + 1, serialTakenFieldError(taken.length)]]
                  : [];
              }),
            ),
          };
      }
  }
}

// Avisos tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  creada: "Recepción registrada: el stock y el costo ya están actualizados.",
  "orden-cerrada":
    "Recepción registrada: el stock y el costo ya están actualizados. Con ella la orden quedó completa y se cerró.",
  anulada:
    "Recepción anulada: el stock ya bajó. El costo de los productos no cambió.",
};

export function goodsReceiptNoticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}

// La anulación (brief-22.5, D-2, D-6 y D-9).

export const VOIDED_BADGE_TEXT = "Anulada";

// La bajada de la confirmación, de la lámina 04 (brief-24.8.1-b, V-32). En presente: lo que
// pasa al confirmar, no una promesa.
export const VOID_CONFIRM_SUBTITLE =
  "Se dan de baja las unidades recibidas y se revierte su impacto en la deuda con el proveedor.";

export const VOID_REASON_LABEL: Record<GoodsReceiptVoidReason, string> = {
  data_entry_error: "Error de carga",
  duplicate: "Cargada dos veces",
  returned_to_supplier: "Mercadería devuelta al proveedor",
  other: "Otro",
};

// Lo que pasa con el stock y con el costo, dicho antes de confirmar (D-9; ADR 0023, punto 6).
export const VOID_STOCK_NOTE =
  "Sale del stock lo que la recepción sumó, con un movimiento «Anulación de recepción» por producto, solo si alcanza lo disponible. En un producto que se lleva por unidad, las unidades de la recepción se dan de baja, una por una, solo si siguen disponibles.";
export const VOID_COST_NOTE =
  "Anular no restaura el costo: si hace falta, corregilo en la ficha del producto.";
export const VOID_ORDER_NOTE =
  "La orden deja de contar esta recepción como recibida. Si la orden ya está cerrada, sigue cerrada.";

// El bloqueo de la tarjeta 17-3 (brief-24.8.1-b, V-38): nombra la unidad y su estado, en vez de
// enumerar las seis causas posibles. El estado no cuesta una lectura: la ficha ya trae las unidades
// con el suyo (H-3). Como ese estado es el de la última lectura de la página y el bloqueo ocurrió
// después, el texto dice «figura como» y no afirma el estado de ahora.
export function voidBlockedHeading(
  displayNumber: string,
  serials: string[],
): string {
  return `No se puede anular ${displayNumber} · ${serials.join(" · ")}`;
}

export function voidBlockedDetail(statusLabel: string | null): string {
  return statusLabel
    ? `La unidad figura como ${statusLabel.toLowerCase()} y no se puede anular la recepción.`
    : "La unidad ya no está disponible y no se puede anular la recepción.";
}

export const VOID_BLOCKED_NOTE =
  "No se cambia ninguna reserva desde esta anulación.";

export type VoidGoodsReceiptState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      message: string;
      // La anulación que ya tiene la recepción, para enlazarla.
      existing: { displayNumber: string } | null;
      // Los productos que no alcanzan, con lo que hay que sacar y lo disponible.
      shortages: GoodsReceiptVoidShortage[];
      // Los IMEI de las unidades que bloquean la anulación (V-38). La página les pone el estado.
      blockedSerials: string[];
    };

export function voidUnexpectedErrorMessage(requestId: string): string {
  return `No pudimos anular la recepción. Código: ${requestId}`;
}

export function voidGoodsReceiptRejection(
  result: Exclude<VoidGoodsReceiptResult, { ok: true }>,
): Omit<
  Extract<VoidGoodsReceiptState, { status: "error" }>,
  "status" | "requestId"
> {
  const none = { existing: null, shortages: [], blockedSerials: [] };
  switch (result.code) {
    case "FORBIDDEN":
      return {
        ...none,
        message: "Solo un administrador puede anular una recepción.",
      };
    case "NOT_FOUND":
      return { ...none, message: GOODS_RECEIPT_NOT_FOUND_MESSAGE };
    case "VALIDATION_ERROR":
      return { ...none, message: "Elegí el motivo de la anulación." };
    case "BUSINESS_RULE_VIOLATION":
      if (result.rule === "already_voided") {
        return {
          ...none,
          message: `Esta recepción ya está anulada, por ${result.receiptVoid.displayNumber}.`,
          existing: { displayNumber: result.receiptVoid.displayNumber },
        };
      }
      // El mensaje lo arma la página, que es la que tiene el estado de cada unidad (V-38). Acá
      // viaja el hecho: cuáles bloquean.
      if (result.rule === "units_not_available") {
        return {
          ...none,
          message: `${result.serials.length === 1 ? "Una unidad" : "Unas unidades"} de esta recepción ya no ${result.serials.length === 1 ? "está disponible" : "están disponibles"}: la recepción no se puede anular.`,
          blockedSerials: result.serials,
        };
      }
      return {
        ...none,
        message:
          "No alcanza el stock disponible para sacar lo que la recepción sumó: parte ya se vendió o está reservada. Corregilo con un ajuste en el producto, o no la anules.",
        shortages: result.shortages,
      };
  }
}

// Una falta, en texto: lo que hay que sacar y lo disponible hoy.
export function shortageText(shortage: GoodsReceiptVoidShortage): string {
  return `Hay que sacar ${formatQuantity(shortage.requested)} y hay disponible ${formatQuantity(shortage.available)}.`;
}
