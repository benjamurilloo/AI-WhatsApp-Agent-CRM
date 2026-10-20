import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import {
  getProductsByIds,
  lockProductsForOrder,
  recordReceivedCosts,
} from "@/modules/catalog";
import {
  getUnitSerials,
  isSerialTakenError,
  parseUnitSerial,
  receiveStock,
  splitUnitSerials,
} from "@/modules/inventory";
import { formatDocumentNumber, nextDocumentNumber } from "@/modules/numbering";
import {
  authorize,
  getMemberSummaries,
  type AuthContext,
} from "@/modules/organizations";
import { failure, type Failure } from "@/shared/errors";
import { currencyDecimals, moneyToDatabase } from "@/shared/money";
import {
  quantityFromDatabase,
  quantityToDatabase,
  type Quantity,
} from "@/shared/quantity";
import * as receiptRepository from "./goods-receipt-repository";
import {
  evaluatePurchaseOrderLines,
  parsePurchaseOrderLines,
  type PurchaseOrderLineIssue,
  type PurchaseOrderLineRuleIssue,
} from "./lines";
import * as orderRepository from "./purchase-order-repository";
import * as supplierRepository from "./repository";
import {
  MAX_GOODS_RECEIPT_LINES,
  SUPPLIER_REFERENCE_MAX_LENGTH,
  SUPPLIER_REFERENCE_PATTERN,
} from "./schema";

// Casos de uso de la recepción de mercadería (ADR 0023, puntos 4, 5, 10, 12 y 14; brief-22.4). Solo
// un admin la lee y la escribe (punto 12). purchasing es dueño de la regla: abre la transacción y se
// la pasa a catalog (los productos y el costo), inventory (el stock), numbering (el número) y audit.
//
// La serialización (D-8), en el orden del punto 10:
// 1. con orden, su cabecera FOR UPDATE;
// 2. el proveedor FOR SHARE;
// 3. los productos en modo compartido, ordenados por id;
// 4. la comprobación, con lo recibido de cada línea de la orden leído ahora;
// 5. la entrada de stock, que bloquea los saldos y toma el contador al armar el motivo;
// 6. la recepción y sus líneas, el costo (después de los saldos: H-2), el cierre automático y la
//    auditoría.
// Ningún rechazo escribe, audita, mueve stock, cambia un costo ni consume número (D-10).

export const GOODS_RECEIPTS_PAGE_SIZE = 25;
export const SUPPLIER_GOODS_RECEIPTS_LIMIT = 5;
export { MAX_GOODS_RECEIPT_LINES, SUPPLIER_REFERENCE_MAX_LENGTH };

const idSchema = z.uuid();
const supplierReferencePattern = new RegExp(SUPPLIER_REFERENCE_PATTERN);

export function formatGoodsReceiptNumber(value: number): string {
  return formatDocumentNumber("goods_receipt", value);
}

// La anulación de una recepción (brief-22.5, D-1): ARC-000001.
export function formatGoodsReceiptVoidNumber(value: number): string {
  return formatDocumentNumber("goods_receipt_void", value);
}

