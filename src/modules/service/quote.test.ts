import { describe, expect, it } from "vitest";
import {
  canTransition,
  evaluateQuote,
  parseQuoteInput,
  SERVICE_ORDER_TRANSITIONS,
  type QuoteType,
  type ServiceOrderStatus,
} from "./quote";

// Las reglas puras de la orden de servicio (brief-29.6, D-4 y D-13): las transiciones y el armado del
// presupuesto. La base fija las mismas transiciones con su trigger; lo prueba service-orders.test.ts.

const TYPE_A = "00000000-0000-4000-8000-00000000000a";
const TYPE_B = "00000000-0000-4000-8000-00000000000b";

describe("las transiciones", () => {
  it("son exactamente las de D-4", () => {
    const pairs = Object.entries(SERVICE_ORDER_TRANSITIONS).flatMap(
      ([from, targets]) => targets.map((to) => `${from}->${to}`),
    );
    expect(pairs.sort()).toEqual(
      [
        "received->sent",
        "sent->quoted",
        "quoted->approved",
        "quoted->rejected",
        "approved->repaired",
        "repaired->delivered",
        "rejected->delivered",
        "received->cancelled",
        "sent->cancelled",
        "quoted->cancelled",
        "approved->cancelled",
      ].sort(),
    );
  });

  it.each<[ServiceOrderStatus, ServiceOrderStatus]>([
    ["repaired", "cancelled"],
    ["delivered", "cancelled"],
    ["received", "quoted"],
    ["approved", "delivered"],
    ["rejected", "repaired"],
    ["cancelled", "received"],
  ])("rechaza %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe("parseQuoteInput", () => {
  it("lee los montos con los decimales de cada moneda", () => {
    expect(
      parseQuoteInput(
        {
          customerCurrency: "ARS",
          technicianCurrency: "USD",
          lines: [
            { repairTypeId: TYPE_A, price: "180.000,50", cost: "35,5" },
            { repairTypeId: TYPE_B.toUpperCase(), price: "1000", cost: "70" },
          ],
        },
        20,
      ),
    ).toEqual({
      ok: true,
      customerCurrency: "ARS",
      technicianCurrency: "USD",
      lines: [
        { position: 1, repairTypeId: TYPE_A, price: 18000050n, cost: 3550n },
        { position: 2, repairTypeId: TYPE_B, price: 100000n, cost: 7000n },
      ],
    });
  });

  it("rechaza las monedas, la lista vacía, el exceso de líneas y cada línea que no se lee", () => {
    const line = { repairTypeId: TYPE_A, price: "10", cost: "5" };
    expect(
      parseQuoteInput(
        { customerCurrency: "XYZ", technicianCurrency: "USD", lines: [line] },
        20,
      ),
    ).toMatchObject({ ok: false, reason: "customer_currency" });
    expect(
      parseQuoteInput(
        { customerCurrency: "USD", technicianCurrency: "", lines: [line] },
        20,
      ),
    ).toMatchObject({ ok: false, reason: "technician_currency" });
    expect(
      parseQuoteInput(
        { customerCurrency: "USD", technicianCurrency: "USD", lines: [] },
        20,
      ),
    ).toMatchObject({ ok: false, reason: "no_lines" });
    expect(
      parseQuoteInput(
        {
          customerCurrency: "USD",
          technicianCurrency: "USD",
          lines: [line, { ...line, repairTypeId: TYPE_B }],
        },
        1,
      ),
    ).toMatchObject({ ok: false, reason: "too_many_lines" });
    expect(
      parseQuoteInput(
        {
          customerCurrency: "USD",
          technicianCurrency: "USD",
          lines: [
            line,
            { ...line },
            { repairTypeId: "x", price: "1", cost: "1" },
            { repairTypeId: TYPE_B, price: "0", cost: "1" },
          ],
        },
        20,
      ),
    ).toEqual({
      ok: false,
      reason: "lines",
      lines: [
        { position: 2, field: "repairType" },
        { position: 3, field: "repairType" },
        { position: 4, field: "price", reason: "zero" },
      ],
    });
  });
});

describe("evaluateQuote", () => {
  const parsed = (customer = "USD", technician = "USD") => {
    const result = parseQuoteInput(
      {
        customerCurrency: customer,
        technicianCurrency: technician,
        lines: [
          { repairTypeId: TYPE_A, price: "80", cost: "35" },
          { repairTypeId: TYPE_B, price: "200", cost: "120" },
        ],
      },
      20,
    );
    if (!result.ok) throw new Error("no se leyó");
    return result;
  };
  const types = (b: Partial<QuoteType> = {}) =>
    new Map<string, QuoteType>([
      [
        TYPE_A,
        {
          isActive: true,
          listPrice: { priceCurrency: "USD", costCurrency: "USD" },
        },
      ],
      [TYPE_B, { isActive: true, listPrice: null, ...b }],
    ]);

  it("suma cada lado; un tipo sin precio en la lista se carga a mano", () => {
    expect(evaluateQuote(parsed(), types())).toEqual({
      ok: true,
      lines: parsed().lines,
      customerTotal: 28000n,
      technicianTotal: 15500n,
    });
  });

  it("rechaza las monedas de la lista que no son las del presupuesto, y los tipos que no sirven", () => {
    expect(evaluateQuote(parsed("ARS"), types())).toEqual({
      ok: false,
      reason: "line_rules",
      lines: [
        { position: 1, repairTypeId: TYPE_A, rule: "price_currency_mismatch" },
      ],
    });
    expect(
      evaluateQuote(
        parsed("USD"),
        types({ listPrice: { priceCurrency: "USD", costCurrency: "ARS" } }),
      ),
    ).toMatchObject({
      ok: false,
      lines: [{ position: 2, rule: "cost_currency_mismatch" }],
    });
    expect(evaluateQuote(parsed(), types({ isActive: false }))).toMatchObject({
      ok: false,
      lines: [{ position: 2, rule: "inactive_type" }],
    });
    expect(
      evaluateQuote(parsed(), new Map([[TYPE_A, types().get(TYPE_A)!]])),
    ).toMatchObject({
      ok: false,
      lines: [{ position: 2, rule: "missing_type" }],
    });
  });

  it("rechaza un total que no cabe", () => {
    const result = parseQuoteInput(
      {
        customerCurrency: "USD",
        technicianCurrency: "USD",
        lines: [
          { repairTypeId: TYPE_A, price: "999999999999", cost: "1" },
          { repairTypeId: TYPE_B, price: "999999999999", cost: "1" },
        ],
      },
      20,
    );
    if (!result.ok) throw new Error("no se leyó");
    expect(evaluateQuote(result, types())).toEqual({
      ok: false,
      reason: "total_too_large",
    });
  });
});
