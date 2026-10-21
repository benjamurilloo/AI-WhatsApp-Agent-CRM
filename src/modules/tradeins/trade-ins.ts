import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  auditUserIds,
  listEntityAuditLogs,
  nameAuditActors,
  recordAudit,
  type NamedAuditLogEntry,
} from "@/modules/audit";
import { getProductsByIds, searchProducts } from "@/modules/catalog";
import {
  getClientsByIds,
  lockClientForOrder,
  type Client,
} from "@/modules/crm";
import {
  getUnitSummaries,
  isSerialTakenError,
  listUnitGrades,
  parseUnitSerial,
  registerTradeInUnit,
  writeOffTradeInUnit,
  type BalanceRule,
  type UnitStatus,
} from "@/modules/inventory";
import { formatDocumentNumber, nextDocumentNumber } from "@/modules/numbering";
import {
  getMainCurrency,
  getMemberSummaries,
  type AuthContext,
} from "@/modules/organizations";
import type { DbTransaction } from "@/shared/db";
import { failure, type Failure } from "@/shared/errors";
import {
  acceptedCurrencies,
  currencyDecimals,
  moneyToDatabase,
  parseMoneyInput,
  type AmountRejection,
} from "@/shared/money";
import { requireTradeIns } from "./checklist";
import * as repository from "./repository";

// La recepción de un usado, el comprobante PU, y su anulación, el APU (ADR 0024, punto 8; brief-29.7,
// D-4, D-5 y D-8). tradeins es dueño de la regla: abre la transacción de la recepción y se la pasa a
// crm (el cliente), inventory (la unidad), numbering (el número) y audit. La anulación la orquesta cash
// bajo su bloqueo (U-4): cash llama a voidTradeInInCash con su transacción, y esta, a inventory para dar
// de baja la unidad (U-3).
//
// Un admin recibe y anula; un viewer lee las recepciones sin el valor reconocido (ADR 0024, punto 14).
// El comprobante no tiene datos personales: el cliente es una referencia, y su nombre, su teléfono y su
// DNI se leen de la ficha al mostrarlo (U-5).

export type TradeInDestination = repository.TradeInDestination;
export type TradeInVoidReason = repository.TradeInVoidReason;
export const TRADE_IN_DESTINATIONS = repository.TRADE_IN_DESTINATIONS;
export const TRADE_IN_VOID_REASONS = repository.TRADE_IN_VOID_REASONS;

export const TRADE_INS_PAGE_SIZE = 25;
export const CLIENT_TRADE_INS_LIMIT = 5;

const idSchema = z.uuid();

export function formatTradeInNumber(value: number): string {
  return formatDocumentNumber("trade_in", value);
}

export function formatTradeInVoidNumber(value: number): string {
  return formatDocumentNumber("trade_in_void", value);
}

