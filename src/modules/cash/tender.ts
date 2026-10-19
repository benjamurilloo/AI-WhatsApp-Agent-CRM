import type { ExchangeSetup } from "@/modules/fx";
import type { Failure } from "@/shared/errors";
import {
  convertMoney,
  currencyDecimals,
  exchangeRateToDatabase,
  moneyToDatabase,
  parseExchangeRateInput,
  type ExchangeRate,
  type ExchangeRateRejection,
  type Money,
} from "@/shared/money";
import type { CurrencyAccount } from "./imputation";
import type { ReceiptTender } from "./repository";
import { parseCashAmount, type CashAmountRejection } from "./totals";

// Cobrar en otra moneda que el destino (ADR 0025, punto 5; brief-29.4, D-6). Un cobro guarda dos
// montos: lo aplicado, en la moneda de su venta, su pedido o la cuenta, que es lo que lee la
// imputación, y lo recibido, en la otra moneda de la organización, que es lo que cuenta la caja. Lo
// aplicado se calcula acá, una sola vez, al registrar, con la única conversión del CRM, y nunca se
// recalcula. Funciones puras: la cotización vigente la lee el servicio dentro de su transacción.

// Lo que agrega el formulario de un cobro. Vacío, o la moneda del destino, es el cobro de siempre.
export type TenderInput = {
  // La moneda que entra.
  tenderedCurrency?: string;
  // Una cotización acordada para este cobro, escrita como en la pantalla de la cotización. Vacía,
  // se usa la vigente.
  exchangeRate?: string;
  // La vigente que mostró el formulario: si cambió mientras tanto, el cobro se rechaza y el admin
  // vuelve a ver la equivalencia.
  exchangeRateId?: string;
};

export type ReceiptTenderRead = {
  currency: string;
  amount: Money;
  rate: ExchangeRate;
  // La fila de la vigente; null en una cotización acordada, que no pasa a ser la vigente.
  rateId: string | null;
};

export type TenderField = "tenderedCurrency" | "exchangeRate" | "amount";

export type TenderFailure =
  | Failure<
      "VALIDATION_ERROR",
      {
        fields: TenderField[];
        amount?: CashAmountRejection | "conversion";
        exchangeRate?: ExchangeRateRejection;
      }
    >
  | Failure<
      "BUSINESS_RULE_VIOLATION",
      { rule: "no_exchange_rate" | "exchange_rate_changed" }
    >;

// La moneda que entra, normalizada: la del destino si no se eligió otra.
export function tenderedCurrencyOf(
  input: TenderInput | undefined,
  targetCurrency: string,
): string {
  const text = (input?.tenderedCurrency ?? "").trim().toUpperCase();
  return text === "" ? targetCurrency : text;
}

// Solo entra la otra moneda de la organización contra un destino en la principal (ADR 0025, punto
// 5: «la del destino y la otra moneda de la organización»). Al revés, dólares contra una venta en
// pesos, el redondeo de lo recibido se multiplica por la cotización: lo que propone la pantalla
// excede lo que falta en más de un centavo y el tope lo rechaza (revisión independiente de la 29.4,
// R1-1). Un destino en la otra moneda se cobra en su moneda, como antes.
export function canConvert(
  setup: ExchangeSetup | null,
  from: string,
  to: string,
): setup is ExchangeSetup {
  if (!setup) return false;
  return from === setup.quoteCurrency && to === setup.mainCurrency;
}

function decimalsOf(currency: string): number {
  const found = currencyDecimals(currency);
  if (!found.ok) throw new Error(`moneda sin decimales conocidos: ${currency}`);
  return found.decimals;
}

// Convertir un monto entre las dos monedas de la organización, en la dirección que corresponda.
export function convertBetween(
  setup: ExchangeSetup,
  amount: Money,
  from: string,
  to: string,
  rate: ExchangeRate,
) {
  return convertMoney({
    amount,
    rate,
    direction: from === setup.mainCurrency ? "to_quote" : "to_base",
    targetDecimals: decimalsOf(to),
  });
}

