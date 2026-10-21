import { z } from "zod";
import { sumLineTotals } from "@/shared/lines";
import {
  currencyDecimals,
  parseMoneyInput,
  type AmountRejection,
  type Money,
} from "@/shared/money";

// Las reglas puras de la orden de servicio (brief-29.6, D-4): las transiciones de su estado y el
// armado del presupuesto; desde la 29.6.2, las de la orden de una unidad propia y sus líneas, solo con
// el costo (brief-29.6.2, D-3). No leen la base: quien llama bloquea la orden, lee la lista del modelo
// y les pasa lo que leyó. El trigger de la 0059 fija las mismas transiciones en la base.

export type ServiceOrderStatus =
  | "received"
  | "sent"
  | "quoted"
  | "approved"
  | "rejected"
  | "repaired"
  | "delivered"
  | "cancelled";

// A dónde puede pasar cada estado: received → sent → quoted → approved o rejected; approved → repaired
// → delivered; rejected → delivered, sin venta; cancelled desde received, sent, quoted o approved. Una
// reparada no se cancela: el técnico ya trabajó y se le debe.
export const SERVICE_ORDER_TRANSITIONS: Readonly<
  Record<ServiceOrderStatus, readonly ServiceOrderStatus[]>
> = {
  received: ["sent", "cancelled"],
  sent: ["quoted", "cancelled"],
  quoted: ["approved", "rejected", "cancelled"],
  approved: ["repaired", "cancelled"],
  rejected: ["delivered"],
  repaired: ["delivered"],
  delivered: [],
  cancelled: [],
};

export type ServiceOrderKind = "customer_device" | "own_unit";

// La orden de una unidad propia (brief-29.6.2, D-3) nace sent y salta el presupuesto: pasa a repaired,
// que es final porque la unidad no sale del local, o a cancelled.
export const OWN_UNIT_TRANSITIONS: Readonly<
  Record<ServiceOrderStatus, readonly ServiceOrderStatus[]>
> = {
  received: [],
  sent: ["repaired", "cancelled"],
  quoted: [],
  approved: [],
  rejected: [],
  repaired: [],
  delivered: [],
  cancelled: [],
};

export function canTransition(
  from: ServiceOrderStatus,
  to: ServiceOrderStatus,
  kind: ServiceOrderKind = "customer_device",
): boolean {
  const transitions =
    kind === "own_unit" ? OWN_UNIT_TRANSITIONS : SERVICE_ORDER_TRANSITIONS;
  return transitions[from].includes(to);
}

const idSchema = z.uuid();

// Todo llega como texto desde el formulario: una línea por tipo de reparación elegido.
export type QuoteLineInput = {
  repairTypeId: string;
  price: string;
  cost: string;
};

export type QuoteInput = {
  customerCurrency: string;
  technicianCurrency: string;
  lines: QuoteLineInput[];
};

export type QuoteLineField = "repairType" | "price" | "cost";

export type QuoteLineIssue = {
  position: number;
  field: QuoteLineField;
  reason?: AmountRejection;
};

export type ParsedQuoteLine = {
  position: number;
  repairTypeId: string;
  price: Money;
  cost: Money;
};

export type QuoteValidation =
  | {
      ok: true;
      customerCurrency: string;
      technicianCurrency: string;
      lines: ParsedQuoteLine[];
    }
  | {
      ok: false;
      reason:
        | "customer_currency"
        | "technician_currency"
        | "no_lines"
        | "too_many_lines"
        | "lines";
      lines: QuoteLineIssue[];
    };

