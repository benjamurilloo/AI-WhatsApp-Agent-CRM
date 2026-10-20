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
  type ProductPrice,
} from "@/modules/catalog";
import {
  getClientsByIds,
  lockClientForOrder,
  lockClientForOrderByPhone,
  type Client,
} from "@/modules/crm";
import {
  deliverStock,
  getAvailableStock,
  getUnitSummaries,
  releaseStock,
  reserveStock,
  resolveLineUnits,
  type LineUnitIssue,
  type StockLine,
  type UnitStatus,
} from "@/modules/inventory";
import { formatDocumentNumber, nextDocumentNumber } from "@/modules/numbering";
import {
  authorize,
  getMemberSummaries,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  computeLineTotal,
  duplicateLines,
  evaluateLines,
  parseLines,
  sumLineTotals,
  type LineField,
  type LineInput,
  type LineProduct,
  type LineRule,
  type LineRuleIssue,
  type LineUnit,
  type ParsedLine,
} from "@/shared/lines";
import {
  currencyDecimals,
  moneyFromDatabase,
  moneyToDatabase,
  type Money,
} from "@/shared/money";
import {
  parseQuantityInput,
  quantityToDatabase,
  type Quantity,
} from "@/shared/quantity";
import * as repository from "./repository";
import { MAX_ORDER_LINES, orderStatus } from "./schema";

// Casos de uso del pedido (ADR 0020; brief-19.2): el alta de un pendiente, la lista y el detalle;
// desde la 19.3, sus transiciones (confirmar, entregar y cancelar). orders es dueño de la regla:
// abre la transacción y se la pasa a crm (el cliente), catalog (los productos y su precio),
// numbering (el número), inventory (la reserva y la entrega) y audit. Desde la 19.4, el pendiente
// que deja el agente llega con la transacción de ingestion (placeOrderFromIngestion).

export type OrderStatus = repository.OrderStatus;
export const ORDER_STATUSES = orderStatus.enumValues;
export { MAX_ORDER_LINES };
export const ORDERS_PAGE_SIZE = 25;
export const CLIENT_ORDERS_LIMIT = 5;

const idSchema = z.uuid();

export function formatOrderNumber(value: number): string {
  return formatDocumentNumber("order", value);
}

// El número como lo escribe quien busca: «P-000123», «p000123», «000123» o «123».
export function parseOrderNumberSearch(text: string): number | null {
  const match = /^(?:p-?)?0*(\d{1,15})$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Alta (ADR 0020, punto 3). Todo llega como texto desde el formulario y se valida acá.

// Desde la 20.3, la línea y sus reglas viven en src/shared/lines, compartidas con la venta sin
// pedido (brief-20.3, D-1). Si el precio que vio quien carga cambió, la respuesta es CONFLICT y no
// se crea nada (brief-19.2, D-5).
export type OrderLineInput = LineInput;

export type OrderInput = { clientId: string; lines: OrderLineInput[] };

export type OrderLineField = LineField;

export type OrderValidationFailure = Failure<
  "VALIDATION_ERROR",
  {
    reason: "client" | "no_lines" | "too_many_lines" | "lines";
    lines: { position: number; field: OrderLineField; serial?: string }[];
  }
>;

export type OrderLineRule = LineRule;

export type OrderLineRuleIssue = LineRuleIssue;

export type CreateOrderResult =
  | { ok: true; order: { id: string; number: number; displayNumber: string } }
  | OrderValidationFailure
  | Failure<"FORBIDDEN">
  | Failure<"NOT_FOUND", { target: "client" }>
  | Failure<
      "NOT_FOUND",
      { target: "products"; lines: { position: number; productId: string }[] }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "inactive_client" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "line_rules"; lines: OrderLineRuleIssue[] }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "total_too_large" }>
  // Desde la 29.5.2: un IMEI que no es de una unidad disponible del producto de su línea
  // (brief-29.5.2, D-5, AC-1).
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "units"; units: LineUnitIssue[] }
    >
  | Failure<"CONFLICT", { prices: LinePriceConflict[] }>;

// El precio que cambió: el del producto o, desde la 29.5.2, el monto de una línea por unidad
// (lineTotal, con la escala de la base; null si lo que cambió fue el precio del producto).
export type LinePriceConflict = {
  position: number;
  productId: string;
  price: ProductPrice | null;
  lineTotal: string | null;
};

// Las unidades de las líneas de un producto por unidad con IMEI (brief-29.5.2, D-1 y D-5), con los
// productos ya bloqueados. Una línea de un producto inexistente, inactivo o por cantidad no se resuelve:
// evaluateLines responde su regla. lock: la venta sin pedido las bloquea, el alta del pedido no.
export async function resolveLinesUnits(
  tx: DbTransaction,
  organizationId: string,
  lines: ParsedLine[],
  products: Map<string, LineProduct<ProductPrice>>,
  { lock }: { lock: boolean },
): Promise<
  | {
      ok: true;
      units: Map<number, (LineUnit & { id: string; serial: string })[]>;
    }
  | { ok: false; issues: LineUnitIssue[] }
