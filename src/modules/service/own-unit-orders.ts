import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import { getProduct } from "@/modules/catalog";
import {
  getUnitForRepair,
  returnUnitFromRepair,
  sendUnitToRepair,
  type BalanceRule,
} from "@/modules/inventory";
import { nextDocumentNumber } from "@/modules/numbering";
import { hasCapability, type AuthContext } from "@/modules/organizations";
import { lockTechnicianForServiceOrder } from "@/modules/purchasing";
import { failure, type Failure } from "@/shared/errors";
import { moneyToDatabase } from "@/shared/money";
import {
  evaluateRepairCosts,
  parseRepairCostInput,
  type RepairCostLineInput,
  type RepairCostLineIssue,
  type RepairCostRule,
} from "./quote";
import * as repository from "./repository";
import { MAX_SERVICE_ORDER_LINES, REPORTED_ISSUE_MAX_LENGTH } from "./schema";
import {
  formatServiceOrderNumber,
  inTransition,
  invalidTransition,
  requireRepairs,
  statusAudit,
  type ServiceOrderKind,
  type ServiceOrderRef,
  type ServiceOrderStatus,
  type TransitionResult,
} from "./service-orders";

// La orden de una unidad propia (ADR 0024, punto 10; brief-29.6.2, D-3). Una unidad del stock va al
// técnico y vuelve con lo que cobró sumado a su costo, en revisión; se libera a la venta desde
// inventory. Exige repairs y serialized_units, y la opera un admin.
//
// El orden de bloqueo (D-6). Mandarla: el técnico en modo compartido, como el proveedor de una
// recepción antes que sus productos; después, dentro de sendUnitToRepair, el producto, la unidad y el
// saldo; el contador, y la orden. Marcarla reparada y cancelarla: la orden FOR UPDATE, y después el
// producto y la unidad.

const idSchema = z.uuid();

async function requireOwnUnitRepairs(
  context: AuthContext,
): Promise<{ ok: true } | Failure<"FORBIDDEN" | "NOT_FOUND">> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  if (!(await hasCapability(context.organizationId, "serialized_units"))) {
    return failure("NOT_FOUND");
  }
  return { ok: true };
}

export type OwnUnitRepairInput = {
  technicianId: string;
  reportedIssue: string;
};

export type OwnUnitRepairField = "technician" | "reportedIssue";

export type CreateOwnUnitServiceOrderResult =
  | { ok: true; order: ServiceOrderRef }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: OwnUnitRepairField[] }>
  | Failure<"NOT_FOUND", { target: "unit" | "technician" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      {
        rule:
          | "unit_not_available"
          | "unit_without_model"
          | "inactive_technician"
          | "not_technician";
      }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: BalanceRule }>;

type CreateRejection = Exclude<CreateOwnUnitServiceOrderResult, { ok: true }>;

// Un rechazo con la unidad o el saldo tomados se lanza, para revertir también la fila en 0 que pudo
// crear el bloqueo del saldo (convención de la 19.3).
class OwnUnitRejected<T> extends Error {
  constructor(readonly result: T) {
    super("rechazado");
    this.name = "OwnUnitRejected";
  }
}

