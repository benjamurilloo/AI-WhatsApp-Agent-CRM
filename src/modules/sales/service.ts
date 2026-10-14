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
  type Client,
} from "@/modules/crm";
import {
  restoreSaleStock,
  sellStock,
  type StockShortage,
} from "@/modules/inventory";
import { formatDocumentNumber, nextDocumentNumber } from "@/modules/numbering";
import {
  lockOrderForSale,
  MAX_ORDER_LINES,
  type OrderStatus,
} from "@/modules/orders";
import {
  authorize,
  getMemberSummaries,
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
import { optionalCalendarDate } from "@/shared/calendar";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  duplicateLines,
  evaluateLines,
  parseLines,
  type LineField,
  type LineInput,
  type LineRuleIssue,
  type ParsedLine,
} from "@/shared/lines";
import { moneyToDatabase } from "@/shared/money";
import { quantityToDatabase } from "@/shared/quantity";
import * as repository from "./repository";

// Casos de uso de la venta (ADR 0021; brief-20.2): la emisión desde un pedido entregado, la lista
// y el detalle. sales es dueño de la regla: abre la transacción y se la pasa a orders (el pedido
// bloqueado), numbering (el número) y audit. La venta de un pedido copia sus montos y no toca el
// stock ni el estado del pedido (ADR 0021, punto 3). Desde la 20.3, la venta sin pedido (ADR 0021,
// punto 4; brief-20.3): se arma con líneas, con las reglas de src/shared/lines, y descuenta el
// stock con la transacción que le pasa a inventory. Desde la 20.4, la anulación (ADR 0021, punto 6;
// brief-20.4): otro comprobante, que repone el stock de una venta sin pedido y deja libre el pedido
// de una venta de pedido. Desde la 21.3, cash depende de sales para leer: la venta que cobra y las
// ventas de un cliente (ADR 0022, punto 13; brief-21.3, D-4). sales no depende de cash.

export const SALES_PAGE_SIZE = 25;

const idSchema = z.uuid();

export function formatSaleNumber(value: number): string {
  return formatDocumentNumber("sale", value);
}

export function formatSaleVoidNumber(value: number): string {
  return formatDocumentNumber("sale_void", value);
}

function searchNumber(digits: string): number | null {
  const value = Number(digits);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// El número como lo escribe quien busca: «V-000123», «v000123», «000123» o «123».
export function parseSaleNumberSearch(text: string): number | null {
  const match = /^(?:v-?)?0*(\d{1,15})$/i.exec(text.trim());
  return match ? searchNumber(match[1]!) : null;
}

// El número de una anulación lleva siempre su prefijo: «A-000045» o «a45» (brief-20.4, D-8). Sin
// prefijo, el número es el de una venta.
export function parseSaleVoidNumberSearch(text: string): number | null {
  const match = /^a-?0*(\d{1,15})$/i.exec(text.trim());
  return match ? searchNumber(match[1]!) : null;
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
        // Desde la 20.4, la última venta de la cadena: si está vigente, el pedido ya está vendido; si
        // está anulada, la nueva la reemplaza (brief-20.4, D-3).
        const last = await repository.findLastSaleByOrder(
          organizationId,
          order.id,
          tx,
        );
        if (last && last.voidNumber === null) return soldResult(last);
        const replacesSaleId = last?.id ?? null;

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
          replacesSaleId,
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
              // Solo en un reemplazo: la primera venta conserva el diff de la 20.2 (brief-20.4, D-9).
              ...(replacesSaleId === null
                ? {}
                : { replaces_sale_id: replacesSaleId }),
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
    // El bloqueo del pedido serializa las emisiones; si el índice parcial o el único del reemplazo
    // igual se disparan, es la misma regla, no un error (brief-20.2, D-4; brief-20.4, D-3).
    if (!repository.isOrderAlreadySold(error)) throw error;
    const existing = await repository.findLastSaleByOrder(
      organizationId,
      orderId.toLowerCase(),
    );
    if (!existing || existing.voidNumber !== null) throw error;
    return soldResult(existing);
  }
}

// La venta sin pedido (ADR 0021, puntos 4, 5 y 7; brief-20.3). Solo admin. Todo llega como texto
// desde el formulario y se valida acá; el cliente vacío es «Consumidor final».

export type SaleInput = { clientId: string; lines: LineInput[] };

export type SaleLineField = LineField;

export type SaleValidationFailure = Failure<
  "VALIDATION_ERROR",
  {
    reason: "client" | "no_lines" | "too_many_lines" | "lines";
    lines: { position: number; field: SaleLineField }[];
  }
