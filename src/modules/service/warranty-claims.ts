import { z } from "zod";
import { recordAudit } from "@/modules/audit";
import { getProduct } from "@/modules/catalog";
import { getClientsByIds, lockClientForOrder } from "@/modules/crm";
import { getUnitWarranties, type Warranty } from "@/modules/inventory";
import { nextDocumentNumber } from "@/modules/numbering";
import {
  getMainCurrency,
  getOrganizationTimezone,
  type AuthContext,
} from "@/modules/organizations";
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
  type ServiceOrderRef,
  type ServiceOrderStatus,
  type TransitionResult,
} from "./service-orders";
import { findServiceSettings, serviceOrderWarranty } from "./warranties";

// El reclamo de garantía (ADR 0024, punto 11; brief-29.9.2): un equipo que vuelve en garantía se
// recibe, se manda al técnico, se repara y se entrega sin presupuesto y sin venta. Apunta al equipo
// original (U-1): la unidad que el local vendió o la orden de un cliente que el local reparó y entregó.
// Solo se abre con ese equipo en garantía, derivada con las lecturas de la 29.9, y a lo sumo uno
// abierto por equipo. Lo opera un admin, con repairs; el de una unidad exige además serialized_units,
// que es la capacidad de su garantía.
//
// El cliente de una unidad sale de la pantalla (D-1): la ficha del cliente compone de quién es cada
// unidad leyendo sales y orders, y service no lee orders (H-5). Acá se comprueba que el cliente existe
// y está activo, no que compró la unidad: es un límite declarado, de un admin y auditado.
//
// El orden de bloqueo, como el alta de una orden: el cliente en modo compartido, el contador y la
// orden. La garantía se lee antes de la transacción, sin bloquear la unidad: inventory no da un
// bloqueo de la unidad para otro módulo, y la regla que no puede romperse —un reclamo abierto por
// equipo— la fija el índice único parcial.

const idSchema = z.uuid();

export type WarrantyClaimInput =
  | { unitId: string; clientId: string; reportedIssue: string }
  | { serviceOrderId: string; reportedIssue: string };

export type WarrantyClaimField = "reportedIssue";

export type WarrantyClaimRule =
  // La unidad no está vendida, o la orden no es de un cliente, reparada y entregada.
  | "not_claimable"
  | "not_in_warranty"
  | "claim_open"
  | "inactive_client"
  | "unit_without_model";

export type CreateWarrantyClaimResult =
  | { ok: true; order: ServiceOrderRef }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<"VALIDATION_ERROR", { fields: WarrantyClaimField[] }>
  | Failure<"NOT_FOUND", { target: "unit" | "order" | "client" }>
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: WarrantyClaimRule }>;

type CreateRejection = Exclude<CreateWarrantyClaimResult, { ok: true }>;

// Un rechazo dentro de la transacción se lanza, para no dejar consumido el número de la orden.
class ClaimRejected extends Error {
  constructor(readonly result: CreateRejection) {
    super("rechazado");
    this.name = "ClaimRejected";
  }
}

function rule(value: WarrantyClaimRule): CreateRejection {
  return { ok: false, code: "BUSINESS_RULE_VIOLATION", rule: value };
}

// El equipo original, como lo necesita el alta: de quién es, qué modelo e IMEI tiene, y su garantía.
type ClaimTarget = {
  claimUnitId: string | null;
  claimServiceOrderId: string | null;
  // Null en una unidad: lo da la pantalla.
  clientId: string | null;
  modelId: string;
  deviceSerial: string | null;
  // Para la pantalla del alta.
  description: string;
  warranty: Warranty | null;
};

async function unitTarget(
  context: AuthContext,
  unitId: string,
): Promise<{ ok: true; target: ClaimTarget } | CreateRejection> {
  if (!idSchema.safeParse(unitId).success) {
    return { ok: false, code: "NOT_FOUND", target: "unit" };
  }
  // Sin serialized_units, getUnitWarranties responde NOT_FOUND: la garantía de una unidad es de esa
  // capacidad.
  const found = await getUnitWarranties(context, [unitId]);
  if (!found.ok) return found;
  const unit = found.units[0];
  if (!unit) return { ok: false, code: "NOT_FOUND", target: "unit" };
  if (unit.status !== "sold") return rule("not_claimable");
  const product = await getProduct(context, unit.productId);
  if (!product.ok) return { ok: false, code: "NOT_FOUND", target: "unit" };
  const modelId = product.product.modelId;
  if (modelId === null) return rule("unit_without_model");
  return {
    ok: true,
    target: {
      claimUnitId: unit.id,
      claimServiceOrderId: null,
      clientId: null,
      modelId,
      deviceSerial: unit.serial,
      description: `${unit.productName} ${unit.serial}`.trim(),
      warranty: unit.warranty,
    },
  };
}

