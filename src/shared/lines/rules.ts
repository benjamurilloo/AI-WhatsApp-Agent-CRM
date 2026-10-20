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
//
// Desde la 29.5.2 (ADR 0024, punto 6; brief-29.5.2, D-1, D-2 y D-5), una línea de un producto por
// unidad lleva los IMEI de sus unidades, y su cantidad es la cantidad de IMEI. El precio de cada
// unidad es el propio, si tiene, o el vigente del producto, y el monto de la línea es la suma.

const idSchema = z.uuid();

// El IMEI o número de serie, con la forma de stock_units (brief-29.5, D-2). Se repite acá porque
// src/shared no importa inventory; tests/unit lo compara con el de su esquema.
export const LINE_SERIAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;

// IMEI por línea como máximo: más que esto no es un pedido de mostrador.
export const MAX_LINE_SERIALS = 100;

// Todo llega como texto desde el formulario.
export type LineInput = {
  productId: string;
  quantity: string;
  // Id del precio vigente que vio quien carga, o vacío si el producto no tenía precio. Si cambió,
  // el comprobante no se escribe (brief-19.2, D-5; brief-20.3, D-4).
  expectedPriceId: string;
  // Desde la 29.5.2: los IMEI de la línea, uno por renglón o separados por espacios, comas o punto y
  // coma. Vacío en un producto por cantidad.
  serials?: string;
  // Desde la 29.5.2: el monto de la línea que vio quien carga, con las unidades elegidas; vacío si no
  // lo vio (sin JavaScript), y entonces vale el de ahora, como el precio esperado.
  expectedLineTotal?: string;
};

export type LineField = "product" | "quantity" | "expectedPrice" | "serials";

export type ParsedLine = {
  position: number;
  productId: string;
  quantity: Quantity;
  expectedPriceId: string | null;
  // Vacío en una línea sin IMEI.
  serials: string[];
  // En centésimos, o null si no hay que compararlo.
  expectedLineTotal: Money | null;
};

export type LinesValidation =
  | { ok: true; lines: ParsedLine[] }
  | {
      ok: false;
      reason: "no_lines" | "too_many_lines" | "lines";
      lines: LineFieldIssue[];
    };

// serial, desde la 29.5.2: el IMEI mal escrito o repetido de la línea, para nombrarlo (AC-1).
export type LineFieldIssue = {
  position: number;
  field: LineField;
  serial?: string;
};

// El primer IMEI mal escrito y, si no hay, el primero repetido; null si no hay ninguno.
function badSerial(serials: string[]): string | null {
  const invalid = serials.find((serial) => !LINE_SERIAL_PATTERN.test(serial));
  if (invalid !== undefined) return invalid;
  const seen = new Set<string>();
  for (const serial of serials) {
    if (seen.has(serial.toLowerCase())) return serial;
    seen.add(serial.toLowerCase());
  }
  return null;
}

// Los IMEI de un campo de texto. Los vacíos no cuentan.
export function splitLineSerials(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((serial) => serial.trim())
    .filter((serial) => serial !== "");
}

const ONE: Quantity = 1000n;

// Un monto con la escala de la base o como lo escribe un formulario: dígitos, con hasta dos
// decimales y punto. Null si no lo es.
function parseExpectedTotal(text: string): Money | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