function searchNumber(pattern: RegExp, text: string): number | null {
  const match = pattern.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// El número como lo escribe quien busca: «RC-000123», «rc000123», «000123» o «123» (D-12).
export function parseGoodsReceiptNumberSearch(text: string): number | null {
  return searchNumber(/^(?:rc-?)?0*(\d{1,15})$/i, text);
}

// El número de una anulación, siempre con su prefijo: «ARC-000001» o «arc1» (brief-22.5, H-8). Sin
// prefijo, el número es el de la recepción.
export function parseGoodsReceiptVoidNumberSearch(text: string): number | null {
  return searchNumber(/^arc-?0*(\d{1,15})$/i, text);
}

// La referencia del proveedor (D-13): opcional; se recorta, y vacía se guarda nula.
export function normalizeSupplierReference(
  text: string,
): { ok: true; value: string | null } | { ok: false } {
  const value = text.trim();
  if (value === "") return { ok: true, value: null };
  if (
    value.length > SUPPLIER_REFERENCE_MAX_LENGTH ||
    !supplierReferencePattern.test(value)
  ) {
    return { ok: false };
  }
  return { ok: true, value };
}

// El alta (D-7 a D-10). Todo llega como texto desde el formulario y se valida acá.

// Con orden, cada línea nombra la línea de la orden que recibe, y el producto sale de ella. Sin
// orden, la línea nombra el producto.
export type GoodsReceiptLineInput = {
  purchaseOrderLineId?: string;
  productId: string;
  quantity: string;
  unitCost: string;
  // Desde la 29.5, en un producto por unidad: un IMEI por unidad, uno por renglón o separados por
  // espacios o comas (brief-29.5, D-6). En un producto por cantidad va vacío.
  serials?: string;
};

export type GoodsReceiptInput = {
  // Vacío o null: la recepción sin orden.
  purchaseOrderId: string | null;
  // Con orden no se miran: el proveedor y la moneda son los de la orden.
  supplierId: string;
  currency: string;
  supplierReference: string;
  lines: GoodsReceiptLineInput[];
};

export type GoodsReceiptValidationFailure = Failure<
  "VALIDATION_ERROR",
  {
    reason:
      | "purchase_order"
      | "supplier"
      | "currency"
      | "supplier_reference"
      | "no_lines"
      | "too_many_lines"
      | "lines";
    lines: PurchaseOrderLineIssue[];
  }
>;

// exceeds_pending lleva lo que falta recibir de la línea de la orden. Desde la 29.5, los IMEI de un
// producto por unidad (brief-29.5, D-6): uno por unidad, con la cantidad entera (serials_count), con
// su forma (serial_format), sin repetirse en la recepción (serial_repeated), y ninguno en un producto
// por cantidad (serials_not_allowed).
export type GoodsReceiptSerialRule =
  "serials_count" | "serial_format" | "serial_repeated" | "serials_not_allowed";

export type GoodsReceiptLineRuleIssue =
  | PurchaseOrderLineRuleIssue
  | {
      position: number;
      productId: string;
      rule: "exceeds_pending";
      pending: string;
    }
  | { position: number; productId: string; rule: GoodsReceiptSerialRule };

export type CreateGoodsReceiptResult =
  | {
      ok: true;
      receipt: { id: string; number: number; displayNumber: string };
      // Si esta recepción completó la orden y la cerró (D-9).
      closedOrder: boolean;
    }
  | GoodsReceiptValidationFailure
  | Failure<"FORBIDDEN">
  | Failure<"NOT_FOUND", { target: "supplier" | "purchase_order" }>
  | Failure<
      "NOT_FOUND",
      {
        target: "products" | "order_lines";
        lines: { position: number; productId: string }[];
      }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "inactive_supplier" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "order_not_open"; status: orderRepository.PurchaseOrderStatus }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "line_rules"; lines: GoodsReceiptLineRuleIssue[] }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "total_too_large" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "stock_limit"; productIds: string[] }
    >
  // Desde la 29.5: IMEI que ya tienen una unidad vigente en la organización. Vacío si dos recepciones
  // simultáneas chocaron en la base y no se sabe cuál.
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "serials_taken"; serials: string[] }
    >;

type ParsedLines = Extract<
  ReturnType<typeof parsePurchaseOrderLines>,
  { ok: true }
>["lines"];

// Lo que se valida antes de abrir la transacción. Con orden, el proveedor, la moneda y las líneas
// de la orden se leen sin bloquear: no cambian nunca (el trigger de la 0048 fija la cabecera, y las
// líneas son de solo inserción). Su estado sí cambia, y se lee después, con la cabecera bloqueada.
type Prepared = {
  order: {
    id: string;
    number: number;
    lines: orderRepository.PurchaseOrderLineRow[];
  } | null;
  supplierId: string;
  currency: string;
  decimals: number;
  supplierReference: string | null;
  lines: ParsedLines;
  // Con orden, la línea de la orden de cada posición.
  orderLineIds: Map<number, string>;
  // Los IMEI escritos en cada posición, separados y sin vacíos (brief-29.5, D-6).
  serials: Map<number, string[]>;
};

function serialsByPosition(input: GoodsReceiptInput): Map<number, string[]> {
  return new Map(
    input.lines.map((line, index) => [
      index + 1,
      splitUnitSerials((line.serials ?? "").slice(0, 20_000)),
    ]),
  );
}

async function prepareGoodsReceipt(
  organizationId: string,
  input: GoodsReceiptInput,
): Promise<
  | ({ ok: true } & Prepared)
  | GoodsReceiptValidationFailure
  | Failure<"NOT_FOUND", { target: "purchase_order" }>
  | Failure<
      "NOT_FOUND",
      {
        target: "order_lines";
        lines: { position: number; productId: string }[];
      }
    >