> {
  const requests = lines
    .filter((line) => {
      const product = products.get(line.productId);
      return (
        product?.isActive === true &&
        product.tracking === "unit" &&
        line.serials.length > 0
      );
    })
    .map(({ position, productId, serials }) => ({
      position,
      productId,
      serials,
    }));
  if (requests.length === 0) return { ok: true, units: new Map() };
  return resolveLineUnits(tx, organizationId, requests, { lock });
}

function validateOrderInput(
  input: OrderInput,
):
  { ok: true; clientId: string; lines: ParsedLine[] } | OrderValidationFailure {
  const invalid = (
    reason: OrderValidationFailure["reason"],
    lines: OrderValidationFailure["lines"] = [],
  ): OrderValidationFailure => ({
    ok: false,
    code: "VALIDATION_ERROR",
    reason,
    lines,
  });
  const clientId = input.clientId.trim().toLowerCase();
  if (!idSchema.safeParse(clientId).success) return invalid("client");
  const parsed = parseLines(input.lines, MAX_ORDER_LINES);
  if (!parsed.ok) return invalid(parsed.reason, parsed.lines);
  return { ok: true, clientId, lines: parsed.lines };
}

function lineRules(lines: OrderLineRuleIssue[]): CreateOrderResult {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "line_rules",
    lines,
  };
}

export async function createOrder(
  context: AuthContext,
  input: OrderInput,
): Promise<CreateOrderResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validateOrderInput(input);
  if (!validated.ok) return validated;
  const { clientId, lines } = validated;
  const duplicates = duplicateLines(lines);
  if (duplicates.length > 0) return lineRules(duplicates);
  const { organizationId, userId } = context;

  return repository.withTransaction(async (tx): Promise<CreateOrderResult> => {
    // El orden de bloqueo (ADR 0020, punto 6; brief-19.2, D-3): el cliente, los productos
    // ordenados por id y, al final, el contador.
    const client = await lockClientForOrder(tx, organizationId, clientId);
    if (client === "not_found") {
      return { ok: false, code: "NOT_FOUND", target: "client" };
    }
    if (client === "inactive") {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "inactive_client",
      };
    }

    const products = await lockProductsForOrder(
      tx,
      organizationId,
      lines.map((line) => line.productId),
    );
    // Las unidades se leen sin reservarlas: un pendiente no toca el stock, y confirmar vuelve a
    // mirarlas con su bloqueo (brief-29.5.2, D-1).
    const resolved = await resolveLinesUnits(
      tx,
      organizationId,
      lines,
      products,
      { lock: false },
    );
    if (!resolved.ok) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "units",
        units: resolved.issues,
      };
    }
    const evaluated = evaluateLines(lines, products, resolved.units);
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
          return lineRules(evaluated.lines);
        // El precio que vio quien carga el pedido tiene que seguir vigente (D-5).
        case "price_changed":
          return {
            ok: false,
            code: "CONFLICT",
            prices: priceConflicts(evaluated.lines),
          };
        case "total_too_large":
          return {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "total_too_large",
          };
      }
    }

    const order = await writeOrder(tx, {
      organizationId,
      clientId,
      creator: { createdBy: userId },
      currency: evaluated.currency,
      lines: evaluated.lines.map((line) => ({
        position: line.position,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: line.total,
        units: line.serials.map((_, index) => ({
          unitId: resolved.units.get(line.position)![index]!.id,
          unitPrice: line.unitPrices[index]!,
        })),
      })),
      total: evaluated.total,
    });
    return { ok: true, order };
  });
}

export function priceConflicts(
  lines: {
    position: number;
    productId: string;
    price: ProductPrice;
    lineTotal: Money | null;
  }[],
): LinePriceConflict[] {
  return lines.map((line) => ({
    position: line.position,
    productId: line.productId,
    price: line.price,
    lineTotal: line.lineTotal === null ? null : moneyToDatabase(line.lineTotal),
  }));
}

type WritableLine = {
  position: number;
  productId: string;
  quantity: Quantity;
  // En centésimos (brief-29.5.2, D-2: en una línea por unidad, el común de sus unidades o el del
  // producto).
  unitPrice: Money;
  total: Money;
  // Las unidades elegidas, con su precio; vacío en un producto por cantidad y en el pedido del agente.
  units: { unitId: string; unitPrice: Money }[];
};

