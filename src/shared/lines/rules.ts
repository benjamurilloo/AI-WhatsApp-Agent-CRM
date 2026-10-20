import { z } from "zod";
import {
  currencyDecimals,
  moneyFromDatabase,
  type Money,
} from "@/shared/money";
import { parseQuantityInput, type Quantity } from "@/shared/quantity";
import { computeLineTotal, sumLineTotals } from "./line-total";

// Las reglas de línea de un comprobante armado por quien lo carga (ADR 0019, puntos 3 y 4; ADR
// 0020, punto 3; ADR 0021, punto 4): el pedido de la app y, desde la 20.3, la venta sin pedido
// (brief-20.3, D-1). Puro: no lee la base. Quien llama valida, bloquea los productos y le pasa lo
// que leyó con su forma mínima, porque src/shared no importa módulos. El pedido del agente no usa
// estas reglas: responde las de su contrato (ingestion-v2), con otros códigos.

const idSchema = z.uuid();

// Todo llega como texto desde el formulario.
export type LineInput = {
  productId: string;
  quantity: string;
  // Id del precio vigente que vio quien carga, o vacío si el producto no tenía precio. Si cambió,
  // el comprobante no se escribe (brief-19.2, D-5; brief-20.3, D-4).
  expectedPriceId: string;
};

export type LineField = "product" | "quantity" | "expectedPrice";

export type ParsedLine = {
  position: number;
  productId: string;
  quantity: Quantity;
  expectedPriceId: string | null;
};

export type LinesValidation =
  | { ok: true; lines: ParsedLine[] }
  | {
      ok: false;
      reason: "no_lines" | "too_many_lines" | "lines";
      lines: { position: number; field: LineField }[];
    };

export function parseLines(
  input: LineInput[],
  maxLines: number,
): LinesValidation {
  if (input.length === 0) return { ok: false, reason: "no_lines", lines: [] };
  if (input.length > maxLines) {
    return { ok: false, reason: "too_many_lines", lines: [] };
  }
  const issues: { position: number; field: LineField }[] = [];
  const lines: ParsedLine[] = [];
  input.forEach((line, index) => {
    const position = index + 1;
    // Los ids, en minúsculas: PostgreSQL los iguala, pero los productos bloqueados se buscan en un
    // Map por texto (revisión independiente de la 11.1, M-3).
    const productId = line.productId.trim().toLowerCase();
    const expected = line.expectedPriceId.trim().toLowerCase();
    const quantity = parseQuantityInput(line.quantity);
    if (!idSchema.safeParse(productId).success) {
      issues.push({ position, field: "product" });
    } else if (quantity === null || quantity === 0n) {
      issues.push({ position, field: "quantity" });
    } else if (expected !== "" && !idSchema.safeParse(expected).success) {
      issues.push({ position, field: "expectedPrice" });
    } else {
      lines.push({
        position,
        productId,
        quantity,
        expectedPriceId: expected === "" ? null : expected,
      });
    }
  });
  if (issues.length > 0) return { ok: false, reason: "lines", lines: issues };
  return { ok: true, lines };
}

export type LineRule =
  | "inactive_product"
  // Desde la 29.5: un producto por unidad no entra en un pedido ni en una venta hasta la 29.5.2
  // (brief-29.5, D-1).
  | "unit_tracked"
  | "no_price"
  | "currency_mismatch"
  | "duplicate_product"
  | "zero_total"
  | "amount_too_large";

export type LineRuleIssue = {
  position: number;
  productId: string;
  rule: LineRule;
};

// Un producto va en una sola línea (ADR 0020, punto 3): se rechaza cada repetición, no la primera.
export function duplicateLines(lines: ParsedLine[]): LineRuleIssue[] {
  const seen = new Set<string>();
  return lines.flatMap((line) => {
    if (seen.has(line.productId)) {
      return [
        {
          position: line.position,
          productId: line.productId,
          rule: "duplicate_product" as const,
        },
      ];
    }
    seen.add(line.productId);
    return [];
  });
}

// Lo mínimo del precio vigente que las reglas miran. Quien llama pasa el suyo y lo recibe de vuelta.
export type LinePrice = { id: string; amount: string; currency: string };

export type LineProduct<P extends LinePrice> = {
  isActive: boolean;
  // Desde la 29.5; sin él, por cantidad.
  tracking?: "quantity" | "unit";
  price: P | null;
};

export type PricedLine<P extends LinePrice> = ParsedLine & {
  price: P;
  total: Money;
};

export type LinesEvaluation<P extends LinePrice> =
  | { ok: true; currency: string; lines: PricedLine<P>[]; total: Money }
  | {
      ok: false;
      reason: "missing_products";
      lines: { position: number; productId: string }[];
    }
  | { ok: false; reason: "line_rules"; lines: LineRuleIssue[] }
  | {
      ok: false;
      reason: "price_changed";
      lines: { position: number; productId: string; price: P }[];
    }
  | { ok: false; reason: "total_too_large" };

// Las líneas ya validadas y sin repetidos, contra los productos que quien llama bloqueó. El orden
// es el del alta del pedido (brief-19.2): los productos que no están, los inactivos o sin precio,
// el precio que cambió, la moneda y los montos de cada línea y, al final, el total.
export function evaluateLines<P extends LinePrice>(
  lines: ParsedLine[],
  products: Map<string, LineProduct<P>>,
): LinesEvaluation<P> {
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

  const unusable = lines.flatMap((line): LineRuleIssue[] => {
    const product = products.get(line.productId)!;
    const { position, productId } = line;
    if (!product.isActive) {
      return [{ position, productId, rule: "inactive_product" }];
    }
    if (product.tracking === "unit") {
      return [{ position, productId, rule: "unit_tracked" }];
    }
    if (!product.price) return [{ position, productId, rule: "no_price" }];
    return [];
  });
  if (unusable.length > 0) {
    return { ok: false, reason: "line_rules", lines: unusable };
  }

  const priced = lines.map((line) => ({
    ...line,
    price: products.get(line.productId)!.price!,
  }));
  const changed = priced.filter(
    (line) => line.price.id !== line.expectedPriceId,
  );
  if (changed.length > 0) {
    return {
      ok: false,
      reason: "price_changed",
      lines: changed.map(({ position, productId, price }) => ({
        position,
        productId,
        price,
      })),
    };
  }

  // Una moneda por comprobante, la de la primera línea (ADR 0019, punto 3).
  const currency = priced[0]!.price.currency;
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) {
    throw new Error("Un precio guardado en una moneda que no se acepta.");
  }
  const issues: LineRuleIssue[] = [];
  const totaled: PricedLine<P>[] = [];
  for (const line of priced) {
    const { position, productId } = line;
    if (line.price.currency !== currency) {
      issues.push({ position, productId, rule: "currency_mismatch" });
      continue;
    }
    const total = computeLineTotal(
      moneyFromDatabase(line.price.amount),
      line.quantity,
      decimals.decimals,
    );
    if (!total.ok) {
      issues.push({ position, productId, rule: total.reason });
      continue;
    }
    totaled.push({ ...line, total: total.total });
  }
  if (issues.length > 0)
    return { ok: false, reason: "line_rules", lines: issues };
  const total = sumLineTotals(totaled.map((line) => line.total));
  if (total === null) return { ok: false, reason: "total_too_large" };
  return { ok: true, currency, lines: totaled, total };
}