> {
  const invalid = (
    reason: GoodsReceiptValidationFailure["reason"],
    lines: PurchaseOrderLineIssue[] = [],
  ): GoodsReceiptValidationFailure => ({
    ok: false,
    code: "VALIDATION_ERROR",
    reason,
    lines,
  });
  const orderId = (input.purchaseOrderId ?? "").trim().toLowerCase();
  if (orderId !== "" && !idSchema.safeParse(orderId).success) {
    return invalid("purchase_order");
  }
  const reference = normalizeSupplierReference(input.supplierReference);
  if (!reference.ok) return invalid("supplier_reference");
  if (input.lines.length === 0) return invalid("no_lines");
  if (input.lines.length > MAX_GOODS_RECEIPT_LINES) {
    return invalid("too_many_lines");
  }

  if (orderId === "") {
    const supplierId = input.supplierId.trim().toLowerCase();
    if (!idSchema.safeParse(supplierId).success) return invalid("supplier");
    const currency = input.currency.trim();
    const decimals = currencyDecimals(currency);
    if (!decimals.ok) return invalid("currency");
    const parsed = parsePurchaseOrderLines(
      input.lines,
      MAX_GOODS_RECEIPT_LINES,
      decimals.decimals,
    );
    if (!parsed.ok) return invalid(parsed.reason, parsed.lines);
    return {
      ok: true,
      order: null,
      supplierId,
      currency,
      decimals: decimals.decimals,
      supplierReference: reference.value,
      lines: parsed.lines,
      orderLineIds: new Map(),
      serials: serialsByPosition(input),
    };
  }

  const order = await orderRepository.findPurchaseOrder(
    organizationId,
    orderId,
  );
  if (!order) return { ok: false, code: "NOT_FOUND", target: "purchase_order" };
  const decimals = currencyDecimals(order.currency);
  // La moneda de la orden ya se validó al crearla: si no se lee, es un defecto.
  if (!decimals.ok) throw new Error("moneda de la orden no aceptada");
  const orderLines = await orderRepository.findPurchaseOrderLines(
    organizationId,
    order.id,
  );
  const orderLinesById = new Map(orderLines.map((line) => [line.id, line]));
  // Cada línea nombra una línea de esta orden (D-7): un id que no es uuid no se lee, y uno que no es
  // de la orden no existe para ella.
  const ids = input.lines.map((line) =>
    (line.purchaseOrderLineId ?? "").trim().toLowerCase(),
  );
  const unreadable = ids.flatMap((id, index) =>
    idSchema.safeParse(id).success
      ? []
      : [{ position: index + 1, field: "product" as const }],
  );
  if (unreadable.length > 0) return invalid("lines", unreadable);
  const missing = ids.flatMap((id, index) =>
    orderLinesById.has(id) ? [] : [{ position: index + 1, productId: "" }],
  );
  if (missing.length > 0) {
    return {
      ok: false,
      code: "NOT_FOUND",
      target: "order_lines",
      lines: missing,
    };
  }
  const parsed = parsePurchaseOrderLines(
    input.lines.map((line, index) => ({
      productId: orderLinesById.get(ids[index]!)!.productId,
      quantity: line.quantity,
      unitCost: line.unitCost,
    })),
    MAX_GOODS_RECEIPT_LINES,
    decimals.decimals,
  );
  if (!parsed.ok) return invalid(parsed.reason, parsed.lines);
  return {
    ok: true,
    order: { id: order.id, number: order.number, lines: orderLines },
    supplierId: order.supplierId,
    currency: order.currency,
    decimals: decimals.decimals,
    supplierReference: reference.value,
    lines: parsed.lines,
    orderLineIds: new Map(ids.map((id, index) => [index + 1, id])),
    serials: serialsByPosition(input),
  };
}

