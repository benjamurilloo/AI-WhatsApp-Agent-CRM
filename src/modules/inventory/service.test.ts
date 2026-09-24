import { describe, expect, it } from "vitest";
import type { Product } from "@/modules/catalog";
import { MAX_QUANTITY } from "@/shared/quantity";
import {
  composeProductStockPage,
  computeBalanceAfter,
  movementPageBounds,
  MOVEMENTS_PAGE_SIZE,
  PRODUCTS_PAGE_SIZE,
  validateMovementHistoryFilters,
  validateStockAdjustmentInput,
  type MovementHistoryFilters,
  type StockAdjustmentInput,
} from "./service";

let nextId = 0;

function product(overrides: Partial<Product> = {}): Product {
  nextId += 1;
  return {
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
    sku: `SKU-${nextId}`,
    name: `Producto ${nextId}`,
    description: null,
    unit: "unidad",
    reorderPoint: "10.000",
    brand: null,
    category: null,
    condition: "new",
    isActive: true,
    createdAt: new Date("2026-09-15T00:00:00Z"),
    updatedAt: new Date("2026-09-15T00:00:00Z"),
    ...overrides,
  };
}

describe("composeProductStockPage", () => {
  it("un producto sin saldo registrado tiene 0 y está sin stock", () => {
    const p = product();
    const result = composeProductStockPage([p], new Map(), {
      stockStatus: "all",
      page: 1,
    });
    expect(result.products[0]).toMatchObject({
      quantityOnHand: "0.000",
      stockStatus: "sin_stock",
    });
  });

  it("deriva el estado con el saldo y filtra por él", () => {
    const available = product({ name: "A" });
    const low = product({ name: "B" });
    const empty = product({ name: "C" });
    const balances = new Map([
      [available.id, "10.001"],
      [low.id, "10.000"],
      [empty.id, "0.000"],
    ]);
    const all = [available, low, empty];
    const statusOf = (stockStatus: "disponible" | "bajo_stock" | "sin_stock") =>
      composeProductStockPage(all, balances, {
        stockStatus,
        page: 1,
      }).products.map((p) => p.name);
    expect(statusOf("disponible")).toEqual(["A"]);
    expect(statusOf("bajo_stock")).toEqual(["B"]);
    expect(statusOf("sin_stock")).toEqual(["C"]);
  });

  it("ordena por nombre sin distinguir mayúsculas ni acentos, y desempata por SKU", () => {
    const products = [
      product({ name: "yerba", sku: "B" }),
      product({ name: "Azúcar", sku: "Z" }),
      product({ name: "azucar", sku: "A" }),
    ];
    const result = composeProductStockPage(products, new Map(), {
      stockStatus: "all",
      page: 1,
    });
    expect(result.products.map((p) => p.sku)).toEqual(["A", "Z", "B"]);
  });

  it("pagina de a 25 y lleva una página fuera de rango a la última", () => {
    const products = Array.from({ length: 30 }, (_, i) =>
      product({ name: `P${String(i).padStart(2, "0")}` }),
    );
    const second = composeProductStockPage(products, new Map(), {
      stockStatus: "all",
      page: 9,
    });
    expect(second).toMatchObject({ total: 30, page: 2, pageCount: 2 });
    expect(second.products).toHaveLength(30 - PRODUCTS_PAGE_SIZE);
    expect(
      composeProductStockPage(products, new Map(), {
        stockStatus: "all",
        page: 0,
      }).page,
    ).toBe(1);
  });

  it("sin resultados devuelve una página vacía", () => {
    expect(
      composeProductStockPage([], new Map(), { stockStatus: "all", page: 1 }),
    ).toEqual({ products: [], total: 0, page: 1, pageCount: 1 });
  });
});

describe("computeBalanceAfter", () => {
  it("un ajuste negativo que deja el saldo exacto en 0 se acepta", () => {
    expect(computeBalanceAfter(6000n, "adjustment_negative", 6000n)).toEqual({
      ok: true,
      balanceAfter: 0n,
    });
  });

  it("uno que lo dejaría en −0,001 viola negative_stock", () => {
    expect(computeBalanceAfter(6000n, "adjustment_negative", 6001n)).toEqual({
      ok: false,
      rule: "negative_stock",
    });
  });

  it("un ajuste positivo llega al máximo, pero no lo supera por una milésima", () => {
    expect(
      computeBalanceAfter(MAX_QUANTITY - 1n, "adjustment_positive", 1n),
    ).toEqual({ ok: true, balanceAfter: MAX_QUANTITY });
    expect(
      computeBalanceAfter(MAX_QUANTITY, "adjustment_positive", 1n),
    ).toEqual({ ok: false, rule: "stock_limit" });
  });

  it("suma y resta exactas en milésimas", () => {
    expect(computeBalanceAfter(100n, "adjustment_positive", 200n)).toEqual({
      ok: true,
      balanceAfter: 300n,
    });
  });
});

