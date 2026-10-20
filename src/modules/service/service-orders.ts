import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import { findServiceProduct, getModel, listModels } from "@/modules/catalog";
import {
  getClientsByIds,
  lockClientForOrder,
  type Client,
} from "@/modules/crm";
import { formatDocumentNumber, nextDocumentNumber } from "@/modules/numbering";
import {
  authorize,
  getMainCurrency,
  getMemberSummaries,
  type AuthContext,
} from "@/modules/organizations";
import {
  getSupplierNames,
  lockTechnicianForServiceOrder,
} from "@/modules/purchasing";
import { getSale, issueServiceSale } from "@/modules/sales";
import { failure, type Failure } from "@/shared/errors";
import { moneyToDatabase } from "@/shared/money";
import {
  canTransition,
  evaluateQuote,
  parseQuoteInput,
  type QuoteInput,
  type QuoteLineIssue,
  type QuoteRuleIssue,
  type QuoteType,
} from "./quote";
import { repairsAllowed } from "./repair-list";
import * as repository from "./repository";
import {
  DEVICE_SERIAL_PATTERN,
  MAX_SERVICE_ORDER_LINES,
  REPORTED_ISSUE_MAX_LENGTH,
} from "./schema";

// Casos de uso de la orden de servicio del equipo de un cliente (ADR 0024, punto 10; brief-29.6, D-4,
// D-6, D-9 y D-11). service es dueño de la regla: abre la transacción y se la pasa a crm (el cliente),
// purchasing (el técnico), sales (la venta de la entrega), numbering (el número) y audit. De la
// capacidad repairs: sin ella, la orden no existe para nadie.
//
// Un admin las opera; un viewer las lee sin el técnico ni el costo (ADR 0024, punto 14). El IMEI del
// equipo y lo que reporta el cliente son datos personales: no entran en la auditoría, y el vaciado de
// datos de un cliente los borra (D-11).
//
// La serialización (D-9): cada transición bloquea la cabecera FOR UPDATE y decide con lo leído. De dos
// transiciones de la misma orden, la segunda espera y ve el estado que dejó la primera. Mandarla toma
// además el técnico en modo compartido. Entregarla toma, en este orden, la orden, el cliente en modo
// compartido y el producto de servicio FOR SHARE (los dos dentro de issueServiceSale), el contador de
// la venta y sus inserts, y al final actualiza la orden.

export type ServiceOrderStatus = repository.ServiceOrderStatus;
export type ServiceOrderCancelReason = repository.ServiceOrderCancelReason;
export const SERVICE_ORDER_STATUSES = repository.SERVICE_ORDER_STATUSES;
export const SERVICE_ORDER_CANCEL_REASONS =
  repository.SERVICE_ORDER_CANCEL_REASONS;
export { MAX_SERVICE_ORDER_LINES, REPORTED_ISSUE_MAX_LENGTH };

export const SERVICE_ORDERS_PAGE_SIZE = 25;
export const CLIENT_SERVICE_ORDERS_LIMIT = 5;

// Las que todavía no terminaron: el filtro «En curso» de la lista.
export const OPEN_SERVICE_ORDER_STATUSES: readonly ServiceOrderStatus[] = [
  "received",
  "sent",
  "quoted",
  "approved",
  "rejected",
  "repaired",
];

const idSchema = z.uuid();
const serialPattern = new RegExp(DEVICE_SERIAL_PATTERN);

export function formatServiceOrderNumber(value: number): string {
  return formatDocumentNumber("service_order", value);
}

