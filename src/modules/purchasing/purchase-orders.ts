import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import { getProductsByIds, lockProductsForOrder } from "@/modules/catalog";
import { formatDocumentNumber, nextDocumentNumber } from "@/modules/numbering";
import {
  authorize,
  getMemberSummaries,
  type AuthContext,
} from "@/modules/organizations";
import { failure, type Failure } from "@/shared/errors";
import { currencyDecimals, moneyToDatabase } from "@/shared/money";
import { quantityToDatabase } from "@/shared/quantity";
import {
  evaluatePurchaseOrderLines,
  parsePurchaseOrderLines,
  type PurchaseOrderLineInput,
  type PurchaseOrderLineIssue,
  type PurchaseOrderLineRuleIssue,
} from "./lines";
import * as orderRepository from "./purchase-order-repository";
import * as supplierRepository from "./repository";
import { MAX_PURCHASE_ORDER_LINES, purchaseOrderStatus } from "./schema";

// Casos de uso de la orden de compra (ADR 0023, puntos 3, 10, 12 y 14; brief-22.3). Solo un admin
// la lee y la escribe (punto 12): sus montos muestran el costo. purchasing es dueño de la regla:
// abre la transacción y se la pasa a catalog (los productos), numbering (el número) y audit. La
// orden no toca el stock ni el costo: eso lo hace la recepción, en la 22.4.
//
// La serialización (D-7): el alta lee el proveedor FOR SHARE, bloquea los productos en modo
// compartido ordenados por id, comprueba y toma el contador al final; la cancelación bloquea la
// cabecera FOR UPDATE y decide con lo leído. El cierre a mano y la comprobación de recepciones al
// cancelar llegan con la 22.4 (D-3).

export type PurchaseOrderStatus = orderRepository.PurchaseOrderStatus;
export const PURCHASE_ORDER_STATUSES = purchaseOrderStatus.enumValues;
export { MAX_PURCHASE_ORDER_LINES };
export const PURCHASE_ORDERS_PAGE_SIZE = 25;
export const SUPPLIER_PURCHASE_ORDERS_LIMIT = 5;

const idSchema = z.uuid();

export function formatPurchaseOrderNumber(value: number): string {
  return formatDocumentNumber("purchase_order", value);
}

// El número como lo escribe quien busca: «OC-000123», «oc000123», «000123» o «123» (D-11).
export function parsePurchaseOrderNumberSearch(text: string): number | null {
  const match = /^(?:oc-?)?0*(\d{1,15})$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// El alta (D-4 a D-9). Todo llega como texto desde el formulario y se valida acá.

export type { PurchaseOrderLineInput, PurchaseOrderLineIssue };
export type {
  PurchaseOrderLineField,
  PurchaseOrderLineRule,
  PurchaseOrderLineRuleIssue,
} from "./lines";

export type PurchaseOrderInput = {
  supplierId: string;
  currency: string;
  lines: PurchaseOrderLineInput[];
};

export type PurchaseOrderValidationFailure = Failure<
  "VALIDATION_ERROR",
  {
    reason: "supplier" | "currency" | "no_lines" | "too_many_lines" | "lines";
    lines: PurchaseOrderLineIssue[];
  }
>;

export type CreatePurchaseOrderResult =
  | { ok: true; order: { id: string; number: number; displayNumber: string } }
  | PurchaseOrderValidationFailure
  | Failure<"FORBIDDEN">
  | Failure<"NOT_FOUND", { target: "supplier" }>
  | Failure<
      "NOT_FOUND",
      { target: "products"; lines: { position: number; productId: string }[] }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "inactive_supplier" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "line_rules"; lines: PurchaseOrderLineRuleIssue[] }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "total_too_large" }>;

type ValidatedInput = {
  supplierId: string;
  currency: string;
  decimals: number;
  lines: Extract<
    ReturnType<typeof parsePurchaseOrderLines>,
    { ok: true }
  >["lines"];
};

function validatePurchaseOrderInput(
  input: PurchaseOrderInput,
): ({ ok: true } & ValidatedInput) | PurchaseOrderValidationFailure {
  const invalid = (
    reason: PurchaseOrderValidationFailure["reason"],
    lines: PurchaseOrderLineIssue[] = [],
  ): PurchaseOrderValidationFailure => ({
    ok: false,
    code: "VALIDATION_ERROR",
    reason,
    lines,
  });
  const supplierId = input.supplierId.trim().toLowerCase();
  if (!idSchema.safeParse(supplierId).success) return invalid("supplier");
  // Una de las monedas del sistema, que la persona elige (D-5): los costos se leen con sus decimales.
  const currency = input.currency.trim();
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) return invalid("currency");
  const parsed = parsePurchaseOrderLines(
    input.lines,
    MAX_PURCHASE_ORDER_LINES,
    decimals.decimals,
  );
  if (!parsed.ok) return invalid(parsed.reason, parsed.lines);
  return {
    ok: true,
    supplierId,
    currency,
    decimals: decimals.decimals,
    lines: parsed.lines,
  };
}

