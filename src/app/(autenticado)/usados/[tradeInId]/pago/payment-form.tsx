"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { PaymentMethod } from "@/modules/cash";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  radioClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { AmountReading } from "@/app/(autenticado)/caja/money-fields";
import type { ReceiptExchangeProps } from "@/app/(autenticado)/caja/exchange";
import {
  TenderCurrencyChoice,
  TenderedAmountFields,
} from "@/app/(autenticado)/caja/exchange-fields";
import { createTradeInPaymentAction } from "../../actions";
import type {
  PaymentFormField,
  PaymentFormState,
  PaymentFormValues,
} from "../../messages";

// El pago de un usado comprado (brief-29.7.2, D-6), con el molde del pago de una recepción: el medio,
// como grupo de opciones con los elegibles (sin «Permuta»), y el monto, propuesto en lo que falta, con
// su lectura. La moneda es la del usado. Con moneda principal se paga también en la otra moneda: la
// moneda que sale se elige con un enlace, como en el cobro. Un solo paso: el tope lo vuelve a calcular
// cash con el bloqueo tomado. Funciona sin JavaScript. El usado viaja en un campo oculto.

const initialState: PaymentFormState = { status: "idle" };

export function TradeInPaymentForm({
  tradeInId,
  currency,
  cancelHref,
  defaultAmount,
  paymentMethods,
  hasOpenSession,
  exchange,
}: {
  tradeInId: string;
  currency: string;
  cancelHref: string;
  // Lo que falta, como se escribe en el campo.
  defaultAmount: string;
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
  exchange: ReceiptExchangeProps | null;
}) {
  const [state, formAction, pending] = useActionState(
    createTradeInPaymentAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const tenderedOther = exchange !== null && exchange.tendered !== currency;
  const values: PaymentFormValues = failed
    ? state.values
    : {
        // Con un solo medio, se propone ese.
        paymentMethodId:
          paymentMethods.length === 1 ? paymentMethods[0]!.id : "",
        amount: tenderedOther ? exchange.proposed : defaultAmount,
        tenderedCurrency: exchange?.tendered ?? currency,
        exchangeRate: "",
      };
  const invalid = (field: PaymentFormField) =>
    failed && state.fields.includes(field);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form
      key={failed ? state.requestId : `nuevo-${exchange?.tendered ?? ""}`}
      action={formAction}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="tradeInId" value={tradeInId} />
      <div aria-live="polite" aria-atomic="true">
        {failed ? (
          <p
            ref={errorRef}
            tabIndex={-1}
            id="pago-error"
            className={formMessageClass}
          >
            {state.message}
            {state.openCash ? (
              <>
                {" "}
                <Link href="/caja/abrir" className={linkClass}>
                  Abrir caja
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {exchange ? <TenderCurrencyChoice exchange={exchange} /> : null}

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={
          invalid("paymentMethod") ? "pago-error" : "pago-medio-ayuda"
        }
      >
        <legend className={`${labelClass} mb-1`}>Medio de pago *</legend>
        {paymentMethods.map((method) => (
          <label key={method.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="paymentMethodId"
              value={method.id}
              required
              defaultChecked={values.paymentMethodId === method.id}
              aria-invalid={invalid("paymentMethod") ? true : undefined}
              className={radioClass}
            />
            {method.name}
            {method.isCash ? (
              <span className="text-muted">(sale de la caja)</span>
            ) : null}
          </label>
        ))}
        <p id="pago-medio-ayuda" className="text-sm text-muted">
          {hasOpenSession
            ? "Un pago en efectivo sale de la sesión de caja abierta."
            : "La caja está cerrada: para pagar en efectivo, primero abrila."}
        </p>
        {invalid("paymentMethod") ? (
          <p className={fieldErrorClass}>Elegí un medio de pago de la lista.</p>
        ) : null}
      </fieldset>

      {tenderedOther ? (
        <TenderedAmountFields
          exchange={exchange}
          target={currency}
          defaultAmount={values.amount}
          defaultRate={values.exchangeRate}
          invalidAmount={invalid("amount")}
          invalidRate={invalid("exchangeRate")}
          errorId="pago-error"
        />
      ) : (
        <AmountField
          currency={currency}
          defaultValue={values.amount}
          invalid={invalid("amount")}
        />
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Link href={cancelHref} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Registrando…" : "Registrar pago"}
        </button>
      </div>
    </form>
  );
}

// El monto, dentro del formulario: se vuelve a montar con él en cada rechazo, así que lo que se lee
// arranca de lo enviado.
function AmountField({
  currency,
  defaultValue,
  invalid,
}: {
  currency: string;
  defaultValue: string;
  invalid: boolean;
}) {
  const [amount, setAmount] = useState(defaultValue);
  return (
    <div className="flex max-w-xs flex-col gap-1">
      <label htmlFor="pago-monto" className={labelClass}>
        Monto en <span className="font-mono">{currency}</span> *
      </label>
      <input
        id="pago-monto"
        name="amount"
        type="text"
        inputMode="decimal"
        required
        autoComplete="off"
        defaultValue={defaultValue}
        onChange={(event) => setAmount(event.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? "pago-lectura pago-error" : "pago-lectura"}
        className={`${inputClass} tabular-nums`}
      />
      <AmountReading id="pago-lectura" amount={amount} currency={currency} />
    </div>
  );
}