// El número como lo escribe quien busca: «OS-000123», «os000123», «000123» o «123».
export function parseServiceOrderNumberSearch(text: string): number | null {
  const match = /^(?:os-?)?0*(\d{1,15})$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function requireRepairs(
  context: AuthContext,
  role?: "admin",
): Promise<{ ok: true } | Failure<"FORBIDDEN" | "NOT_FOUND">> {
  const signedIn = authorize(context, {});
  if (!signedIn.ok) return signedIn;
  if (!(await repairsAllowed(context))) return failure("NOT_FOUND");
  return role ? authorize(context, { role }) : { ok: true };
}

// El alta (D-4). Todo llega como texto desde el formulario.

export type ServiceOrderInput = {
  clientId: string;
  modelId: string;
  deviceSerial: string;
  reportedIssue: string;
};

export type ServiceOrderField =
  "client" | "model" | "deviceSerial" | "reportedIssue";

export type ServiceOrderRef = {
  id: string;
  number: number;
  displayNumber: string;
};

export type CreateServiceOrderResult =
  | { ok: true; order: ServiceOrderRef }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | Failure<"VALIDATION_ERROR", { fields: ServiceOrderField[] }>
  | Failure<"NOT_FOUND", { target: "client" | "model" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "inactive_client" | "inactive_model" }
    >;

export function validateServiceOrderInput(input: ServiceOrderInput):
  | {
      ok: true;
      values: {
        clientId: string;
        modelId: string;
        deviceSerial: string | null;
        reportedIssue: string;
      };
    }
  | Failure<"VALIDATION_ERROR", { fields: ServiceOrderField[] }> {
  const fields: ServiceOrderField[] = [];
  const clientId = input.clientId.trim().toLowerCase();
  if (!idSchema.safeParse(clientId).success) fields.push("client");
  const modelId = input.modelId.trim().toLowerCase();
  if (!idSchema.safeParse(modelId).success) fields.push("model");
  const serial = input.deviceSerial.trim();
  if (serial !== "" && !serialPattern.test(serial)) fields.push("deviceSerial");
  const reportedIssue = input.reportedIssue.trim();
  if (
    reportedIssue.length === 0 ||
    reportedIssue.length > REPORTED_ISSUE_MAX_LENGTH
  ) {
    fields.push("reportedIssue");
  }
  if (fields.length > 0) return { ok: false, code: "VALIDATION_ERROR", fields };
  return {
    ok: true,
    values: {
      clientId,
      modelId,
      deviceSerial: serial === "" ? null : serial,
      reportedIssue,
    },
  };
}

export async function createServiceOrder(
  context: AuthContext,
  input: ServiceOrderInput,
): Promise<CreateServiceOrderResult> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  const validated = validateServiceOrderInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  // El modelo da los precios del presupuesto: tiene que existir y estar activo. No se bloquea: una
  // desactivación a la vez no cambia lo que se recibió.
  const model = await getModel(context, values.modelId);
  if (!model.ok) return { ok: false, code: "NOT_FOUND", target: "model" };
  if (!model.model.isActive) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "inactive_model",
    };
  }
  const { organizationId, userId } = context;
  return repository.withTransaction(
    async (tx): Promise<CreateServiceOrderResult> => {
      // El cliente en modo compartido, antes del contador, como el alta del pedido.
      const client = await lockClientForOrder(
        tx,
        organizationId,
        values.clientId,
      );
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
      const number = await nextDocumentNumber(
        tx,
        organizationId,
        "service_order",
      );
      const order = await repository.insertServiceOrder(tx, {
        organizationId,
        number,
        clientId: values.clientId,
        modelId: values.modelId,
        deviceSerial: values.deviceSerial,
        reportedIssue: values.reportedIssue,
        createdBy: userId,
      });
      // Sin el IMEI ni lo que reportó el cliente: el vaciado no tiene que alcanzar la auditoría (D-11).
      await recordAudit(tx, {
        organizationId,
        actorUserId: userId,
        entityType: "service_order",
        entityId: order.id,
        action: "create",
        diff: {
          before: null,
          after: {
            number: order.number,
            kind: "customer_device",
            status: order.status,
            client_id: order.clientId,
            model_id: order.modelId,
          },
        },
      });
      return {
        ok: true,
        order: {
          id: order.id,
          number: order.number,
          displayNumber: formatServiceOrderNumber(order.number),
        },
      };
    },
  );
}