export async function createPurchaseOrder(
  context: AuthContext,
  input: PurchaseOrderInput,
): Promise<CreatePurchaseOrderResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validatePurchaseOrderInput(input);
  if (!validated.ok) return validated;
  const { supplierId, currency, decimals, lines } = validated;
  const { organizationId, userId } = context;

  return supplierRepository.withTransaction(
    async (tx): Promise<CreatePurchaseOrderResult> => {
      // 1. El proveedor FOR SHARE (H-4): una desactivación en curso termina antes, y se lee su estado
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

      // 2. Los productos en modo compartido, ordenados por id (D-6). El precio que también trae no
      // se mira.
      const products = await lockProductsForOrder(
        tx,
        organizationId,
        lines.map((line) => line.productId),
      );

      // 3. Las reglas de D-4, con lo bloqueado.
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

      // 4. El número al final, para retener el contador lo menos posible (ADR 0021, punto 7).
      const number = await nextDocumentNumber(
        tx,
        organizationId,
        "purchase_order",
      );
      // 5. La cabecera, las líneas y la auditoría.
      const order = await orderRepository.insertPurchaseOrder(tx, {
        organizationId,
        number,
        supplierId,
        currency,
        total: moneyToDatabase(evaluated.total),
        createdBy: userId,
      });
      const newLines = evaluated.lines.map((line) => ({
        productId: line.productId,
        position: line.position,
        quantity: quantityToDatabase(line.quantity),
        unitCost: moneyToDatabase(line.unitCost),
        lineTotal: moneyToDatabase(line.total),
      }));
      await orderRepository.insertPurchaseOrderLines(
        tx,
        organizationId,
        order.id,
        newLines,
      );
      // Solo ids, cantidades, montos y estado: ningún dato del proveedor (D-9; punto 14). audit
      // admite valores planos, así que cada línea va con sus claves numeradas, como el pedido.
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "purchase_order",
        entityId: order.id,
        action: "create",
        diff: {
          before: null,
          after: {
            number: order.number,
            status: order.status,
            supplier_id: supplierId,
            currency,
            total: order.total,
            lines: newLines.length,
            ...Object.fromEntries(
              newLines.flatMap((line) => [
                [`line_${line.position}_product_id`, line.productId],
                [`line_${line.position}_quantity`, line.quantity],
                [`line_${line.position}_unit_cost`, line.unitCost],
                [`line_${line.position}_total`, line.lineTotal],
              ]),
            ),
          },
        },
      });
      return {
        ok: true,
        order: {
          id: order.id,
          number: order.number,
          displayNumber: formatPurchaseOrderNumber(order.number),
        },
      };
    },
  );
}

// La cancelación (D-7 y D-8): la cabecera FOR UPDATE, el estado leído y el UPDATE. Una orden que ya
// no está abierta responde not_open, sin escribir ni auditar: de dos cancelaciones simultáneas, la
// segunda espera a la primera y ve cancelled (AC-5).

export type CancelPurchaseOrderResult =
  | { ok: true }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "not_open"; status: PurchaseOrderStatus }
    >;

export async function cancelPurchaseOrder(
  context: AuthContext,
  purchaseOrderId: string,
): Promise<CancelPurchaseOrderResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(purchaseOrderId).success) {
    return failure("VALIDATION_ERROR");
  }
  const id = purchaseOrderId.toLowerCase();
  const { organizationId, userId } = context;

  return supplierRepository.withTransaction(
    async (tx): Promise<CancelPurchaseOrderResult> => {
      const order = await orderRepository.findPurchaseOrder(
        organizationId,
        id,
        tx,
        { forUpdate: true },
      );
      if (!order) return failure("NOT_FOUND");
      if (order.status !== "open") {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "not_open",
          status: order.status,
        };
      }
      await orderRepository.cancelPurchaseOrderRow(tx, organizationId, id);
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "purchase_order",
        entityId: id,
        action: "status_change",
        diff: { before: { status: "open" }, after: { status: "cancelled" } },
      });
      return { ok: true };
    },
  );
}

// Lecturas: solo admin (punto 12). El nombre de los productos se compone por la interfaz de
// catalog; el del proveedor, en el mismo módulo.

export type PurchaseOrderSummary = {
  id: string;
  number: number;
  displayNumber: string;
  supplierId: string;
  supplierName: string;
  lineCount: number;
  total: string;
  currency: string;
  status: PurchaseOrderStatus;
  createdAt: Date;
};

export type PurchaseOrderStatusFilter = "all" | PurchaseOrderStatus;

export type PurchaseOrderListFilters = {
  status: PurchaseOrderStatusFilter;
  supplierId: string | null;
  // Lo que escribió quien busca; vacío no filtra.
  number: string;
  page: number;
};

export type PurchaseOrderPage = {
  ok: true;
  orders: PurchaseOrderSummary[];
  total: number;
  page: number;
  pageCount: number;
};

function summarize(
  row: orderRepository.PurchaseOrderListRow,
): PurchaseOrderSummary {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatPurchaseOrderNumber(row.number),
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    lineCount: row.lineCount,
    total: row.total,
    currency: row.currency,
    status: row.status,
    createdAt: row.createdAt,
  };
}