// La lectura del presupuesto: las dos monedas son de las del sistema, el tipo es un uuid, y el precio
// y el costo se leen con los decimales de su moneda. Un tipo repetido es un error de la línea que lo
// repite.
export function parseQuoteInput(
  input: QuoteInput,
  maxLines: number,
): QuoteValidation {
  const customerCurrency = input.customerCurrency.trim();
  const technicianCurrency = input.technicianCurrency.trim();
  const customerDecimals = currencyDecimals(customerCurrency);
  if (!customerDecimals.ok) {
    return { ok: false, reason: "customer_currency", lines: [] };
  }
  const technicianDecimals = currencyDecimals(technicianCurrency);
  if (!technicianDecimals.ok) {
    return { ok: false, reason: "technician_currency", lines: [] };
  }
  if (input.lines.length === 0) {
    return { ok: false, reason: "no_lines", lines: [] };
  }
  if (input.lines.length > maxLines) {
    return { ok: false, reason: "too_many_lines", lines: [] };
  }
  const issues: QuoteLineIssue[] = [];
  const lines: ParsedQuoteLine[] = [];
  const seen = new Set<string>();
  input.lines.forEach((line, index) => {
    const position = index + 1;
    const repairTypeId = line.repairTypeId.trim().toLowerCase();
    if (!idSchema.safeParse(repairTypeId).success || seen.has(repairTypeId)) {
      issues.push({ position, field: "repairType" });
      return;
    }
    seen.add(repairTypeId);
    const price = parseMoneyInput(line.price, customerDecimals.decimals);
    if (!price.ok) {
      issues.push({ position, field: "price", reason: price.reason });
      return;
    }
    const cost = parseMoneyInput(line.cost, technicianDecimals.decimals);
    if (!cost.ok) {
      issues.push({ position, field: "cost", reason: cost.reason });
      return;
    }
    lines.push({
      position,
      repairTypeId,
      price: price.amount,
      cost: cost.amount,
    });
  });
  if (issues.length > 0) return { ok: false, reason: "lines", lines: issues };
  return { ok: true, customerCurrency, technicianCurrency, lines };
}

// Lo que el presupuesto mira de la lista: si el tipo está activo y, si tiene precio para el modelo, en
// qué monedas.
export type QuoteType = {
  isActive: boolean;
  listPrice: { priceCurrency: string; costCurrency: string } | null;
};

export type QuoteRule =
  | "missing_type"
  | "inactive_type"
  // El precio de la lista del tipo está en otra moneda que la del presupuesto: una lista con monedas
  // mezcladas no se presupuesta junta (D-4; ADR 0024, R-12).
  | "price_currency_mismatch"
  | "cost_currency_mismatch";

export type QuoteRuleIssue = {
  position: number;
  repairTypeId: string;
  rule: QuoteRule;
};

export type QuoteEvaluation =
  | {
      ok: true;
      lines: ParsedQuoteLine[];
      customerTotal: Money;
      technicianTotal: Money;
    }
  | { ok: false; reason: "line_rules"; lines: QuoteRuleIssue[] }
  | { ok: false; reason: "total_too_large" };

// Las reglas del presupuesto contra la lista del modelo: cada tipo existe y está activo; si tiene
// precio en la lista, sus monedas son las del presupuesto; y cada total cabe en numeric(14, 2). Un tipo
// sin precio para el modelo se carga a mano, en las monedas del presupuesto.
export function evaluateQuote(
  validated: Extract<QuoteValidation, { ok: true }>,
  types: ReadonlyMap<string, QuoteType>,
): QuoteEvaluation {
  const issues: QuoteRuleIssue[] = [];
  for (const line of validated.lines) {
    const { position, repairTypeId } = line;
    const type = types.get(repairTypeId);
    if (!type) {
      issues.push({ position, repairTypeId, rule: "missing_type" });
    } else if (!type.isActive) {
      issues.push({ position, repairTypeId, rule: "inactive_type" });
    } else if (
      type.listPrice &&
      type.listPrice.priceCurrency !== validated.customerCurrency
    ) {
      issues.push({ position, repairTypeId, rule: "price_currency_mismatch" });
    } else if (
      type.listPrice &&
      type.listPrice.costCurrency !== validated.technicianCurrency
    ) {
      issues.push({ position, repairTypeId, rule: "cost_currency_mismatch" });
    }
  }
  if (issues.length > 0) {
    return { ok: false, reason: "line_rules", lines: issues };
  }
  const customerTotal = sumLineTotals(
    validated.lines.map((line) => line.price),
  );
  const technicianTotal = sumLineTotals(
    validated.lines.map((line) => line.cost),
  );
  if (customerTotal === null || technicianTotal === null) {
    return { ok: false, reason: "total_too_large" };
  }
  return { ok: true, lines: validated.lines, customerTotal, technicianTotal };
}

