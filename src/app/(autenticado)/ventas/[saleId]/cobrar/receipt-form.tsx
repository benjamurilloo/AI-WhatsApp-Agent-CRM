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
import type { ReceiptExchangeProps } from "@/app/(autenticado)/caja/exchange";
import {
  TenderCurrencyChoice,
  TenderedAmountFields,
} from "@/app/(autenticado)/caja/exchange-fields";
import { AmountReading } from "@/app/(autenticado)/caja/money-fields";
import type {
  ReceiptFormField,
  ReceiptFormState,
  ReceiptFormValues,
} from "./messages";

// El cobro de una venta (brief-21.3, D-3 y D-8) y, desde la 21.4, la seña de un pedido (brief-21.4,
// D-8): el medio, como grupo de opciones con los activos, y el monto, propuesto en lo que falta, con
// su lectura («Se lee: …») como en la caja. Un solo paso: el tope lo vuelve a calcular cash con el
// bloqueo tomado. Funciona sin JavaScript. El destino viaja en un campo oculto, y la acción es la
// del cobro o la de la seña. Desde la 29.4, con moneda principal, se puede recibir en la otra moneda
// de la organización (brief-29.4, D-6): la moneda que entra se elige con un enlace y el servidor
// vuelve a armar el formulario con el monto propuesto en ella.

const initialState: ReceiptFormState = { status: "idle" };

export function ReceiptForm({
  action,
  target,
  cancelHref,
  submitLabel,
  currency,
  outstanding,
  paymentMethods,
  hasOpenSession,
  exchange,
}: {
  action: (
    previous: ReceiptFormState,
    formData: FormData,
  ) => Promise<ReceiptFormState>;
  target: { field: "saleId" | "orderId"; id: string };
  cancelHref: string;
  submitLabel: string;
  currency: string;
  // Lo que falta, como se escribe en el campo.
  outstanding: string;
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
  exchange: ReceiptExchangeProps | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const values: ReceiptFormValues = failed
    ? state.values
    : {
        // Con un solo medio activo, se propone ese.
        paymentMethodId:
          paymentMethods.length === 1 ? paymentMethods[0]!.id : "",
        amount: exchange ? exchange.proposed : outstanding,
        tenderedCurrency: exchange?.tendered ?? currency,
        exchangeRate: "",
      };
  const invalid = (field: ReceiptFormField) =>
    failed && state.fields.includes(field);
  const tendered = exchange?.tendered ?? currency;

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form
      // Con otra moneda que entra, el formulario se vuelve a montar con su monto propuesto.
      key={failed ? state.requestId : `nuevo-${tendered}`}
      action={formAction}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name={target.field} value={target.id} />
      <div aria-live="polite" aria-atomic="true">
        {failed ? (
          <p
            ref={errorRef}
            tabIndex={-1}
            id="cobro-error"
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

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={
          invalid("paymentMethod") ? "cobro-error" : "cobro-medio-ayuda"
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
              <span className="text-muted">(entra a la caja)</span>
            ) : null}
          </label>
        ))}
        <p id="cobro-medio-ayuda" className="text-sm text-muted">
          {hasOpenSession
            ? "Un cobro en efectivo entra a la sesión de caja abierta."
            : "La caja está cerrada: para cobrar en efectivo, primero abrila."}
        </p>
        {invalid("paymentMethod") ? (
          <p className={fieldErrorClass}>Elegí un medio de pago de la lista.</p>
        ) : null}
      </fieldset>

      {exchange ? <TenderCurrencyChoice exchange={exchange} /> : null}

      {exchange && tendered !== currency ? (
        <TenderedAmountFields
          exchange={exchange}
          target={currency}
          defaultAmount={values.amount}
          defaultRate={values.exchangeRate}
          invalidAmount={invalid("amount")}
          invalidRate={invalid("exchangeRate")}
          errorId="cobro-error"
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
          {pending ? "Registrando…" : submitLabel}
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
      <label htmlFor="cobro-monto" className={labelClass}>
        Monto en <span className="font-mono">{currency}</span> *
      </label>
      <input
        id="cobro-monto"
        name="amount"
        type="text"
        inputMode="decimal"
        required
        autoComplete="off"
        defaultValue={defaultValue}
        onChange={(event) => setAmount(event.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={
          invalid ? "cobro-lectura cobro-error" : "cobro-lectura"
        }
        className={`${inputClass} tabular-nums`}
      />
      <AmountReading id="cobro-lectura" amount={amount} currency={currency} />
    </div>
  );
}