// El número como lo escribe quien busca: «PU-000123», «pu000123».
export function parseTradeInNumberSearch(text: string): number | null {
  const match = /^pu-?0*(\d{1,15})$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// El alta (D-4). Todo llega como texto desde el formulario; passed son los puntos del checklist que
// pasaron, por id.

export type TradeInInput = {
  clientId: string;
  productId: string;
  serial: string;
  batteryHealth: string;
  gradeId: string;
  value: string;
  currency: string;
  destination: string;
  passed: string[];
};

export type TradeInField =
  | "client"
  | "product"
  | "serial"
  | "batteryHealth"
  | "grade"
  | "value"
  | "currency"
  | "destination";

export type TradeInValues = {
  clientId: string;
  productId: string;
  serial: string;
  batteryHealth: number;
  gradeId: string;
  value: string;
  currency: string;
  destination: TradeInDestination;
  passed: Set<string>;
};

export type TradeInValidationFailure = Failure<
  "VALIDATION_ERROR",
  { fields: TradeInField[]; amount?: AmountRejection }
>;

const destinationSchema = z.enum(repository.TRADE_IN_DESTINATIONS);

export function validateTradeInInput(
  input: TradeInInput,
): { ok: true; values: TradeInValues } | TradeInValidationFailure {
  const fields: TradeInField[] = [];
  const clientId = input.clientId.trim().toLowerCase();
  if (!idSchema.safeParse(clientId).success) fields.push("client");
  const productId = input.productId.trim().toLowerCase();
  if (!idSchema.safeParse(productId).success) fields.push("product");
  const serial = parseUnitSerial(input.serial);
  if (serial === null) fields.push("serial");
  const batteryText = input.batteryHealth.trim();
  const batteryHealth = /^\d{1,3}$/.test(batteryText)
    ? Number(batteryText)
    : NaN;
  if (!(batteryHealth >= 0 && batteryHealth <= 100)) {
    fields.push("batteryHealth");
  }
  const gradeId = input.gradeId.trim().toLowerCase();
  if (!idSchema.safeParse(gradeId).success) fields.push("grade");
  const currency = input.currency.trim().toUpperCase();
  const decimals = currencyDecimals(currency);
  let value: string | null = null;
  let amount: AmountRejection | undefined;
  if (!decimals.ok) {
    fields.push("currency");
  } else {
    const parsed = parseMoneyInput(input.value, decimals.decimals);
    if (parsed.ok) value = moneyToDatabase(parsed.amount);
    else {
      fields.push("value");
      amount = parsed.reason;
    }
  }
  const destination = destinationSchema.safeParse(input.destination);
  if (!destination.success) fields.push("destination");
  if (fields.length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields,
      ...(amount ? { amount } : {}),
    };
  }
  return {
    ok: true,
    values: {
      clientId,
      productId,
      serial: serial!,
      batteryHealth,
      gradeId,
      value: value!,
      currency,
      destination: destination.data!,
      passed: new Set(input.passed.map((id) => id.trim().toLowerCase())),
    },
  };
}

export type TradeInRef = {
  id: string;
  number: number;
  displayNumber: string;
};

export type CreateTradeInResult =
  | { ok: true; tradeIn: TradeInRef; unitId: string }
  | Failure<"FORBIDDEN" | "NOT_FOUND">
  | TradeInValidationFailure
  | Failure<"NOT_FOUND", { target: "client" | "product" }>
  | Failure<"CONFLICT", { field: "serial" }>
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      {
        rule:
          | "inactive_client"
          | "inactive_product"
          | "not_used_unit_product"
          | "inactive_grade";
      }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "mandatory_check_failed"; items: string[] }
    >;

