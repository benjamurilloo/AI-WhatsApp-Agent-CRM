import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ExchangeSetup } from "@/modules/fx";
import type { ServiceCatalogProduct } from "@/modules/inventory";
import {
  capabilityListResponseSchemaV3,
  contractRate,
  convertPrice,
  productListResponseSchemaV3,
  productResponseSchemaV3,
  productStockResponseSchemaV3,
  sortUnitsByPrice,
  toContractCapabilities,
  toContractProductV3,
  toContractUnitV3,
  unitListResponseSchemaV3,
  type ContractUnitV3,
} from "./contract";

// Contrato de lectura v3 (brief-29.8, D-2 a D-6): la conversión en cada caso de D-6, el producto y la
// unidad del contrato, el orden de las unidades, los esquemas estrictos y los fixtures, que son de
// forma asumida hasta la ventana con el agente.

const AS_OF = new Date("2026-10-22T13:00:00.000Z");

function setup(
  overrides: Partial<{
    main: string;
    quote: string;
    rate: bigint;
    stale: boolean;
    current: boolean;
  }> = {},
): ExchangeSetup {
  const main = overrides.main ?? "USD";
  const quote = overrides.quote ?? "ARS";
  return {
    mainCurrency: main,
    quoteCurrency: quote,
    source: "manual",
    adjustment: 0n,
    current:
      overrides.current === false
        ? null
        : {
            id: "00000000-0000-4000-8000-000000000001",
            baseCurrency: main,
            quoteCurrency: quote,
            rate: overrides.rate ?? 1_200_000_000n,
            source: "manual",
            recordedBy: null,
            recordedAt: AS_OF,
            asOf: AS_OF,
            reading: null,
            stale: overrides.stale ?? false,
          },
  } as unknown as ExchangeSetup;
}

describe("convertPrice (D-6)", () => {
  it("de la principal a la otra multiplica, con la tasa y su fecha", () => {
    expect(
      convertPrice({ amount: "420.00", currency: "USD" }, setup()),
    ).toStrictEqual({
      amount: "504000.00",
      currency: "ARS",
      rate: "1200",
      rate_as_of: "2026-10-22T13:00:00.000Z",
    });
  });

  it("de la otra a la principal divide con la misma tasa: no se invierte", () => {
    expect(
      convertPrice({ amount: "12000.00", currency: "ARS" }, setup()),
    ).toStrictEqual({
      amount: "10.00",
      currency: "USD",
      rate: "1200",
      rate_as_of: "2026-10-22T13:00:00.000Z",
    });
  });

  it("redondea a los decimales de la moneda de destino, con el medio hacia afuera", () => {
    // 1.00 USD × 950,5 = 950,5 CLP, que no tiene decimales.
    expect(
      convertPrice(
        { amount: "1.00", currency: "USD" },
        setup({ quote: "CLP", rate: 950_500_000n }),
      ),
    ).toMatchObject({ amount: "951", currency: "CLP", rate: "950.5" });
  });

  it.each([
    ["sin configuración", null],
    ["sin cotización vigente", setup({ current: false })],
    ["con la vigente vencida (U-3)", setup({ stale: true })],
  ])("va null %s", (_, value) => {
    expect(
      convertPrice({ amount: "420.00", currency: "USD" }, value),
    ).toBeNull();
  });

  it("va null sin precio, con una moneda fuera del par o si redondea a cero", () => {
    expect(convertPrice(null, setup())).toBeNull();
    expect(
      convertPrice({ amount: "420.00", currency: "EUR" }, setup()),
    ).toBeNull();
    // 1 peso / 1200 = 0,0008 dólares: no cabe en centavos.
    expect(
      convertPrice({ amount: "1.00", currency: "ARS" }, setup()),
    ).toBeNull();
  });

  it("va null si no cabe en numeric(14, 2)", () => {
    expect(
      convertPrice(
        { amount: "999999999999.99", currency: "USD" },
        setup({ rate: 999_999_000_000n }),
      ),
    ).toBeNull();
  });
});

describe("contractRate", () => {
  it("escribe la tasa sin ceros de más", () => {
    expect(contractRate(1_200_000_000n)).toBe("1200");
    expect(contractRate(1_187_500_000n)).toBe("1187.5");
    expect(contractRate(1_000_001n)).toBe("1.000001");
  });
});

const PRODUCT: ServiceCatalogProduct = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  sku: "IP13-128-AZUL-USADO",
  name: "iPhone 13 128 GB Azul",
  description: null,
  unit: "unidad",
  brand: "Apple",
  category: "Celulares",
  condition: "used",
  tracking: "unit",
  modelId: "3f1c2b4a-8d6e-4f0a-9b7c-1e2d3c4b5a69",
  price: { amount: "420.00", currency: "USD" },
  stockStatus: "disponible",
} as unknown as ServiceCatalogProduct;