// Las transiciones (D-4). Una orden que ya no está en el estado de partida responde
// invalid_transition con su estado, sin escribir ni auditar.

type InvalidTransition = Failure<
  "BUSINESS_RULE_VIOLATION",
  { rule: "invalid_transition"; status: ServiceOrderStatus }
>;

export type TransitionResult =
  | { ok: true }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | InvalidTransition;

function invalidTransition(status: ServiceOrderStatus): InvalidTransition {
  return {
    ok: false,
    code: "BUSINESS_RULE_VIOLATION",
    rule: "invalid_transition",
    status,
  };
}

// Lo común a toda transición: la capacidad y el rol, el id, la orden FOR UPDATE y el estado.
async function inTransition<R>(
  context: AuthContext,
  serviceOrderId: string,
  to: ServiceOrderStatus,
  work: (
    tx: Parameters<Parameters<typeof repository.withTransaction>[0]>[0],
    order: repository.ServiceOrderRow,
  ) => Promise<R>,
): Promise<
  | R
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | InvalidTransition
> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(serviceOrderId).success) {
    return failure("VALIDATION_ERROR");
  }
  return repository.withTransaction(async (tx) => {
    const order = await repository.findServiceOrder(
      context.organizationId,
      serviceOrderId.toLowerCase(),
      tx,
      { forUpdate: true },
    );
    if (!order) return failure("NOT_FOUND");
    if (!canTransition(order.status, to))
      return invalidTransition(order.status);
    return work(tx, order);
  });
}

function statusAudit(
  context: AuthContext,
  order: repository.ServiceOrderRow,
  before: Record<string, string | number | null>,
  after: Record<string, string | number | null>,
) {
  return {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    entityType: "service_order" as const,
    entityId: order.id,
    action: "status_change" as const,
    diff: { before, after },
  };
}

// Mandarla al técnico (D-3 y D-9): uno activo, con la marca.
export type SendServiceOrderResult =
  | TransitionResult
  | Failure<"NOT_FOUND", { target: "technician" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "inactive_technician" | "not_technician" }
    >;

export async function sendServiceOrder(
  context: AuthContext,
  serviceOrderId: string,
  technicianId: string,
): Promise<SendServiceOrderResult> {
  if (!idSchema.safeParse(technicianId.trim()).success) {
    return { ok: false, code: "NOT_FOUND", target: "technician" };
  }
  const supplierId = technicianId.trim().toLowerCase();
  return inTransition(
    context,
    serviceOrderId,
    "sent",
    async (tx, order): Promise<SendServiceOrderResult> => {
      const technician = await lockTechnicianForServiceOrder(
        tx,
        context.organizationId,
        supplierId,
      );
      if (technician === "not_found") {
        return { ok: false, code: "NOT_FOUND", target: "technician" };
      }
      if (technician !== "technician") {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule:
            technician === "inactive"
              ? "inactive_technician"
              : "not_technician",
        };
      }
      await repository.updateServiceOrder(
        tx,
        context.organizationId,
        order.id,
        {
          status: "sent",
          technicianId: supplierId,
          sentAt: new Date(),
        },
      );
      await recordAudit(
        tx,
        statusAudit(
          context,
          order,
          { status: order.status, technician_id: null },
          { status: "sent", technician_id: supplierId },
        ),
      );
      return { ok: true };
    },
  );
}

// El presupuesto (D-4): uno solo, con la lista del modelo del equipo, editable antes de guardarlo. Las
// líneas se insertan con el pase a quoted y no cambian.
export type QuoteServiceOrderResult =
  | TransitionResult
  | Failure<
      "VALIDATION_ERROR",
      {
        reason:
          | "customer_currency"
          | "technician_currency"
          | "no_lines"
          | "too_many_lines"
          | "lines";
        lines: QuoteLineIssue[];
      }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "line_rules"; lines: QuoteRuleIssue[] }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "total_too_large" }>;