// El orden de bloqueo (D-4): el cliente en modo compartido, el checklist FOR SHARE (un cambio a la vez
// espera), y en inventory el producto FOR SHARE, el aviso de IMEI repetido, el contador del PU y la
// unidad; al final, el comprobante y su resultado. El índice único del IMEI es la última defensa entre
// dos recepciones del mismo equipo, o una recepción y un alta.
export async function createTradeIn(
  context: AuthContext,
  input: TradeInInput,
): Promise<CreateTradeInResult> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const validated = validateTradeInInput(input);
  if (!validated.ok) return validated;
  const { values } = validated;
  const { organizationId, userId } = context;
  try {
    return await repository.withTransaction(
      async (tx): Promise<CreateTradeInResult> => {
        const client = await lockClientForOrder(
          tx,
          organizationId,
          values.clientId,
        );
        if (client === "not_found") {
          return { ok: false, code: "NOT_FOUND", target: "client" };
        }
        if (client === "inactive") {
          return rule("inactive_client");
        }
        const items = (
          await repository.findChecklistItems(organizationId, tx, {
            lock: "share",
          })
        ).filter((item) => item.isActive);
        const failed = items.filter(
          (item) => item.isMandatory && !values.passed.has(item.id),
        );
        if (failed.length > 0) {
          return {
            ok: false,
            code: "BUSINESS_RULE_VIOLATION",
            rule: "mandatory_check_failed",
            items: failed.map((item) => item.name),
          };
        }
        const tradeInId = randomUUID();
        let number: number | null = null;
        const unit = await registerTradeInUnit(tx, {
          organizationId,
          tradeInId,
          productId: values.productId,
          serial: values.serial,
          gradeId: values.gradeId,
          batteryHealth: values.batteryHealth,
          cost: values.value,
          costCurrency: values.currency,
          beforeInsert: async () => {
            number = await nextDocumentNumber(tx, organizationId, "trade_in");
          },
          createdBy: userId,
        });
        if (!unit.ok) {
          switch (unit.reason) {
            case "product_not_found":
              return { ok: false, code: "NOT_FOUND", target: "product" };
            case "serial_taken":
              return { ok: false, code: "CONFLICT", field: "serial" };
            case "grade_inactive":
              return rule("inactive_grade");
            default:
              return rule(unit.reason);
          }
        }
        if (number === null) throw new Error("La recepción no tomó su número.");
        const tradeIn = await repository.insertTradeIn(tx, {
          id: tradeInId,
          organizationId,
          number,
          clientId: values.clientId,
          productId: values.productId,
          unitId: unit.unitId,
          serial: values.serial,
          batteryHealth: values.batteryHealth,
          gradeId: values.gradeId,
          value: values.value,
          currency: values.currency,
          destination: values.destination,
          createdBy: userId,
        });
        await repository.insertChecklistResults(
          tx,
          organizationId,
          tradeIn.id,
          items.map((item, index) => ({
            checklistItemId: item.id,
            position: index + 1,
            itemName: item.name,
            wasMandatory: item.isMandatory,
            passed: values.passed.has(item.id),
          })),
        );
        // Sin datos del cliente: el comprobante no los tiene (D-4).
        await recordAudit(tx, {
          organizationId,
          actorUserId: userId,
          entityType: "trade_in",
          entityId: tradeIn.id,
          action: "create",
          diff: {
            before: null,
            after: {
              number: tradeIn.number,
              product_id: values.productId,
              unit_id: unit.unitId,
              serial: values.serial,
              value: values.value,
              currency: values.currency,
              destination: values.destination,
            },
          },
        });
        return {
          ok: true,
          tradeIn: {
            id: tradeIn.id,
            number: tradeIn.number,
            displayNumber: formatTradeInNumber(tradeIn.number),
          },
          unitId: unit.unitId,
        };
      },
    );
  } catch (error) {
    // Dos recepciones del mismo IMEI a la vez, o una recepción y un alta: la segunda choca en el índice
    // único parcial (AC-7).
    if (isSerialTakenError(error)) {
      return { ok: false, code: "CONFLICT", field: "serial" };
    }
    throw error;
  }
}

function rule<R extends string>(
  name: R,
): Failure<"BUSINESS_RULE_VIOLATION", { rule: R }> {
  return { ok: false, code: "BUSINESS_RULE_VIOLATION", rule: name };
}

// El formulario de la recepción (D-7): los productos usados llevados por unidad, los grados activos,
// el checklist activo y las monedas, con la principal propuesta. Solo admin.
export type TradeInForm = {
  products: { id: string; name: string; sku: string }[];
  grades: { id: string; name: string; description: string | null }[];
  checklist: { id: string; name: string; isMandatory: boolean }[];
  currencies: string[];
  mainCurrency: string | null;
};

export async function getTradeInForm(
  context: AuthContext,
): Promise<
  { ok: true; form: TradeInForm } | Failure<"FORBIDDEN" | "NOT_FOUND">
> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  const [products, grades, items, mainCurrency] = await Promise.all([
    searchProducts(context, { text: "", activity: "active" }),
    listUnitGrades(context),
    repository.findChecklistItems(context.organizationId),
    getMainCurrency(context.organizationId),
  ]);
  return {
    ok: true,
    form: {
      products: products.ok
        ? products.products
            .filter(
              (product) =>
                product.condition === "used" &&
                product.tracking === "unit" &&
                !product.isService,
            )
            .map((product) => ({
              id: product.id,
              name: product.name,
              sku: product.sku,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
        : [],
      grades: grades.ok
        ? grades.grades
            .filter((grade) => grade.isActive)
            .map((grade) => ({
              id: grade.id,
              name: grade.name,
              description: grade.description,
            }))
        : [],
      checklist: items
        .filter((item) => item.isActive)
        .map((item) => ({
          id: item.id,
          name: item.name,
          isMandatory: item.isMandatory,
        })),
      currencies: acceptedCurrencies(),
      mainCurrency,
    },
  };
}

// Las lecturas (D-7 y D-8): los dos roles; el valor, solo un admin.

export type TradeInSummary = {
  id: string;
  number: number;
  displayNumber: string;
  createdAt: Date;
  clientId: string;
  clientName: string | null;
  productId: string;
  productName: string | null;
  unitId: string;
  serial: string;
  destination: TradeInDestination;
  // Null para un viewer.
  value: { amount: string; currency: string } | null;
  // La anulación, si la tiene.
  voidDisplayNumber: string | null;
};

async function summarize(
  context: AuthContext,
  rows: repository.TradeInRow[],
): Promise<TradeInSummary[]> {
  const [clients, products] = await Promise.all([
    getClientsByIds(
      context,
      rows.map((row) => row.clientId),
    ),
    getProductsByIds(
      context,
      rows.map((row) => row.productId),
    ),
  ]);
  const clientNames = new Map(
    clients.ok
      ? clients.clients.map((client) => [client.id, client.displayName])
      : [],
  );
  const productNames = new Map(
    products.ok
      ? products.products.map((product) => [product.id, product.name])
      : [],
  );
  const admin = context.role === "admin";
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    displayNumber: formatTradeInNumber(row.number),
    createdAt: row.createdAt,
    clientId: row.clientId,
    clientName: clientNames.get(row.clientId) ?? null,
    productId: row.productId,
    productName: productNames.get(row.productId) ?? null,
    unitId: row.unitId,
    serial: row.serial,
    destination: row.destination,
    value: admin ? { amount: row.value, currency: row.currency } : null,
    voidDisplayNumber: row.voided
      ? formatTradeInVoidNumber(row.voided.number)
      : null,
  }));
}

export type TradeInStatusFilter = "all" | "current" | "voided";
export type TradeInDestinationFilter = "all" | TradeInDestination;

export type TradeInListFilters = {
  status: TradeInStatusFilter;
  destination: TradeInDestinationFilter;
  // El número («PU-000123») o el IMEI.
  search: string;
  page: number;
};

export type TradeInPage = {
  ok: true;
  tradeIns: TradeInSummary[];
  total: number;
  page: number;
  pageCount: number;
};

export async function listTradeIns(
  context: AuthContext,
  filters: TradeInListFilters,
): Promise<TradeInPage | Failure<"FORBIDDEN" | "NOT_FOUND">> {
  const allowed = await requireTradeIns(context);
  if (!allowed.ok) return allowed;
  const search = filters.search.trim();
  const number = search === "" ? null : parseTradeInNumberSearch(search);
  const serial =
    search === "" || number !== null ? null : parseUnitSerial(search);
  if (search !== "" && number === null && serial === null) {
    return { ok: true, tradeIns: [], total: 0, page: 1, pageCount: 1 };
  }
  const query: repository.TradeInListQuery = {
    organizationId: context.organizationId,
    voided: filters.status === "all" ? null : filters.status === "voided",
    destination: filters.destination === "all" ? null : filters.destination,
    number,
    serial,
    clientId: null,
  };
  const total = await repository.countTradeIns(query);
  const pageCount = Math.max(1, Math.ceil(total / TRADE_INS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(filters.page) || 1), pageCount);
  const rows =
    total === 0
      ? []
      : await repository.findTradeIns(
          query,
          TRADE_INS_PAGE_SIZE,
          (page - 1) * TRADE_INS_PAGE_SIZE,
        );
  return {
    ok: true,
    tradeIns: await summarize(context, rows),
    total,
    page,
    pageCount,
  };
}

// Las últimas recepciones de un cliente, para su ficha (D-7). Sin la capacidad, NOT_FOUND.
export async function listClientTradeIns(
  context: AuthContext,
  clientId: string,
): Promise<
  | { ok: true; tradeIns: TradeInSummary[]; total: number }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireTradeIns(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(clientId).success) return failure("VALIDATION_ERROR");
  const query: repository.TradeInListQuery = {
    organizationId: context.organizationId,
    voided: null,
    destination: null,
    number: null,
    serial: null,
    clientId: clientId.toLowerCase(),
  };
  const total = await repository.countTradeIns(query);
  const rows =
    total === 0
      ? []
      : await repository.findTradeIns(query, CLIENT_TRADE_INS_LIMIT, 0);
  return { ok: true, tradeIns: await summarize(context, rows), total };
}