>;

export type SaleLineRuleIssue = LineRuleIssue;

// Lo pedido y lo disponible de cada línea que no alcanza (ADR 0021, punto 5).
export type SaleShortage = {
  position: number;
  productId: string;
  requested: string;
  available: string;
};

export type IssueSaleWithoutOrderResult =
  | { ok: true; sale: { id: string; number: number; displayNumber: string } }
  | SaleValidationFailure
  | Failure<"FORBIDDEN">
  | Failure<"NOT_FOUND", { target: "client" }>
  | Failure<
      "NOT_FOUND",
      { target: "products"; lines: { position: number; productId: string }[] }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "inactive_client" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "line_rules"; lines: SaleLineRuleIssue[] }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "total_too_large" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "insufficient_stock"; lines: SaleShortage[] }
    >
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

function validateSaleInput(
  input: SaleInput,
):
  | { ok: true; clientId: string | null; lines: ParsedLine[] }
  | SaleValidationFailure {
  const clientId = input.clientId.trim().toLowerCase();
  if (clientId !== "" && !idSchema.safeParse(clientId).success) {
    return { ok: false, code: "VALIDATION_ERROR", reason: "client", lines: [] };
  }
  // El límite de líneas es el del pedido (ADR 0021, punto 4).
  const parsed = parseLines(input.lines, MAX_ORDER_LINES);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      reason: parsed.reason,
      lines: parsed.lines,
    };
  }
  return {
    ok: true,
    clientId: clientId === "" ? null : clientId,
    lines: parsed.lines,
  };
}

// Lo que no alcanza se lanza, para revertir la transacción y con ella la fila en 0 que pudo crear
// el bloqueo del saldo (convención de la 19.3; brief-20.3, D-3). Se traduce fuera de la transacción.
class InsufficientStock extends Error {
  constructor(readonly shortages: StockShortage[]) {
    super("insufficient_stock");
  }
}

export async function issueSale(
  context: AuthContext,
  input: SaleInput,
): Promise<IssueSaleWithoutOrderResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  const validated = validateSaleInput(input);
  if (!validated.ok) return validated;
  const { clientId, lines } = validated;
  const duplicates = duplicateLines(lines);
  if (duplicates.length > 0) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "line_rules",
      lines: duplicates,
    };
  }
  const { organizationId, userId } = context;

  try {
    return await repository.withTransaction(
      async (tx): Promise<IssueSaleWithoutOrderResult> => {
        // El orden de bloqueo (ADR 0021, punto 7): el cliente en modo compartido, si hay; los
        // productos en modo compartido, por id; sus saldos FOR UPDATE, en el mismo orden, dentro
        // de sellStock; y al final el contador, que se toma al armar el motivo de los movimientos.
        if (clientId !== null) {
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
        }

        const products = await lockProductsForOrder(
          tx,
          organizationId,
          lines.map((line) => line.productId),
        );
        const evaluated = evaluateLines(lines, products);
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
            // Una venta cobra lo que dice el comprobante: el precio que vio quien vende tiene que
            // seguir vigente (brief-20.3, D-4).
            case "price_changed":
              return { ok: false, code: "CONFLICT", prices: evaluated.lines };
            case "total_too_large":
              return {
                ok: false,
                code: "BUSINESS_RULE_VIOLATION",
                rule: "total_too_large",
              };
          }
        }

        // El número se toma después de comprobar lo disponible y antes de escribir los
        // movimientos, que lo llevan en el motivo. Con un rechazo, no se consume.
        let number: number | null = null;
        const sold = await sellStock(tx, {
          organizationId,
          lines: evaluated.lines.map((line) => ({
            productId: line.productId,
            quantity: quantityToDatabase(line.quantity),
          })),
          reason: async () => {
            number = await nextDocumentNumber(tx, organizationId, "sale");
            return `Venta ${formatSaleNumber(number)}`;
          },
          createdBy: userId,
        });
        if (!sold.ok) throw new InsufficientStock(sold.shortages);
        if (number === null) throw new Error("La venta no tomó su número.");

        const saleLines = evaluated.lines.map((line) => ({
          productId: line.productId,
          position: line.position,
          quantity: quantityToDatabase(line.quantity),
          unitPrice: line.price.amount,
          currency: line.price.currency,
          lineTotal: moneyToDatabase(line.total),
        }));
        const sale = await repository.insertSale(tx, {
          organizationId,
          number,
          orderId: null,
          clientId,
          currency: evaluated.currency,
          total: moneyToDatabase(evaluated.total),
          replacesSaleId: null,
          createdBy: userId,
        });
        await repository.insertSaleLines(
          tx,
          organizationId,
          sale.id,
          saleLines,
        );
        // El mismo diff de la venta de un pedido, con order_id nulo y, sin cliente, client_id
        // nulo (brief-20.3, D-8). Sin nombres ni textos del cliente.
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
              order_id: null,
              client_id: clientId,
              currency: sale.currency,
              total: sale.total,
              lines: saleLines.length,
              ...Object.fromEntries(
                saleLines.flatMap((line) => [
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
    // Sin traducir un 23505: una venta sin pedido no pasa por el índice del pedido (H-4).
    if (!(error instanceof InsufficientStock)) throw error;
    const positions = new Map(
      lines.map((line) => [line.productId, line.position]),
    );
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "insufficient_stock",
      lines: error.shortages
        .map((shortage) => ({
          position: positions.get(shortage.productId)!,
          productId: shortage.productId,
          requested: shortage.requested,
          available: shortage.available,
        }))
        .sort((a, b) => a.position - b.position),
    };
  }
}

// La anulación (ADR 0021, puntos 6 y 7; brief-20.4, D-4 a D-6). Solo admin. Anula la venta entera
// con otro comprobante, con un motivo de la lista cerrada.

export type SaleVoidReason = repository.SaleVoidReason;

export const SALE_VOID_REASONS = repository.SALE_VOID_REASONS;

type VoidReference = { id: string; number: number; displayNumber: string };

export type VoidSaleResult =
  // El pedido de la venta, si tiene: su detalle vuelve a ofrecer la emisión.
  | { ok: true; saleVoid: VoidReference; orderId: string | null }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "already_voided"; saleVoid: VoidReference }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "stock_limit"; productIds: string[] }
    >;