// Los IMEI de cada línea contra el seguimiento de su producto, leído con los productos bloqueados
// (brief-29.5, D-6). Un IMEI se compara sin distinguir mayúsculas, como el índice de la base.
function serialIssues(
  lines: { position: number; productId: string; quantity: Quantity }[],
  serials: Map<number, string[]>,
  trackings: Map<string, "quantity" | "unit">,
): GoodsReceiptLineRuleIssue[] {
  const seen = new Set<string>();
  return lines.flatMap((line): GoodsReceiptLineRuleIssue[] => {
    const { position, productId } = line;
    const written = serials.get(position) ?? [];
    const issue = (rule: GoodsReceiptSerialRule) => [
      { position, productId, rule },
    ];
    if (trackings.get(productId) !== "unit") {
      return written.length > 0 ? issue("serials_not_allowed") : [];
    }
    if (written.some((serial) => parseUnitSerial(serial) === null)) {
      return issue("serial_format");
    }
    if (BigInt(written.length) * 1000n !== line.quantity) {
      return issue("serials_count");
    }
    const lowered = written.map((serial) => serial.toLowerCase());
    const repeated =
      new Set(lowered).size !== lowered.length ||
      lowered.some((serial) => seen.has(serial));
    for (const serial of lowered) seen.add(serial);
    return repeated ? issue("serial_repeated") : [];
  });
}

// El rechazo que llega con los saldos bloqueados se lanza, para revertir la transacción y con ella
// la fila en 0 que pudo crear el bloqueo (convención de la 19.3, como voidSale). Se traduce fuera.
class StockLimit extends Error {
  constructor(readonly productIds: string[]) {
    super("stock_limit");
  }
}

class SerialsTaken extends Error {
  constructor(readonly serials: string[]) {
    super("serials_taken");
  }
}