// La recepción que creó cada unidad, para la ficha de unidades (D-7). Sin la capacidad, ninguna.
export async function getUnitTradeIns(
  context: AuthContext,
  unitIds: string[],
): Promise<Map<string, TradeInRef>> {
  const allowed = await requireTradeIns(context);
  if (!allowed.ok) return new Map();
  const rows = await repository.findTradeInsByUnits(
    context.organizationId,
    unitIds.filter((id) => idSchema.safeParse(id).success),
  );
  return new Map(
    rows.map((row) => [
      row.unitId,
      {
        id: row.id,
        number: row.number,
        displayNumber: formatTradeInNumber(row.number),
      },
    ]),
  );
}

export type TradeInCheck = {
  position: number;
  // La copia del nombre y de si era obligatorio al emitirlo (D-4).
  name: string;
  wasMandatory: boolean;
  passed: boolean;
};

export type TradeInDetail = TradeInSummary & {
  // El cliente como lo entrega crm para el rol: el DNI, solo para un admin (U-5).
  client: Client | null;
  batteryHealth: number;
  grade: { id: string; name: string } | null;
  checks: TradeInCheck[];
  // La unidad, con su estado de hoy.
  unitStatus: UnitStatus | null;
  createdByName: string | null;
  void: {
    displayNumber: string;
    reason: TradeInVoidReason;
    createdAt: Date;
    createdByName: string | null;
  } | null;
};

export async function getTradeIn(
  context: AuthContext,
  tradeInId: string,
): Promise<
  | { ok: true; tradeIn: TradeInDetail }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireTradeIns(context);
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(tradeInId).success) {
    return failure("VALIDATION_ERROR");
  }
  const { organizationId } = context;
  const row = await repository.findTradeIn(
    organizationId,
    tradeInId.toLowerCase(),
  );
  if (!row) return failure("NOT_FOUND");
  const [[summary], clients, results, units, grades, members] =
    await Promise.all([
      summarize(context, [row]),
      getClientsByIds(context, [row.clientId]),
      repository.findChecklistResults(organizationId, row.id),
      getUnitSummaries(organizationId, [row.unitId]),
      listUnitGrades(context),
      getMemberSummaries(
        organizationId,
        [row.createdBy, row.voided?.createdBy].filter(
          (id): id is string => id !== undefined,
        ),
      ),
    ]);
  const names = new Map(members.map((member) => [member.id, member.name]));
  const grade = grades.ok
    ? grades.grades.find((candidate) => candidate.id === row.gradeId)
    : undefined;
  return {
    ok: true,
    tradeIn: {
      ...summary!,
      client: clients.ok ? (clients.clients[0] ?? null) : null,
      batteryHealth: row.batteryHealth,
      grade: grade ? { id: grade.id, name: grade.name } : null,
      checks: results.map((result) => ({
        position: result.position,
        name: result.itemName,
        wasMandatory: result.wasMandatory,
        passed: result.passed,
      })),
      unitStatus: units.get(row.unitId)?.status ?? null,
      createdByName: names.get(row.createdBy) ?? null,
      void: row.voided
        ? {
            displayNumber: formatTradeInVoidNumber(row.voided.number),
            reason: row.voided.reason,
            createdAt: row.voided.createdAt,
            createdByName: names.get(row.voided.createdBy) ?? null,
          }
        : null,
    },
  };
}

// La historia de la recepción: el alta y la anulación. Solo admin: lleva el valor.
export async function listTradeInAudit(
  context: AuthContext,
  tradeInId: string,
  page: number,
): Promise<
  | {
      ok: true;
      entries: NamedAuditLogEntry[];
      total: number;
      page: number;
      pageCount: number;
    }
  | Failure<"FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR">
