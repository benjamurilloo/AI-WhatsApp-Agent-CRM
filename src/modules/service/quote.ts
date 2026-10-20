import { z } from "zod";
import { sumLineTotals } from "@/shared/lines";
import {
  currencyDecimals,
  parseMoneyInput,
  type AmountRejection,
  type Money,
} from "@/shared/money";

// Las reglas puras de la orden de servicio (brief-29.6, D-4): las transiciones de su estado y el
// armado del presupuesto. No leen la base: quien llama bloquea la orden, lee la lista del modelo y les
// pasa lo que leyó. El trigger de la 0058 fija las mismas transiciones en la base.

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

export function canTransition(
  from: ServiceOrderStatus,
  to: ServiceOrderStatus,
): boolean {
  return SERVICE_ORDER_TRANSITIONS[from].includes(to);
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
