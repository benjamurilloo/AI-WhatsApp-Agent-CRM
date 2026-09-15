import { describe, expect, it } from "vitest";
import type { Product } from "@/modules/catalog";
import { composeProductStockPage, PRODUCTS_PAGE_SIZE } from "./service";

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