export async function quoteServiceOrder(
  context: AuthContext,
  serviceOrderId: string,
  input: QuoteInput,
): Promise<QuoteServiceOrderResult> {
  const parsed = parseQuoteInput(input, MAX_SERVICE_ORDER_LINES);
  if (!parsed.ok) {
    const allowed = await requireRepairs(context, "admin");
    if (!allowed.ok) return allowed;
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      reason: parsed.reason,
      lines: parsed.lines,
    };
  }
  return inTransition(
    context,
    serviceOrderId,
    "quoted",
    async (tx, order): Promise<QuoteServiceOrderResult> => {
      const { organizationId } = context;
      // La lista del modelo, leída con la orden bloqueada: lo que cuenta es la lista de ahora.
      const [types, prices] = await Promise.all([
        repository.findRepairTypes(organizationId, tx),
        repository.findModelRepairPrices(organizationId, order.modelId, tx),
      ]);
      const byType = new Map(prices.map((row) => [row.repairTypeId, row]));
      const quoteTypes = new Map<string, QuoteType>(
        types.map((type) => {
          const row = byType.get(type.id);
          return [
            type.id,
            {
              isActive: type.isActive,
              listPrice: row
                ? {
                    priceCurrency: row.priceCurrency,
                    costCurrency: row.costCurrency,
                  }
                : null,
            },
          ];
        }),
      );
      const evaluated = evaluateQuote(parsed, quoteTypes);
      if (!evaluated.ok) {
        return evaluated.reason === "line_rules"
          ? {
              ok: false,
              code: "BUSINESS_RULE_VIOLATION",
              rule: "line_rules",
              lines: evaluated.lines,
            }
          : {
              ok: false,
              code: "BUSINESS_RULE_VIOLATION",
              rule: "total_too_large",
            };
      }
      const customerTotal = moneyToDatabase(evaluated.customerTotal);
      const technicianTotal = moneyToDatabase(evaluated.technicianTotal);
      // Primero la cabecera: el trigger de las líneas exige una orden presupuestándose.
      await repository.updateServiceOrder(tx, organizationId, order.id, {
        status: "quoted",
        quotedAt: new Date(),
        customerCurrency: parsed.customerCurrency,
        customerTotal,
        technicianCurrency: parsed.technicianCurrency,
        technicianTotal,
      });
      const lines = evaluated.lines.map((line) => ({
        repairTypeId: line.repairTypeId,
        position: line.position,
        price: moneyToDatabase(line.price),
        cost: moneyToDatabase(line.cost),
      }));
      await repository.insertServiceOrderLines(
        tx,
        organizationId,
        order.id,
        lines,
      );
      // audit admite valores planos: las líneas van con claves numeradas, como el pedido. La auditoría
      // de la orden es del admin: lleva el costo.
      const after: Record<string, string | number | null> = {
        status: "quoted",
        customer_currency: parsed.customerCurrency,
        customer_total: customerTotal,
        technician_currency: parsed.technicianCurrency,
        technician_total: technicianTotal,
        lines: lines.length,
        ...Object.fromEntries(
          lines.flatMap((line) => [
            [`line_${line.position}_repair_type_id`, line.repairTypeId],
            [`line_${line.position}_price`, line.price],
            [`line_${line.position}_cost`, line.cost],
          ]),
        ),
      };
      const before = Object.fromEntries(
        Object.keys(after).map((key) => [
          key,
          key === "status" ? order.status : null,
        ]),
      );
      await recordAudit(tx, statusAudit(context, order, before, after));
      return { ok: true };
    },
  );
}

