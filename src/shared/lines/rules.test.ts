import { describe, expect, it } from "vitest";
import { MAX_AMOUNT, moneyToDatabase } from "@/shared/money";
import {
  duplicateLines,
  evaluateLines,
  parseLines,
  type LinePrice,
  type LineProduct,
  type ParsedLine,
} from "./rules";

// brief-20.3, D-1 y AC-2: las reglas de línea del pedido de la app y de la venta sin pedido. Los
// tests de integración de orders fijan que el alta del pedido responde lo mismo que antes.

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const PRICE_A = "00000000-0000-4000-8000-0000000000a1";
const PRICE_B = "00000000-0000-4000-8000-0000000000b1";
const PRICE_C = "00000000-0000-4000-8000-0000000000c1";

const line = (
  position: number,
  productId: string,
  quantity: bigint,
  expectedPriceId: string | null,
): ParsedLine => ({ position, productId, quantity, expectedPriceId });

const product = (
  price: LinePrice | null,
  isActive = true,
): LineProduct<LinePrice> => ({ isActive, price });

const price = (id: string, amount: string, currency = "ARS"): LinePrice => ({
  id,
  amount,
  currency,
});

describe("parseLines", () => {
  it("valida y normaliza las líneas", () => {
    expect(
      parseLines(
        [
          {
            productId: ` ${A.toUpperCase()} `,
            quantity: "1,5",
            expectedPriceId: PRICE_A,
          },
          { productId: B, quantity: "2", expectedPriceId: "" },
        ],
        50,
      ),
    ).toEqual({
      ok: true,
      lines: [line(1, A, 1_500n, PRICE_A), line(2, B, 2_000n, null)],
    });
  });

  it("rechaza sin líneas o con más que el límite", () => {
    expect(parseLines([], 50)).toEqual({
      ok: false,
      reason: "no_lines",
      lines: [],
    });
    const many = Array.from({ length: 3 }, () => ({
      productId: A,
      quantity: "1",
      expectedPriceId: "",
    }));
    expect(parseLines(many, 2)).toEqual({
      ok: false,
      reason: "too_many_lines",
      lines: [],
    });
  });

  it("informa la posición y el campo de cada línea inválida", () => {
    expect(
      parseLines(
        [
          { productId: "x", quantity: "1", expectedPriceId: "" },
          { productId: A, quantity: "0", expectedPriceId: "" },
          { productId: B, quantity: "1,2345", expectedPriceId: "" },
          { productId: C, quantity: "1", expectedPriceId: "y" },
        ],
        50,
      ),
    ).toEqual({
      ok: false,
      reason: "lines",
      lines: [
        { position: 1, field: "product" },
        { position: 2, field: "quantity" },
        { position: 3, field: "quantity" },
        { position: 4, field: "expectedPrice" },
      ],
    });
  });
});

describe("duplicateLines", () => {
  it("rechaza cada repetición, no la primera", () => {
    expect(
      duplicateLines([
        line(1, A, 1_000n, null),
        line(2, B, 1_000n, null),
        line(3, A, 1_000n, null),
        line(4, A, 1_000n, null),
      ]),
    ).toEqual([
      { position: 3, productId: A, rule: "duplicate_product" },
      { position: 4, productId: A, rule: "duplicate_product" },
    ]);
  });
});

describe("evaluateLines", () => {
  it("devuelve las líneas con precio y total, y el total del comprobante", () => {
    const result = evaluateLines(
      [line(1, A, 3_000n, PRICE_A), line(2, B, 500n, PRICE_B)],
      new Map([
        [A, product(price(PRICE_A, "1234.50"))],
        [B, product(price(PRICE_B, "0.05"))],
      ]),
    );
    expect(result).toEqual({
      ok: true,
      currency: "ARS",
      lines: [
        {
          ...line(1, A, 3_000n, PRICE_A),
          price: price(PRICE_A, "1234.50"),
          total: 370_350n,
        },
        {
          ...line(2, B, 500n, PRICE_B),
          price: price(PRICE_B, "0.05"),
          total: 3n,
        },
      ],
      total: 370_353n,
    });
  });

  it("primero los productos que no están", () => {
    expect(
      evaluateLines(
        [line(1, A, 1_000n, PRICE_A), line(2, B, 1_000n, null)],
        new Map([[A, product(null, false)]]),
      ),
    ).toEqual({
      ok: false,
      reason: "missing_products",
      lines: [{ position: 2, productId: B }],
    });
  });

  it("después los inactivos y los que no tienen precio, antes que el precio que cambió", () => {
    expect(
      evaluateLines(
        [
          line(1, A, 1_000n, null),
          line(2, B, 1_000n, null),
          line(3, C, 1_000n, "00000000-0000-4000-8000-0000000000ff"),
        ],
        new Map([
          [A, product(price(PRICE_A, "1.00"), false)],
          [B, product(null)],
          [C, product(price(PRICE_C, "1.00"))],
        ]),
      ),
    ).toEqual({
      ok: false,
      reason: "line_rules",
      lines: [
        { position: 1, productId: A, rule: "inactive_product" },
        { position: 2, productId: B, rule: "no_price" },
      ],
    });
  });

  it("el precio que cambió, con el vigente, antes que la moneda y los montos", () => {
    const current = price(PRICE_B, "2.00", "USD");
    expect(
      evaluateLines(
        [line(1, A, 1_000n, PRICE_A), line(2, B, 1_000n, null)],
        new Map([
          [A, product(price(PRICE_A, "1.00"))],
          [B, product(current)],
        ]),
      ),
    ).toEqual({
      ok: false,
      reason: "price_changed",
      lines: [{ position: 2, productId: B, price: current }],
    });
  });

  it("la moneda de la primera línea, y los montos de cada una", () => {
    expect(
      evaluateLines(
        [
          line(1, A, 1_000n, PRICE_A),
          line(2, B, 1_000n, PRICE_B),
          line(3, C, 100n, PRICE_C),
        ],
        new Map([
          [A, product(price(PRICE_A, "1.00"))],
          [B, product(price(PRICE_B, "1.00", "USD"))],
          [C, product(price(PRICE_C, "0.03"))],
        ]),
      ),
    ).toEqual({
      ok: false,
      reason: "line_rules",
      lines: [
        { position: 2, productId: B, rule: "currency_mismatch" },
        { position: 3, productId: C, rule: "zero_total" },
      ],
    });
    expect(
      evaluateLines(
        [line(1, A, 2_000n, PRICE_A)],
        new Map([[A, product(price(PRICE_A, moneyToDatabase(MAX_AMOUNT)))]]),
      ),
    ).toEqual({
      ok: false,
      reason: "line_rules",
      lines: [{ position: 1, productId: A, rule: "amount_too_large" }],
    });
  });

  it("al final, un total que no cabe", () => {
    expect(
      evaluateLines(
        [line(1, A, 1_000n, PRICE_A), line(2, B, 1_000n, PRICE_B)],
        new Map([
          [A, product(price(PRICE_A, moneyToDatabase(MAX_AMOUNT)))],
          [B, product(price(PRICE_B, "0.01"))],
        ]),
      ),
    ).toEqual({ ok: false, reason: "total_too_large" });
  });
});