// La escritura del alta, común a la app y al agente (brief-19.4, D-7): el número al final, para
// retener el contador lo menos posible (ADR 0020, punto 6), la cabecera, las líneas y la auditoría,
// con el autor como actor. Se llama con todas las reglas ya cumplidas: un rechazo nunca llega acá.
async function writeOrder(
  tx: DbTransaction,
  input: {
    organizationId: string;
    clientId: string;
    creator: repository.OrderCreator;
    currency: string;
    lines: WritableLine[];
    total: Money;
  },
): Promise<{ id: string; number: number; displayNumber: string }> {
  const { organizationId, clientId, creator, currency } = input;
  const number = await nextDocumentNumber(tx, organizationId, "order");
  const order = await repository.insertOrder(tx, {
    organizationId,
    number,
    clientId,
    currency,
    total: moneyToDatabase(input.total),
    ...creator,
  });
  const newLines = input.lines.map((line) => ({
    productId: line.productId,
    position: line.position,
    quantity: quantityToDatabase(line.quantity),
    unitPrice: moneyToDatabase(line.unitPrice),
    currency,
    lineTotal: moneyToDatabase(line.total),
  }));
  const inserted = await repository.insertOrderLines(
    tx,
    organizationId,
    order.id,
    newLines,
  );
  const lineIds = new Map(inserted.map((line) => [line.position, line.id]));
  await repository.insertOrderLineUnits(
    tx,
    organizationId,
    input.lines.flatMap((line) =>
      line.units.map((unit) => ({
        orderLineId: lineIds.get(line.position)!,
        productId: line.productId,
        unitId: unit.unitId,
        unitPrice: moneyToDatabase(unit.unitPrice),
      })),
    ),
  );
  const unitIds = new Map(
    input.lines.map((line) => [
      line.position,
      line.units.map((unit) => unit.unitId),
    ]),
  );
  // Solo ids, cantidades, montos y estado: ningún dato del cliente (brief-19.2, D-11). audit
  // admite valores planos, así que cada línea va con sus claves numeradas.
  await recordAudit(tx, {
    organizationId,
    ...("createdBy" in creator
      ? { actorUserId: creator.createdBy }
      : { actorCredentialId: creator.createdByCredentialId }),
    entityType: "order",
    entityId: order.id,
    action: "create",
    diff: {
      before: null,
      after: {
        number: order.number,
        status: order.status,
        client_id: clientId,
        currency,
        total: order.total,
        lines: newLines.length,
        ...Object.fromEntries(
          newLines.flatMap((line) => [
            [`line_${line.position}_product_id`, line.productId],
            [`line_${line.position}_quantity`, line.quantity],
            [`line_${line.position}_unit_price`, line.unitPrice],
            [`line_${line.position}_total`, line.lineTotal],
            // Desde la 29.5.2, solo en una línea por unidad: los ids de sus unidades, sin el IMEI.
            ...(unitIds.get(line.position)!.length > 0
              ? [
                  [
                    `line_${line.position}_unit_ids`,
                    unitIds.get(line.position)!.join(","),
                  ],
                ]
              : []),
          ]),
        ),
      },
    },
  });
  return {
    id: order.id,
    number: order.number,
    displayNumber: formatOrderNumber(order.number),
  };
}

// El pendiente que deja el agente (ADR 0020, punto 9; brief-19.4). La transacción y el ledger son de
// ingestion, que ya validó el evento: el teléfono en E.164 canónico, de 1 a 10 líneas con un uuid
// cada una, sin productos repetidos, y cantidades mayores que cero (D-1 a D-3). La credencial es el
// actor. Las reglas son las del alta de la app, sin el precio esperado (el agente no manda precios),
// con una sola respuesta en el orden de D-6: primero el cliente y después las líneas en su orden.
// Ninguna regla escribe, así que un rechazo no consume un número. No mira el stock (D-8).

export type AgentOrderRule =
  | "client_not_found"
  | "client_inactive"
  | "product_not_found"
  | "product_without_price"
  | "currency_mismatch"
  | "amount_out_of_range";

export type AgentOrderLineInput = { productId: string; quantity: string };

export type PlaceAgentOrderResult =
  | { ok: true; order: { number: number; displayNumber: string } }
  | { ok: false; rule: AgentOrderRule };

export async function placeOrderFromIngestion(
  tx: DbTransaction,
  input: {
    organizationId: string;
    credentialId: string;
    ingestionEventId: string;
    phoneE164: string;
    lines: AgentOrderLineInput[];
  },
): Promise<PlaceAgentOrderResult> {
  const { organizationId } = input;
  const lines = input.lines.map((line, index) => {
    const quantity = parseQuantityInput(line.quantity);
    if (quantity === null || quantity === 0n) {
      throw new Error("Una cantidad que el contrato no debía aceptar.");
    }
    return {
      position: index + 1,
      productId: line.productId.toLowerCase(),
      quantity,
    };
  });
  const reject = (rule: AgentOrderRule): PlaceAgentOrderResult => ({
    ok: false,
    rule,
  });

  // El mismo orden de bloqueo que el alta de la app: el cliente, los productos por id y, al
  // final, el contador.
  const client = await lockClientForOrderByPhone(
    tx,
    organizationId,
    input.phoneE164,
  );
  if (client.status === "not_found") return reject("client_not_found");
  if (client.status === "inactive") return reject("client_inactive");

  const products = await lockProductsForOrder(
    tx,
    organizationId,
    lines.map((line) => line.productId),
  );
  // Una moneda por pedido, la de la primera línea (ADR 0019, punto 3). Si la primera falla, se
  // responde su regla antes de mirar la moneda de las demás.
  let currency: string | null = null;
  let decimals = 0;
  const writable: WritableLine[] = [];
  for (const line of lines) {
    const product = products.get(line.productId);
    // Inexistente, de otra organización o inactivo, sin distinguir, como la lectura (D-6). Desde la
    // 29.5, también un producto por unidad, y sigue así en la 29.5.2: el agente no ve IMEI ni puede
    // elegir unidades, y su contrato no cambia; pedir por unidad desde el agente es de la 29.8
    // (brief-29.5, D-1 y D-7; brief-29.5.2, D-1 y D-6).
    if (!product || !product.isActive || product.tracking === "unit") {
      return reject("product_not_found");
    }
    if (!product.price) return reject("product_without_price");
    if (currency === null) {
      currency = product.price.currency;
      const found = currencyDecimals(currency);
      if (!found.ok) {
        throw new Error("Un precio guardado en una moneda que no se acepta.");
      }
      decimals = found.decimals;
    }
    if (product.price.currency !== currency) {
      return reject("currency_mismatch");
    }
    const total = computeLineTotal(
      moneyFromDatabase(product.price.amount),
      line.quantity,
      decimals,
    );
    if (!total.ok) return reject("amount_out_of_range");
    writable.push({
      ...line,
      unitPrice: moneyFromDatabase(product.price.amount),
      total: total.total,
      units: [],
    });
  }
  const orderTotal = sumLineTotals(writable.map((line) => line.total));
  if (orderTotal === null) return reject("amount_out_of_range");

  const order = await writeOrder(tx, {
    organizationId,
    clientId: client.clientId,
    creator: {
      createdByCredentialId: input.credentialId,
      ingestionEventId: input.ingestionEventId,
    },
    currency: currency!,
    lines: writable,
    total: orderTotal,
  });
  return {
    ok: true,
    order: { number: order.number, displayNumber: order.displayNumber },
  };
}