const reasonSchema = z.enum(repository.SALE_VOID_REASONS);

function voidReference(row: repository.SaleVoidRow): VoidReference {
  return {
    id: row.id,
    number: row.number,
    displayNumber: formatSaleVoidNumber(row.number),
  };
}

function voidedResult(row: repository.SaleVoidRow): VoidSaleResult {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "already_voided",
    saleVoid: voidReference(row),
  };
}

// Los rechazos que llegan con los saldos bloqueados se lanzan, para revertir la transacción y con
// ella la fila en 0 que pudo crear el bloqueo (convención de la 19.3). Se traducen fuera.
class AlreadyVoided extends Error {
  constructor(readonly row: repository.SaleVoidRow) {
    super("already_voided");
  }
}

class StockLimit extends Error {
  constructor(readonly productIds: string[]) {
    super("stock_limit");
  }
}

export async function voidSale(
  context: AuthContext,
  saleId: string,
  reason: string,
): Promise<VoidSaleResult> {
  const authorized = authorize(context, { role: "admin" });
  if (!authorized.ok) return authorized;
  if (!idSchema.safeParse(saleId).success) return failure("VALIDATION_ERROR");
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return failure("VALIDATION_ERROR");
  const { organizationId, userId } = context;

  // La venta se lee sin bloqueo: es inmutable, y su pedido no cambia (brief-20.4, H-7). Una venta ya
  // anulada se rechaza antes de bloquear nada.
  const sale = await repository.findSale(organizationId, saleId.toLowerCase());
  if (!sale) return failure("NOT_FOUND");
  const previous = await repository.findVoidBySale(organizationId, sale.id);
  if (previous) return voidedResult(previous);
  const lines = await repository.findSaleLines(organizationId, sale.id);

  try {
    return await repository.withTransaction(
      async (tx): Promise<VoidSaleResult> => {
        let number: number | null = null;
        if (sale.orderId !== null) {
          // La venta de un pedido (ADR 0021, punto 7): la cabecera del pedido FOR UPDATE y al final
          // el contador. Dos anulaciones de la venta, o una anulación y otra emisión del mismo
          // pedido, se serializan en esa fila. No toca el stock: el pedido sigue entregado.
          await lockOrderForSale(tx, organizationId, sale.orderId);
          const again = await repository.findVoidBySale(
            organizationId,
            sale.id,
            tx,
          );
          if (again) return voidedResult(again);
          number = await nextDocumentNumber(tx, organizationId, "sale_void");
        } else {
          // La venta sin pedido (ADR 0021, punto 7): los productos en modo compartido, por id, sin
          // mirar si están activos; sus saldos FOR UPDATE, dentro de restoreSaleStock; y al final el
          // contador, que se toma al armar el motivo. Dos anulaciones de la misma venta se
          // serializan en los saldos: la venta no se puede bloquear (H-7). Por eso el motivo vuelve
          // a mirar, ya con los saldos tomados, que nadie la haya anulado (D-4).
          await lockProductsForOrder(
            tx,
            organizationId,
            lines.map((line) => line.productId),
          );
          const restored = await restoreSaleStock(tx, {
            organizationId,
            lines: lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
            })),
            reason: async () => {
              const again = await repository.findVoidBySale(
                organizationId,
                sale.id,
                tx,
              );
              if (again) throw new AlreadyVoided(again);
              number = await nextDocumentNumber(
                tx,
                organizationId,
                "sale_void",
              );
              return `Anulación ${formatSaleVoidNumber(number)} de la venta ${formatSaleNumber(sale.number)}`;
            },
            createdBy: userId,
          });
          if (!restored.ok) throw new StockLimit(restored.productIds);
        }
        if (number === null) throw new Error("La anulación no tomó su número.");

        // Las claves foráneas de la anulación toman la venta y el autor después del contador. Ningún
        // camino bloquea una venta FOR UPDATE (crm_app no tiene UPDATE en sales), y el autor se toma
        // como en el alta del pedido y la venta (brief-20.4, H-6).
        const saleVoid = await repository.insertSaleVoid(tx, {
          organizationId,
          number,
          saleId: sale.id,
          currency: sale.currency,
          total: sale.total,
          reason: parsedReason.data,
          createdBy: userId,
        });
        // Sobre la venta, con el número de la anulación y el motivo de la lista, y nada más
        // (ADR 0021, punto 6; brief-20.4, D-9). before no es null: recordAudit lo reserva para
        // create, como en note_added y tag_change.
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "sale",
          entityId: sale.id,
          action: "void",
          diff: {
            before: { void_number: null, reason: null },
            after: { void_number: saleVoid.number, reason: saleVoid.reason },
          },
        });
        return {
          ok: true,
          saleVoid: voidReference(saleVoid),
          orderId: sale.orderId,
        };
      },
    );
  } catch (error) {
    if (error instanceof AlreadyVoided) return voidedResult(error.row);
    if (error instanceof StockLimit) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "stock_limit",
        productIds: error.productIds,
      };
    }
    // La base es la última defensa: dos anulaciones que igual chocan en sale_voids_sale_unique son
    // la misma regla, no un error (brief-20.4, D-4).
    if (!repository.isSaleAlreadyVoided(error)) throw error;
    const existing = await repository.findVoidBySale(organizationId, sale.id);
    if (!existing) throw error;
    return voidedResult(existing);
  }
}