describe("validateStockAdjustmentInput", () => {
  const valid: StockAdjustmentInput = {
    type: "adjustment_positive",
    quantity: "2,5",
    expectedQuantityOnHand: "6.000",
    reason: "  Conteo físico  ",
  };

  it("normaliza cantidades a milésimas y recorta el motivo", () => {
    expect(validateStockAdjustmentInput(valid)).toEqual({
      ok: true,
      values: {
        type: "adjustment_positive",
        quantity: 2500n,
        expectedQuantityOnHand: 6000n,
        reason: "Conteo físico",
      },
    });
  });

  it("acepta la menor cantidad, un saldo esperado de 0 y un motivo de 500 caracteres", () => {
    expect(
      validateStockAdjustmentInput({
        ...valid,
        quantity: "0,001",
        expectedQuantityOnHand: "0",
        reason: "a".repeat(500),
      }).ok,
    ).toBe(true);
  });

  it("devuelve cada campo inválido en orden", () => {
    expect(
      validateStockAdjustmentInput({
        type: "sale",
        quantity: "0",
        expectedQuantityOnHand: "-1",
        reason: "   ",
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["type", "quantity", "expectedQuantityOnHand", "reason"],
    });
  });

  it.each([
    ["quantity", { quantity: "1e3" }],
    ["quantity", { quantity: "1,0001" }],
    ["expectedQuantityOnHand", { expectedQuantityOnHand: "" }],
    ["reason", { reason: "a".repeat(501) }],
  ])("rechaza %s: %j", (field, override) => {
    expect(validateStockAdjustmentInput({ ...valid, ...override })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [field],
    });
  });
});

describe("validateMovementHistoryFilters", () => {
  const all: MovementHistoryFilters = {
    type: "all",
    from: "",
    to: "",
    page: 1,
  };

  it("sin filtros no limita tipo ni período", () => {
    expect(validateMovementHistoryFilters(all)).toEqual({
      ok: true,
      values: { type: null, from: null, to: null },
    });
  });

  it("acepta un tipo, fechas iguales y recorta espacios", () => {
    expect(
      validateMovementHistoryFilters({
        ...all,
        type: "adjustment_negative",
        from: " 2024-02-29 ",
        to: "2024-02-29",
      }),
    ).toEqual({
      ok: true,
      values: {
        type: "adjustment_negative",
        from: "2024-02-29",
        to: "2024-02-29",
      },
    });
  });

  it.each([
    [["type"], { type: "sale" }],
    [["type"], { type: "" }],
    [["from"], { from: "2025-02-29" }],
    [["from"], { from: "2026-9-1" }],
    [["to"], { to: "0999-12-31" }],
    [["from", "to"], { from: "2026-09-02", to: "2026-09-01" }],
  ])("rechaza %j: %j", (fields, override) => {
    expect(validateMovementHistoryFilters({ ...all, ...override })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields,
    });
  });
});

describe("movementPageBounds", () => {
  it("sin movimientos hay una página", () => {
    expect(movementPageBounds(0, 5)).toEqual({
      page: 1,
      pageCount: 1,
      offset: 0,
    });
  });

  it("calcula el desplazamiento y lleva las páginas fuera de rango a un extremo", () => {
    expect(movementPageBounds(MOVEMENTS_PAGE_SIZE + 1, 2)).toEqual({
      page: 2,
      pageCount: 2,
      offset: MOVEMENTS_PAGE_SIZE,
    });
    expect(movementPageBounds(MOVEMENTS_PAGE_SIZE, 2).page).toBe(1);
    expect(movementPageBounds(60, Number.POSITIVE_INFINITY).page).toBe(3);
    expect(movementPageBounds(60, 2.9).page).toBe(2);
    expect(movementPageBounds(60, Number.NaN).page).toBe(1);
  });
});
