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
  releaseStock,
  reserveStock,
  type StockLine,
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
import { computeLineTotal, sumOrderTotal } from "./line-total";
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

export type OrderLineInput = {
  productId: string;
  quantity: string;
  // Id del precio vigente que vio quien carga el pedido, o vacío si el producto no tenía precio.
  // Si cambió, la respuesta es CONFLICT y no se crea nada (brief-19.2, D-5).
  expectedPriceId: string;
};

export type OrderInput = { clientId: string; lines: OrderLineInput[] };

export type OrderLineField = "product" | "quantity" | "expectedPrice";

export type OrderValidationFailure = Failure<
  "VALIDATION_ERROR",
  {
    reason: "client" | "no_lines" | "too_many_lines" | "lines";
    lines: { position: number; field: OrderLineField }[];
  }
>;

export type OrderLineRule =
  | "inactive_product"
  | "no_price"
  | "currency_mismatch"
  | "duplicate_product"
  | "zero_total"
  | "amount_too_large";

export type OrderLineRuleIssue = {
  position: number;
  productId: string;
  rule: OrderLineRule;
};

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
  | Failure<
      "CONFLICT",
      {
        prices: {
          position: number;
          productId: string;
          price: ProductPrice | null;
        }[];
      }
    >;

type ParsedLine = {
  position: number;
  productId: string;
  quantity: Quantity;
  expectedPriceId: string | null;
};

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
  if (input.lines.length === 0) return invalid("no_lines");
  if (input.lines.length > MAX_ORDER_LINES) return invalid("too_many_lines");

  const issues: OrderValidationFailure["lines"] = [];
  const lines: ParsedLine[] = [];
  input.lines.forEach((line, index) => {
    const position = index + 1;
    // Los ids, en minúsculas: PostgreSQL los iguala, pero los productos bloqueados se buscan en un
    // Map por texto (revisión independiente de la 11.1, M-3).
    const productId = line.productId.trim().toLowerCase();
    const expected = line.expectedPriceId.trim().toLowerCase();
    const quantity = parseQuantityInput(line.quantity);
    if (!idSchema.safeParse(productId).success) {
      issues.push({ position, field: "product" });
    } else if (quantity === null || quantity === 0n) {
      issues.push({ position, field: "quantity" });
    } else if (expected !== "" && !idSchema.safeParse(expected).success) {
      issues.push({ position, field: "expectedPrice" });
    } else {
      lines.push({
        position,
        productId,
        quantity,
        expectedPriceId: expected === "" ? null : expected,
      });
    }
  });
  if (issues.length > 0) return invalid("lines", issues);
  return { ok: true, clientId, lines };
}

// Un producto va en una sola línea (ADR 0020, punto 3): se rechaza cada repetición, no la primera.
function duplicateLines(lines: ParsedLine[]): OrderLineRuleIssue[] {
  const seen = new Set<string>();
  return lines.flatMap((line) => {
    if (seen.has(line.productId)) {
      return [
        {
          position: line.position,
          productId: line.productId,
          rule: "duplicate_product" as const,
        },
      ];
    }
    seen.add(line.productId);
    return [];
  });
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
    const missing = lines.filter((line) => !products.has(line.productId));
    if (missing.length > 0) {
      return {
        ok: false,
        code: "NOT_FOUND",
        target: "products",
        lines: missing.map(({ position, productId }) => ({
          position,
          productId,
        })),
      };
    }

    const unusable = lines.flatMap((line): OrderLineRuleIssue[] => {
      const product = products.get(line.productId)!;
      const { position, productId } = line;
      if (!product.isActive) {
        return [{ position, productId, rule: "inactive_product" }];
      }
      if (!product.price) return [{ position, productId, rule: "no_price" }];
      return [];
    });
    if (unusable.length > 0) return lineRules(unusable);

    // El precio que vio quien carga el pedido tiene que seguir vigente (D-5).
    const changed = lines.filter(
      (line) =>
        products.get(line.productId)!.price!.id !== line.expectedPriceId,
    );
    if (changed.length > 0) {
      return {
        ok: false,
        code: "CONFLICT",
        prices: changed.map(({ position, productId }) => ({
          position,
          productId,
          price: products.get(productId)!.price,
        })),
      };
    }

    // Una moneda por pedido, la de la primera línea (ADR 0019, punto 3).
    const priced = lines.map((line) => ({
      ...line,
      price: products.get(line.productId)!.price!,
    }));
    const currency = priced[0]!.price.currency;
    const decimals = currencyDecimals(currency);
    if (!decimals.ok) {
      throw new Error("Un precio guardado en una moneda que no se acepta.");
    }
    const amountIssues: OrderLineRuleIssue[] = [];
    const totals: Money[] = [];
    for (const line of priced) {
      const { position, productId } = line;
      if (line.price.currency !== currency) {
        amountIssues.push({ position, productId, rule: "currency_mismatch" });
        continue;
      }
      const total = computeLineTotal(
        moneyFromDatabase(line.price.amount),
        line.quantity,
        decimals.decimals,
      );
      if (!total.ok) {
        amountIssues.push({ position, productId, rule: total.reason });
        continue;
      }
      totals.push(total.total);
    }
    if (amountIssues.length > 0) return lineRules(amountIssues);
    const orderTotal = sumOrderTotal(totals);
    if (orderTotal === null) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "total_too_large",
      };
    }

    const order = await writeOrder(tx, {
      organizationId,
      clientId,
      creator: { createdBy: userId },
      currency,
      lines: priced.map((line, index) => ({ ...line, total: totals[index]! })),
      total: orderTotal,
    });
    return { ok: true, order };
  });
}

type WritableLine = {
  position: number;
  productId: string;
  quantity: Quantity;
  price: ProductPrice;
  total: Money;
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
    unitPrice: line.price.amount,
    currency,
    lineTotal: moneyToDatabase(line.total),
  }));
  await repository.insertOrderLines(tx, organizationId, order.id, newLines);
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
    // Inexistente, de otra organización o inactivo, sin distinguir, como la lectura (D-6).
    if (!product || !product.isActive) return reject("product_not_found");
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
    writable.push({ ...line, price: product.price, total: total.total });
  }
  const orderTotal = sumOrderTotal(writable.map((line) => line.total));
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
          const stockLines: StockLine[] = lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          }));
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
            const reserved = await reserveStock(tx, organizationId, stockLines);
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
};

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
  const [clients, products, available] = await Promise.all([
    getClientsByIds(context, [order.clientId]),
    getProductsByIds(context, productIds),
    order.status === "pending"
      ? getAvailableStock(context, productIds)
      : Promise.resolve(null),
  ]);
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