// Aprobar, rechazar y marcarla reparada: solo el estado y su fecha. Una orden reparada pone su costo al
// debe de la cuenta del técnico (D-7): la cuenta lo lee por listTechnicianChargesForAccount.
async function simpleTransition(
  context: AuthContext,
  serviceOrderId: string,
  to: "approved" | "rejected" | "repaired",
): Promise<TransitionResult> {
  return inTransition(
    context,
    serviceOrderId,
    to,
    async (tx, order): Promise<TransitionResult> => {
      const now = new Date();
      await repository.updateServiceOrder(
        tx,
        context.organizationId,
        order.id,
        to === "approved"
          ? { status: to, approvedAt: now }
          : to === "rejected"
            ? { status: to, rejectedAt: now }
            : { status: to, repairedAt: now },
      );
      await recordAudit(
        tx,
        statusAudit(context, order, { status: order.status }, { status: to }),
      );
      return { ok: true };
    },
  );
}

export function approveServiceOrder(
  context: AuthContext,
  serviceOrderId: string,
): Promise<TransitionResult> {
  return simpleTransition(context, serviceOrderId, "approved");
}

export function rejectServiceOrder(
  context: AuthContext,
  serviceOrderId: string,
): Promise<TransitionResult> {
  return simpleTransition(context, serviceOrderId, "rejected");
}

export function markServiceOrderRepaired(
  context: AuthContext,
  serviceOrderId: string,
): Promise<TransitionResult> {
  return simpleTransition(context, serviceOrderId, "repaired");
}

// La entrega (D-6): una orden reparada emite su venta en la misma transacción; una rechazada vuelve sin
// reparar y sin venta. De dos entregas simultáneas, la segunda espera la orden y ve delivered (AC-9).
export type DeliverServiceOrderResult =
  | {
      ok: true;
      sale: { id: string; number: number; displayNumber: string } | null;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | InvalidTransition
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "no_service_product" }>;

export async function deliverServiceOrder(
  context: AuthContext,
  serviceOrderId: string,
): Promise<DeliverServiceOrderResult> {
  const { organizationId, userId } = context;
  return inTransition(
    context,
    serviceOrderId,
    "delivered",
    async (tx, order): Promise<DeliverServiceOrderResult> => {
      const deliveredAt = new Date();
      if (order.status === "rejected") {
        await repository.updateServiceOrder(tx, organizationId, order.id, {
          status: "delivered",
          deliveredAt,
        });
        await recordAudit(
          tx,
          statusAudit(
            context,
            order,
            { status: order.status, sale_id: null },
            { status: "delivered", sale_id: null },
          ),
        );
        return { ok: true, sale: null };
      }
      // El producto de servicio lo crea org:capability (D-1). Sin él no hay venta: no se entrega.
      const product = await findServiceProduct(organizationId);
      if (!product) {
        return {
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule: "no_service_product",
        };
      }
      // La reparada tiene su presupuesto (CHECK de la 0058).
      const sale = await issueServiceSale(tx, {
        organizationId,
        userId,
        clientId: order.clientId,
        productId: product.id,
        currency: order.customerCurrency!,
        total: order.customerTotal!,
      });
      await repository.updateServiceOrder(tx, organizationId, order.id, {
        status: "delivered",
        deliveredAt,
        saleId: sale.id,
      });
      await recordAudit(
        tx,
        statusAudit(
          context,
          order,
          { status: order.status, sale_id: null },
          { status: "delivered", sale_id: sale.id },
        ),
      );
      return { ok: true, sale };
    },
  );
}

// La cancelación (D-4): con un motivo de la lista, desde received, sent, quoted o approved.
const cancelReasonSchema = z.enum(repository.SERVICE_ORDER_CANCEL_REASONS);

