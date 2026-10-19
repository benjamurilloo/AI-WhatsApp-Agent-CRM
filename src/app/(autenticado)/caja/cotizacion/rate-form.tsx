"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { formatExchangeRate, parseExchangeRateInput } from "@/shared/money";
import {
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  radioClass,
} from "@/app/_components/form-styles";
import { recordExchangeRateAction } from "./actions";
import { largeChangeMessage, type RateFormState } from "./messages";

// La carga manual de una cotización (ADR 0025, punto 4; brief-29.4, D-4): el valor, con su lectura
// («Se lee: 1 USD = ARS 1.565,00»), y si se mueve más de un 10 % contra la vigente, una confirmación
// que no bloquea. Funciona sin JavaScript.

const initialState: RateFormState = { status: "idle" };

export function RateForm({
  mainCurrency,
  quoteCurrency,
}: {
  mainCurrency: string;
  quoteCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(
    recordExchangeRateAction,
    initialState,
  );
  const messageRef = useRef<HTMLParagraphElement>(null);
  const shown = state.status === "idle" ? { rate: "" } : state.values;
  const [rate, setRate] = useState(shown.rate);
  const parsed = parseExchangeRateInput(rate);
  const invalid = state.status === "error" && state.field === "rate";

  useEffect(() => {
    if (state.status !== "idle") messageRef.current?.focus();
  }, [state]);

  return (
    <form
      key={state.status === "idle" ? "nueva" : state.requestId}
      action={formAction}
      className="flex flex-col gap-4"
    >
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" ? (
          <p
            ref={messageRef}
            tabIndex={-1}
            id="cotizacion-error"
            className={formMessageClass}
          >
            {state.message}
          </p>
        ) : null}
        {state.status === "confirm" ? (
          <p
            ref={messageRef}
            tabIndex={-1}
            id="cotizacion-error"
            className={formMessageClass}
          >
            {largeChangeMessage(
              state.current,
              parsed.ok ? formatExchangeRate(parsed.rate) : state.values.rate,
            )}
          </p>
        ) : null}
      </div>

      <div className="flex max-w-xs flex-col gap-1">
        <label htmlFor="cotizacion-valor" className={labelClass}>
          1 {mainCurrency} = {quoteCurrency} *
        </label>
        <input
          id="cotizacion-valor"
          name="rate"
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
          defaultValue={shown.rate}
          onChange={(event) => setRate(event.target.value)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={
            invalid
              ? "cotizacion-lectura cotizacion-error"
              : "cotizacion-lectura"
          }
          className={`${inputClass} tabular-nums`}
        />
        <p
          id="cotizacion-lectura"
          aria-live="polite"
          aria-atomic="true"
          className="min-h-5 text-sm tabular-nums text-muted"
        >
          {parsed.ok ? (
            <>
              Se lee: 1 {mainCurrency} = {quoteCurrency}{" "}
              {formatExchangeRate(parsed.rate)}
            </>
          ) : (
            "Con coma decimal, por ejemplo 1.565,50."
          )}
        </p>
      </div>

      {state.status === "confirm" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="confirmLargeChange"
            value="si"
            required
            className={radioClass}
          />
          Confirmo la cotización nueva
        </label>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Cargando…" : "Cargar cotización"}
        </button>
      </div>
    </form>
  );
}