describe("toContractProductV3", () => {
  it("mapea el usado con su modelo, su variante y el convertido", () => {
    const body = toContractProductV3(
      PRODUCT,
      {
        model: {
          id: "3f1c2b4a-8d6e-4f0a-9b7c-1e2d3c4b5a69",
          name: "iPhone 13",
          brand: "Apple",
        },
        attributes: [{ key: "color", name: "Color", value: "Azul" }],
      },
      setup(),
    );
    expect(body).toMatchObject({
      condition: "used",
      tracking: "unit",
      model: { model_id: "3f1c2b4a-8d6e-4f0a-9b7c-1e2d3c4b5a69" },
      attributes: [{ key: "color", name: "Color", value: "Azul" }],
      price: { amount: "420.00", currency: "USD" },
      price_converted: { amount: "504000.00", currency: "ARS" },
    });
    expect(
      productResponseSchemaV3.safeParse({
        contract_version: "3",
        product: body,
      }).success,
    ).toBe(true);
  });

  it("sin la capacidad variants, sin modelo ni atributos", () => {
    const body = toContractProductV3(PRODUCT, null, null);
    expect(body.model).toBeNull();
    expect(body.attributes).toEqual([]);
    expect(body.price_converted).toBeNull();
  });

  it("el esquema es estricto: sin campos de más, ni el modelo de v2", () => {
    const valid = toContractProductV3(PRODUCT, null, setup());
    for (const invalid of [
      { ...valid, serial: "356789012345678" },
      { ...valid, cost: { amount: "300.00", currency: "USD" } },
      { ...valid, condition: "broken" },
      { ...valid, tracking: undefined },
    ]) {
      expect(
        productResponseSchemaV3.safeParse({
          contract_version: "3",
          product: invalid,
        }).success,
      ).toBe(false);
    }
  });
});

describe("las unidades (D-3)", () => {
  const unit = (
    id: string,
    price: { amount: string; currency: string } | null,
  ) =>
    toContractUnitV3(
      { id, grade: "A", batteryHealth: 87, price },
      { amount: "420.00", currency: "USD" },
      setup(),
    );

  it("la unidad sin precio propio lleva el del producto", () => {
    expect(unit("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", null)).toMatchObject({
      price: { amount: "420.00", currency: "USD" },
      price_converted: { amount: "504000.00" },
    });
  });

  it("ordena de menor a mayor precio, las de otra moneda después y sin precio al final", () => {
    const ids = [
      "00000000-0000-4000-8000-00000000000a",
      "00000000-0000-4000-8000-00000000000b",
      "00000000-0000-4000-8000-00000000000c",
      "00000000-0000-4000-8000-00000000000d",
    ];
    const units: ContractUnitV3[] = [
      unit(ids[0]!, { amount: "430.00", currency: "USD" }),
      { ...unit(ids[1]!, null), price: null, price_converted: null },
      unit(ids[2]!, { amount: "100000.00", currency: "ARS" }),
      unit(ids[3]!, { amount: "395.50", currency: "USD" }),
    ];
    expect(sortUnitsByPrice(units, "USD").map((u) => u.unit_id)).toEqual([
      ids[3],
      ids[0],
      ids[2],
      ids[1],
    ]);
  });

  it("el esquema no admite el IMEI ni el costo", () => {
    const valid = unit("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", null);
    const list = (item: unknown) => ({
      contract_version: "3",
      product_id: PRODUCT.id,
      items: [item],
    });
    expect(unitListResponseSchemaV3.safeParse(list(valid)).success).toBe(true);
    for (const invalid of [
      { ...valid, serial: "356789012345678" },
      { ...valid, cost: { amount: "300.00", currency: "USD" } },
      { ...valid, battery_health: 0 },
      { ...valid, battery_health: 101 },
    ]) {
      expect(unitListResponseSchemaV3.safeParse(list(invalid)).success).toBe(
        false,
      );
    }
  });
});

describe("las capacidades (D-5)", () => {
  it("devuelve las que recibe", () => {
    const body = toContractCapabilities(["variants", "serialized_units"]);
    expect(body).toStrictEqual({
      contract_version: "3",
      capabilities: ["variants", "serialized_units"],
    });
    expect(capabilityListResponseSchemaV3.safeParse(body).success).toBe(true);
  });
});

describe("fixtures del contrato v3", () => {
  const dir = path.join(process.cwd(), "tests/fixtures/read/v3");
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

  it("existen las cinco rutas", () => {
    const paths = files.map(
      (file) =>
        JSON.parse(readFileSync(path.join(dir, file), "utf8")).request
          .path as string,
    );
    expect(paths.some((p) => p.startsWith("/api/read/v3/products?"))).toBe(
      true,
    );
    expect(
      paths.some((p) => /^\/api\/read\/v3\/products\/[0-9a-f-]{36}$/.test(p)),
    ).toBe(true);
    expect(paths.some((p) => p.endsWith("/stock"))).toBe(true);
    expect(paths.some((p) => p.endsWith("/units"))).toBe(true);
    expect(paths).toContain("/api/read/v3/capabilities");
  });

  it.each(files)("%s declara su forma y pasa el validador", (file) => {
    const data = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const isCaptured = file.startsWith("captured-");
    expect(data.shape).toBe(isCaptured ? "captured" : "assumed");
    expect(data.note).toMatch(
      isCaptured ? /capturada del consumidor real/i : /forma asumida/i,
    );
    const requestPath = data.request.path as string;
    const { body } = data.response;
    const schema = requestPath.endsWith("/stock")
      ? productStockResponseSchemaV3
      : requestPath.endsWith("/units")
        ? unitListResponseSchemaV3
        : requestPath.endsWith("/capabilities")
          ? capabilityListResponseSchemaV3
          : "items" in body
            ? productListResponseSchemaV3
            : productResponseSchemaV3;
    const parsed = schema.safeParse(body);
    expect(parsed.success, parsed.error?.message).toBe(true);
  });
});
