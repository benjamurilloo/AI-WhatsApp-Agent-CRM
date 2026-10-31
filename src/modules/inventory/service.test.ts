import { describe, expect, it } from "vitest";
import type { Product } from "@/modules/catalog";
import { MAX_QUANTITY } from "@/shared/quantity";
import {
  composeProductStockPage,
  computeBalanceAfter,
  movementPageBounds,
  MOVEMENTS_PAGE_SIZE,
  NO_MODEL_GROUP,
  PRODUCTS_PAGE_SIZE,
  sumByModel,
  validateMovementHistoryFilters,
  validateStockAdjustmentInput,
  type MovementHistoryFilters,
  type ProductSort,
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
    barcode: null,
    weightKg: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    location: null,
    shelf: null,
    modelId: null,
    tracking: "quantity",
    isService: false,
    isActive: true,
    createdAt: new Date("2026-09-15T00:00:00Z"),
    updatedAt: new Date("2026-09-15T00:00:00Z"),
    ...overrides,
  };
}

// Un saldo sin nada reservado, como antes de la 19.3.
const onHand = (value: string) => ({ onHand: value, reserved: "0.000" });

describe("composeProductStockPage", () => {
  it("un producto sin saldo registrado tiene 0 y está sin stock", () => {
    const p = product();
    const result = composeProductStockPage([p], new Map(), {
      stockStatus: "all",
      page: 1,
    });
    expect(result.products[0]).toMatchObject({
      quantityOnHand: "0.000",
      quantityReserved: "0.000",
      quantityAvailable: "0.000",
      stockStatus: "sin_stock",
    });
  });

  it("brief-19.3 D-7: el estado, el filtro y el orden usan lo disponible, no el saldo físico", () => {
    // Punto de pedido 10 (product()): 15 físicos con 6 reservados quedan en bajo stock.
    const reserved = product({ name: "A" });
    const all = product({ name: "B" });
    const free = product({ name: "C" });
    const balances = new Map([
      [reserved.id, { onHand: "15.000", reserved: "6.000" }],
      [all.id, { onHand: "4.000", reserved: "4.000" }],
      [free.id, onHand("12.000")],
    ]);
    const page = composeProductStockPage([reserved, all, free], balances, {
      stockStatus: "all",
      page: 1,
      sort: "stock_asc",
    });
    expect(
      page.products.map((p) => [
        p.name,
        p.quantityOnHand,
        p.quantityReserved,
        p.quantityAvailable,
        p.stockStatus,
      ]),
    ).toEqual([
      ["B", "4.000", "4.000", "0.000", "sin_stock"],
      ["A", "15.000", "6.000", "9.000", "bajo_stock"],
      ["C", "12.000", "0.000", "12.000", "disponible"],
    ]);
    expect(
      composeProductStockPage([reserved, all, free], balances, {
        stockStatus: "sin_stock",
        page: 1,
      }).products.map((p) => p.name),
    ).toEqual(["B"]);
  });

  it("deriva el estado con el saldo y filtra por él", () => {
    const available = product({ name: "A" });
    const low = product({ name: "B" });
    const empty = product({ name: "C" });
    const balances = new Map([
      [available.id, onHand("10.001")],
      [low.id, onHand("10.000")],
      [empty.id, onHand("0.000")],
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

  it("brief-15.2 D-1: ordena por nombre inverso, SKU y stock, con desempate por nombre", () => {
    const a = product({ name: "A", sku: "Z-1" });
    const b = product({ name: "B", sku: "A-1" });
    const c = product({ name: "C", sku: "M-1" });
    const balances = new Map([
      [a.id, onHand("5.000")],
      [b.id, onHand("12.000")],
      [c.id, onHand("5.000")],
    ]);
    const names = (sort: ProductSort) =>
      composeProductStockPage([c, a, b], balances, {
        stockStatus: "all",
        page: 1,
        sort,
      }).products.map((p) => p.name);
    expect(names("name_desc")).toEqual(["C", "B", "A"]);
    expect(names("sku_asc")).toEqual(["B", "C", "A"]);
    expect(names("stock_asc")).toEqual(["A", "C", "B"]);
    expect(names("stock_desc")).toEqual(["B", "A", "C"]);
  });

  it("brief-15.2 D-1: por precio, numérico y sin precio al final en los dos sentidos", () => {
    const cheap = product({ name: "Cheap" });
    const dear = product({ name: "Dear" });
    const none = product({ name: "Alpha" });
    const ten = product({ name: "Ten" });
    const ars = (amount: string) => ({ amount, currency: "ARS" });
    const prices = new Map([
      [cheap.id, ars("9.50")],
      [dear.id, ars("1200.00")],
      [ten.id, ars("10.00")],
    ]);
    const names = (sort: ProductSort) =>
      composeProductStockPage(
        [none, dear, ten, cheap],
        new Map(),
        { stockStatus: "all", page: 1, sort },
        prices,
      ).products.map((p) => p.name);
    expect(names("price_asc")).toEqual(["Cheap", "Ten", "Dear", "Alpha"]);
    expect(names("price_desc")).toEqual(["Dear", "Ten", "Cheap", "Alpha"]);
  });

  it("brief-15.2 H-2: por precio, los montos se comparan dentro de cada moneda", () => {
    const pesos = product({ name: "Pesos" });
    const morePesos = product({ name: "Más pesos" });
    const dollars = product({ name: "Dólares" });
    const prices = new Map([
      [pesos.id, { amount: "990.00", currency: "ARS" }],
      [morePesos.id, { amount: "5000.00", currency: "ARS" }],
      [dollars.id, { amount: "10.00", currency: "USD" }],
    ]);
    const names = (sort: ProductSort) =>
      composeProductStockPage(
        [dollars, morePesos, pesos],
        new Map(),
        { stockStatus: "all", page: 1, sort },
        prices,
      ).products.map((p) => p.name);
    expect(names("price_asc")).toEqual(["Pesos", "Más pesos", "Dólares"]);
    expect(names("price_desc")).toEqual(["Más pesos", "Pesos", "Dólares"]);
  });

  it("brief-15.2 D-2: pagina con el tamaño pedido; uno fuera de 1 a 50 vuelve a 25", () => {
    const products = Array.from({ length: 30 }, (_, i) =>
      product({ name: `P${String(i).padStart(2, "0")}` }),
    );
    const page = (pageSize: number) =>
      composeProductStockPage(products, new Map(), {
        stockStatus: "all",
        page: 1,
        pageSize,
      });
    expect(page(10)).toMatchObject({ pageCount: 3 });
    expect(page(10).products).toHaveLength(10);
    expect(page(50).products).toHaveLength(30);
    expect(page(51).products).toHaveLength(PRODUCTS_PAGE_SIZE);
    expect(page(0).products).toHaveLength(PRODUCTS_PAGE_SIZE);
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
      // modelTotals desde la 24.5.1 (brief-24.5.1, D-2): vacío porque no se agrupa.
    ).toEqual({
      products: [],
      total: 0,
      page: 1,
      pageCount: 1,
      modelTotals: new Map(),
    });
  });
});

describe("computeBalanceAfter", () => {
  it("brief-19.3: rechaza un ajuste negativo que deja el saldo por debajo de lo reservado", () => {
    expect(
      computeBalanceAfter(10000n, "adjustment_negative", 3000n, 8000n),
    ).toEqual({ ok: false, rule: "below_reserved" });
    expect(
      computeBalanceAfter(10000n, "adjustment_negative", 2000n, 8000n),
    ).toEqual({ ok: true, balanceAfter: 8000n });
    // Negativo tiene prioridad: el saldo no puede bajar de cero, haya o no reservas.
    expect(
      computeBalanceAfter(1000n, "adjustment_negative", 2000n, 500n),
    ).toEqual({ ok: false, rule: "negative_stock" });
  });

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

  it("brief-19.3 AC-5: order_delivery no es un tipo de ajuste", () => {
    expect(
      validateStockAdjustmentInput({ ...valid, type: "order_delivery" }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["type"] });
  });

  it("brief-20.3 AC-5: sale no es un tipo de ajuste", () => {
    expect(validateStockAdjustmentInput({ ...valid, type: "sale" })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["type"],
    });
  });

  it("brief-20.4 D-5: sale_void no es un tipo de ajuste", () => {
    expect(
      validateStockAdjustmentInput({ ...valid, type: "sale_void" }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["type"] });
  });

  it("brief-22.4 D-3: goods_receipt no es un tipo de ajuste", () => {
    expect(
      validateStockAdjustmentInput({ ...valid, type: "goods_receipt" }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["type"] });
  });

  it("brief-22.5 D-3: goods_receipt_void no es un tipo de ajuste", () => {
    expect(
      validateStockAdjustmentInput({ ...valid, type: "goods_receipt_void" }),
    ).toEqual({ ok: false, code: "VALIDATION_ERROR", fields: ["type"] });
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

  // brief-20.3, H-2: el historial filtra las ventas sin pedido.
  it("acepta sale, la salida de una venta sin pedido", () => {
    expect(validateMovementHistoryFilters({ ...all, type: "sale" })).toEqual({
      ok: true,
      values: { type: "sale", from: null, to: null },
    });
  });

  // brief-20.4, D-7: el historial filtra las reposiciones de las anulaciones.
  it("acepta sale_void, la reposición de una anulación", () => {
    expect(
      validateMovementHistoryFilters({ ...all, type: "sale_void" }),
    ).toEqual({
      ok: true,
      values: { type: "sale_void", from: null, to: null },
    });
  });

  // brief-22.4, D-14: el historial filtra las entradas de las recepciones.
  it("acepta goods_receipt, la entrada de una recepción", () => {
    expect(
      validateMovementHistoryFilters({ ...all, type: "goods_receipt" }),
    ).toEqual({
      ok: true,
      values: { type: "goods_receipt", from: null, to: null },
    });
  });

  // brief-22.5, D-9: el historial filtra las salidas de las anulaciones de recepciones.
  it("acepta goods_receipt_void, la anulación de una recepción", () => {
    expect(
      validateMovementHistoryFilters({ ...all, type: "goods_receipt_void" }),
    ).toEqual({
      ok: true,
      values: { type: "goods_receipt_void", from: null, to: null },
    });
  });

  it.each([
    [["type"], { type: "purchase" }],
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

// Las sumas por modelo del catálogo agrupado (brief-24.5.1, D-2 y AC-3).
describe("sumByModel (brief-24.5.1, D-2)", () => {
  const MODEL_A = "00000000-0000-4000-8000-00000000aaaa";
  const MODEL_B = "00000000-0000-4000-8000-00000000bbbb";

  const withStock = (
    products: Product[],
    balances: Map<string, { onHand: string; reserved: string }>,
  ) =>
    composeProductStockPage(products, balances, {
      stockStatus: "all",
      page: 1,
    }).products;

  it("suma las presentaciones, lo disponible y lo reservado de cada modelo", () => {
    const a1 = product({ modelId: MODEL_A, name: "A1" });
    const a2 = product({ modelId: MODEL_A, name: "A2" });
    const b1 = product({ modelId: MODEL_B, name: "B1" });
    const balances = new Map([
      [a1.id, { onHand: "5.000", reserved: "1.000" }],
      [a2.id, { onHand: "3.000", reserved: "2.000" }],
      [b1.id, { onHand: "7.000", reserved: "0.000" }],
    ]);
    expect(sumByModel(withStock([a1, a2, b1], balances))).toEqual(
      new Map([
        [
          MODEL_A,
          {
            products: 2,
            // 5-1 y 3-2 disponibles; 1 y 2 reservados.
            quantityAvailable: "5.000",
            quantityReserved: "3.000",
          },
        ],
        [
          MODEL_B,
          {
            products: 1,
            quantityAvailable: "7.000",
            quantityReserved: "0.000",
          },
        ],
      ]),
    );
  });

  it("los productos sin modelo van a su propio grupo, con la clave vacía", () => {
    const loose = product({ modelId: null, name: "Funda" });
    const balances = new Map([[loose.id, onHand("4.000")]]);
    const totals = sumByModel(withStock([loose], balances));
    expect(totals.get(NO_MODEL_GROUP)).toEqual({
      products: 1,
      quantityAvailable: "4.000",
      quantityReserved: "0.000",
    });
    expect([...totals.keys()]).toEqual([NO_MODEL_GROUP]);
  });

  it("un modelo cuyo stock está todo reservado suma cero disponible, no desaparece", () => {
    const taken = product({ modelId: MODEL_A, name: "Agotado" });
    const balances = new Map([
      [taken.id, { onHand: "2.000", reserved: "2.000" }],
    ]);
    expect(sumByModel(withStock([taken], balances))).toEqual(
      new Map([
        [
          MODEL_A,
          {
            products: 1,
            quantityAvailable: "0.000",
            quantityReserved: "2.000",
          },
        ],
      ]),
    );
  });

  it("sin productos no hay grupos", () => {
    expect(sumByModel([])).toEqual(new Map());
  });

  it("suma con decimales sin error de punto flotante", () => {
    const a1 = product({ modelId: MODEL_A, name: "A1", unit: "kg" });
    const a2 = product({ modelId: MODEL_A, name: "A2", unit: "kg" });
    const a3 = product({ modelId: MODEL_A, name: "A3", unit: "kg" });
    const balances = new Map([
      [a1.id, onHand("0.100")],
      [a2.id, onHand("0.200")],
      [a3.id, onHand("0.400")],
    ]);
    // 0.1 + 0.2 + 0.4 en punto flotante da 0.7000000000000001.
    expect(
      sumByModel(withStock([a1, a2, a3], balances)).get(MODEL_A),
    ).toMatchObject({ quantityAvailable: "0.700" });
  });
});

// Las sumas que devuelve la página (brief-24.5.1, D-2): del resultado filtrado, no de la tajada.
describe("composeProductStockPage y las sumas por modelo (brief-24.5.1, AC-3)", () => {
  const MODEL_A = "00000000-0000-4000-8000-00000000aaaa";

  it("sin agrupar no trae sumas: nadie las mira", () => {
    const p = product({ modelId: MODEL_A });
    const page = composeProductStockPage(
      [p],
      new Map([[p.id, onHand("3.000")]]),
      { stockStatus: "all", page: 1 },
    );
    expect(page.modelTotals).toEqual(new Map());
  });

  it("agrupando, las sumas cubren el resultado filtrado entero y no solo la página", () => {
    const many = Array.from({ length: PRODUCTS_PAGE_SIZE + 3 }, (_, index) =>
      product({ modelId: MODEL_A, name: `P${String(index).padStart(3, "0")}` }),
    );
    const balances = new Map(many.map((p) => [p.id, onHand("1.000")]));
    const page = composeProductStockPage(
      many,
      balances,
      {
        stockStatus: "all",
        page: 1,
        sort: "name_asc",
        pageSize: PRODUCTS_PAGE_SIZE,
      },
      new Map(),
      new Map([[MODEL_A, 0]]),
    );
    expect(page.products).toHaveLength(PRODUCTS_PAGE_SIZE);
    expect(page.total).toBe(PRODUCTS_PAGE_SIZE + 3);
    // La página muestra PRODUCTS_PAGE_SIZE, pero el grupo declara los PRODUCTS_PAGE_SIZE + 3.
    expect(page.modelTotals.get(MODEL_A)).toEqual({
      products: PRODUCTS_PAGE_SIZE + 3,
      quantityAvailable: `${PRODUCTS_PAGE_SIZE + 3}.000`,
      quantityReserved: "0.000",
    });
  });

  it("el filtro de estado se aplica antes de sumar: las sumas son del resultado filtrado", () => {
    const empty = product({ modelId: MODEL_A, name: "Sin stock" });
    const stocked = product({ modelId: MODEL_A, name: "Con stock" });
    const balances = new Map([
      [empty.id, onHand("0.000")],
      [stocked.id, onHand("50.000")],
    ]);
    const page = composeProductStockPage(
      [empty, stocked],
      balances,
      {
        stockStatus: "disponible",
        page: 1,
        sort: "name_asc",
        pageSize: PRODUCTS_PAGE_SIZE,
      },
      new Map(),
      new Map([[MODEL_A, 0]]),
    );
    expect(page.modelTotals.get(MODEL_A)).toEqual({
      products: 1,
      quantityAvailable: "50.000",
      quantityReserved: "0.000",
    });
  });
});