// El pedido que creó un evento, para responder su reenvío sin escribir (D-6). Null si el evento no
// creó ninguno, que no debería pasar con un evento procesado.
export async function findOrderPlacedByIngestion(
  tx: DbTransaction,
  organizationId: string,
  ingestionEventId: string,
): Promise<{ number: number; displayNumber: string } | null> {
  const number = await repository.findOrderNumberByIngestionEvent(
    tx,
    organizationId,
    ingestionEventId,
  );
  return number === undefined
    ? null
    : { number, displayNumber: formatOrderNumber(number) };
}

// Las transiciones (ADR 0020, punto 4; brief-19.3): solo admin. Orden de bloqueo del punto 6: la
// cabecera FOR UPDATE; si la transición toca stock, los productos en modo compartido por id
// (catalog) y después sus saldos en el mismo orden (inventory). Cancelar un pendiente no toca el
// stock, así que no lee productos ni saldos. Ninguna transición bloquea ni lee al cliente.

export type OrderTransition = "confirm" | "deliver" | "cancel";

// Origen permitido y estado de destino de cada transición.
const TRANSITIONS: Record<
  OrderTransition,
  { from: OrderStatus[]; to: repository.TargetStatus }
> = {
  confirm: { from: ["pending"], to: "confirmed" },
  deliver: { from: ["confirmed"], to: "delivered" },
  cancel: { from: ["pending", "confirmed"], to: "cancelled" },
};

export type OrderLineRef = { position: number; productId: string };

export type OrderTransitionResult =
  | { ok: true; changed: boolean }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "invalid_transition"; status: OrderStatus }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "inactive_product"; lines: OrderLineRef[] }
    >
  // Desde la 29.5: un pedido pendiente de un producto que después pasó a llevarse por unidad no se
  // confirma (brief-29.5, D-1). Desde la 29.5.2, solo si su línea no tiene unidades: se creó cuando el
  // producto se llevaba por cantidad (brief-29.5.2, D-3).
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "unit_tracked"; lines: OrderLineRef[] }
    >
  // Desde la 29.5.2: una unidad del pedido ya no está disponible al confirmar (brief-29.5.2, D-1).
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      {
        rule: "units_unavailable";
        units: (OrderLineRef & { serial: string; status: UnitStatus })[];
      }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      {
        rule: "insufficient_stock";
        lines: (OrderLineRef & { requested: string; available: string })[];
      }
    >;

export type CancelOrderResult = OrderTransitionResult;

type TransitionRejection = Exclude<OrderTransitionResult, { ok: true }>;

// Un rechazo después de bloquear saldos se lanza para revertir la transacción entera: lockBalance
// pudo crear filas en 0 (brief-19.3, AC-3: un rechazo no escribe nada).
class TransitionRejected extends Error {
  constructor(readonly result: TransitionRejection) {
    super(result.code);
    this.name = "TransitionRejected";
  }
}

// Los ids de las unidades de cada línea que tiene, por id de línea; una línea sin unidades no está.
async function lineUnitIds(
  organizationId: string,
  lineIds: string[],
  executor?: DbTransaction,
): Promise<Map<string, string[]>> {
  const rows = await repository.findOrderLineUnits(
    organizationId,
    lineIds,
    executor,
  );
  const byLine = new Map<string, string[]>();
  for (const row of rows) {
    byLine.set(row.orderLineId, [
      ...(byLine.get(row.orderLineId) ?? []),
      row.unitId,
    ]);
  }
  return byLine;
}