export function parseLines(
  input: LineInput[],
  maxLines: number,
): LinesValidation {
  if (input.length === 0) return { ok: false, reason: "no_lines", lines: [] };
  if (input.length > maxLines) {
    return { ok: false, reason: "too_many_lines", lines: [] };
  }
  const issues: LineFieldIssue[] = [];
  const lines: ParsedLine[] = [];
  input.forEach((line, index) => {
    const position = index + 1;
    // Los ids, en minúsculas: PostgreSQL los iguala, pero los productos bloqueados se buscan en un
    // Map por texto (revisión independiente de la 11.1, M-3).
    const productId = line.productId.trim().toLowerCase();
    const expected = line.expectedPriceId.trim().toLowerCase();
    const serials = splitLineSerials(line.serials ?? "");
    const quantityText = line.quantity.trim();
    // Con IMEI, la cantidad es la cantidad de IMEI; si además se escribió una, tiene que coincidir.
    const quantity =
      serials.length > 0 && quantityText === ""
        ? BigInt(serials.length) * ONE
        : parseQuantityInput(quantityText);
    const totalText = (line.expectedLineTotal ?? "").trim();
    const expectedLineTotal =
      totalText === "" ? null : parseExpectedTotal(totalText);
    const bad = badSerial(serials);
    if (!idSchema.safeParse(productId).success) {
      issues.push({ position, field: "product" });
    } else if (serials.length > MAX_LINE_SERIALS) {
      issues.push({ position, field: "serials" });
    } else if (bad !== null) {
      issues.push({ position, field: "serials", serial: bad });
    } else if (
      quantity === null ||
      quantity === 0n ||
      (serials.length > 0 && quantity !== BigInt(serials.length) * ONE)
    ) {
      issues.push({ position, field: "quantity" });
    } else if (
      (expected !== "" && !idSchema.safeParse(expected).success) ||
      (totalText !== "" && expectedLineTotal === null)
    ) {
      issues.push({ position, field: "expectedPrice" });
    } else {
      lines.push({
        position,
        productId,
        quantity,
        expectedPriceId: expected === "" ? null : expected,
        serials,
        expectedLineTotal,
      });
    }
  });
  if (issues.length > 0) return { ok: false, reason: "lines", lines: issues };
  return { ok: true, lines };
}

export type LineRule =
  | "inactive_product"
  // Desde la 29.6 (brief-29.6, D-5): el producto de servicio se vende solo por su orden de servicio.
  | "service_product"
  // Desde la 29.5.2 (brief-29.5.2, D-5): un producto por unidad sin IMEI, y un producto por cantidad
  // con IMEI. Reemplazan a unit_tracked de la 29.5, que rechazaba todo producto por unidad.
  | "units_required"
  | "not_unit_tracked"
  | "no_price"
  | "currency_mismatch"
  // Desde la 29.5.2: una unidad con precio propio en otra moneda que el comprobante (D-2).
  | "unit_currency_mismatch"
  | "duplicate_product"
  // Desde la 29.5.2: el mismo IMEI en dos líneas.
  | "duplicate_unit"
  | "zero_total"
  | "amount_too_large";

export type LineRuleIssue = {
  position: number;
  productId: string;
  rule: LineRule;
  // Desde la 29.5.2, en duplicate_unit y unit_currency_mismatch: el IMEI, para nombrarlo (AC-1).
  serial?: string;
};

// Un producto va en una sola línea (ADR 0020, punto 3): se rechaza cada repetición, no la primera.
// Desde la 29.5.2, lo mismo con un IMEI en dos líneas: se rechaza la segunda.
export function duplicateLines(lines: ParsedLine[]): LineRuleIssue[] {
  const seen = new Set<string>();
  const seenSerials = new Set<string>();
  return lines.flatMap((line): LineRuleIssue[] => {
    const { position, productId } = line;
    if (seen.has(productId)) {
      return [{ position, productId, rule: "duplicate_product" }];
    }
    seen.add(productId);
    const repeated = line.serials.find((serial) =>
      seenSerials.has(serial.toLowerCase()),
    );
    if (repeated !== undefined) {
      return [
        { position, productId, rule: "duplicate_unit", serial: repeated },
      ];
    }
    for (const serial of line.serials) seenSerials.add(serial.toLowerCase());
    return [];
  });
}

// Lo mínimo del precio vigente que las reglas miran. Quien llama pasa el suyo y lo recibe de vuelta.
export type LinePrice = { id: string; amount: string; currency: string };

export type LineProduct<P extends LinePrice> = {
  isActive: boolean;
  // Desde la 29.5; sin él, por cantidad.
  tracking?: "quantity" | "unit";
  // Desde la 29.6; sin él, no es de servicio.
  isService?: boolean;
  price: P | null;
};

// Una unidad elegida, con su precio propio o null (brief-29.5.2, D-2), en el orden de sus IMEI.
export type LineUnit = { price: { amount: string; currency: string } | null };