async function orderTarget(
  context: AuthContext,
  serviceOrderId: string,
): Promise<{ ok: true; target: ClaimTarget } | CreateRejection> {
  if (!idSchema.safeParse(serviceOrderId).success) {
    return { ok: false, code: "NOT_FOUND", target: "order" };
  }
  const { organizationId } = context;
  const original = await repository.findServiceOrder(
    organizationId,
    serviceOrderId.toLowerCase(),
  );
  if (!original) return { ok: false, code: "NOT_FOUND", target: "order" };
  // La garantía de una reparación es la de una orden de un cliente reparada y entregada (brief-29.9,
  // D-2): un reclamo no tiene garantía propia, así que no se reclama un reclamo.
  if (
    original.kind !== "customer_device" ||
    original.status !== "delivered" ||
    original.repairedAt === null
  ) {
    return rule("not_claimable");
  }
  const [settings, timezone] = await Promise.all([
    findServiceSettings(organizationId),
    getOrganizationTimezone(context),
  ]);
  return {
    ok: true,
    target: {
      claimUnitId: null,
      claimServiceOrderId: original.id,
      clientId: original.clientId!,
      modelId: original.modelId,
      deviceSerial: original.deviceSerial,
      description: formatServiceOrderNumber(original.number),
      warranty: serviceOrderWarranty(
        original,
        settings?.warrantyDays ?? null,
        timezone,
        new Date(),
      ),
    },
  };
}

function targetOf(context: AuthContext, input: WarrantyClaimInput) {
  return "unitId" in input
    ? unitTarget(context, input.unitId)
    : orderTarget(context, input.serviceOrderId);
}

export async function createWarrantyClaim(
  context: AuthContext,
  input: WarrantyClaimInput,
): Promise<CreateWarrantyClaimResult> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  const reportedIssue = input.reportedIssue.trim();
  if (
    reportedIssue.length === 0 ||
    reportedIssue.length > REPORTED_ISSUE_MAX_LENGTH
  ) {
    return { ok: false, code: "VALIDATION_ERROR", fields: ["reportedIssue"] };
  }
  const clientInput = "clientId" in input ? input.clientId.trim() : null;
  if (clientInput !== null && !idSchema.safeParse(clientInput).success) {
    return { ok: false, code: "NOT_FOUND", target: "client" };
  }
  const found = await targetOf(context, input);
  if (!found.ok) return found;
  const { target } = found;
  if (target.warranty?.status !== "in_warranty") {
    return rule("not_in_warranty");
  }
  const clientId = (target.clientId ?? clientInput!).toLowerCase();
  const { organizationId, userId } = context;
  try {
    return await repository.withTransaction(async (tx) => {
      const client = await lockClientForOrder(tx, organizationId, clientId);
      if (client === "not_found") {
        throw new ClaimRejected({
          ok: false,
          code: "NOT_FOUND",
          target: "client",
        });
      }
      if (client === "inactive") {
        throw new ClaimRejected(rule("inactive_client"));
      }
      const number = await nextDocumentNumber(
        tx,
        organizationId,
        "service_order",
      );
      const order = await repository.insertWarrantyClaim(tx, {
        organizationId,
        number,
        clientId,
        claimUnitId: target.claimUnitId,
        claimServiceOrderId: target.claimServiceOrderId,
        modelId: target.modelId,
        deviceSerial: target.deviceSerial,
        reportedIssue,
        createdBy: userId,
      });
      if (order === "open") throw new ClaimRejected(rule("claim_open"));
      // Sin el IMEI ni lo que reportó el cliente, como el alta de una orden (brief-29.6, D-11).
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
            kind: "warranty_claim",
            status: order.status,
            client_id: clientId,
            claim_unit_id: target.claimUnitId,
            claim_service_order_id: target.claimServiceOrderId,
            model_id: target.modelId,
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
    if (error instanceof ClaimRejected) return error.result;
    throw error;
  }
}

// La pantalla del alta (D-5): el equipo, el cliente y su garantía, y si se puede abrir. Solo admin.
export type WarrantyClaimForm = {
  description: string;
  clientId: string;
  clientName: string | null;
  warranty: Warranty | null;
};

export async function getWarrantyClaimForm(
  context: AuthContext,
  input: { unitId: string; clientId: string } | { serviceOrderId: string },
): Promise<{ ok: true; form: WarrantyClaimForm } | CreateRejection> {
  const allowed = await requireRepairs(context, "admin");
  if (!allowed.ok) return allowed;
  const found = await targetOf(context, { ...input, reportedIssue: "" });
  if (!found.ok) return found;
  const { target } = found;
  const clientId =
    target.clientId ?? ("clientId" in input ? input.clientId : "");
  if (!idSchema.safeParse(clientId).success) {
    return { ok: false, code: "NOT_FOUND", target: "client" };
  }
  const clients = await getClientsByIds(context, [clientId.toLowerCase()]);
  const client = clients.ok ? clients.clients[0] : undefined;
  if (!client) return { ok: false, code: "NOT_FOUND", target: "client" };
  return {
    ok: true,
    form: {
      description: target.description,
      clientId: client.id,
      clientName: client.displayName,
      warranty: target.warranty,
    },
  };
}

// Marcarlo reparado (D-2): con lo que cobró el técnico por cada tipo, en una moneda, como una unidad
// propia (H-7), o sin cargo (U-2). Con cargo, el total va al debe de su cuenta (D-4); sin cargo, la
// orden no tiene total ni líneas, y la cuenta no la lee.
export type WarrantyClaimRepairInput =
  | { charge: false }
  | { charge: true; currency: string; lines: RepairCostLineInput[] };

export type MarkWarrantyClaimRepairedResult =
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
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: "total_too_large" }>;