async function transitionOrder(
  context: AuthContext,
  orderId: string,
  transition: OrderTransition,
): Promise<OrderTransitionResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(orderId).success) return failure("VALIDATION_ERROR");
  const { organizationId, userId } = context;
  const { from, to } = TRANSITIONS[transition];

  try {
    return await repository.withTransaction(
      async (tx): Promise<OrderTransitionResult> => {
        const order = await repository.findOrder(organizationId, orderId, tx, {
          forUpdate: true,
        });
        if (!order) return failure("NOT_FOUND");
        // Repetir una transición no escribe ni audita (brief-19.3, D-4).
        if (order.status === to) return { ok: true, changed: false };
        if (!from.includes(order.status)) {
          return {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "invalid_transition",
            status: order.status,
          };
        }

        if (order.status === "confirmed" || to === "confirmed") {
          const lines = await repository.findOrderLines(
            organizationId,
            order.id,
            tx,
          );
          // Las unidades elegidas al crear (brief-29.5.2, D-1): confirmar reserva exactamente estas,
          // cancelar las libera y entregar las vende.
          const unitIdsByLine = await lineUnitIds(
            organizationId,
            lines.map((line) => line.id),
            tx,
          );
          const stockLines: StockLine[] = lines.map((line) => {
            const unitIds = unitIdsByLine.get(line.id);
            return {
              productId: line.productId,
              quantity: line.quantity,
              ...(unitIds ? { unitIds } : {}),
            };
          });
          const positions = new Map(
            lines.map((line) => [line.productId, line.position]),
          );
          const products = await lockProductsForOrder(
            tx,
            organizationId,
            lines.map((line) => line.productId),
          );

          if (to === "confirmed") {
            // Solo confirmar mira si el producto está activo: cancelar y entregar tienen que poder
            // liberar siempre (ADR 0020, punto 4).
            const inactive = lines.filter(
              (line) => products.get(line.productId)?.isActive !== true,
            );
            if (inactive.length > 0) {
              return {
                ok: false,
                code: "BUSINESS_RULE_VIOLATION",
                rule: "inactive_product",
                lines: inactive.map((line) => ({
                  position: line.position,
                  productId: line.productId,
                })),
              };
            }
            const unitTracked = lines.filter(
              (line) =>
                products.get(line.productId)?.tracking === "unit" &&
                !unitIdsByLine.has(line.id),
            );
            if (unitTracked.length > 0) {
              return {
                ok: false,
                code: "BUSINESS_RULE_VIOLATION",
                rule: "unit_tracked",
                lines: unitTracked.map((line) => ({
                  position: line.position,
                  productId: line.productId,
                })),
              };
            }
            const reserved = await reserveStock(tx, organizationId, stockLines);
            if (!reserved.ok && reserved.reason === "units_unavailable") {
              const lineOfUnit = new Map(
                lines.flatMap((line) =>
                  (unitIdsByLine.get(line.id) ?? []).map((unitId) => [
                    unitId,
                    line,
                  ]),
                ),
              );
              throw new TransitionRejected({
                ok: false,
                code: "BUSINESS_RULE_VIOLATION",
                rule: "units_unavailable",
                units: reserved.units
                  .map((unit) => {
                    const line = lineOfUnit.get(unit.id)!;
                    return {
                      position: line.position,
                      productId: line.productId,
                      serial: unit.serial,
                      status: unit.status,
                    };
                  })
                  .sort(
                    (a, b) =>
                      a.position - b.position ||
                      a.serial.localeCompare(b.serial),
                  ),
              });
            }
            if (!reserved.ok) {
              throw new TransitionRejected({
                ok: false,
                code: "BUSINESS_RULE_VIOLATION",
                rule: "insufficient_stock",
                lines: reserved.shortages
                  .map((shortage) => ({
                    position: positions.get(shortage.productId)!,
                    productId: shortage.productId,
                    requested: shortage.requested,
                    available: shortage.available,
                  }))
                  .sort((a, b) => a.position - b.position),
              });
            }
          } else if (to === "delivered") {
            await deliverStock(tx, {
              organizationId,
              lines: stockLines,
              reason: `Entrega del pedido ${formatOrderNumber(order.number)}`,
              createdBy: userId,
            });
          } else {
            await releaseStock(tx, organizationId, stockLines);
          }
        }

        await repository.updateOrderStatus(tx, organizationId, order.id, to);
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "order",
          entityId: order.id,
          action: "status_change",
          diff: { before: { status: order.status }, after: { status: to } },
        });
        return { ok: true, changed: true };
      },
    );
  } catch (error) {
    if (error instanceof TransitionRejected) return error.result;
    throw error;
  }
}

// El pedido para su venta (brief-20.2; ADR 0021, punto 3). sales le pasa su transacción; orders
// bloquea la cabecera FOR UPDATE, como una transición, y devuelve el pedido con sus líneas en su
// orden. Es una lectura con bloqueo: no escribe nada ni cambia el estado, y no autoriza, porque la
// emisión ya lo hizo. Dos emisiones del mismo pedido se serializan en esta fila. Null si el pedido
// no existe en la organización.