// Las líneas de una unidad propia (brief-29.6.2, D-3): un tipo de reparación y lo que cobró el técnico,
// sin precio al cliente, en la moneda del costo de la unidad (U-1), que fija quien llama. Un tipo con
// costo en la lista en otra moneda se carga a mano en esta: no hay conversión.
export type RepairCostLineInput = { repairTypeId: string; cost: string };

export type RepairCostLineIssue = {
  position: number;
  field: "repairType" | "cost";
  reason?: AmountRejection;
};

export type ParsedRepairCostLine = {
  position: number;
  repairTypeId: string;
  cost: Money;
};

export type RepairCostValidation =
  | { ok: true; lines: ParsedRepairCostLine[] }
  | {
      ok: false;
      reason: "currency" | "no_lines" | "too_many_lines" | "lines";
      lines: RepairCostLineIssue[];
    };

export function parseRepairCostInput(
  lines: RepairCostLineInput[],
  currency: string,
  maxLines: number,
): RepairCostValidation {
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) return { ok: false, reason: "currency", lines: [] };
  if (lines.length === 0) return { ok: false, reason: "no_lines", lines: [] };
  if (lines.length > maxLines) {
    return { ok: false, reason: "too_many_lines", lines: [] };
  }
  const issues: RepairCostLineIssue[] = [];
  const parsed: ParsedRepairCostLine[] = [];
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const position = index + 1;
    const repairTypeId = line.repairTypeId.trim().toLowerCase();
    if (!idSchema.safeParse(repairTypeId).success || seen.has(repairTypeId)) {
      issues.push({ position, field: "repairType" });
      return;
    }
    seen.add(repairTypeId);
    const cost = parseMoneyInput(line.cost, decimals.decimals);
    if (!cost.ok) {
      issues.push({ position, field: "cost", reason: cost.reason });
      return;
    }
    parsed.push({ position, repairTypeId, cost: cost.amount });
  });
  if (issues.length > 0) return { ok: false, reason: "lines", lines: issues };
  return { ok: true, lines: parsed };
}

export type RepairCostRule = "missing_type" | "inactive_type";

export type RepairCostEvaluation =
  | { ok: true; lines: ParsedRepairCostLine[]; total: Money }
  | {
      ok: false;
      reason: "line_rules";
      lines: { position: number; repairTypeId: string; rule: RepairCostRule }[];
    }
  | { ok: false; reason: "total_too_large" };

// Cada tipo existe y está activo, y el total cabe en numeric(14, 2).
export function evaluateRepairCosts(
  lines: ParsedRepairCostLine[],
  types: ReadonlyMap<string, { isActive: boolean }>,
): RepairCostEvaluation {
  const issues: {
    position: number;
    repairTypeId: string;
    rule: RepairCostRule;
  }[] = [];
  for (const { position, repairTypeId } of lines) {
    const type = types.get(repairTypeId);
    if (!type) issues.push({ position, repairTypeId, rule: "missing_type" });
    else if (!type.isActive) {
      issues.push({ position, repairTypeId, rule: "inactive_type" });
    }
  }
  if (issues.length > 0) {
    return { ok: false, reason: "line_rules", lines: issues };
  }
  const total = sumLineTotals(lines.map((line) => line.cost));
  if (total === null) return { ok: false, reason: "total_too_large" };
  return { ok: true, lines, total };
}
