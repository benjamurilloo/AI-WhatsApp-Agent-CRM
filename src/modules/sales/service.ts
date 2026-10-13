import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import { getProductsByIds, lockProductsForOrder } from "@/modules/catalog";
import {
  getClientsByIds,
  lockClientForOrder,
  type Client,
} from "@/modules/crm";
import { formatDocumentNumber, nextDocumentNumber } from "@/modules/numbering";
import { lockOrderForSale, type OrderStatus } from "@/modules/orders";
import {
  authorize,
  getMemberSummaries,
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
import { optionalCalendarDate } from "@/shared/calendar";
import { failure, type Failure } from "@/shared/errors";
import * as repository from "./repository";

// Casos de uso de la venta (ADR 0021; brief-20.2): la emisión desde un pedido entregado, la lista
// y el detalle. sales es dueño de la regla: abre la transacción y se la pasa a orders (el pedido
// bloqueado), numbering (el número) y audit. La venta de un pedido copia sus montos y no toca el
// stock ni el estado del pedido (ADR 0021, punto 3). Ningún módulo depende de sales.

export const SALES_PAGE_SIZE = 25;

const idSchema = z.uuid();

export function formatSaleNumber(value: number): string {
  return formatDocumentNumber("sale", value);
}

// El número como lo escribe quien busca: «V-000123», «v000123», «000123» o «123».
export function parseSaleNumberSearch(text: string): number | null {
  const match = /^(?:v-?)?0*(\d{1,15})$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Emisión (ADR 0021, puntos 3 y 7; brief-20.2, D-4). Solo admin.

export type IssueSaleResult =
  | { ok: true; sale: { id: string; number: number; displayNumber: string } }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "order_not_delivered"; status: OrderStatus }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      {
        rule: "already_sold";
        sale: { id: string; number: number; displayNumber: string };
      }
    >;

function soldResult(sale: repository.SaleRow): IssueSaleResult {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "already_sold",
    sale: {
      id: sale.id,
      number: sale.number,
      displayNumber: formatSaleNumber(sale.number),
    },
  };
}