export type PricedLine<P extends LinePrice> = ParsedLine & {
  price: P;
  // El precio unitario de la línea, en centésimos: el del producto o, en un producto por unidad cuyas
  // unidades valen todas lo mismo, ese precio. Si valen distinto, el del producto, y el detalle de cada
  // unidad está en unitPrices (brief-29.5.2, D-2).
  unitPrice: Money;
  // El precio de cada unidad, en el orden de serials; vacío en un producto por cantidad.
  unitPrices: Money[];
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
      // lineTotal, desde la 29.5.2: el monto de ahora de una línea por unidad cuyo monto esperado no
      // coincide; null si lo que cambió fue el precio del producto.
      lines: {
        position: number;
        productId: string;
        price: P;
        lineTotal: Money | null;
      }[];
    }
  | { ok: false; reason: "total_too_large" };

// Las líneas ya validadas y sin repetidos, contra los productos que quien llama bloqueó. El orden
// es el del alta del pedido (brief-19.2): los productos que no están, los inactivos o sin precio,
// el precio que cambió, la moneda y los montos de cada línea y, al final, el total. Desde la 29.5.2,
// units trae las unidades de cada línea de un producto por unidad con IMEI, por posición: quien llama
// ya las resolvió y comprobó que son del producto y están disponibles. Después de los montos, el monto
// esperado de esas líneas.
export function evaluateLines<P extends LinePrice>(
  lines: ParsedLine[],
  products: Map<string, LineProduct<P>>,
  units: Map<number, LineUnit[]> = new Map(),
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
    if (product.isService) {
      return [{ position, productId, rule: "service_product" }];
    }
    const byUnit = product.tracking === "unit";
    if (byUnit && line.serials.length === 0) {
      return [{ position, productId, rule: "units_required" }];
    }
    if (!byUnit && line.serials.length > 0) {
      return [{ position, productId, rule: "not_unit_tracked" }];
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
        lineTotal: null,
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
    const productPrice = moneyFromDatabase(line.price.amount);
    if (line.serials.length === 0) {
      const total = computeLineTotal(
        productPrice,
        line.quantity,
        decimals.decimals,
      );
      if (!total.ok) {
        issues.push({ position, productId, rule: total.reason });
        continue;
      }
      totaled.push({
        ...line,
        unitPrice: productPrice,
        unitPrices: [],
        total: total.total,
      });
      continue;
    }
    const lineUnits = units.get(position);
    if (!lineUnits || lineUnits.length !== line.serials.length) {
      throw new Error(`unidades sin resolver en la línea ${position}`);
    }
    const foreign = lineUnits.findIndex(
      (unit) => unit.price && unit.price.currency !== currency,
    );
    if (foreign >= 0) {
      issues.push({
        position,
        productId,
        rule: "unit_currency_mismatch",
        serial: line.serials[foreign]!,
      });
      continue;
    }
    // Cada unidad se redondea como una línea de cantidad 1, y la línea es la suma (D-2).
    const unitTotals = lineUnits.map((unit) =>
      computeLineTotal(
        unit.price ? moneyFromDatabase(unit.price.amount) : productPrice,
        ONE,
        decimals.decimals,
      ),
    );
    const failed = unitTotals.find((total) => !total.ok);
    if (failed && !failed.ok) {
      issues.push({ position, productId, rule: failed.reason });
      continue;
    }
    const unitPrices = unitTotals.map((total) => (total.ok ? total.total : 0n));
    const total = sumLineTotals(unitPrices);
    if (total === null) {
      issues.push({ position, productId, rule: "amount_too_large" });
      continue;
    }
    totaled.push({
      ...line,
      unitPrice: unitPrices.every((price) => price === unitPrices[0])
        ? unitPrices[0]!
        : productPrice,
      unitPrices,
      total,
    });
  }
  if (issues.length > 0)
    return { ok: false, reason: "line_rules", lines: issues };

  const totalChanged = totaled.filter(
    (line) =>
      line.serials.length > 0 &&
      line.expectedLineTotal !== null &&
      line.expectedLineTotal !== line.total,
  );
  if (totalChanged.length > 0) {
    return {
      ok: false,
      reason: "price_changed",
      lines: totalChanged.map(({ position, productId, price, total }) => ({
        position,
        productId,
        price,
        lineTotal: total,
      })),
    };
  }

  const total = sumLineTotals(totaled.map((line) => line.total));
  if (total === null) return { ok: false, reason: "total_too_large" };
  return { ok: true, currency, lines: totaled, total };
}
