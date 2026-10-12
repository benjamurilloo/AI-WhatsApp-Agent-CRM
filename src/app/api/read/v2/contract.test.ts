import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  productListResponseSchemaV2,
  productResponseSchemaV2,
  productStockResponseSchemaV2,
  toContractProductStockV2,
} from "./contract";

// Contrato de lectura v2 de productos (brief-19.4, D-12): el mapeo del stock y los fixtures, que son
// de forma asumida hasta la 19.4.3.

const ID = "0b6f3c2e-5a4d-4e8f-9c1b-2a3d4e5f6a7b";

describe("toContractProductStockV2", () => {
  it("escribe las tres cantidades en forma canónica, con el estado que recibe", () => {
    const body = toContractProductStockV2({
      productId: ID,
      unit: "kg",
      quantityOnHand: "2.500",
      quantityReserved: "0.250",
      quantityAvailable: "2.250",
      stockStatus: "disponible",
    });
    expect(body).toStrictEqual({
      contract_version: "2",
      product_id: ID,
      quantity_on_hand: "2.5",
      quantity_reserved: "0.25",
      quantity_available: "2.25",
      unit: "kg",
      stock_status: "disponible",
    });
    expect(productStockResponseSchemaV2.safeParse(body).success).toBe(true);
  });

  it("el esquema es estricto: sin un número de JSON, sin campos de más ni de v1", () => {
    const valid = toContractProductStockV2({
      productId: ID,
      unit: "unidad",
      quantityOnHand: "10.000",
      quantityReserved: "8.000",
      quantityAvailable: "2.000",
      stockStatus: "bajo_stock",
    });
    for (const invalid of [
      { ...valid, quantity_available: 2 },
      { ...valid, quantity_reserved: "8.000" },
      { ...valid, reorder_point: "5" },
      { ...valid, contract_version: "1" },
    ]) {
      expect(productStockResponseSchemaV2.safeParse(invalid).success).toBe(
        false,
      );
    }
  });
});

describe("fixtures del contrato v2", () => {
  const dir = path.join(process.cwd(), "tests/fixtures/read/v2");
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

  it("existen las tres rutas", () => {
    const paths = files.map(
      (file) =>
        JSON.parse(readFileSync(path.join(dir, file), "utf8")).request
          .path as string,
    );
    expect(paths.some((p) => p.startsWith("/api/read/v2/products?"))).toBe(
      true,
    );
    expect(paths.some((p) => p.endsWith("/stock"))).toBe(true);
    expect(
      paths.some((p) => /^\/api\/read\/v2\/products\/[0-9a-f-]{36}$/.test(p)),
    ).toBe(true);
  });

  it.each(files)("%s declara su forma y pasa el validador", (file) => {
    const data = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    // Las capturas del consumidor real, desde la 19.4.3 (brief-19.4, AC-15).
    const isCaptured = file.startsWith("captured-");
    expect(data.shape).toBe(isCaptured ? "captured" : "assumed");
    expect(data.note).toMatch(
      isCaptured ? /capturada del consumidor real/i : /forma asumida/i,
    );
    const { body } = data.response;
    const schema = data.request.path.endsWith("/stock")
      ? productStockResponseSchemaV2
      : "items" in body
        ? productListResponseSchemaV2
        : productResponseSchemaV2;
    const parsed = schema.safeParse(body);
    expect(parsed.success, parsed.error?.message).toBe(true);
  });
});