export async function issueSaleFromOrder(
  context: AuthContext,
  orderId: string,
): Promise<IssueSaleResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(orderId).success) return failure("VALIDATION_ERROR");
  const { organizationId, userId } = context;

  try {
    return await repository.withTransaction(
      async (tx): Promise<IssueSaleResult> => {
        // El orden de bloqueo (ADR 0021, punto 7, con su precisión del 2026-10-13): la cabecera del
        // pedido, el cliente y los productos y, al final, el contador. No exige que el cliente ni
        // los productos estén activos: la operación ya ocurrió.
        const order = await lockOrderForSale(tx, organizationId, orderId);
        if (!order) return failure("NOT_FOUND");
        if (order.status !== "delivered") {
          return {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "order_not_delivered",
            status: order.status,
          };
        }
        // Con el pedido bloqueado, una emisión simultánea espera acá y ve la venta ya confirmada.
        const existing = await repository.findSaleByOrder(
          organizationId,
          order.id,
          tx,
        );
        if (existing) return soldResult(existing);

        // El cliente y los productos en modo compartido, antes del contador (revisión independiente
        // de la 20.2, R-7; precisión fechada del ADR 0021, punto 7): los INSERT toman FOR KEY SHARE
        // sobre ellos por las claves foráneas, y así no los esperan con el contador tomado, por
        // ejemplo detrás de un vaciado que bloquea la ficha FOR UPDATE. Como el alta del pedido, los
        // productos van ordenados por id. No se mira si están activos: la operación ya ocurrió.
        await lockClientForOrder(tx, organizationId, order.clientId);
        await lockProductsForOrder(
          tx,
          organizationId,
          order.lines.map((line) => line.productId),
        );

        const number = await nextDocumentNumber(tx, organizationId, "sale");
        const sale = await repository.insertSale(tx, {
          organizationId,
          number,
          orderId: order.id,
          clientId: order.clientId,
          currency: order.currency,
          total: order.total,
          createdBy: userId,
        });
        await repository.insertSaleLines(
          tx,
          organizationId,
          sale.id,
          order.lines,
        );
        // Sin nombres ni textos del cliente (brief-20.2, D-7): el vaciado no tiene que alcanzar
        // la auditoría de las ventas. La auditoría solo admite valores planos: las líneas van con
        // claves numeradas, como el pedido.
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "sale",
          entityId: sale.id,
          action: "create",
          diff: {
            before: null,
            after: {
              number: sale.number,
              order_id: order.id,
              client_id: order.clientId,
              currency: sale.currency,
              total: sale.total,
              lines: order.lines.length,
              ...Object.fromEntries(
                order.lines.flatMap((line) => [
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
          ok: true,
          sale: {
            id: sale.id,
            number: sale.number,
            displayNumber: formatSaleNumber(sale.number),
          },
        };
      },
    );
  } catch (error) {
    // El bloqueo del pedido serializa las emisiones; si el índice único igual se dispara, es la
    // misma regla, no un error (brief-20.2, D-4).
    if (!repository.isOrderAlreadySold(error)) throw error;
    const existing = await repository.findSaleByOrder(organizationId, orderId);
    if (!existing) throw error;
    return soldResult(existing);
  }
}

// Lecturas: admin y viewer (ADR 0021, punto 10). Los nombres se componen en memoria por las
// interfaces de crm y catalog, sin JOIN; el contacto del cliente sale de crm ya resuelto para el
// rol. Ninguna venta muestra costo ni margen.

export type SaleSummary = {
  id: string;
  number: number;
  displayNumber: string;
  orderId: string;
  clientId: string;
  // Null si el cliente no se pudo leer; no debería pasar, por la clave foránea.
  clientName: string | null;
  lineCount: number;
  total: string;
  currency: string;
  createdAt: Date;
};

export type SaleListFilters = {
  clientId: string | null;
  // Lo que escribió quien busca; vacío no filtra.
  number: string;
  // YYYY-MM-DD o vacío.
  from: string;
  to: string;
  page: number;
};

export type SalePage = {
  ok: true;
  sales: SaleSummary[];
  total: number;
  page: number;
  pageCount: number;
};

export type SaleListField = "from" | "to";

const periodSchema = z
  .object({ from: optionalCalendarDate, to: optionalCalendarDate })
  .superRefine((values, ctx) => {
    if (values.from && values.to && values.from > values.to) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "invertido" });
    }
  });

const EMPTY_PAGE = { total: 0, page: 1, pageCount: 1 } as const;