const EMPTY_PAGE = { orders: [], total: 0, page: 1, pageCount: 1 } as const;

export async function listPurchaseOrders(
  context: AuthContext,
  filters: PurchaseOrderListFilters,
): Promise<PurchaseOrderPage | Failure<"FORBIDDEN">> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  // Un proveedor o un número que no pueden existir no traen órdenes: la lista queda vacía.
  const supplierId = filters.supplierId?.trim().toLowerCase() || null;
  if (supplierId !== null && !idSchema.safeParse(supplierId).success) {
    return { ok: true, ...EMPTY_PAGE, orders: [] };
  }
  const numberText = filters.number.trim();
  const number =
    numberText === "" ? null : parsePurchaseOrderNumberSearch(numberText);
  if (numberText !== "" && number === null) {
    return { ok: true, ...EMPTY_PAGE, orders: [] };
  }
  const query: orderRepository.PurchaseOrderListQuery = {
    organizationId: context.organizationId,
    status: filters.status === "all" ? null : filters.status,
    supplierId,
    number,
  };
  const total = await orderRepository.countPurchaseOrders(query);
  const pageCount = Math.max(1, Math.ceil(total / PURCHASE_ORDERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await orderRepository.findPurchaseOrders(
          query,
          PURCHASE_ORDERS_PAGE_SIZE,
          (page - 1) * PURCHASE_ORDERS_PAGE_SIZE,
        );
  return { ok: true, orders: rows.map(summarize), total, page, pageCount };
}

// Las últimas órdenes de un proveedor, para su ficha (D-10).
export async function listRecentSupplierPurchaseOrders(
  context: AuthContext,
  supplierId: string,
): Promise<
  | { ok: true; orders: PurchaseOrderSummary[]; total: number }
  | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(supplierId).success) {
    return failure("VALIDATION_ERROR");
  }
  const query: orderRepository.PurchaseOrderListQuery = {
    organizationId: context.organizationId,
    status: null,
    supplierId: supplierId.toLowerCase(),
    number: null,
  };
  const total = await orderRepository.countPurchaseOrders(query);
  const rows =
    total === 0
      ? []
      : await orderRepository.findPurchaseOrders(
          query,
          SUPPLIER_PURCHASE_ORDERS_LIMIT,
          0,
        );
  return { ok: true, orders: rows.map(summarize), total };
}

export type PurchaseOrderLine = {
  position: number;
  productId: string;
  // El nombre y el SKU de hoy: la línea no los copia, como en el pedido.
  product: {
    name: string;
    sku: string;
    unit: string;
    isActive: boolean;
  } | null;
  quantity: string;
  unitCost: string;
  lineTotal: string;
};

export type PurchaseOrderDetail = {
  id: string;
  number: number;
  displayNumber: string;
  // Los datos de hoy de la ficha: la orden no los copia (punto 14). Null no debería pasar, por la
  // clave foránea.
  supplier: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    cuit: string | null;
    isActive: boolean;
  } | null;
  supplierId: string;
  currency: string;
  total: string;
  status: PurchaseOrderStatus;
  closedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  lines: PurchaseOrderLine[];
};

export async function getPurchaseOrder(
  context: AuthContext,
  purchaseOrderId: string,
): Promise<
  | { ok: true; order: PurchaseOrderDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(purchaseOrderId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const order = await orderRepository.findPurchaseOrder(
    organizationId,
    purchaseOrderId.toLowerCase(),
  );
  if (!order) return failure("NOT_FOUND");
  const [lines, supplier] = await Promise.all([
    orderRepository.findPurchaseOrderLines(organizationId, order.id),
    supplierRepository.findSupplier(organizationId, order.supplierId),
  ]);
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
    order: {
      id: order.id,
      number: order.number,
      displayNumber: formatPurchaseOrderNumber(order.number),
      supplier: supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            phone: supplier.phone,
            email: supplier.email,
            cuit: supplier.cuit,
            isActive: supplier.isActive,
          }
        : null,
      supplierId: order.supplierId,
      currency: order.currency,
      total: order.total,
      status: order.status,
      closedAt: order.closedAt,
      cancelledAt: order.cancelledAt,
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
          unitCost: line.unitCost,
          lineTotal: line.lineTotal,
        };
      }),
    },
  };
}

// La historia de la orden (D-9): «Alta» y «Cancelación».

export type PurchaseOrderAuditEntry = NamedAuditLogEntry;

export type PurchaseOrderAuditResult =
  | {
      ok: true;
      entries: PurchaseOrderAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function listPurchaseOrderAudit(
  context: AuthContext,
  purchaseOrderId: string,
  page: number,
): Promise<PurchaseOrderAuditResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(purchaseOrderId).success) {
    return failure("VALIDATION_ERROR");
  }
  const order = await orderRepository.findPurchaseOrder(
    context.organizationId,
    purchaseOrderId.toLowerCase(),
  );
  if (!order) return failure("NOT_FOUND");
  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["purchase_order"],
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
