"use client";

import Link from "next/link";
import { useState } from "react";
import {
  convertMoney,
  currencyDecimals,
  exchangeRateFromDatabase,
  formatMoney,
  moneyToDatabase,
  parseExchangeRateInput,
  parseMoneyInput,
} from "@/shared/money";
import {
  fieldErrorClass,
  inputClass,
  labelClass,
} from "@/app/_components/form-styles";
import { AmountReading } from "./money-fields";
import {
  NO_RATE_TEXT,
  STALE_RATE_TEXT,
  type ReceiptExchangeProps,
} from "./exchange";

// Los campos de un cobro en la otra moneda (ADR 0025, punto 5; brief-29.4, D-6). La moneda que entra
// se elige con enlaces, que el servidor resuelve; lo demás es del formulario: el monto en esa
// moneda, la cotización vigente o una acordada, y lo que se aplica. «Se aplican» lo calcula el
// navegador con la misma conversión que el servidor, solo para mostrar: el cobro lo vuelve a calcular
// con la cotización leída en su transacción.

// Lo que se aplicaría, formateado en la moneda del destino; null si todavía no se entiende.
export function appliedReading(input: {
  amount: string;
  tendered: string;
  target: string;
  mainCurrency: string;
  negotiated: string;
  currentRate: string | null;
}): string | null {
  const from = currencyDecimals(input.tendered);
  const to = currencyDecimals(input.target);
  if (!from.ok || !to.ok) return null;
  const amount = parseMoneyInput(input.amount, from.decimals);
  if (!amount.ok) return null;
  const typed = input.negotiated.trim();
  let rate: bigint;
  if (typed !== "") {
    const parsed = parseExchangeRateInput(typed);
    if (!parsed.ok) return null;
    rate = parsed.rate;
  } else if (input.currentRate !== null) {
    rate = exchangeRateFromDatabase(input.currentRate);
  } else {
    return null;
  }
  const applied = convertMoney({
    amount: amount.amount,
    rate,
    direction: input.tendered === input.mainCurrency ? "to_quote" : "to_base",
    targetDecimals: to.decimals,
  });
  return applied.ok
    ? formatMoney(moneyToDatabase(applied.amount), input.target)
    : null;
}

export function TenderCurrencyChoice({
  exchange,
}: {
  exchange: ReceiptExchangeProps;
}) {
  return (
    <nav aria-label="Moneda que entra" className="flex flex-col gap-1">
      <span className={labelClass}>Moneda que entra</span>
      <ul className="flex w-fit gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5">
        {exchange.choices.map((choice) => (
          <li key={choice.currency}>
            <Link
              href={choice.href}
              aria-current={choice.selected ? "true" : undefined}
              className={`block rounded-md px-4 py-2 font-mono text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                choice.selected
                  ? "bg-action text-on-action shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {choice.currency}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// El monto en la otra moneda, la cotización y lo que se aplica. Se vuelve a montar en cada rechazo,
// así que arranca de lo enviado.
export function TenderedAmountFields({
  exchange,
  target,
  defaultAmount,
  defaultRate,
  invalidAmount,
  invalidRate,
  errorId,
}: {
  exchange: ReceiptExchangeProps;
  target: string;
  defaultAmount: string;
  defaultRate: string;
  invalidAmount: boolean;
  invalidRate: boolean;
  errorId: string;
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [negotiated, setNegotiated] = useState(defaultRate);
  const { rate, tendered } = exchange;
  const applied = appliedReading({
    amount,
    tendered,
    target,
    mainCurrency: exchange.mainCurrency,
    negotiated,
    currentRate: rate?.value ?? null,
  });
  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="tenderedCurrency" value={tendered} />
      {rate ? (
        <input type="hidden" name="exchangeRateId" value={rate.id} />
      ) : null}
      <div className="flex flex-col gap-1 text-sm">
        {rate ? (
          <p>
            Cotización vigente:{" "}
            <span className="font-medium tabular-nums">{rate.label}</span>{" "}
            <span className="text-muted">({rate.recordedLabel})</span>
          </p>
        ) : (
          <p className={fieldErrorClass}>{NO_RATE_TEXT}</p>
        )}
        {rate?.stale ? (
          <p className="w-fit rounded-md bg-warning-soft px-2 py-1 text-on-warning-soft">
            {STALE_RATE_TEXT}
          </p>
        ) : null}
        {exchange.equivalence ? (
          <p className="tabular-nums">{exchange.equivalence}</p>
        ) : null}
      </div>

      <div className="flex max-w-xs flex-col gap-1">
        <label htmlFor="cobro-monto" className={labelClass}>
          Monto en <span className="font-mono">{tendered}</span> *
        </label>
        <input
          id="cobro-monto"
          name="amount"
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
          defaultValue={defaultAmount}
          onChange={(event) => setAmount(event.target.value)}
          aria-invalid={invalidAmount ? true : undefined}
          aria-describedby={
            invalidAmount
              ? `cobro-lectura cobro-aplicado ${errorId}`
              : "cobro-lectura cobro-aplicado"
          }
          className={`${inputClass} tabular-nums`}
        />
        <AmountReading id="cobro-lectura" amount={amount} currency={tendered} />
        <p
          id="cobro-aplicado"
          aria-live="polite"
          aria-atomic="true"
          className="min-h-5 text-sm tabular-nums text-muted"
        >
          {applied ? <>Se aplican: {applied}</> : null}
        </p>
      </div>

      <details open={defaultRate !== "" || invalidRate}>
        <summary className="cursor-pointer text-sm font-medium">
          Cotización acordada para este cobro
        </summary>
        <div className="mt-2 flex max-w-xs flex-col gap-1">
          <label htmlFor="cobro-cotizacion" className={labelClass}>
            1 {exchange.mainCurrency} ={" "}
            {tendered === exchange.mainCurrency ? target : tendered}
          </label>
          <input
            id="cobro-cotizacion"
            name="exchangeRate"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={defaultRate}
            onChange={(event) => setNegotiated(event.target.value)}
            aria-invalid={invalidRate ? true : undefined}
            aria-describedby={
              invalidRate
                ? `cobro-cotizacion-ayuda ${errorId}`
                : "cobro-cotizacion-ayuda"
            }
            className={`${inputClass} tabular-nums`}
          />
          <p id="cobro-cotizacion-ayuda" className="text-sm text-muted">
            Con coma decimal, por ejemplo 1.565,50. Solo vale para este cobro:
            no cambia la vigente.
          </p>
        </div>
      </details>
    </div>
  );
}