export async function createGoodsReceipt(
  context: AuthContext,
  input: GoodsReceiptInput,
): Promise<CreateGoodsReceiptResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const { organizationId, userId } = context;
  const prepared = await prepareGoodsReceipt(organizationId, input);
  if (!prepared.ok) return prepared;
  const { order, supplierId, currency, decimals, lines, orderLineIds } =
    prepared;

  try {
    return await supplierRepository.withTransaction(
      async (tx): Promise<CreateGoodsReceiptResult> => {
        // 1. Con orden, la cabecera FOR UPDATE: dos recepciones de la misma orden, o una recepción y
        // la cancelación, se ordenan acá (AC-5).
        if (order) {
          const locked = await orderRepository.findPurchaseOrder(
            organizationId,
            order.id,
            tx,
            { forUpdate: true },
          );
          if (!locked) throw new Error("la orden leída ya no existe");
          if (locked.status !== "open") {
            return {
              ok: false,
              code: "BUSINESS_RULE_VIOLATION",
              rule: "order_not_open",
              status: locked.status,
            };
          }
        }

        // 2. El proveedor FOR SHARE: una desactivación en curso termina antes, y se lee su estado
        // confirmado.
        const supplier = await supplierRepository.findSupplier(
          organizationId,
          supplierId,
          tx,
          { forShare: true },
        );
        if (!supplier)
          return { ok: false, code: "NOT_FOUND", target: "supplier" };
        if (!supplier.isActive) {
          return {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "inactive_supplier",
          };
        }

        // 3. Los productos en modo compartido, ordenados por id. El precio que también trae no se mira
        // acá: la advertencia de moneda es de la pantalla (D-7).
        const products = await lockProductsForOrder(
          tx,
          organizationId,
          lines.map((line) => line.productId),
        );

        // 4. Las reglas de línea, con lo bloqueado.
        const evaluated = evaluatePurchaseOrderLines(lines, products, decimals);
        if (!evaluated.ok) {
          switch (evaluated.reason) {
            case "missing_products":
              return {
                ok: false,
                code: "NOT_FOUND",
                target: "products",
                lines: evaluated.lines,
              };
            case "line_rules":
              return {
                ok: false,
                code: "BUSINESS_RULE_VIOLATION",
                rule: "line_rules",
                lines: evaluated.lines,
              };
            case "total_too_large":
              return {
                ok: false,
                code: "BUSINESS_RULE_VIOLATION",
                rule: "total_too_large",
              };
          }
        }

        // Con orden, lo que falta de cada línea, leído con la cabecera bloqueada (D-7): nunca se
        // recibe más de lo que falta.
        const pendingAfter = new Map<string, Quantity>();
        if (order) {
          const received = await receiptRepository.sumReceivedByOrderLine(
            organizationId,
            order.id,
            tx,
          );
          for (const line of order.lines) {
            pendingAfter.set(
              line.id,
              quantityFromDatabase(line.quantity) -
                quantityFromDatabase(received.get(line.id) ?? "0.000"),
            );
          }
          const exceeding: GoodsReceiptLineRuleIssue[] = [];
          for (const line of evaluated.lines) {
            const orderLineId = orderLineIds.get(line.position)!;
            const pending = pendingAfter.get(orderLineId)!;
            if (line.quantity > pending) {
              exceeding.push({
                position: line.position,
                productId: line.productId,
                rule: "exceeds_pending",
                pending: quantityToDatabase(pending > 0n ? pending : 0n),
              });
              continue;
            }
            pendingAfter.set(orderLineId, pending - line.quantity);
          }
          if (exceeding.length > 0) {
            return {
              ok: false,
              code: "BUSINESS_RULE_VIOLATION",
              rule: "line_rules",
              lines: exceeding,
            };
          }
        }

        // Desde la 29.5, los IMEI de cada línea contra el seguimiento de su producto (D-6).
        const trackings = new Map(
          [...products.values()].map((product) => [
            product.id,
            product.tracking,
          ]),
        );
        const serialRules = serialIssues(
          evaluated.lines,
          prepared.serials,
          trackings,
        );
        if (serialRules.length > 0) {
          return {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "line_rules",
            lines: serialRules,
          };
        }
        const unitSerials = new Map(
          evaluated.lines.flatMap((line) =>
            trackings.get(line.productId) === "unit"
              ? [[line.productId, prepared.serials.get(line.position)!]]
              : [],
          ),
        );

        // 5. La entrada de stock: bloquea los saldos y, después de comprobar que caben, toma el número
        // al armar el motivo (ADR 0023, punto 10). El motivo no nombra al proveedor (punto 12). Desde la
        // 29.5, crea las unidades de cada línea de un producto por unidad, con el costo de la línea y la
        // recepción como origen: su id se elige acá (brief-29.5, D-4).
        const receiptId = randomUUID();
        let number: number | null = null;
        const stock = await receiveStock(tx, {
          organizationId,
          originId: receiptId,
          lines: evaluated.lines.map((line) => {
            const serials = unitSerials.get(line.productId);
            return {
              productId: line.productId,
              quantity: quantityToDatabase(line.quantity),
              ...(serials
                ? {
                    units: serials.map((serial) => ({
                      serial,
                      cost: moneyToDatabase(line.unitCost),
                      costCurrency: currency,
                    })),
                  }
                : {}),
            };
          }),
          reason: async () => {
            number = await nextDocumentNumber(
              tx,
              organizationId,
              "goods_receipt",
            );
            return `Recepción ${formatGoodsReceiptNumber(number)}`;
          },
          createdBy: userId,
        });
        if (!stock.ok) {
          if (stock.reason === "serials_taken") {
            throw new SerialsTaken(stock.serials);
          }
          throw new StockLimit(stock.productIds);
        }
        if (number === null) throw new Error("la entrada no pidió el número");
        const displayNumber = formatGoodsReceiptNumber(number);

        // 6. La recepción y sus líneas.
        const receipt = await receiptRepository.insertGoodsReceipt(tx, {
          id: receiptId,
          organizationId,
          number,
          supplierId,
          purchaseOrderId: order?.id ?? null,
          currency,
          total: moneyToDatabase(evaluated.total),
          supplierReference: prepared.supplierReference,
          createdBy: userId,
        });
        const newLines = evaluated.lines.map((line) => ({
          purchaseOrderLineId: orderLineIds.get(line.position) ?? null,
          productId: line.productId,
          position: line.position,
          quantity: quantityToDatabase(line.quantity),
          unitCost: moneyToDatabase(line.unitCost),
          lineTotal: moneyToDatabase(line.total),
        }));
        const lineIds = await receiptRepository.insertGoodsReceiptLines(
          tx,
          organizationId,
          receipt.id,
          newLines,
        );
        await receiptRepository.insertGoodsReceiptLineUnits(
          tx,
          organizationId,
          [...stock.unitIds].flatMap(([productId, unitIds]) =>
            unitIds.map((unitId) => ({
              goodsReceiptLineId: lineIds.get(productId)!,
              unitId,
            })),
          ),
        );

        // El costo, después de la entrada de stock: los saldos ya ordenan a dos recepciones del mismo
        // producto, así que el costo vigente que lee catalog es el de la que confirmó antes (H-2).
        // Desde la 29.5, solo de los productos por cantidad: el costo de un producto por unidad vive en
        // cada unidad (ADR 0024, punto 6; brief-29.5, H-6).
        const costLines = newLines.filter(
          (line) => !unitSerials.has(line.productId),
        );
        if (costLines.length > 0) {
          await recordReceivedCosts(tx, {
            organizationId,
            createdBy: userId,
            goodsReceiptNumber: displayNumber,
            lines: costLines.map((line) => ({
              productId: line.productId,
              amount: line.unitCost,
              currency,
            })),
          });
        }

        // El cierre automático: si después de esta recepción no falta nada de ninguna línea (D-9).
        let closedOrder = false;
        if (
          order &&
          [...pendingAfter.values()].every((pending) => pending <= 0n)
        ) {
          await orderRepository.closePurchaseOrderRow(
            tx,
            organizationId,
            order.id,
          );
          const closedBy = {
            closed_by: "goods_receipt",
            goods_receipt_number: displayNumber,
          };
          await recordAudit(tx, {
            organizationId,
            actorUserId: userId,
            entityType: "purchase_order",
            entityId: order.id,
            action: "status_change",
            diff: {
              before: { status: "open", ...closedBy },
              after: { status: "closed", ...closedBy },
            },
          });
          closedOrder = true;
        }

        // Solo ids, cantidades, montos y la referencia: ningún dato del proveedor (D-6; punto 14).
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "goods_receipt",
          entityId: receipt.id,
          action: "create",
          diff: {
            before: null,
            after: {
              number: receipt.number,
              supplier_id: supplierId,
              purchase_order_number: order
                ? formatDocumentNumber("purchase_order", order.number)
                : null,
              currency,
              total: receipt.total,
              supplier_reference: receipt.supplierReference,
              lines: newLines.length,
              ...Object.fromEntries(
                newLines.flatMap((line) => [
                  [`line_${line.position}_product_id`, line.productId],
                  [`line_${line.position}_quantity`, line.quantity],
                  [`line_${line.position}_unit_cost`, line.unitCost],
                  [`line_${line.position}_total`, line.lineTotal],
                  // Desde la 29.5, los IMEI de un producto por unidad.
                  ...(unitSerials.has(line.productId)
                    ? [
                        [
                          `line_${line.position}_serials`,
                          unitSerials.get(line.productId)!.join(", "),
                        ],
                      ]
                    : []),
                ]),
              ),
            },
          },
        });
        return {
          ok: true,
          receipt: { id: receipt.id, number: receipt.number, displayNumber },
          closedOrder,
        };
      },
    );
  } catch (error) {
    if (error instanceof SerialsTaken || isSerialTakenError(error)) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "serials_taken",
        serials: error instanceof SerialsTaken ? error.serials : [],
      };
    }
    if (!(error instanceof StockLimit)) throw error;
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "stock_limit",
      productIds: error.productIds,
    };
  }
}