export async function cancelServiceOrder(
  context: AuthContext,
  serviceOrderId: string,
  reason: string,
): Promise<TransitionResult> {
  const parsed = cancelReasonSchema.safeParse(reason);
  if (!parsed.success) {
    const allowed = await requireRepairs(context, "admin");
    if (!allowed.ok) return allowed;
    return failure("VALIDATION_ERROR");
  }
  return inTransition(
    context,
    serviceOrderId,
    "cancelled",
    async (tx, order): Promise<TransitionResult> => {
      await repository.updateServiceOrder(
        tx,
        context.organizationId,
        order.id,
        {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: parsed.data,
        },
      );
      await recordAudit(
        tx,
        statusAudit(
          context,
          order,
          { status: order.status, cancel_reason: null },
          { status: "cancelled", cancel_reason: parsed.data },
        ),
      );
      return { ok: true };
    },
  );
}

// Lecturas: admin y viewer. Un viewer no recibe el técnico ni el costo (ADR 0024, punto 14). Los
// nombres se componen en memoria por las interfaces de crm, catalog y purchasing, sin JOIN.

export type ServiceOrderSummary = {
  id: string;
  number: number;
  displayNumber: string;
  clientId: string;
  // Null si el cliente no se pudo leer; no debería pasar, por la clave foránea.
  clientName: string | null;
  modelId: string;
  modelName: string | null;
  status: ServiceOrderStatus;
  // Null hasta el presupuesto.
  customerTotal: string | null;
  customerCurrency: string | null;
  createdAt: Date;
};

export type ServiceOrderStatusFilter = "all" | "open" | ServiceOrderStatus;

export type ServiceOrderListFilters = {
  status: ServiceOrderStatusFilter;
  // Lo que escribió quien busca; vacío no filtra.
  number: string;
  page: number;
};

export type ServiceOrderPage = {
  ok: true;
  orders: ServiceOrderSummary[];
  total: number;
  page: number;
  pageCount: number;
};

async function summarize(
  context: AuthContext,
  rows: repository.ServiceOrderRow[],
): Promise<ServiceOrderSummary[]> {
  if (rows.length === 0) return [];
  const [clients, models] = await Promise.all([
    getClientsByIds(
      context,
      rows.map((row) => row.clientId),
    ),
    listModels(context),
  ]);
  const clientNames = new Map(
    clients.ok
      ? clients.clients.map((client) => [client.id, client.displayName])
      : [],
  );
  const modelNames = new Map(
    models.ok ? models.models.map((model) => [model.id, model.name]) : [],
  );
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    displayNumber: formatServiceOrderNumber(row.number),
    clientId: row.clientId,
    clientName: clientNames.get(row.clientId) ?? null,
    modelId: row.modelId,
    modelName: modelNames.get(row.modelId) ?? null,
    status: row.status,
    customerTotal: row.customerTotal,
    customerCurrency: row.customerCurrency,
    createdAt: row.createdAt,
  }));
}

const EMPTY_PAGE = { total: 0, page: 1, pageCount: 1 } as const;

