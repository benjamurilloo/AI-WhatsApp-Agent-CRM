import { describe, expect, it } from "vitest";
import {
  evaluatePurchaseOrderLines,
  parsePurchaseOrderLines,
  type ParsedPurchaseOrderLine,
} from "./lines";

// Las reglas de las líneas de la orden de compra (brief-22.3, D-4; AC-2): cada regla en su orden, el
// redondeo por línea con monedas de 0 y 2 decimales, y el costo leído con los decimales de la moneda.

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";

const line = (productId: string, quantity: string, unitCost: string) => ({
  productId,
  quantity,
  unitCost,
});

describe("la lectura de las líneas", () => {
  it("de 1 a 50 líneas", () => {
    expect(parsePurchaseOrderLines([], 50, 2)).toEqual({
      ok: false,
      reason: "no_lines",
      lines: [],
    });
    const many = Array.from({ length: 51 }, () => line(P1, "1", "1"));
    expect(parsePurchaseOrderLines(many, 50, 2)).toEqual({
      ok: false,
      reason: "too_many_lines",
      lines: [],
    });
    expect(parsePurchaseOrderLines(many.slice(0, 50), 50, 2).ok).toBe(true);
  });

  it("cada línea con su primer campo que no se lee, con la razón del costo", () => {
    expect(
      parsePurchaseOrderLines(
        [
          line("no-es-un-uuid", "1", "10"),
          line(P1, "0", "10"),
          line(P2, "abc", "10"),
          line(P3, "1", "10,555"),
          line(P1, "1", "0"),
          line(P1, "1", "1234567890123"),
          line(P1, "1", "diez"),
          line(P1, "1", ""),
        ],
        50,
        2,
      ),
    ).toEqual({
      ok: false,
      reason: "lines",
      lines: [
        { position: 1, field: "product" },
        { position: 2, field: "quantity" },
        { position: 3, field: "quantity" },
        { position: 4, field: "unitCost", reason: "decimals" },
        { position: 5, field: "unitCost", reason: "zero" },
        { position: 6, field: "unitCost", reason: "too_large" },
        { position: 7, field: "unitCost", reason: "invalid" },
        { position: 8, field: "unitCost", reason: "invalid" },
      ],
    });
  });

  it("el costo se lee con los decimales de la moneda elegida", () => {
    // Con dos decimales, «1.500,50» es mil quinientos con cincuenta.
    expect(parsePurchaseOrderLines([line(P1, "2", "1.500,50")], 50, 2)).toEqual(
      {
        ok: true,
        lines: [
          { position: 1, productId: P1, quantity: 2000n, unitCost: 150050n },
        ],
      },
    );
    // Sin decimales, el separador se rechaza: «1.500» no se adivina.
    expect(parsePurchaseOrderLines([line(P1, "2", "1.500")], 50, 0)).toEqual({
      ok: false,
      reason: "lines",
      lines: [{ position: 1, field: "unitCost", reason: "separator" }],
    });
    expect(parsePurchaseOrderLines([line(P1, "2", "1500")], 50, 0)).toEqual({
      ok: true,
      lines: [
        { position: 1, productId: P1, quantity: 2000n, unitCost: 150000n },
      ],
    });
  });

  it("el id del producto va en minúsculas", () => {
    const parsed = parsePurchaseOrderLines(
      [line(` ${P1.toUpperCase()} `, "1", "1")],
      50,
      2,
    );
    expect(parsed.ok && parsed.lines[0]!.productId).toBe(P1);
  });
});

const parsed = (
  productId: string,
  quantity: bigint,
  unitCost: bigint,
  position: number,
): ParsedPurchaseOrderLine => ({ position, productId, quantity, unitCost });

const active = new Map([
  [P1, { isActive: true }],
  [P2, { isActive: true }],
  [P3, { isActive: false }],
]);

describe("las reglas, en su orden", () => {
  it("2. un producto en una sola línea, antes que todo lo demás", () => {
    // La repetición se informa aunque el producto no exista o esté inactivo.
    expect(
      evaluatePurchaseOrderLines(
        [
          parsed(P3, 1000n, 100n, 1),
          parsed("44444444-4444-4444-8444-444444444444", 1000n, 100n, 2),
          parsed(P3, 1000n, 100n, 3),
        ],
        active,
        2,
      ),
    ).toEqual({
      ok: false,
      reason: "line_rules",
      lines: [{ position: 3, productId: P3, rule: "duplicate_product" }],
    });
  });

  it("3. el producto existe en la organización, y después que esté activo", () => {
    const missing = "44444444-4444-4444-8444-444444444444";
    expect(
      evaluatePurchaseOrderLines(
        [parsed(P3, 1000n, 100n, 1), parsed(missing, 1000n, 100n, 2)],
        active,
        2,
      ),
    ).toEqual({
      ok: false,
      reason: "missing_products",
      lines: [{ position: 2, productId: missing }],
    });
    expect(
      evaluatePurchaseOrderLines(
        [parsed(P1, 1000n, 100n, 1), parsed(P3, 1000n, 100n, 2)],
        active,
        2,
      ),
    ).toEqual({
      ok: false,
      reason: "line_rules",
      lines: [{ position: 2, productId: P3, rule: "inactive_product" }],
    });
  });

  it("4. el total de cada línea no es cero ni desborda, después de la actividad", () => {
    expect(
      evaluatePurchaseOrderLines(
        [
          // 0,01 por 0,001 da 0,00001: cero con dos decimales.
          parsed(P1, 1n, 1n, 1),
          // 999.999.999.999,99 por 2 desborda numeric(14, 2).
          parsed(P2, 2000n, 99_999_999_999_999n, 2),
        ],
        active,
        2,
      ),
    ).toEqual({
      ok: false,
      reason: "line_rules",
      lines: [
        { position: 1, productId: P1, rule: "zero_total" },
        { position: 2, productId: P2, rule: "amount_too_large" },
      ],
    });
  });

  it("5. la suma cabe en numeric(14, 2)", () => {
    expect(
      evaluatePurchaseOrderLines(
        [
          parsed(P1, 1000n, 60_000_000_000_000n, 1),
          parsed(P2, 1000n, 60_000_000_000_000n, 2),
        ],
        active,
        2,
      ),
    ).toEqual({ ok: false, reason: "total_too_large" });
  });

  it("el redondeo por línea con monedas de 2 y de 0 decimales", () => {
    // 3 × 3,34 = 10,02, y 1,5 × 0,99 = 1,485 → 1,49 con dos decimales (el medio hacia afuera del
    // cero). El total es la suma de las líneas redondeadas: 11,51.
    const lines = [parsed(P1, 3000n, 334n, 1), parsed(P2, 1500n, 99n, 2)];
    expect(evaluatePurchaseOrderLines(lines, active, 2)).toEqual({
      ok: true,
      lines: [
        { ...lines[0], total: 1002n },
        { ...lines[1], total: 149n },
      ],
      total: 1151n,
    });
    // Sin decimales: 1,5 × 333 = 499,5 → 500, y 2,5 × 101 = 252,5 → 253; el total, 753.
    const pesos = [parsed(P1, 1500n, 33300n, 1), parsed(P2, 2500n, 10100n, 2)];
    expect(evaluatePurchaseOrderLines(pesos, active, 0)).toEqual({
      ok: true,
      lines: [
        { ...pesos[0], total: 50000n },
        { ...pesos[1], total: 25300n },
      ],
      total: 75300n,
    });
  });
});