export type OrderForSale = {
  id: string;
  number: number;
  status: OrderStatus;
  clientId: string;
  currency: string;
  total: string;
  lines: {
    position: number;
    productId: string;
    quantity: string;
    unitPrice: string;
    currency: string;
    lineTotal: string;
    // Desde la 29.5.2: las unidades de la línea, con su precio; la venta las copia (brief-29.5.2,
    // D-3). Vacío en una línea por cantidad.
    units: { unitId: string; unitPrice: string }[];
  }[];
};

export async function lockOrderForSale(
  tx: DbTransaction,
  organizationId: string,
  orderId: string,
): Promise<OrderForSale | null> {
  const order = await repository.findOrder(organizationId, orderId, tx, {
    forUpdate: true,
  });
  if (!order) return null;
  const lines = await repository.findOrderLines(organizationId, order.id, tx);
  const units = await repository.findOrderLineUnits(
    organizationId,
    lines.map((line) => line.id),
    tx,
  );
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    clientId: order.clientId,
    currency: order.currency,
    total: order.total,
    lines: lines.map((line) => ({
      position: line.position,
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      currency: line.currency,
      lineTotal: line.lineTotal,
      units: units
        .filter((unit) => unit.orderLineId === line.id)
        .map(({ unitId, unitPrice }) => ({ unitId, unitPrice })),
    })),
  };
}

// El pedido para su seña (brief-21.4, D-2; ADR 0022, puntos 4, 5 y 13). Lo usa cash con su
// transacción, después del bloqueo de cobros y ya autorizado, por eso no recibe AuthContext. Es la
// función hermana de lockOrderForSale, sin las líneas, que la seña no usa (brief-21.4, H-3):
// lockOrderForReceipt bloquea la cabecera FOR UPDATE, como una transición, así que una seña y una
// transición del mismo pedido se serializan en esta fila (H-6); getOrderForReceipt y
// listClientOrdersForAccount leen sin bloquear, para las lecturas y la cuenta del cliente. Ninguna
// escribe. Un id que no es uuid no encuentra nada.

export type OrderForReceipt = {
  id: string;
  number: number;
  displayNumber: string;
  status: OrderStatus;
  clientId: string;
  currency: string;
  // Con la escala de la base ("1234.50").
  total: string;
  createdAt: Date;
};

function orderForReceipt(row: repository.OrderRow): OrderForReceipt {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatOrderNumber(row.number),
    status: row.status,
    clientId: row.clientId,
    currency: row.currency,
    total: row.total,
    createdAt: row.createdAt,
  };
}

export async function lockOrderForReceipt(
  tx: DbTransaction,
  organizationId: string,
  orderId: string,
): Promise<OrderForReceipt | null> {
  if (!idSchema.safeParse(orderId).success) return null;
  const row = await repository.findOrder(
    organizationId,
    orderId.toLowerCase(),
    tx,
    { forUpdate: true },
  );
  return row ? orderForReceipt(row) : null;
}

export async function getOrderForReceipt(
  tx: DbTransaction,
  organizationId: string,
  orderId: string,
): Promise<OrderForReceipt | null> {
  if (!idSchema.safeParse(orderId).success) return null;
  const row = await repository.findOrder(
    organizationId,
    orderId.toLowerCase(),
    tx,
  );
  return row ? orderForReceipt(row) : null;
}

// Todos los pedidos del cliente, de todos los estados, del más viejo al más nuevo.
export async function listClientOrdersForAccount(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
): Promise<OrderForReceipt[]> {
  if (!idSchema.safeParse(clientId).success) return [];
  const rows = await repository.findClientOrders(
    tx,
    organizationId,
    clientId.toLowerCase(),
  );
  return rows.map(orderForReceipt);
}

// Los pedidos de unos ids, de cualquier cliente, para la lista de deudores (brief-21.6, D-6). cash
// pasa solo los pedidos con señas; de a 1000, para no acercarse al tope de parámetros de una sentencia.
// Un id que no es uuid no encuentra nada.
const ORDERS_FOR_ACCOUNTS_CHUNK = 1000;

export async function getOrdersForAccountsByIds(
  tx: DbTransaction,
  organizationId: string,
  ids: string[],
): Promise<OrderForReceipt[]> {
  const valid = [
    ...new Set(
      ids
        .filter((id) => idSchema.safeParse(id).success)
        .map((id) => id.toLowerCase()),
    ),
  ];
  const found: OrderForReceipt[] = [];
  for (
    let start = 0;
    start < valid.length;
    start += ORDERS_FOR_ACCOUNTS_CHUNK
  ) {
    const rows = await repository.findOrdersByIds(
      tx,
      organizationId,
      valid.slice(start, start + ORDERS_FOR_ACCOUNTS_CHUNK),
    );
    found.push(...rows.map(orderForReceipt));
  }
  return found;
}

// Confirmar reserva el stock de cada línea, o nada si alguna no alcanza.
export function confirmOrder(
  context: AuthContext,
  orderId: string,
): Promise<OrderTransitionResult> {
  return transitionOrder(context, orderId, "confirm");
}