export async function listServiceOrders(
  context: AuthContext,
  filters: ServiceOrderListFilters,
): Promise<ServiceOrderPage | Failure<"FORBIDDEN" | "NOT_FOUND">> {
  const allowed = await requireRepairs(context);
  if (!allowed.ok) return allowed;
  const numberText = filters.number.trim();
  const number =
    numberText === "" ? null : parseServiceOrderNumberSearch(numberText);
  if (numberText !== "" && number === null) {
    return { ok: true, ...EMPTY_PAGE, orders: [] };
  }
  const query: repository.ServiceOrderListQuery = {
    organizationId: context.organizationId,
    statuses:
      filters.status === "all"
        ? null
        : filters.status === "open"
          ? [...OPEN_SERVICE_ORDER_STATUSES]
          : [filters.status],
    number,
    clientId: null,
  };
  const total = await repository.countServiceOrders(query);
  const pageCount = Math.max(1, Math.ceil(total / SERVICE_ORDERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await repository.findServiceOrders(
          query,
          SERVICE_ORDERS_PAGE_SIZE,
          (page - 1) * SERVICE_ORDERS_PAGE_SIZE,
        );
  return {
    ok: true,
    orders: await summarize(context, rows),
    total,
    page,
    pageCount,
  };
}

// Las últimas órdenes de un cliente, para su ficha (D-10). Sin la capacidad, ninguna.
export async function listClientServiceOrders(
  context: AuthContext,
  clientId: string,
): Promise<
  | { ok: true; orders: ServiceOrderSummary[]; total: number }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireRepairs(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(clientId).success) return failure("VALIDATION_ERROR");
  const query: repository.ServiceOrderListQuery = {
    organizationId: context.organizationId,
    statuses: null,
    number: null,
    clientId: clientId.toLowerCase(),
  };
  const total = await repository.countServiceOrders(query);
  const rows =
    total === 0
      ? []
      : await repository.findServiceOrders(
          query,
          CLIENT_SERVICE_ORDERS_LIMIT,
          0,
        );
  return { ok: true, orders: await summarize(context, rows), total };
}

export type ServiceOrderLine = {
  position: number;
  repairTypeId: string;
  // El nombre de hoy: la línea no lo copia.
  repairTypeName: string | null;
  price: string;
  // Null para un viewer.
  cost: string | null;
};

export type ServiceOrderDetail = {
  id: string;
  number: number;
  displayNumber: string;
  status: ServiceOrderStatus;
  // El cliente como lo entrega crm para el rol. Null no debería pasar, por la clave foránea.
  client: Client | null;
  clientId: string;
  model: { id: string; name: string } | null;
  // Null después del vaciado de datos del cliente (D-11).
  deviceSerial: string | null;
  reportedIssue: string | null;
  // Null para un viewer, o antes de mandarla.
  technician: { id: string; name: string | null } | null;
  customerCurrency: string | null;
  customerTotal: string | null;
  // Null para un viewer, o antes del presupuesto.
  technicianCurrency: string | null;
  technicianTotal: string | null;
  sentAt: Date | null;
  quotedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  repairedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: ServiceOrderCancelReason | null;
  lines: ServiceOrderLine[];
  // La venta de la entrega, con su anulación si la tiene (D-6): la orden sigue entregada.
  sale: {
    id: string;
    displayNumber: string;
    voidDisplayNumber: string | null;
  } | null;
  createdAt: Date;
};

export async function getServiceOrder(
  context: AuthContext,
  serviceOrderId: string,
): Promise<
  | { ok: true; order: ServiceOrderDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireRepairs(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(serviceOrderId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const order = await repository.findServiceOrder(
    organizationId,
    serviceOrderId.toLowerCase(),
  );
  if (!order) return failure("NOT_FOUND");
  const admin = context.role === "admin";
  const [lines, types, clients, model, technicianNames, sale] =
    await Promise.all([
      repository.findServiceOrderLines(organizationId, order.id),
      repository.findRepairTypes(organizationId),
      getClientsByIds(context, [order.clientId]),
      getModel(context, order.modelId),
      admin && order.technicianId !== null
        ? getSupplierNames(context, [order.technicianId])
        : Promise.resolve(null),
      order.saleId !== null
        ? getSale(context, order.saleId)
        : Promise.resolve(null),
    ]);
  const typeNames = new Map(types.map((type) => [type.id, type.name]));
  return {
    ok: true,
    order: {
      id: order.id,
      number: order.number,
      displayNumber: formatServiceOrderNumber(order.number),
      status: order.status,
      client: clients.ok ? (clients.clients[0] ?? null) : null,
      clientId: order.clientId,
      model: model.ok ? { id: model.model.id, name: model.model.name } : null,
      deviceSerial: order.deviceSerial,
      reportedIssue: order.reportedIssue,
      technician:
        admin && order.technicianId !== null
          ? {
              id: order.technicianId,
              name:
                technicianNames?.ok === true
                  ? (technicianNames.names.get(order.technicianId) ?? null)
                  : null,
            }
          : null,
      customerCurrency: order.customerCurrency,
      customerTotal: order.customerTotal,
      technicianCurrency: admin ? order.technicianCurrency : null,
      technicianTotal: admin ? order.technicianTotal : null,
      sentAt: order.sentAt,
      quotedAt: order.quotedAt,
      approvedAt: order.approvedAt,
      rejectedAt: order.rejectedAt,
      repairedAt: order.repairedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
      lines: lines.map((line) => ({
        position: line.position,
        repairTypeId: line.repairTypeId,
        repairTypeName: typeNames.get(line.repairTypeId) ?? null,
        price: line.price,
        cost: admin ? line.cost : null,
      })),
      sale:
        sale?.ok === true
          ? {
              id: sale.sale.id,
              displayNumber: sale.sale.displayNumber,
              voidDisplayNumber: sale.sale.saleVoid?.displayNumber ?? null,
            }
          : null,
      createdAt: order.createdAt,
    },
  };
}

// El formulario del presupuesto (D-4): los tipos activos, con el precio y el costo de la lista del
// modelo del equipo si los tiene, y las monedas que propone. Solo admin, y solo con la orden mandada.
export type QuoteFormRow = {
  repairTypeId: string;
  name: string;
  listPrice: {
    price: string;
    priceCurrency: string;
    cost: string;
    costCurrency: string;
  } | null;
};

export type QuoteForm = {
  rows: QuoteFormRow[];
  // La moneda de la lista si todos los precios del modelo comparten una; si no, la principal.
  customerCurrency: string | null;
  technicianCurrency: string | null;
};

export async function getQuoteForm(
  context: AuthContext,
  serviceOrderId: string,
): Promise<
  | { ok: true; form: QuoteForm }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | InvalidTransition
> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(serviceOrderId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const order = await repository.findServiceOrder(
    organizationId,
    serviceOrderId.toLowerCase(),
  );
  if (!order) return failure("NOT_FOUND");
  if (!canTransition(order.status, "quoted")) {
    return invalidTransition(order.status);
  }
  const [types, prices, main] = await Promise.all([
    repository.findRepairTypes(organizationId),
    repository.findModelRepairPrices(organizationId, order.modelId),
    getMainCurrency(organizationId),
  ]);
  const byType = new Map(prices.map((row) => [row.repairTypeId, row]));
  const rows = types
    .filter((type) => type.isActive)
    .map((type) => {
      const row = byType.get(type.id);
      return {
        repairTypeId: type.id,
        name: type.name,
        listPrice: row
          ? {
              price: row.price,
              priceCurrency: row.priceCurrency,
              cost: row.cost,
              costCurrency: row.costCurrency,
            }
          : null,
      };
    });
  const only = (values: string[]) =>
    new Set(values).size === 1 ? values[0]! : null;
  const priced = rows.flatMap((row) => (row.listPrice ? [row.listPrice] : []));
  return {
    ok: true,
    form: {
      rows,
      customerCurrency:
        only(priced.map((price) => price.priceCurrency)) ?? main,
      technicianCurrency:
        only(priced.map((price) => price.costCurrency)) ?? main,
    },
  };
}

// La historia de la orden: el alta y cada transición. Solo admin: lleva el técnico y el costo.
export type ServiceOrderAuditEntry = NamedAuditLogEntry;

export async function listServiceOrderAudit(
  context: AuthContext,
  serviceOrderId: string,
  page: number,
): Promise<
  | {
      ok: true;
      entries: ServiceOrderAuditEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(serviceOrderId).success) {
    return failure("VALIDATION_ERROR");
  }
  const order = await repository.findServiceOrder(
    context.organizationId,
    serviceOrderId.toLowerCase(),
  );
  if (!order) return failure("NOT_FOUND");
  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["service_order"],
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
