import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ExchangeSetup } from "@/modules/fx";
import type { ServiceCatalogProduct } from "@/modules/inventory";
import {
  appointmentSlotsResponseSchemaV3,
  capabilityListResponseSchemaV3,
  contractRate,
  convertPrice,
  productListResponseSchemaV3,
  productResponseSchemaV3,
  productStockResponseSchemaV3,
  repairListResponseSchemaV3,
  serviceOrderListResponseSchemaV3,
  sortUnitsByPrice,
  toContractAppointmentSlotsV3,
  toContractCapabilities,
  toContractProductV3,
  toContractRepairListV3,
  toContractServiceOrderListV3,
  toContractTradeInChecklistV3,
  toContractTradeInQuoteV3,
  toContractUnitV3,
  tradeInChecklistResponseSchemaV3,
  tradeInQuoteResponseSchemaV3,
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

const MODEL = {
  id: "3f1c2b4a-8d6e-4f0a-9b7c-1e2d3c4b5a69",
  name: "iPhone 11",
  brand: "Apple",
};

describe("las reparaciones (brief-29.8.2, D-2)", () => {
  it("el precio al cliente con el convertido, y el esquema no admite un costo", () => {
    const body = toContractRepairListV3(
      [
        {
          model: MODEL,
          repairs: [
            {
              repairTypeId: "5f0c9a8e-3b1d-4c2a-9e7f-1a2b3c4d5e6f",
              name: "Cambio de batería",
              price: { amount: "45.00", currency: "USD" },
            },
          ],
        },
      ],
      setup(),
    );
    expect(body).toStrictEqual({
      contract_version: "3",
      items: [
        {
          model: { model_id: MODEL.id, name: "iPhone 11", brand: "Apple" },
          repairs: [
            {
              repair_type_id: "5f0c9a8e-3b1d-4c2a-9e7f-1a2b3c4d5e6f",
              name: "Cambio de batería",
              price: { amount: "45.00", currency: "USD" },
              price_converted: {
                amount: "54000.00",
                currency: "ARS",
                rate: "1200",
                rate_as_of: AS_OF.toISOString(),
              },
            },
          ],
        },
      ],
    });
    expect(repairListResponseSchemaV3.safeParse(body).success).toBe(true);
    const repair = body.items[0]!.repairs[0]!;
    for (const invalid of [
      { ...repair, cost: { amount: "20.00", currency: "USD" } },
      { ...repair, price: null },
    ]) {
      expect(
        repairListResponseSchemaV3.safeParse({
          ...body,
          items: [{ ...body.items[0], repairs: [invalid] }],
        }).success,
      ).toBe(false);
    }
    // Un modelo sin reparaciones no se publica.
    expect(
      repairListResponseSchemaV3.safeParse({
        ...body,
        items: [{ ...body.items[0], repairs: [] }],
      }).success,
    ).toBe(false);
  });
});

describe("las órdenes de servicio (brief-29.8.2, D-4)", () => {
  const order = {
    number: 123,
    model: MODEL,
    status: "quoted" as const,
    statusAt: new Date("2026-10-22T15:00:00.000Z"),
    receivedAt: new Date("2026-10-20T13:10:00.000Z"),
    quote: {
      total: { amount: "120.00", currency: "USD" },
      repairs: [
        {
          name: "Cambio de pantalla",
          price: { amount: "120.00", currency: "USD" },
        },
      ],
    },
  };

  it("el número del comprobante, las fechas y el presupuesto sin convertir", () => {
    const body = toContractServiceOrderListV3(
      [order, { ...order, number: 7, status: "received", quote: null }],
      (number) => `OS-${String(number).padStart(6, "0")}`,
    );
    expect(body.items[0]).toStrictEqual({
      number: "OS-000123",
      model: { model_id: MODEL.id, name: "iPhone 11", brand: "Apple" },
      status: "quoted",
      status_at: "2026-10-22T15:00:00.000Z",
      received_at: "2026-10-20T13:10:00.000Z",
      quote: {
        total: { amount: "120.00", currency: "USD" },
        repairs: [
          {
            name: "Cambio de pantalla",
            price: { amount: "120.00", currency: "USD" },
          },
        ],
      },
    });
    expect(body.items[1]).toMatchObject({ number: "OS-000007", quote: null });
    expect(serviceOrderListResponseSchemaV3.safeParse(body).success).toBe(true);
  });

  it("el esquema no admite el IMEI, lo reportado, el técnico, un costo ni un estado desconocido", () => {
    const valid = toContractServiceOrderListV3([order], () => "OS-000123")
      .items[0]!;
    for (const invalid of [
      { ...valid, device_serial: "356789012345678" },
      { ...valid, reported_issue: "No carga" },
      { ...valid, technician: "Técnico" },
      { ...valid, quote: { ...valid.quote, technician_total: "50.00" } },
      { ...valid, status: "lost" },
      { ...valid, number: "123" },
      { ...valid, quote: { ...valid.quote, price_converted: null } },
    ]) {
      expect(
        serviceOrderListResponseSchemaV3.safeParse({
          contract_version: "3",
          items: [invalid],
        }).success,
      ).toBe(false);
    }
  });
});

describe("el checklist de un usado (brief-29.8.3, D-2)", () => {
  it("los puntos con su id, su nombre y si son obligatorios, sin la reparación", () => {
    const body = toContractTradeInChecklistV3([
      {
        id: "7b2e1c4d-5f6a-4b7c-8d9e-0f1a2b3c4d5e",
        name: "Face ID funciona",
        isMandatory: true,
      },
    ]);
    expect(body).toStrictEqual({
      contract_version: "3",
      items: [
        {
          item_id: "7b2e1c4d-5f6a-4b7c-8d9e-0f1a2b3c4d5e",
          name: "Face ID funciona",
          mandatory: true,
        },
      ],
    });
    expect(tradeInChecklistResponseSchemaV3.safeParse(body).success).toBe(true);
    expect(
      tradeInChecklistResponseSchemaV3.safeParse({
        ...body,
        items: [{ ...body.items[0], repair_type_id: body.items[0]!.item_id }],
      }).success,
    ).toBe(false);
  });
});

describe("la cotización de un usado (brief-29.8.3, D-3, U-4 y U-5)", () => {
  const quote = {
    ok: true as const,
    quote: {
      product: {
        id: "9d4a3e6f-7b8c-4d9e-8f01-2b3c4d5e6f70",
        name: "iPhone 13 128 GB Usado",
      },
      currency: "USD",
      low: "330.00",
      high: "370.00",
      repairs: ["Cambio de pantalla", "Cambio de batería"],
    },
  };

  it("el rango redondeado con el convertido y los nombres de las reparaciones", () => {
    const body = toContractTradeInQuoteV3(quote, setup());
    expect(body).toStrictEqual({
      contract_version: "3",
      quote: {
        product: {
          product_id: "9d4a3e6f-7b8c-4d9e-8f01-2b3c4d5e6f70",
          name: "iPhone 13 128 GB Usado",
        },
        estimate: true,
        range: { low: "330.00", high: "370.00", currency: "USD" },
        range_converted: {
          low: "396000.00",
          high: "444000.00",
          currency: "ARS",
          rate: "1200",
          rate_as_of: AS_OF.toISOString(),
        },
        repairs: ["Cambio de pantalla", "Cambio de batería"],
      },
      reason: null,
    });
    expect(tradeInQuoteResponseSchemaV3.safeParse(body).success).toBe(true);
  });

  it("un piso en cero es cero en las dos monedas", () => {
    const body = toContractTradeInQuoteV3(
      { ok: true, quote: { ...quote.quote, low: "0.00", high: "10.00" } },
      setup(),
    );
    expect(body.quote?.range).toStrictEqual({
      low: "0.00",
      high: "10.00",
      currency: "USD",
    });
    expect(body.quote?.range_converted).toMatchObject({
      low: "0.00",
      high: "12000.00",
    });
  });

  it.each([
    ["sin cotización vigente", setup({ current: false })],
    ["con la vigente vencida", setup({ stale: true })],
    ["sin configuración", null],
    ["con una moneda fuera del par", setup({ main: "EUR", quote: "ARS" })],
  ])("el convertido va null %s", (_case, exchange) => {
    expect(
      toContractTradeInQuoteV3(quote, exchange).quote?.range_converted,
    ).toBeNull();
  });

  it("cada motivo fino pasa a uno de los tres del contrato", () => {
    const reason = (result: Parameters<typeof toContractTradeInQuoteV3>[0]) =>
      toContractTradeInQuoteV3(result, setup()).reason;
    expect(
      reason({
        ok: false,
        code: "CHECKLIST_INCOMPLETE",
        itemIds: ["7b2e1c4d-5f6a-4b7c-8d9e-0f1a2b3c4d5e"],
      }),
    ).toStrictEqual({
      code: "checklist_incomplete",
      item_ids: ["7b2e1c4d-5f6a-4b7c-8d9e-0f1a2b3c4d5e"],
    });
    expect(
      reason({ ok: false, code: "NOT_ACCEPTED", items: ["Face ID funciona"] }),
    ).toStrictEqual({ code: "not_accepted", items: ["Face ID funciona"] });
    for (const rule of [
      "product_not_quotable",
      "no_settings",
      "example_values",
      "no_capability",
      "no_reference_price",
      "no_margin",
      "no_battery_repair_type",
      "no_repair_cost",
      "currency_mismatch",
      "not_positive",
    ] as const) {
      const body = toContractTradeInQuoteV3(
        { ok: false, code: "UNAVAILABLE", rule },
        setup(),
      );
      expect(body).toStrictEqual({
        contract_version: "3",
        quote: null,
        reason: { code: "not_quotable" },
      });
      expect(tradeInQuoteResponseSchemaV3.safeParse(body).success).toBe(true);
    }
  });

  it("el esquema no admite el valor exacto, el margen, un costo, el paso ni un motivo fino", () => {
    const valid = toContractTradeInQuoteV3(quote, setup());
    const inner = valid.quote!;
    for (const invalid of [
      { ...valid, quote: { ...inner, value: "372.50" } },
      { ...valid, quote: { ...inner, margin: "100.00" } },
      { ...valid, quote: { ...inner, reference: "520.00" } },
      {
        ...valid,
        quote: { ...inner, repairs: [{ name: "x", cost: "40.00" }] },
      },
      { ...valid, quote: { ...inner, rounding_step: "10.00" } },
      { ...valid, quote: { ...inner, estimate: false } },
      { ...valid, quote: null, reason: { code: "no_margin" } },
      { ...valid, quote: null, reason: null },
      { ...valid, reason: { code: "not_quotable" } },
    ]) {
      expect(tradeInQuoteResponseSchemaV3.safeParse(invalid).success).toBe(
        false,
      );
    }
  });
});

describe("las franjas libres (brief-29.10.2, D-2 y A-1)", () => {
  const slots = {
    today: "2026-10-27",
    slotMinutes: 30,
    reasons: [
      {
        id: "3c5e7a9b-1d2f-4a6b-8c0d-2e4f6a8b0c1d",
        name: "Ver o comprar un equipo",
      },
    ],
    days: [
      {
        date: "2026-10-29",
        slots: [
          {
            startsAt: "2026-10-29T15:00:00-03:00",
            endsAt: "2026-10-29T15:30:00-03:00",
          },
        ],
      },
    ],
  };

  it("la fecha de hoy, la duración, los motivos y las franjas con su desplazamiento", () => {
    const body = toContractAppointmentSlotsV3(slots);
    expect(body).toStrictEqual({
      contract_version: "3",
      today: "2026-10-27",
      slot_minutes: 30,
      reasons: [
        {
          reason_id: "3c5e7a9b-1d2f-4a6b-8c0d-2e4f6a8b0c1d",
          name: "Ver o comprar un equipo",
        },
      ],
      days: [
        {
          date: "2026-10-29",
          slots: [
            {
              starts_at: "2026-10-29T15:00:00-03:00",
              ends_at: "2026-10-29T15:30:00-03:00",
            },
          ],
        },
      ],
    });
    expect(appointmentSlotsResponseSchemaV3.safeParse(body).success).toBe(true);
  });

  it("sin la capacidad: today siempre, y nada más", () => {
    const body = toContractAppointmentSlotsV3({
      today: "2026-10-27",
      slotMinutes: null,
      reasons: [],
      days: [],
    });
    expect(body).toStrictEqual({
      contract_version: "3",
      today: "2026-10-27",
      slot_minutes: null,
      reasons: [],
      days: [],
    });
    expect(appointmentSlotsResponseSchemaV3.safeParse(body).success).toBe(true);
  });

  it("el esquema no admite ocupación, cupo, turnos, un día vacío ni un instante sin desplazamiento", () => {
    const valid = toContractAppointmentSlotsV3(slots);
    const day = valid.days[0]!;
    const slot = day.slots[0]!;
    for (const invalid of [
      { ...valid, capacity: 1 },
      { ...valid, today: undefined },
      { ...valid, days: [{ ...day, slots: [] }] },
      { ...valid, days: [{ ...day, slots: [{ ...slot, occupied: 0 }] }] },
      { ...valid, days: [{ ...day, appointments: [] }] },
      {
        ...valid,
        days: [
          { ...day, slots: [{ ...slot, starts_at: "2026-10-29T15:00:00" }] },
        ],
      },
    ]) {
      expect(appointmentSlotsResponseSchemaV3.safeParse(invalid).success).toBe(
        false,
      );
    }
  });
});

describe("fixtures del contrato v3", () => {
  const dir = path.join(process.cwd(), "tests/fixtures/read/v3");
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));

  it("existen las diez rutas", () => {
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
    expect(paths.some((p) => p.startsWith("/api/read/v3/repairs?"))).toBe(true);
    expect(
      paths.some((p) => p.startsWith("/api/read/v3/service-orders?")),
    ).toBe(true);
    expect(paths).toContain("/api/read/v3/trade-in-checklist");
    expect(
      paths.some((p) => p.startsWith("/api/read/v3/trade-in-quote?")),
    ).toBe(true);
    expect(
      paths.some((p) => p.startsWith("/api/read/v3/appointment-slots?")),
    ).toBe(true);
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
          : requestPath.startsWith("/api/read/v3/repairs?")
            ? repairListResponseSchemaV3
            : requestPath.startsWith("/api/read/v3/service-orders?")
              ? serviceOrderListResponseSchemaV3
              : requestPath === "/api/read/v3/trade-in-checklist"
                ? tradeInChecklistResponseSchemaV3
                : requestPath.startsWith("/api/read/v3/trade-in-quote?")
                  ? tradeInQuoteResponseSchemaV3
                  : requestPath.startsWith("/api/read/v3/appointment-slots?")
                    ? appointmentSlotsResponseSchemaV3
                    : "items" in body
                      ? productListResponseSchemaV3
                      : productResponseSchemaV3;
    const parsed = schema.safeParse(body);
    expect(parsed.success, parsed.error?.message).toBe(true);
  });
});
