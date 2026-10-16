import type {
  CreateGoodsReceiptResult,
  GoodsReceiptLineRuleIssue,
} from "@/modules/purchasing";
import { formatQuantity } from "@/shared/quantity";
import {
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
export const NO_SUPPLIER_GOODS_RECEIPTS_MESSAGE =
  "Este proveedor no tiene recepciones.";
export const ORDER_NOT_RECEIVABLE_MESSAGE =
  "Esta orden de compra no existe o ya no está abierta: no recibe mercadería.";
// La recepción no copia el nombre del producto ni los datos del proveedor (punto 14).
export const CURRENT_DATA_NOTE =
  "Los productos y el proveedor se muestran con sus datos de hoy. Las cantidades, los costos y los totales son los del día de la recepción.";

// La advertencia de D-7: el producto se vende en otra moneda, y el margen no se calcula entre
// monedas distintas.
export function currencyWarning(
  priceCurrency: string | null,
  currency: string,
): string | null {
  return priceCurrency && currency && priceCurrency !== currency
    ? `Este producto se vende en ${priceCurrency}: con este costo queda sin margen.`
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
};

export type GoodsReceiptFormValues = {
  orderId: string;
  supplierId: string;
  supplierText: string;
  currency: string;
  supplierReference: string;
  lines: GoodsReceiptFormLine[];
};

export type GoodsReceiptFormState =
  | { status: "idle" }
  | {
      status: "error";
      requestId: string;
      values: GoodsReceiptFormValues;
      message: string;
      // Errores por línea, por su posición en el formulario (desde 1).
      lineErrors: Record<number, string>;
      supplierError: string | null;
      currencyError: string | null;
      referenceError: string | null;
    };

export type GoodsReceiptRejection = Pick<
  Extract<GoodsReceiptFormState, { status: "error" }>,
  | "message"
  | "lineErrors"
  | "supplierError"
  | "currencyError"
  | "referenceError"
>;

const REVIEW_LINES = "Revisá las líneas marcadas.";

const NONE = {
  lineErrors: {},
  supplierError: null,
  currencyError: null,
  referenceError: null,
};

export const SUPPLIER_REFERENCE_HINT =
  "Opcional: el número del remito o de la factura, hasta 40 letras, números, espacios, guiones o barras.";

export function lineRuleIssueMessage(issue: GoodsReceiptLineRuleIssue): string {
  if (issue.rule === "exceeds_pending") {
    return `Falta recibir ${formatQuantity(issue.pending)}: no se puede recibir más que eso con esta orden.`;
  }
  return lineRuleMessage(issue.rule);
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
// formulario. productIds son los productos de las líneas enviadas, en orden, para stock_limit.
export function goodsReceiptRejection(
  result: Exclude<CreateGoodsReceiptResult, { ok: true }>,
  currency: string,
  productIds: string[],
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
              productIds.flatMap((productId, index) =>
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
      }
  }
}

// Avisos tras una acción que redirige; solo valores conocidos llegan a la página.
const NOTICES: Record<string, string> = {
  creada: "Recepción registrada: el stock y el costo ya están actualizados.",
  "orden-cerrada":
    "Recepción registrada: el stock y el costo ya están actualizados. Con ella la orden quedó completa y se cerró.",
};

export function goodsReceiptNoticeMessage(
  value: string | string[] | undefined,
): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && Object.hasOwn(NOTICES, key) ? NOTICES[key]! : null;
}
