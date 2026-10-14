"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { CashMovementKind, CashMovementReason } from "@/modules/cash";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  radioClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { recordCashMovementAction } from "../actions";
import {
  KIND_LABEL,
  REASON_LABEL,
  type MovementFormState,
  type MovementFormValues,
} from "../messages";
import { AmountReading, CurrencySelect } from "../money-fields";

// Un aporte o un retiro en la sesión abierta (brief-21.2, D-5 y D-10): moneda, monto y un motivo
// de la lista cerrada del tipo, como grupo de opciones obligatorio. Funciona sin JavaScript. La
// moneda se elige de la lista del sistema y el monto muestra cómo se lee (recorrido de la 21.2).

const initialState: MovementFormState = { status: "idle" };

export function MovementForm({
  sessionId,
  kind,
  reasons,
  currencies,
  defaultCurrency,
}: {
  sessionId: string;
  kind: CashMovementKind;
  reasons: readonly CashMovementReason[];
  currencies: string[];
  defaultCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(
    recordCashMovementAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const values: MovementFormValues = failed
    ? state.values
    : { currency: defaultCurrency, amount: "", reason: "" };
  const invalid = (field: "currency" | "amount" | "reason") =>
    failed && state.fields.includes(field);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form
      key={failed ? state.requestId : "nuevo"}
      action={formAction}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="kind" value={kind} />
      <div aria-live="polite" aria-atomic="true">
        {failed ? (
          <p
            ref={errorRef}
            tabIndex={-1}
            id="movimiento-error"
            className={formMessageClass}
          >
            {state.message}
          </p>
        ) : null}
      </div>

      <MoneyFields
        currencies={currencies}
        values={values}
        currencyInvalid={invalid("currency")}
        amountInvalid={invalid("amount")}
      />

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={invalid("reason") ? "movimiento-error" : undefined}
      >
        <legend className={`${labelClass} mb-1`}>Motivo *</legend>
        {reasons.map((reason) => (
          <label key={reason} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="reason"
              value={reason}
              required
              defaultChecked={values.reason === reason}
              aria-invalid={invalid("reason") ? true : undefined}
              className={radioClass}
            />
            {REASON_LABEL[reason]}
          </label>
        ))}
        {invalid("reason") ? (
          <p className={fieldErrorClass}>Elegí un motivo de la lista.</p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/caja" className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending
            ? "Registrando…"
            : `Registrar ${KIND_LABEL[kind].toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}

// La moneda y el monto, dentro del formulario: se vuelven a montar con él en cada rechazo, así que
// lo que se lee arranca de lo enviado.
function MoneyFields({
  currencies,
  values,
  currencyInvalid,
  amountInvalid,
}: {
  currencies: string[];
  values: MovementFormValues;
  currencyInvalid: boolean;
  amountInvalid: boolean;
}) {
  const [currency, setCurrency] = useState(values.currency);
  const [amount, setAmount] = useState(values.amount);
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,14rem)] sm:items-start">
      <div className="flex flex-col gap-1">
        <label htmlFor="movimiento-moneda" className={labelClass}>
          Moneda *
        </label>
        <CurrencySelect
          id="movimiento-moneda"
          defaultValue={values.currency}
          currencies={currencies}
          required
          invalid={currencyInvalid}
          describedBy={currencyInvalid ? "movimiento-error" : undefined}
          onChange={setCurrency}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="movimiento-monto" className={labelClass}>
          Monto *
        </label>
        <input
          id="movimiento-monto"
          name="amount"
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
          defaultValue={values.amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-invalid={amountInvalid ? true : undefined}
          aria-describedby={
            amountInvalid
              ? "movimiento-lectura movimiento-error"
              : "movimiento-lectura"
          }
          className={`${inputClass} tabular-nums`}
        />
        <AmountReading
          id="movimiento-lectura"
          amount={amount}
          currency={currency}
        />
      </div>
    </div>
  );
}