// Lecturas: solo admin (punto 12). El nombre de los productos se compone por la interfaz de
// catalog; el del proveedor y el número de la orden, en el mismo módulo.

export type GoodsReceiptSummary = {
  id: string;
  number: number;
  displayNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string | null;
  purchaseOrderDisplayNumber: string | null;
  lineCount: number;
  total: string;
  currency: string;
  createdAt: Date;
  // El número de su anulación, ARC-000001; null si está vigente (brief-22.5, D-9).
  voidDisplayNumber: string | null;
};

// Todas, las vigentes o las anuladas (brief-22.5, D-9).
export const GOODS_RECEIPT_STATUSES = ["all", "current", "voided"] as const;
export type GoodsReceiptStatusFilter = (typeof GOODS_RECEIPT_STATUSES)[number];

export type GoodsReceiptListFilters = {
  supplierId: string | null;
  // Lo que escribió quien busca; vacío no filtra. Acepta el número de la recepción o el de su
  // anulación.
  number: string;
  // Sin estado, todas.
  status?: GoodsReceiptStatusFilter;
  page: number;
};

export type GoodsReceiptPage = {
  ok: true;
  receipts: GoodsReceiptSummary[];
  total: number;
  page: number;
  pageCount: number;
};

function summarize(
  row: receiptRepository.GoodsReceiptListRow,
): GoodsReceiptSummary {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatGoodsReceiptNumber(row.number),
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    purchaseOrderId: row.purchaseOrderId,
    purchaseOrderDisplayNumber:
      row.purchaseOrderNumber === null
        ? null
        : formatDocumentNumber("purchase_order", row.purchaseOrderNumber),
    lineCount: row.lineCount,
    total: row.total,
    currency: row.currency,
    createdAt: row.createdAt,
    voidDisplayNumber:
      row.voidNumber === null
        ? null
        : formatGoodsReceiptVoidNumber(row.voidNumber),
  };
}