// Entregar descuenta el stock con un movimiento por línea y libera lo reservado.
export function deliverOrder(
  context: AuthContext,
  orderId: string,
): Promise<OrderTransitionResult> {
  return transitionOrder(context, orderId, "deliver");
}

// Cancelar un pendiente no toca el stock; cancelar un confirmado libera lo reservado.
export function cancelOrder(
  context: AuthContext,
  orderId: string,
): Promise<OrderTransitionResult> {
  return transitionOrder(context, orderId, "cancel");
}

// Lecturas: admin y viewer (ADR 0020, punto 8). Los nombres de los clientes y de los productos se
// componen en memoria por sus interfaces, sin JOIN; el contacto del cliente sale de crm ya
// resuelto para el rol. Ningún pedido muestra costo ni margen.

export type OrderSummary = {
  id: string;
  number: number;
  displayNumber: string;
  clientId: string;
  // Null si el cliente no se pudo leer; no debería pasar, por la clave foránea.
  clientName: string | null;
  lineCount: number;
  total: string;
  currency: string;
  status: OrderStatus;
  // La credencial del agente que lo dejó, o null si lo creó un usuario (brief-19.4, D-11).
  createdByCredentialId: string | null;
  createdAt: Date;
};

export type OrderStatusFilter = "all" | OrderStatus;

export type OrderListFilters = {
  status: OrderStatusFilter;
  clientId: string | null;
  // Lo que escribió quien busca; vacío no filtra.
  number: string;
  page: number;
};

export type OrderPage = {
  ok: true;
  orders: OrderSummary[];
  total: number;
  page: number;
  pageCount: number;
};

async function summarize(
  context: AuthContext,
  rows: repository.OrderListRow[],
): Promise<OrderSummary[]> {
  const found = await getClientsByIds(context, [
    ...new Set(rows.map((row) => row.clientId)),
  ]);
  const names = new Map(
    found.ok
      ? found.clients.map((client) => [client.id, client.displayName])
      : [],
  );
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    displayNumber: formatOrderNumber(row.number),
    clientId: row.clientId,
    clientName: names.get(row.clientId) ?? null,
    lineCount: row.lineCount,
    total: row.total,
    currency: row.currency,
    status: row.status,
    createdByCredentialId: row.createdByCredentialId,
    createdAt: row.createdAt,
  }));
}

const EMPTY_PAGE = { orders: [], total: 0, page: 1, pageCount: 1 } as const;

export async function listOrders(
  context: AuthContext,
  filters: OrderListFilters,
): Promise<OrderPage | Failure<"FORBIDDEN">> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  // Un cliente o un número que no pueden existir no traen pedidos: la lista queda vacía.
  const clientId = filters.clientId?.trim().toLowerCase() || null;
  if (clientId !== null && !idSchema.safeParse(clientId).success) {
    return { ok: true, ...EMPTY_PAGE, orders: [] };
  }
  const numberText = filters.number.trim();
  const number = numberText === "" ? null : parseOrderNumberSearch(numberText);
  if (numberText !== "" && number === null) {
    return { ok: true, ...EMPTY_PAGE, orders: [] };
  }
  const query: repository.OrderListQuery = {
    organizationId: context.organizationId,
    statuses: filters.status === "all" ? null : [filters.status],
    clientId,
    number,
  };
  const total = await repository.countOrders(query);
  const pageCount = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await repository.findOrders(
          query,
          ORDERS_PAGE_SIZE,
          (page - 1) * ORDERS_PAGE_SIZE,
        );
  return {
    ok: true,
    orders: await summarize(context, rows),
    total,
    page,
    pageCount,
  };
}

// Los últimos pedidos de un cliente, para la tarjeta de su ficha (brief-19.2, D-8).
export async function listRecentClientOrders(
  context: AuthContext,
  clientId: string,
): Promise<
  | { ok: true; orders: OrderSummary[]; total: number }
  | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(clientId).success) return failure("VALIDATION_ERROR");
  const query: repository.OrderListQuery = {
    organizationId: context.organizationId,
    statuses: null,
    clientId: clientId.toLowerCase(),
    number: null,
  };
  const total = await repository.countOrders(query);
  const rows =
    total === 0
      ? []
      : await repository.findOrders(query, CLIENT_ORDERS_LIMIT, 0);
  return { ok: true, orders: await summarize(context, rows), total };
}

export type OrderLine = {
  position: number;
  productId: string;
  // El nombre y el SKU de hoy, no los de cuando se creó el pedido: la línea no los copia
  // (brief-19.2, H-4).
  product: {
    name: string;
    sku: string;
    unit: string;
    isActive: boolean;
  } | null;
  quantity: string;
  unitPrice: string;
  currency: string;
  lineTotal: string;
  // Lo disponible hoy, solo en un pendiente (brief-19.3, D-9); null en los demás estados.
  available: string | null;
  // Desde la 29.5.2: las unidades de la línea, por IMEI, con su precio y su estado de hoy; en un
  // pendiente, una que no está available hace que confirmar se rechace (brief-29.5.2, D-5).
  units: OrderLineUnit[];
};