// Mandar a reparar (D-3): la orden nace sent, con el técnico y qué hay que reparar, y la unidad pasa a
// in_repair. Una unidad tiene a lo sumo una orden abierta: estar en reparación ya lo impide, y el índice
// único parcial es la última defensa.
export async function createOwnUnitServiceOrder(
  context: AuthContext,
  unitId: string,
  input: OwnUnitRepairInput,
): Promise<CreateOwnUnitServiceOrderResult> {
  const allowed = await requireOwnUnitRepairs(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(unitId).success) return failure("VALIDATION_ERROR");
  const fields: OwnUnitRepairField[] = [];
  const technicianId = input.technicianId.trim().toLowerCase();
  if (!idSchema.safeParse(technicianId).success) fields.push("technician");
  const reportedIssue = input.reportedIssue.trim();
  if (
    reportedIssue.length === 0 ||
    reportedIssue.length > REPORTED_ISSUE_MAX_LENGTH
  ) {
    fields.push("reportedIssue");
  }
  if (fields.length > 0) return { ok: false, code: "VALIDATION_ERROR", fields };
  const { organizationId, userId } = context;
  const unit = await getUnitForRepair(organizationId, unitId);
  if (!unit) return { ok: false, code: "NOT_FOUND", target: "unit" };
  // El modelo da la lista con la que se cargan las líneas (H-8). El producto de una unidad no cambia, y
  // su modelo, si cambiara a la vez, sigue siendo un modelo de la organización.
  const product = await getProduct(context, unit.productId);
  if (!product.ok) return { ok: false, code: "NOT_FOUND", target: "unit" };
  const modelId = product.product.modelId;
  if (modelId === null) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "unit_without_model",
    };
  }
  try {
    return await repository.withTransaction(async (tx) => {
      const technician = await lockTechnicianForServiceOrder(
        tx,
        organizationId,
        technicianId,
      );
      if (technician === "not_found") {
        throw new OwnUnitRejected<CreateRejection>({
          ok: false,
          code: "NOT_FOUND",
          target: "technician",
        });
      }
      if (technician !== "technician") {
        throw new OwnUnitRejected<CreateRejection>({
          ok: false,
          code: "BUSINESS_RULE_VIOLATION",
          rule:
            technician === "inactive"
              ? "inactive_technician"
              : "not_technician",
        });
      }
      let number = 0;
      const sent = await sendUnitToRepair(tx, {
        organizationId,
        unitId: unit.id,
        reason: async () => {
          number = await nextDocumentNumber(
            tx,
            organizationId,
            "service_order",
          );
          return formatServiceOrderNumber(number);
        },
        createdBy: userId,
      });
      if (!sent.ok) {
        throw new OwnUnitRejected<CreateRejection>(
          sent.reason === "not_found"
            ? { ok: false, code: "NOT_FOUND", target: "unit" }
            : {
                ok: false,
                code: "BUSINESS_RULE_VIOLATION",
                rule: sent.reason,
              },
        );
      }
      const order = await repository.insertOwnUnitServiceOrder(tx, {
        organizationId,
        number,
        unitId: unit.id,
        modelId,
        reportedIssue,
        technicianId,
        sentAt: new Date(),
        createdBy: userId,
      });
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
            kind: "own_unit",
            status: order.status,
            unit_id: unit.id,
            model_id: modelId,
            technician_id: technicianId,
            reported_issue: reportedIssue,
          },
        },
      });
      return {
        ok: true as const,
        order: {
          id: order.id,
          number: order.number,
          displayNumber: formatServiceOrderNumber(order.number),
        },
      };
    });
  } catch (error) {
    if (error instanceof OwnUnitRejected) {
      return error.result as CreateRejection;
    }
    throw error;
  }
}

// Marcarla reparada (D-3): las líneas con lo que cobró el técnico por cada tipo, en la moneda del
// costo de la unidad (U-1). El total va al debe de su cuenta (D-4), se suma al costo de la unidad y la
// unidad vuelve a revisión, todo en la misma transacción.
export type MarkOwnUnitRepairedResult =
  | TransitionResult
  | Failure<
      "VALIDATION_ERROR",
      {
        reason: "currency" | "no_lines" | "too_many_lines" | "lines";
        lines: RepairCostLineIssue[];
      }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      {
        rule: "line_rules";
        lines: {
          position: number;
          repairTypeId: string;
          rule: RepairCostRule;
        }[];
      }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "total_too_large" | "cost_limit" }
    >;

type MarkRejection = Exclude<MarkOwnUnitRepairedResult, { ok: true }>;

async function ownUnitOrder(context: AuthContext, serviceOrderId: string) {
  if (!idSchema.safeParse(serviceOrderId).success) return null;
  const order = await repository.findServiceOrder(
    context.organizationId,
    serviceOrderId.toLowerCase(),
  );
  return order?.kind === "own_unit" ? order : null;
}

