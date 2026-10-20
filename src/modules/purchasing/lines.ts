import { z } from "zod";
import {
  computeLineTotal,
  duplicateLines,
  sumLineTotals,
} from "@/shared/lines";
import {
  parseMoneyInput,
  type AmountRejection,
  type Money,
} from "@/shared/money";
import { parseQuantityInput, type Quantity } from "@/shared/quantity";

// Las líneas de la orden de compra (ADR 0023, punto 3; brief-22.3, D-4). Viven en purchasing y no en
// src/shared/lines porque evalúan un costo que escribe quien carga, en la moneda que eligió, y no el
// precio vigente de cada producto (H-1). Reusan de src/shared el total de la línea, la suma, los
// repetidos y la lectura de la cantidad y del monto. Puro: no lee la base. Quien llama bloquea los
// productos y le pasa lo que leyó.

const idSchema = z.uuid();

// Todo llega como texto desde el formulario.
export type PurchaseOrderLineInput = {
  productId: string;
  quantity: string;
  unitCost: string;
};

export type PurchaseOrderLineField = "product" | "quantity" | "unitCost";

// Un campo que no se lee, con su posición. El costo lleva la razón de parseMoneyInput.
export type PurchaseOrderLineIssue = {
  position: number;
  field: PurchaseOrderLineField;
  reason?: AmountRejection;
};

export type ParsedPurchaseOrderLine = {
  position: number;
  productId: string;
  quantity: Quantity;
  unitCost: Money;
};

export type PurchaseOrderLinesValidation =
  | { ok: true; lines: ParsedPurchaseOrderLine[] }
  | {
      ok: false;
      reason: "no_lines" | "too_many_lines" | "lines";
      lines: PurchaseOrderLineIssue[];
    };

// La regla 1 de D-4 y la lectura de cada línea: el producto es un uuid, la cantidad es positiva y
// cabe en numeric(14, 3), y el costo se lee con los decimales de la moneda elegida. Cada línea
// informa su primer campo que no se lee, en el orden del formulario.
export function parsePurchaseOrderLines(
  input: PurchaseOrderLineInput[],
  maxLines: number,
  decimals: number,
): PurchaseOrderLinesValidation {
  if (input.length === 0) return { ok: false, reason: "no_lines", lines: [] };
  if (input.length > maxLines) {
    return { ok: false, reason: "too_many_lines", lines: [] };
  }
  const issues: PurchaseOrderLineIssue[] = [];
  const lines: ParsedPurchaseOrderLine[] = [];
  input.forEach((line, index) => {
    const position = index + 1;
    // En minúsculas: los productos bloqueados se buscan en un Map por texto.
    const productId = line.productId.trim().toLowerCase();
    const quantity = parseQuantityInput(line.quantity);
    if (!idSchema.safeParse(productId).success) {
      issues.push({ position, field: "product" });
      return;
    }
    if (quantity === null || quantity === 0n) {
      issues.push({ position, field: "quantity" });
      return;
    }
    const cost = parseMoneyInput(line.unitCost, decimals);
    if (!cost.ok) {
      issues.push({ position, field: "unitCost", reason: cost.reason });
      return;
    }
    lines.push({ position, productId, quantity, unitCost: cost.amount });
  });
  if (issues.length > 0) return { ok: false, reason: "lines", lines: issues };
  return { ok: true, lines };
}

// service_product, desde la 29.6: el producto de servicio no se compra ni se recibe, porque nunca
// tiene stock (brief-29.6, D-5).
export type PurchaseOrderLineRule =
  | "duplicate_product"
  | "inactive_product"
  | "service_product"
  | "zero_total"
  | "amount_too_large";

export type PurchaseOrderLineRuleIssue = {
  position: number;
  productId: string;
  rule: PurchaseOrderLineRule;
};

export type CostedLine = ParsedPurchaseOrderLine & { total: Money };

export type PurchaseOrderLinesEvaluation =
  | { ok: true; lines: CostedLine[]; total: Money }
  | { ok: false; reason: "line_rules"; lines: PurchaseOrderLineRuleIssue[] }
  | {
      ok: false;
      reason: "missing_products";
      lines: { position: number; productId: string }[];
    }
  | { ok: false; reason: "total_too_large" };

// Las reglas 2 a 5 de D-4, en su orden, contra los productos que quien llama bloqueó: un producto en
// una sola línea; el producto existe en la organización (si no, missing_products) y está activo; el
// total de cada línea, redondeado a los decimales de la moneda, no es cero ni desborda; y la suma
// cabe en numeric(14, 2). Cada regla informa todas sus líneas antes de pasar a la siguiente.
export function evaluatePurchaseOrderLines(
  lines: ParsedPurchaseOrderLine[],
  products: ReadonlyMap<string, { isActive: boolean; isService?: boolean }>,
  decimals: number,
): PurchaseOrderLinesEvaluation {
  // duplicateLines espera la línea del pedido, con su precio esperado, que acá no existe.
  const duplicates = duplicateLines(
    lines.map((line) => ({
      ...line,
      expectedPriceId: null,
      serials: [],
      expectedLineTotal: null,
    })),
  );
  if (duplicates.length > 0) {
    return {
      ok: false,
      reason: "line_rules",
      lines: duplicates.map(({ position, productId }) => ({
        position,
        productId,
        rule: "duplicate_product" as const,
      })),
    };
  }

  const missing = lines.filter((line) => !products.has(line.productId));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "missing_products",
      lines: missing.map(({ position, productId }) => ({
        position,
        productId,
      })),
    };
  }

  const inactive = lines.filter(
    (line) => !products.get(line.productId)!.isActive,
  );
  if (inactive.length > 0) {
    return {
      ok: false,
      reason: "line_rules",
      lines: inactive.map(({ position, productId }) => ({
        position,
        productId,
        rule: "inactive_product" as const,
      })),
    };
  }

  const services = lines.filter(
    (line) => products.get(line.productId)!.isService === true,
  );
  if (services.length > 0) {
    return {
      ok: false,
      reason: "line_rules",
      lines: services.map(({ position, productId }) => ({
        position,
        productId,
        rule: "service_product" as const,
      })),
    };
  }

  const issues: PurchaseOrderLineRuleIssue[] = [];
  const costed: CostedLine[] = [];
  for (const line of lines) {
    const total = computeLineTotal(line.unitCost, line.quantity, decimals);
    if (!total.ok) {
      issues.push({
        position: line.position,
        productId: line.productId,
        rule: total.reason,
      });
      continue;
    }
    costed.push({ ...line, total: total.total });
  }
  if (issues.length > 0) {
    return { ok: false, reason: "line_rules", lines: issues };
  }

  const total = sumLineTotals(costed.map((line) => line.total));
  if (total === null) return { ok: false, reason: "total_too_large" };
  return { ok: true, lines: costed, total };
}