const EMPTY_PAGE = { receipts: [], total: 0, page: 1, pageCount: 1 } as const;

export async function listGoodsReceipts(
  context: AuthContext,
  filters: GoodsReceiptListFilters,
): Promise<GoodsReceiptPage | Failure<"FORBIDDEN">> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  // Un proveedor o un número que no pueden existir no traen recepciones: la lista queda vacía.
  const supplierId = filters.supplierId?.trim().toLowerCase() || null;
  if (supplierId !== null && !idSchema.safeParse(supplierId).success) {
    return { ok: true, ...EMPTY_PAGE, receipts: [] };
  }
  const numberText = filters.number.trim();
  const voidNumber =
    numberText === "" ? null : parseGoodsReceiptVoidNumberSearch(numberText);
  const number =
    numberText === "" || voidNumber !== null
      ? null
      : parseGoodsReceiptNumberSearch(numberText);
  if (numberText !== "" && number === null && voidNumber === null) {
    return { ok: true, ...EMPTY_PAGE, receipts: [] };
  }
  const query: receiptRepository.GoodsReceiptListQuery = {
    organizationId: context.organizationId,
    supplierId,
    purchaseOrderId: null,
    number,
    voidNumber,
    status:
      filters.status && GOODS_RECEIPT_STATUSES.includes(filters.status)
        ? filters.status
        : "all",
  };
  const total = await receiptRepository.countGoodsReceipts(query);
  const pageCount = Math.max(1, Math.ceil(total / GOODS_RECEIPTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await receiptRepository.findGoodsReceipts(
          query,
          GOODS_RECEIPTS_PAGE_SIZE,
          (page - 1) * GOODS_RECEIPTS_PAGE_SIZE,
        );
  return { ok: true, receipts: rows.map(summarize), total, page, pageCount };
}

// Las últimas recepciones de un proveedor, para su ficha (D-11).
export async function listRecentSupplierGoodsReceipts(
  context: AuthContext,
  supplierId: string,
): Promise<
  | { ok: true; receipts: GoodsReceiptSummary[]; total: number }
  | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(supplierId).success) {
    return failure("VALIDATION_ERROR");
  }
  const query: receiptRepository.GoodsReceiptListQuery = {
    organizationId: context.organizationId,
    supplierId: supplierId.toLowerCase(),
    purchaseOrderId: null,
    number: null,
    voidNumber: null,
    status: "all",
  };
  const total = await receiptRepository.countGoodsReceipts(query);
  const rows =
    total === 0
      ? []
      : await receiptRepository.findGoodsReceipts(
          query,
          SUPPLIER_GOODS_RECEIPTS_LIMIT,
          0,
        );
  return { ok: true, receipts: rows.map(summarize), total };
}

// Las recepciones de una orden, para su detalle, sin paginar: las 1.000 más nuevas. En la práctica una
// orden tiene pocas (D-12 mide 100); lo recibido por línea no depende de este tope.
export async function listOrderGoodsReceipts(
  organizationId: string,
  purchaseOrderId: string,
): Promise<GoodsReceiptSummary[]> {
  const query: receiptRepository.GoodsReceiptListQuery = {
    organizationId,
    supplierId: null,
    purchaseOrderId,
    number: null,
    voidNumber: null,
    status: "all",
  };
  const rows = await receiptRepository.findGoodsReceipts(query, 1000, 0);
  return rows.map(summarize);
}

export type GoodsReceiptLine = {
  position: number;
  productId: string;
  // El nombre y el SKU de hoy: la línea no los copia.
  product: { name: string; sku: string; unit: string } | null;
  quantity: string;
  unitCost: string;
  lineTotal: string;
  // Desde la 29.5: los IMEI de las unidades que creó la línea; vacía en un producto por cantidad.
  serials: string[];
};

export type GoodsReceiptDetail = {
  id: string;
  number: number;
  displayNumber: string;
  // Los datos de hoy de la ficha: la recepción no los copia (punto 14).
  supplier: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    cuit: string | null;
  } | null;
  supplierId: string;
  purchaseOrder: { id: string; displayNumber: string } | null;
  currency: string;
  total: string;
  supplierReference: string | null;
  createdAt: Date;
  lines: GoodsReceiptLine[];
  // Su anulación, si la tiene (brief-22.5, D-9).
  receiptVoid: {
    id: string;
    displayNumber: string;
    reason: receiptRepository.GoodsReceiptVoidReason;
    createdAt: Date;
  } | null;
};