export async function markOwnUnitRepaired(
  context: AuthContext,
  serviceOrderId: string,
  lines: RepairCostLineInput[],
): Promise<MarkOwnUnitRepairedResult> {
  const allowed = await requireOwnUnitRepairs(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(serviceOrderId).success) {
    return failure("VALIDATION_ERROR");
  }
  // La moneda del costo de la unidad no cambia nunca (trigger): se lee antes de bloquear.
  const found = await ownUnitOrder(context, serviceOrderId);
  if (!found) return failure("NOT_FOUND");
  const unit = await getUnitForRepair(context.organizationId, found.unitId!);
  if (!unit) return failure("NOT_FOUND");
  const currency = unit.costCurrency;
  const parsed = parseRepairCostInput(lines, currency, MAX_SERVICE_ORDER_LINES);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      reason: parsed.reason,
      lines: parsed.lines,
    };
  }
  const { organizationId, userId } = context;
  try {
    return await inTransition(
      context,
      serviceOrderId,
      "repaired",
      "own_unit",
      async (tx, order): Promise<MarkOwnUnitRepairedResult> => {
        const types = await repository.findRepairTypes(organizationId, tx);
        const evaluated = evaluateRepairCosts(
          parsed.lines,
          new Map(types.map((type) => [type.id, type])),
        );
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
        const total = moneyToDatabase(evaluated.total);
        // Primero la cabecera: el trigger de las líneas exige una orden propia reparada.
        await repository.updateServiceOrder(tx, organizationId, order.id, {
          status: "repaired",
          repairedAt: new Date(),
          technicianCurrency: currency,
          technicianTotal: total,
        });
        const rows = evaluated.lines.map((line) => ({
          repairTypeId: line.repairTypeId,
          position: line.position,
          price: null,
          cost: moneyToDatabase(line.cost),
        }));
        await repository.insertServiceOrderLines(
          tx,
          organizationId,
          order.id,
          rows,
        );
        const returned = await returnUnitFromRepair(tx, {
          organizationId,
          unitId: order.unitId!,
          amount: total,
          currency,
          reference: formatServiceOrderNumber(order.number),
          createdBy: userId,
        });
        if (!returned.ok) {
          // La moneda se leyó de la unidad, que no la cambia: solo queda el tope del costo.
          if (returned.reason === "cost_currency_mismatch") {
            throw new Error("la moneda del costo de la unidad cambió");
          }
          throw new OwnUnitRejected<MarkRejection>({
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "cost_limit",
          });
        }
        const after: Record<string, string | number | null> = {
          status: "repaired",
          technician_currency: currency,
          technician_total: total,
          lines: rows.length,
          ...Object.fromEntries(
            rows.flatMap((line) => [
              [`line_${line.position}_repair_type_id`, line.repairTypeId],
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
  } catch (error) {
    if (error instanceof OwnUnitRejected) return error.result as MarkRejection;
    throw error;
  }
}

// El formulario de marcarla reparada (D-3): los tipos activos, con el costo de la lista del modelo
// cuando está en la moneda del costo de la unidad (U-1). Un tipo sin costo en esa moneda se carga a
// mano. Solo admin, y solo con la orden mandada.
export type RepairCostFormRow = {
  repairTypeId: string;
  name: string;
  listCost: string | null;
};

export type RepairCostForm = { currency: string; rows: RepairCostFormRow[] };

export async function getOwnUnitRepairForm(
  context: AuthContext,
  serviceOrderId: string,
): Promise<
  | { ok: true; form: RepairCostForm }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "invalid_transition"; status: ServiceOrderStatus }
    >
> {
  const allowed = await requireOwnUnitRepairs(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(serviceOrderId).success) {
    return failure("VALIDATION_ERROR");
  }
  const order = await ownUnitOrder(context, serviceOrderId);
  if (!order) return failure("NOT_FOUND");
  if (order.status !== "sent") return invalidTransition(order.status);
  const { organizationId } = context;
  const [unit, types, prices] = await Promise.all([
    getUnitForRepair(organizationId, order.unitId!),
    repository.findRepairTypes(organizationId),
    repository.findModelRepairPrices(organizationId, order.modelId),
  ]);
  if (!unit) return failure("NOT_FOUND");
  const byType = new Map(prices.map((row) => [row.repairTypeId, row]));
  return {
    ok: true,
    form: {
      currency: unit.costCurrency,
      rows: types
        .filter((type) => type.isActive)
        .map((type) => {
          const row = byType.get(type.id);
          return {
            repairTypeId: type.id,
            name: type.name,
            listCost:
              row && row.costCurrency === unit.costCurrency ? row.cost : null,
          };
        }),
    },
  };
}

// Las órdenes de unas unidades, para la lista de unidades de un producto (D-7): por unidad, de la más
// reciente a la más vieja. Desde la 29.9.2, también los reclamos de garantía de una unidad vendida
// (brief-29.9.2, D-5). Los dos roles; sin repairs, ninguna.
export type UnitServiceOrder = {
  id: string;
  displayNumber: string;
  kind: ServiceOrderKind;
  status: ServiceOrderStatus;
  createdAt: Date;
};

export async function listUnitServiceOrders(
  context: AuthContext,
  unitIds: string[],
): Promise<Map<string, UnitServiceOrder[]>> {
  const allowed = await requireRepairs(context);
  const ids = unitIds.filter((id) => idSchema.safeParse(id).success);
  if (!allowed.ok || ids.length === 0) return new Map();
  const lowered = ids.map((id) => id.toLowerCase());
  const [own, claims] = await Promise.all([
    repository.findServiceOrdersOfUnits(context.organizationId, lowered),
    repository.findClaimsOf(context.organizationId, { unitIds: lowered }),
  ]);
  const rows = [...own, ...claims].sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  );
  const byUnit = new Map<string, UnitServiceOrder[]>();
  for (const row of rows) {
    const unitId = (row.unitId ?? row.claimUnitId)!;
    const list = byUnit.get(unitId) ?? [];
    list.push({
      id: row.id,
      displayNumber: formatServiceOrderNumber(row.number),
      kind: row.kind,
      status: row.status,
      createdAt: row.createdAt,
    });
    byUnit.set(unitId, list);
  }
  return byUnit;
}
