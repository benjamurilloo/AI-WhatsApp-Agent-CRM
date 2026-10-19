import { describe, expect, it } from "vitest";
import type { ExchangeSetup } from "@/modules/fx";
import { exchangeRateFromDatabase } from "@/shared/money";
import {
  accountReceiptCurrencies,
  cashSideOf,
  fitToOutstanding,
  readTender,
  tenderColumns,
  tenderedCurrencyOf,
} from "./tender";
import type { CurrencyAccount } from "./imputation";

// Cobrar en otra moneda que el destino (ADR 0025, punto 5; brief-29.4, D-6 y D-13).

const RATE_ID = "00000000-0000-4000-8000-000000000001";

function setup(rate: string | null = "1565.000000"): ExchangeSetup {
  return {
    mainCurrency: "USD",
    quoteCurrency: "ARS",
    source: "manual",
    adjustment: 0n,
    current:
      rate === null
        ? null
        : {
            id: RATE_ID,
            baseCurrency: "USD",
            quoteCurrency: "ARS",
            rate: exchangeRateFromDatabase(rate),
            source: "manual",
            recordedBy: "00000000-0000-4000-8000-000000000002",
            recordedAt: new Date("2026-10-18T12:00:00Z"),
            asOf: new Date("2026-10-18T12:00:00Z"),
            reading: null,
            stale: false,
          },
  };
}

describe("tenderedCurrencyOf", () => {
  it("vacía es la del destino; si no, en mayúsculas", () => {
    expect(tenderedCurrencyOf(undefined, "USD")).toBe("USD");
    expect(tenderedCurrencyOf({ tenderedCurrency: " " }, "USD")).toBe("USD");
    expect(tenderedCurrencyOf({ tenderedCurrency: "ars" }, "USD")).toBe("ARS");
  });
});

describe("readTender", () => {
  it("en la moneda del destino no convierte nada", () => {
    expect(readTender(setup(), undefined, "100", "USD")).toEqual({
      ok: true,
      tender: null,
    });
  });

  it("pesos contra una venta en dólares: lo aplicado, con la vigente", () => {
    expect(
      readTender(setup(), { tenderedCurrency: "ARS" }, "156.500,00", "USD"),
    ).toEqual({
      ok: true,
      applied: 10_000n,
      tender: {
        currency: "ARS",
        amount: 15_650_000n,
        rate: exchangeRateFromDatabase("1565.000000"),
        rateId: RATE_ID,
      },
    });
  });

  // Revisión independiente de la 29.4, R1-1: al revés, lo que propondría la pantalla excede lo que
  // falta en más de un centavo (63,90 x 1.565 = 100.003,50 contra 100.000,00). Se cobra en pesos.
  it("dólares contra una venta en pesos: no se convierte", () => {
    expect(
      readTender(setup(), { tenderedCurrency: "USD" }, "63,90", "ARS"),
    ).toMatchObject({ ok: false, fields: ["tenderedCurrency"] });
  });

  it("una cotización acordada no apunta a la vigente", () => {
    expect(
      readTender(
        setup(),
        { tenderedCurrency: "ARS", exchangeRate: "1.600" },
        "160000",
        "USD",
      ),
    ).toMatchObject({
      ok: true,
      applied: 10_000n,
      tender: { rateId: null, rate: exchangeRateFromDatabase("1600.000000") },
    });
  });

  // Revisión independiente de la 29.4, R1-2: la acordada no reemplaza a la vigente (D-6).
  it("sin vigente se rechaza aunque venga una acordada", () => {
    expect(
      readTender(
        setup(null),
        { tenderedCurrency: "ARS", exchangeRate: "1.600" },
        "160000",
        "USD",
      ),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "no_exchange_rate",
    });
  });

  it("rechaza sin vigente, con la vigente cambiada y fuera del par", () => {
    expect(
      readTender(setup(null), { tenderedCurrency: "ARS" }, "100", "USD"),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "no_exchange_rate",
    });
    expect(
      readTender(
        setup(),
        {
          tenderedCurrency: "ARS",
          exchangeRateId: "00000000-0000-4000-8000-000000000009",
        },
        "100",
        "USD",
      ),
    ).toEqual({
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "exchange_rate_changed",
    });
    expect(
      readTender(setup(), { tenderedCurrency: "EUR" }, "100", "USD"),
    ).toMatchObject({ ok: false, fields: ["tenderedCurrency"] });
    expect(
      readTender(null, { tenderedCurrency: "ARS" }, "100", "USD"),
    ).toMatchObject({ ok: false, fields: ["tenderedCurrency"] });
  });

  it("rechaza una cotización acordada mal escrita y una conversión que da cero", () => {
    expect(
      readTender(
        setup(),
        { tenderedCurrency: "ARS", exchangeRate: "1565.5" },
        "100",
        "USD",
      ),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["exchangeRate"],
      exchangeRate: "invalid",
    });
    expect(
      readTender(setup(), { tenderedCurrency: "ARS" }, "0,01", "USD"),
    ).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["amount"],
      amount: "conversion",
    });
  });
});