// Lecturas: admin y viewer (ADR 0021, punto 10). Los nombres se componen en memoria por las
// interfaces de crm y catalog, sin JOIN; el contacto del cliente sale de crm ya resuelto para el
// rol. Ninguna venta muestra costo ni margen.

export type SaleSummary = {
  id: string;
  number: number;
  displayNumber: string;
  // Null en una venta sin pedido (brief-20.3, D-7).
  orderId: string | null;
  // Null en una venta sin cliente, que se muestra como «Consumidor final».
  clientId: string | null;
  // Null sin cliente, o si el cliente no se pudo leer; esto último no debería pasar, por la clave
  // foránea.
  clientName: string | null;
  lineCount: number;
  total: string;
  currency: string;
  createdAt: Date;
  // El número de su anulación, A-000045; null si está vigente (brief-20.4, D-8).
  voidDisplayNumber: string | null;
};

export type SaleStatusFilter = "all" | "current" | "voided";

export type SaleListFilters = {
  clientId: string | null;
  // Lo que escribió quien busca; vacío no filtra. Con el prefijo A, el número de una anulación.
  number: string;
  // Desde la 20.4 (brief-20.4, D-8).
  status: SaleStatusFilter;
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
  const voidNumber =
    numberText === "" ? null : parseSaleVoidNumberSearch(numberText);
  const number =
    numberText === "" || voidNumber !== null
      ? null
      : parseSaleNumberSearch(numberText);
  if (numberText !== "" && number === null && voidNumber === null) {
    return { ok: true, sales: [], ...EMPTY_PAGE };
  }
  const query: repository.SaleListQuery = {
    organizationId: context.organizationId,
    clientId,
    number,
    voidNumber,
    status: filters.status,
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
    ...new Set(
      rows.flatMap((row) => (row.clientId === null ? [] : [row.clientId])),
    ),
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
      clientName:
        row.clientId === null ? null : (names.get(row.clientId) ?? null),
      lineCount: row.lineCount,
      total: row.total,
      currency: row.currency,
      createdAt: row.createdAt,
      voidDisplayNumber:
        row.voidNumber === null ? null : formatSaleVoidNumber(row.voidNumber),
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
  // Null en una venta sin pedido (brief-20.3, D-7).
  orderId: string | null;
  // El cliente como lo entrega crm para el rol: sin teléfono ni contacto para un viewer. Null sin
  // cliente («Consumidor final»).
  client: Client | null;
  clientId: string | null;
  currency: string;
  total: string;
  createdAt: Date;
  lines: SaleLine[];
  // Desde la 20.4 (brief-20.4, D-7): su anulación, si la tiene, y la cadena de las ventas de su
  // pedido: la anulada a la que reemplaza y la que la reemplazó.
  saleVoid:
    | (VoidReference & {
        reason: SaleVoidReason;
        currency: string;
        total: string;
        createdAt: Date;
      })
    | null;
  replaces: { id: string; displayNumber: string } | null;
  replacedBy: { id: string; displayNumber: string } | null;
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
  const [clients, products, saleVoid, replaces, replacedBy] = await Promise.all(
    [
      getClientsByIds(context, sale.clientId === null ? [] : [sale.clientId]),
      getProductsByIds(
        context,
        lines.map((line) => line.productId),
      ),
      repository.findVoidBySale(context.organizationId, sale.id),
      sale.replacesSaleId === null
        ? undefined
        : repository.findSale(context.organizationId, sale.replacesSaleId),
      repository.findSaleReplacing(context.organizationId, sale.id),
    ],
  );
  const chainLink = (row: repository.SaleRow | undefined) =>
    row ? { id: row.id, displayNumber: formatSaleNumber(row.number) } : null;
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
      saleVoid: saleVoid
        ? {
            ...voidReference(saleVoid),
            reason: saleVoid.reason,
            currency: saleVoid.currency,
            total: saleVoid.total,
            createdAt: saleVoid.createdAt,
          }
        : null,
      replaces: chainLink(replaces),
      replacedBy: chainLink(replacedBy),
    },
  };
}

