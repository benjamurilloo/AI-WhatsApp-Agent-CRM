import { describe, expect, it } from "vitest";
import {
  canTransition,
  evaluateQuote,
  evaluateRepairCosts,
  OWN_UNIT_TRANSITIONS,
  parseQuoteInput,
  parseRepairCostInput,
  SERVICE_ORDER_TRANSITIONS,
  type QuoteType,
  type ServiceOrderStatus,
} from "./quote";

// Las reglas puras de la orden de servicio (brief-29.6, D-4 y D-13): las transiciones y el armado del
// presupuesto. La base fija las mismas transiciones con su trigger; lo prueba service-orders.test.ts.
// Desde la 29.6.2, las de la orden de una unidad propia y sus líneas solo con costo (brief-29.6.2,
// D-3 y D-10), que prueba contra la base service-own-units.test.ts.

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

describe("la orden de una unidad propia", () => {
  it("pasa de mandada a reparada o cancelada, y nada más", () => {
    const pairs = Object.entries(OWN_UNIT_TRANSITIONS).flatMap(
      ([from, targets]) => targets.map((to) => `${from}->${to}`),
    );
    expect(pairs.sort()).toEqual(["sent->cancelled", "sent->repaired"]);
    expect(canTransition("sent", "repaired", "own_unit")).toBe(true);
    // La misma transición no existe en la orden de un cliente, que pasa por el presupuesto.
    expect(canTransition("sent", "repaired")).toBe(false);
    expect(canTransition("sent", "quoted", "own_unit")).toBe(false);
    expect(canTransition("repaired", "delivered", "own_unit")).toBe(false);
  });

  it("lee el costo de cada línea con los decimales de la moneda de la unidad", () => {
    expect(
      parseRepairCostInput(
        [
          { repairTypeId: TYPE_A, cost: "35,5" },
          { repairTypeId: TYPE_B.toUpperCase(), cost: "40000" },
        ],
        "USD",
        20,
      ),
    ).toEqual({
      ok: true,
      lines: [
        { position: 1, repairTypeId: TYPE_A, cost: 3550n },
        { position: 2, repairTypeId: TYPE_B, cost: 4000000n },
      ],
    });
  });

  it("rechaza la moneda, la lista vacía, el exceso, un tipo repetido y un costo que no se lee", () => {
    const line = { repairTypeId: TYPE_A, cost: "10" };
    expect(parseRepairCostInput([line], "XXX", 20)).toMatchObject({
      ok: false,
      reason: "currency",
    });
    expect(parseRepairCostInput([], "USD", 20)).toMatchObject({
      ok: false,
      reason: "no_lines",
    });
    expect(parseRepairCostInput([line, line], "USD", 1)).toMatchObject({
      ok: false,
      reason: "too_many_lines",
    });
    expect(
      parseRepairCostInput(
        [line, line, { repairTypeId: TYPE_B, cost: "0" }],
        "USD",
        20,
      ),
    ).toEqual({
      ok: false,
      reason: "lines",
      lines: [
        { position: 2, field: "repairType" },
        { position: 3, field: "cost", reason: "zero" },
      ],
    });
  });

  it("exige tipos que existan y estén activos, y un total que quepa", () => {
    const lines = [
      { position: 1, repairTypeId: TYPE_A, cost: 3500n },
      { position: 2, repairTypeId: TYPE_B, cost: 1000n },
    ];
    expect(
      evaluateRepairCosts(
        lines,
        new Map([
          [TYPE_A, { isActive: true }],
          [TYPE_B, { isActive: true }],
        ]),
      ),
    ).toEqual({ ok: true, lines, total: 4500n });
    expect(
      evaluateRepairCosts(lines, new Map([[TYPE_A, { isActive: false }]])),
    ).toEqual({
      ok: false,
      reason: "line_rules",
      lines: [
        { position: 1, repairTypeId: TYPE_A, rule: "inactive_type" },
        { position: 2, repairTypeId: TYPE_B, rule: "missing_type" },
      ],
    });
    expect(
      evaluateRepairCosts(
        [
          { position: 1, repairTypeId: TYPE_A, cost: 99_999_999_999_999n },
          { position: 2, repairTypeId: TYPE_B, cost: 1n },
        ],
        new Map([
          [TYPE_A, { isActive: true }],
          [TYPE_B, { isActive: true }],
        ]),
      ),
    ).toEqual({ ok: false, reason: "total_too_large" });
  });
});