// El monto escrito, en la moneda que entra, y lo aplicado en la del destino. Sin otra moneda, null:
// el servicio lee el monto como siempre.
export function readTender(
  setup: ExchangeSetup | null,
  input: TenderInput | undefined,
  amountText: string,
  targetCurrency: string,
):
  | { ok: true; tender: null }
  | { ok: true; applied: Money; tender: ReceiptTenderRead }
  | TenderFailure {
  const tendered = tenderedCurrencyOf(input, targetCurrency);
  if (tendered === targetCurrency) return { ok: true, tender: null };
  if (!canConvert(setup, tendered, targetCurrency)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["tenderedCurrency"],
    };
  }

  // Sin vigente, se rechaza aunque venga una acordada (ADR 0025, punto 5; brief-29.4, D-6; revisión
  // independiente de la 29.4, R1-2): la acordada ajusta la vigente para un cobro, no la reemplaza.
  const current = setup.current;
  if (!current) {
    return {
      ok: false,
      code: "BUSINESS_RULE_VIOLATION",
      rule: "no_exchange_rate",
    };
  }
  let rate: ExchangeRate;
  let rateId: string | null;
  const negotiated = (input?.exchangeRate ?? "").trim();
  if (negotiated !== "") {
    const parsed = parseExchangeRateInput(negotiated);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        fields: ["exchangeRate"],
        exchangeRate: parsed.reason,
      };
    }
    rate = parsed.rate;
    rateId = null;
  } else {
    const shown = (input?.exchangeRateId ?? "").trim().toLowerCase();
    if (shown !== "" && shown !== current.id) {
      return {
        ok: false,
        code: "BUSINESS_RULE_VIOLATION",
        rule: "exchange_rate_changed",
      };
    }
    rate = current.rate;
    rateId = current.id;
  }

  const parsed = parseCashAmount(amountText, tendered, { allowZero: false });
  if (!parsed.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["amount"],
      amount: parsed.reason,
    };
  }
  const applied = convertBetween(
    setup,
    parsed.amount,
    tendered,
    targetCurrency,
    rate,
  );
  if (!applied.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      fields: ["amount"],
      amount: "conversion",
    };
  }
  return {
    ok: true,
    applied: applied.amount,
    tender: { currency: tendered, amount: parsed.amount, rate, rateId },
  };
}

// La unidad mínima de una moneda, en centésimos: 1 con dos decimales, 100 sin decimales.
export function unitOf(currency: string): Money {
  return 10n ** BigInt(2 - decimalsOf(currency));
}

// El tope de lo que falta, medido con lo aplicado (ADR 0025, punto 5, R-M4). Si después de redondear
// lo aplicado excede lo que falta en exactamente una unidad mínima, se aplica lo que falta, y la
// diferencia de lo recibido queda en la caja como redondeo. Cualquier exceso mayor se rechaza. Solo
// con otra moneda: un cobro en la moneda del destino no redondea.
export function fitToOutstanding(
  applied: Money,
  outstanding: Money,
  currency: string,
  converted: boolean,
): { ok: true; applied: Money } | { ok: false } {
  if (applied <= outstanding) return { ok: true, applied };
  if (
    converted &&
    outstanding > 0n &&
    applied - outstanding === unitOf(currency)
  ) {
    return { ok: true, applied: outstanding };
  }
  return { ok: false };
}

// Las columnas del cobro, con la escala de la base.
export function tenderColumns(
  tender: ReceiptTenderRead | null,
): ReceiptTender | null {
  if (!tender) return null;
  return {
    currency: tender.currency,
    amount: moneyToDatabase(tender.amount),
    exchangeRate: exchangeRateToDatabase(tender.rate),
    exchangeRateId: tender.rateId,
  };
}

// Lo que entra o sale de la caja por un cobro: lo recibido si entró en otra moneda, y si no, lo
// aplicado (ADR 0025, punto 6; brief-29.4, D-7).
export function cashSideOf(row: {
  currency: string;
  amount: string;
  tenderedCurrency: string | null;
  tenderedAmount: string | null;
}): { currency: string; amount: string } {
  if (row.tenderedCurrency !== null && row.tenderedAmount !== null) {
    return { currency: row.tenderedCurrency, amount: row.tenderedAmount };
  }
  return { currency: row.currency, amount: row.amount };
}

// En qué monedas se aplica un cobro a cuenta de una organización con moneda principal (ADR 0025,
// punto 5, R-M2; brief-29.4, D-6, H-4): en la principal, o en una en la que el cliente tenga un saldo
// pendiente o a favor. Así, unos pesos recibidos a cuenta de un cliente que solo debe dólares se
// aplican en dólares, y no quedan como un saldo a favor en pesos que la imputación nunca cruza con la
// deuda. Una moneda vieja con saldo (una venta en euros) se sigue pudiendo cobrar en ella, como hoy.
export function accountReceiptCurrencies(
  setup: ExchangeSetup,
  accounts: CurrencyAccount[],
): string[] {
  const withBalance = accounts
    .filter(
      (row) =>
        row.inFavor > 0n || row.sales.some((sale) => sale.outstanding > 0n),
    )
    .map((row) => row.currency);
  return [...new Set([setup.mainCurrency, ...withBalance])];
}