> {
  const allowed = await requireTradeIns(context, "admin");
  if (!allowed.ok) return allowed;
  if (!idSchema.safeParse(tradeInId).success) {
    return failure("VALIDATION_ERROR");
  }
  const row = await repository.findTradeIn(
    context.organizationId,
    tradeInId.toLowerCase(),
  );
  if (!row) return failure("NOT_FOUND");
  const found = await listEntityAuditLogs({
    organizationId: context.organizationId,
    entityTypes: ["trade_in"],
    entityId: row.id,
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

// La anulación (D-5): la orquesta cash, que ya autorizó, validó el motivo y tomó su bloqueo (U-4). Con
// el bloqueo tomado, la recepción y su anulación se leen otra vez: dos anulaciones de la misma recepción
// se serializan en él, y la segunda ve la primera. La recepción no se bloquea: crm_app no tiene UPDATE en
// trade_ins, y FOR UPDATE lo exige. Después, en inventory, el producto, la unidad y su saldo, y al final
// el contador del APU, que toma reason.
export type VoidTradeInRef = TradeInRef & { voidDisplayNumber: string };

export type VoidTradeInResult =
  | { ok: true; tradeIn: VoidTradeInRef }
  | Failure<"NOT_FOUND">
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "already_voided"; voidDisplayNumber: string }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "unit_not_in_shop"; status: UnitStatus }
    >
  | Failure<"BUSINESS_RULE_VIOLATION", { rule: BalanceRule }>;

export async function voidTradeInInCash(
  tx: DbTransaction,
  request: {
    organizationId: string;
    tradeInId: string;
    reason: TradeInVoidReason;
    createdBy: string;
  },
): Promise<VoidTradeInResult> {
  const { organizationId, createdBy } = request;
  const row = await repository.findTradeIn(
    organizationId,
    request.tradeInId,
    tx,
  );
  if (!row) return failure("NOT_FOUND");
  if (row.voided) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "already_voided",
      voidDisplayNumber: formatTradeInVoidNumber(row.voided.number),
    };
  }
  let number: number | null = null;
  const writtenOff = await writeOffTradeInUnit(tx, {
    organizationId,
    unitId: row.unitId,
    reason: async () => {
      number = await nextDocumentNumber(tx, organizationId, "trade_in_void");
      return `Anulación ${formatTradeInVoidNumber(number)} del usado ${formatTradeInNumber(row.number)}`;
    },
    createdBy,
  });
  if (!writtenOff.ok) {
    if (writtenOff.reason === "unit_not_in_shop") {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "unit_not_in_shop",
        status: writtenOff.status,
      };
    }
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: writtenOff.reason,
    };
  }
  if (number === null) throw new Error("La anulación no tomó su número.");
  const tradeInVoid = await repository.insertTradeInVoid(tx, {
    organizationId,
    number,
    tradeInId: row.id,
    reason: request.reason,
    createdBy,
  });
  // before lleva los mismos campos que after (recordAudit).
  await recordAudit(tx, {
    organizationId,
    actorUserId: createdBy,
    entityType: "trade_in",
    entityId: row.id,
    action: "void",
    diff: {
      before: { void_number: null, reason: null, unit_status: writtenOff.from },
      after: {
        void_number: tradeInVoid.number,
        reason: tradeInVoid.reason,
        unit_status: "written_off",
      },
    },
  });
  return {
    ok: true,
    tradeIn: {
      id: row.id,
      number: row.number,
      displayNumber: formatTradeInNumber(row.number),
      voidDisplayNumber: formatTradeInVoidNumber(tradeInVoid.number),
    },
  };
}

// La última defensa de la anulación (D-5): dos anulaciones que llegaron hasta la base. cash lo traduce.
export function isTradeInAlreadyVoidedError(error: unknown): boolean {
  return repository.isTradeInAlreadyVoided(error);
}

// La anulación ya hecha, para que cash responda already_voided después de la última defensa.
export async function findTradeInVoidNumber(
  organizationId: string,
  tradeInId: string,
): Promise<string | null> {
  const row = await repository.findTradeIn(organizationId, tradeInId);
  return row?.voided ? formatTradeInVoidNumber(row.voided.number) : null;
}