describe("fitToOutstanding (ADR 0025, punto 5, R-M4)", () => {
  it("aplica lo que falta si lo aplicado lo excede en exactamente un centavo, solo con otra moneda", () => {
    expect(fitToOutstanding(10_001n, 10_000n, "USD", true)).toEqual({
      ok: true,
      applied: 10_000n,
    });
    expect(fitToOutstanding(10_001n, 10_000n, "USD", false)).toEqual({
      ok: false,
    });
    expect(fitToOutstanding(10_002n, 10_000n, "USD", true)).toEqual({
      ok: false,
    });
    expect(fitToOutstanding(9_000n, 10_000n, "USD", true)).toEqual({
      ok: true,
      applied: 9_000n,
    });
    expect(fitToOutstanding(1n, 0n, "USD", true)).toEqual({ ok: false });
  });

  it("en una moneda sin decimales, la unidad mínima es una unidad entera", () => {
    expect(fitToOutstanding(10_100n, 10_000n, "CLP", true)).toEqual({
      ok: true,
      applied: 10_000n,
    });
  });
});

describe("accountReceiptCurrencies (ADR 0025, punto 5, R-M2)", () => {
  const account = (
    currency: string,
    outstanding: bigint,
    inFavor: bigint,
  ): CurrencyAccount =>
    ({
      currency,
      debit: 0n,
      credit: 0n,
      balance: 0n,
      retained: 0n,
      inFavor,
      sales: [{ outstanding }],
    }) as unknown as CurrencyAccount;

  it("la principal, y las monedas con saldo pendiente o a favor", () => {
    expect(
      accountReceiptCurrencies(setup(), [
        account("ARS", 0n, 0n),
        account("EUR", 500n, 0n),
      ]),
    ).toEqual(["USD", "EUR"]);
    expect(
      accountReceiptCurrencies(setup(), [account("ARS", 0n, 100n)]),
    ).toEqual(["USD", "ARS"]);
  });
});

describe("las columnas y la caja", () => {
  it("tenderColumns escribe la escala de la base", () => {
    expect(
      tenderColumns({
        currency: "ARS",
        amount: 15_650_000n,
        rate: exchangeRateFromDatabase("1565.000000"),
        rateId: null,
      }),
    ).toEqual({
      currency: "ARS",
      amount: "156500.00",
      exchangeRate: "1565.000000",
      exchangeRateId: null,
    });
    expect(tenderColumns(null)).toBeNull();
  });

  it("cashSideOf cuenta lo recibido si lo hubo", () => {
    expect(
      cashSideOf({
        currency: "USD",
        amount: "100.00",
        tenderedCurrency: "ARS",
        tenderedAmount: "156500.00",
      }),
    ).toEqual({ currency: "ARS", amount: "156500.00" });
    expect(
      cashSideOf({
        currency: "USD",
        amount: "100.00",
        tenderedCurrency: null,
        tenderedAmount: null,
      }),
    ).toEqual({ currency: "USD", amount: "100.00" });
  });
});