export type OrderLineUnit = {
  unitId: string;
  // Vacío si la unidad no se pudo leer; no debería pasar, por la clave foránea.
  serial: string;
  unitPrice: string;
  status: UnitStatus | null;
};

// Las unidades de unas líneas con su IMEI y su estado, ordenadas por IMEI. orders o sales ya
// autorizaron. Lo usa también la venta, que guarda las mismas filas en sale_line_units.
export async function describeLineUnits(
  organizationId: string,
  rows: { lineId: string; unitId: string; unitPrice: string }[],
): Promise<Map<string, OrderLineUnit[]>> {
  const summaries = await getUnitSummaries(
    organizationId,
    rows.map((row) => row.unitId),
  );
  const byLine = new Map<string, OrderLineUnit[]>();
  for (const row of rows) {
    const summary = summaries.get(row.unitId);
    byLine.set(row.lineId, [
      ...(byLine.get(row.lineId) ?? []),
      {
        unitId: row.unitId,
        serial: summary?.serial ?? "",
        unitPrice: row.unitPrice,
        status: summary?.status ?? null,
      },
    ]);
  }
  for (const units of byLine.values()) {
    units.sort((a, b) => a.serial.localeCompare(b.serial));
  }
  return byLine;
}

export type OrderDetail = {
  id: string;
  number: number;
  displayNumber: string;
  // El cliente como lo entrega crm para el rol: sin teléfono ni contacto para un viewer.
  client: Client | null;
  clientId: string;
  currency: string;
  total: string;
  status: OrderStatus;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  // Como en OrderSummary (brief-19.4, D-11).
  createdByCredentialId: string | null;
  createdAt: Date;
  lines: OrderLine[];
};

export async function getOrder(
  context: AuthContext,
  orderId: string,
): Promise<
  | { ok: true; order: OrderDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(orderId).success) return failure("VALIDATION_ERROR");
  const order = await repository.findOrder(context.organizationId, orderId);
  if (!order) return failure("NOT_FOUND");
  const lines = await repository.findOrderLines(
    context.organizationId,
    order.id,
  );
  const productIds = lines.map((line) => line.productId);
  const [clients, products, available, unitRows] = await Promise.all([
    getClientsByIds(context, [order.clientId]),
    getProductsByIds(context, productIds),
    order.status === "pending"
      ? getAvailableStock(context, productIds)
      : Promise.resolve(null),
    repository.findOrderLineUnits(
      context.organizationId,
      lines.map((line) => line.id),
    ),
  ]);
  const units = await describeLineUnits(
    context.organizationId,
    unitRows.map((row) => ({
      lineId: row.orderLineId,
      unitId: row.unitId,
      unitPrice: row.unitPrice,
    })),
  );
  const productsById = new Map(
    products.ok
      ? products.products.map((product) => [product.id, product])
      : [],
  );
  return {
    ok: true,
    order: {
      id: order.id,
      number: order.number,
      displayNumber: formatOrderNumber(order.number),
      client: clients.ok ? (clients.clients[0] ?? null) : null,
      clientId: order.clientId,
      currency: order.currency,
      total: order.total,
      status: order.status,
      confirmedAt: order.confirmedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      createdByCredentialId: order.createdByCredentialId,
      createdAt: order.createdAt,
      lines: lines.map((line) => {
        const product = productsById.get(line.productId);
        return {
          position: line.position,
          productId: line.productId,
          product: product
            ? {
                name: product.name,
                sku: product.sku,
                unit: product.unit,
                isActive: product.isActive,
              }
            : null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          currency: line.currency,
          lineTotal: line.lineTotal,
          available: available?.ok
            ? (available.available.get(line.productId) ?? null)
            : null,
          units: units.get(line.id) ?? [],
        };
      }),
    },
  };
}

// La historia del pedido, solo para admin (brief-19.2, D-12), como la de productos y clientes.

export type OrderAuditEntry = NamedAuditLogEntry;

export type OrderAuditResult =
  | {
      ok: true;
      entries: OrderAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function listOrderAudit(
  context: AuthContext,
  orderId: string,
  page: number,
): Promise<OrderAuditResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(orderId).success) return failure("VALIDATION_ERROR");
  const order = await repository.findOrder(context.organizationId, orderId);
  if (!order) return failure("NOT_FOUND");

  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["order"],
    entityId: order.id,
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

// El pedido confirmado o entregado de cada unidad, para la ficha de unidades del producto
// (brief-29.5.2, D-5). Los dos roles. Una unidad sin pedido activo no está.
export async function getUnitOrders(
  context: AuthContext,
  unitIds: string[],
): Promise<
  | { ok: true; orders: Map<string, { id: string; displayNumber: string }> }
  | Failure<"FORBIDDEN">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const valid = unitIds.filter((id) => idSchema.safeParse(id).success);
  const rows = await repository.findActiveOrdersOfUnits(
    context.organizationId,
    valid,
  );
  return {
    ok: true,
    orders: new Map(
      rows.map((row) => [
        row.unitId,
        { id: row.orderId, displayNumber: formatOrderNumber(row.number) },
      ]),
    ),
  };
}