export async function getGoodsReceipt(
  context: AuthContext,
  goodsReceiptId: string,
): Promise<
  | { ok: true; receipt: GoodsReceiptDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(goodsReceiptId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const receipt = await receiptRepository.findGoodsReceipt(
    organizationId,
    goodsReceiptId.toLowerCase(),
  );
  if (!receipt) return failure("NOT_FOUND");
  const [lines, supplier, order, receiptVoid, lineUnits] = await Promise.all([
    receiptRepository.findGoodsReceiptLines(organizationId, receipt.id),
    supplierRepository.findSupplier(organizationId, receipt.supplierId),
    receipt.purchaseOrderId
      ? orderRepository.findPurchaseOrder(
          organizationId,
          receipt.purchaseOrderId,
        )
      : Promise.resolve(undefined),
    receiptRepository.findVoidByGoodsReceipt(organizationId, receipt.id),
    receiptRepository.findGoodsReceiptLineUnits(organizationId, receipt.id),
  ]);
  const serials = await getUnitSerials(
    organizationId,
    lineUnits.map((row) => row.unitId),
  );
  const serialsByProduct = new Map<string, string[]>();
  for (const row of lineUnits) {
    const list = serialsByProduct.get(row.productId) ?? [];
    list.push(serials.get(row.unitId) ?? "");
    serialsByProduct.set(row.productId, list);
  }
  const products = await getProductsByIds(
    context,
    lines.map((line) => line.productId),
  );
  const productsById = new Map(
    products.ok
      ? products.products.map((product) => [product.id, product])
      : [],
  );
  return {
    ok: true,
    receipt: {
      id: receipt.id,
      number: receipt.number,
      displayNumber: formatGoodsReceiptNumber(receipt.number),
      supplier: supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            phone: supplier.phone,
            email: supplier.email,
            cuit: supplier.cuit,
          }
        : null,
      supplierId: receipt.supplierId,
      purchaseOrder: order
        ? {
            id: order.id,
            displayNumber: formatDocumentNumber("purchase_order", order.number),
          }
        : null,
      currency: receipt.currency,
      total: receipt.total,
      supplierReference: receipt.supplierReference,
      createdAt: receipt.createdAt,
      lines: lines.map((line) => {
        const product = productsById.get(line.productId);
        return {
          position: line.position,
          productId: line.productId,
          product: product
            ? { name: product.name, sku: product.sku, unit: product.unit }
            : null,
          quantity: line.quantity,
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
          // En orden alfabético: las filas de la línea no guardan el orden en que se escribieron.
          serials: (serialsByProduct.get(line.productId) ?? []).sort((a, b) =>
            a.localeCompare(b),
          ),
        };
      }),
      receiptVoid: receiptVoid
        ? {
            id: receiptVoid.id,
            displayNumber: formatGoodsReceiptVoidNumber(receiptVoid.number),
            reason: receiptVoid.reason,
            createdAt: receiptVoid.createdAt,
          }
        : null,
    },
  };
}

// La historia de la recepción: su alta y, desde la 22.5, su anulación (brief-22.5, D-7).

export type GoodsReceiptAuditEntry = NamedAuditLogEntry;

export type GoodsReceiptAuditResult =
  | {
      ok: true;
      entries: GoodsReceiptAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function listGoodsReceiptAudit(
  context: AuthContext,
  goodsReceiptId: string,
  page: number,
): Promise<GoodsReceiptAuditResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(goodsReceiptId).success) {
    return failure("VALIDATION_ERROR");
  }
  const receipt = await receiptRepository.findGoodsReceipt(
    context.organizationId,
    goodsReceiptId.toLowerCase(),
  );
  if (!receipt) return failure("NOT_FOUND");
  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["goods_receipt"],
    entityId: receipt.id,
    page,
  });
  const names = new Map(
    (
      await getMemberSummaries(
        context.organizationId,
        auditUserIds(found.entries),
      )
    ).map((user) => [user.id, user.name]),
  );
  return {
    ok: true,
    entries: nameAuditActors(found.entries, names),
    total: found.total,
    page: found.page,
    pageCount: found.pageCount,
  };
}