export async function markWarrantyClaimRepaired(
  context: AuthContext,
  serviceOrderId: string,
  input: WarrantyClaimRepairInput,
): Promise<MarkWarrantyClaimRepairedResult> {
  const parsed = input.charge
    ? parseRepairCostInput(
        input.lines,
        input.currency.trim(),
        MAX_SERVICE_ORDER_LINES,
      )
    : null;
  if (parsed && !parsed.ok) {
    const allowed = await requireRepairs(context, "admin");
    if (!allowed.ok) return allowed;
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      reason: parsed.reason,
      lines: parsed.lines,
    };
  }
  const { organizationId } = context;
  return inTransition(
    context,
    serviceOrderId,
    "repaired",
    "warranty_claim",
    async (tx, order): Promise<MarkWarrantyClaimRepairedResult> => {
      const repairedAt = new Date();
      if (parsed === null) {
        await repository.updateServiceOrder(tx, organizationId, order.id, {
          status: "repaired",
          repairedAt,
        });
        await recordAudit(
          tx,
          statusAudit(
            context,
            order,
            { status: order.status, technician_total: null },
            { status: "repaired", technician_total: null },
          ),
        );
        return { ok: true };
      }
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
      const currency = (input as { currency: string }).currency.trim();
      const total = moneyToDatabase(evaluated.total);
      // Primero la cabecera: el trigger de las líneas exige un reclamo reparado con su total.
      await repository.updateServiceOrder(tx, organizationId, order.id, {
        status: "repaired",
        repairedAt,
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
}

// El formulario de marcarlo reparado: los tipos activos, con el costo de la lista del modelo cuando
// está en la moneda que propone, la principal de la organización. Un tipo sin costo en esa moneda se
// carga a mano. Solo admin, y solo con el reclamo en el técnico.
export type WarrantyClaimRepairFormRow = {
  repairTypeId: string;
  name: string;
  listCost: string | null;
};

export type WarrantyClaimRepairForm = {
  currency: string | null;
  rows: WarrantyClaimRepairFormRow[];
};

export async function getWarrantyClaimRepairForm(
  context: AuthContext,
  serviceOrderId: string,
): Promise<
  | { ok: true; form: WarrantyClaimRepairForm }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "invalid_transition"; status: ServiceOrderStatus }
    >
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
  if (order?.kind !== "warranty_claim") return failure("NOT_FOUND");
  if (order.status !== "sent") return invalidTransition(order.status);
  const [types, prices, main] = await Promise.all([
    repository.findRepairTypes(organizationId),
    repository.findModelRepairPrices(organizationId, order.modelId),
    getMainCurrency(organizationId),
  ]);
  const byType = new Map(prices.map((row) => [row.repairTypeId, row]));
  return {
    ok: true,
    form: {
      currency: main,
      rows: types
        .filter((type) => type.isActive)
        .map((type) => {
          const row = byType.get(type.id);
          return {
            repairTypeId: type.id,
            name: type.name,
            listCost: row && row.costCurrency === main ? row.cost : null,
          };
        }),
    },
  };
}