// La venta vigente de un pedido, para su detalle (ADR 0021, punto 9): la compone la página, nunca
// orders. Desde la 20.4, si la última está anulada no hay venta vigente, y el pedido vuelve a
// ofrecer la emisión (brief-20.4, D-3).
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
  const sale = await repository.findLastSaleByOrder(
    context.organizationId,
    orderId.toLowerCase(),
  );
  return {
    ok: true,
    sale:
      sale && sale.voidNumber === null
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

// Lecturas para cash (ADR 0022, punto 13; brief-21.3, D-4): sin AuthContext, porque las llama cash
// con la transacción del cobro, después del bloqueo de cobros y ya autorizado. No bloquean: una venta
// no se puede bloquear (ADR 0022, punto 4). Un id que no es uuid no encuentra nada. Desde la 21.4,
// con el pedido de la venta (brief-21.4, D-3): la venta vigente de un pedido es la no anulada con
// ese pedido (ADR 0021, punto 3), y con ella cash aplica la seña.

export type SaleForReceipt = {
  id: string;
  number: number;
  displayNumber: string;
  // Null en una venta sin cliente.
  clientId: string | null;
  // Null en una venta sin pedido.
  orderId: string | null;
  currency: string;
  // Con la escala de la base ("1234.50").
  total: string;
  // La fecha de emisión: el orden de la imputación (ADR 0022, punto 9).
  createdAt: Date;
  voided: boolean;
};

function saleForReceipt(row: repository.SaleForReceiptRow): SaleForReceipt {
  return { ...row, displayNumber: formatSaleNumber(row.number) };
}

export async function getSaleForReceipt(
  tx: DbTransaction,
  organizationId: string,
  saleId: string,
): Promise<SaleForReceipt | null> {
  if (!idSchema.safeParse(saleId).success) return null;
  const row = await repository.findSaleForReceipt(
    tx,
    organizationId,
    saleId.toLowerCase(),
  );
  return row ? saleForReceipt(row) : null;
}

// Las ventas de un cliente, anuladas incluidas, de la más vieja a la más nueva.
export async function listClientSalesForAccount(
  tx: DbTransaction,
  organizationId: string,
  clientId: string,
): Promise<SaleForReceipt[]> {
  if (!idSchema.safeParse(clientId).success) return [];
  const rows = await repository.findClientSalesForAccount(
    tx,
    organizationId,
    clientId.toLowerCase(),
  );
  return rows.map(saleForReceipt);
}