export async function listSales(
  context: AuthContext,
  filters: SaleListFilters,
): Promise<
  | SalePage
  | Failure<"FORBIDDEN">
  | Failure<"VALIDATION_ERROR", { fields: SaleListField[] }>
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  const period = periodSchema.safeParse({ from: filters.from, to: filters.to });
  if (!period.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [
        ...new Set(
          period.error.issues.map((issue) => issue.path[0] as SaleListField),
        ),
      ],
    };
  }
  // Un cliente o un número que no pueden existir no traen ventas: la lista queda vacía.
  const clientId = filters.clientId?.trim().toLowerCase() || null;
  if (clientId !== null && !idSchema.safeParse(clientId).success) {
    return { ok: true, sales: [], ...EMPTY_PAGE };
  }
  const numberText = filters.number.trim();
  const number = numberText === "" ? null : parseSaleNumberSearch(numberText);
  if (numberText !== "" && number === null) {
    return { ok: true, sales: [], ...EMPTY_PAGE };
  }
  const query: repository.SaleListQuery = {
    organizationId: context.organizationId,
    clientId,
    number,
    from: period.data.from,
    to: period.data.to,
    timezone: await getOrganizationTimezone(context),
  };
  const total = await repository.countSales(query);
  const pageCount = Math.max(1, Math.ceil(total / SALES_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await repository.findSales(
          query,
          SALES_PAGE_SIZE,
          (page - 1) * SALES_PAGE_SIZE,
        );
  const found = await getClientsByIds(context, [
    ...new Set(rows.map((row) => row.clientId)),
  ]);
  const names = new Map(
    found.ok
      ? found.clients.map((client) => [client.id, client.displayName])
      : [],
  );
  return {
    ok: true,
    sales: rows.map((row) => ({
      id: row.id,
      number: row.number,
      displayNumber: formatSaleNumber(row.number),
      orderId: row.orderId,
      clientId: row.clientId,
      clientName: names.get(row.clientId) ?? null,
      lineCount: row.lineCount,
      total: row.total,
      currency: row.currency,
      createdAt: row.createdAt,
    })),
    total,
    page,
    pageCount,
  };
}

export type SaleLine = {
  position: number;
  productId: string;
  // El nombre y el SKU de hoy: la línea no los copia (brief-20.2, H-3).
  product: { name: string; sku: string; unit: string } | null;
  quantity: string;
  unitPrice: string;
  currency: string;
  lineTotal: string;
};

export type SaleDetail = {
  id: string;
  number: number;
  displayNumber: string;
  orderId: string;
  // El cliente como lo entrega crm para el rol: sin teléfono ni contacto para un viewer.
  client: Client | null;
  clientId: string;
  currency: string;
  total: string;
  createdAt: Date;
  lines: SaleLine[];
};

export async function getSale(
  context: AuthContext,
  saleId: string,
): Promise<
  | { ok: true; sale: SaleDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(saleId).success) return failure("VALIDATION_ERROR");
  const sale = await repository.findSale(context.organizationId, saleId);
  if (!sale) return failure("NOT_FOUND");
  const lines = await repository.findSaleLines(context.organizationId, sale.id);
  const [clients, products] = await Promise.all([
    getClientsByIds(context, [sale.clientId]),
    getProductsByIds(
      context,
      lines.map((line) => line.productId),
    ),
  ]);
  const productsById = new Map(
    products.ok
      ? products.products.map((product) => [product.id, product])
      : [],
  );
  return {
    ok: true,
    sale: {
      id: sale.id,
      number: sale.number,
      displayNumber: formatSaleNumber(sale.number),
      orderId: sale.orderId,
      client: clients.ok ? (clients.clients[0] ?? null) : null,
      clientId: sale.clientId,
      currency: sale.currency,
      total: sale.total,
      createdAt: sale.createdAt,
      lines: lines.map((line) => {
        const product = productsById.get(line.productId);
        return {
          position: line.position,
          productId: line.productId,
          product: product
            ? { name: product.name, sku: product.sku, unit: product.unit }
            : null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          currency: line.currency,
          lineTotal: line.lineTotal,
        };
      }),
    },
  };
}

// La venta de un pedido, para su detalle (ADR 0021, punto 9): la compone la página, nunca orders.
export async function getSaleForOrder(
  context: AuthContext,
  orderId: string,
): Promise<
  | { ok: true; sale: { id: string; displayNumber: string } | null }
  | Failure<"FORBIDDEN" | "VALIDATION_ERROR">
> {
  const authorized = authorize(context);
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(orderId).success) return failure("VALIDATION_ERROR");
  const sale = await repository.findSaleByOrder(
    context.organizationId,
    orderId.toLowerCase(),
  );
  return {
    ok: true,
    sale: sale
      ? { id: sale.id, displayNumber: formatSaleNumber(sale.number) }
      : null,
  };
}

// La historia de la venta, solo para admin (brief-20.2, D-9), como la del pedido.

export type SaleAuditEntry = NamedAuditLogEntry;

export type SaleAuditResult =
  | {
      ok: true;
      entries: SaleAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">;

export async function listSaleAudit(
  context: AuthContext,
  saleId: string,
  page: number,
): Promise<SaleAuditResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(saleId).success) return failure("VALIDATION_ERROR");
  const sale = await repository.findSale(context.organizationId, saleId);
  if (!sale) return failure("NOT_FOUND");

  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["sale"],
    entityId: sale.id,
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
