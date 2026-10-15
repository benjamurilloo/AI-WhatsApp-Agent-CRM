"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { PaymentMethod, RefundableAmount } from "@/modules/cash";
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
import { formatMoney } from "@/shared/money";
import { AmountReading } from "@/app/(autenticado)/caja/money-fields";
import type { RefundFormState, RefundFormValues } from "./messages";

// La devolución (brief-21.5, D-7 y D-9), desde la cuenta de un cliente o desde una venta sin cliente
// anulada: la moneda (si hay más de una con algo a devolver), el medio, como grupo de opciones con
// los activos, y el monto, propuesto en lo disponible, con su lectura como en la caja. Un solo paso:
// el tope lo vuelve a calcular cash con el bloqueo tomado. Funciona sin JavaScript: sin él, el monto
// propuesto es el de la primera moneda.

const initialState: RefundFormState = { status: "idle" };

export function RefundForm({
  action,
  target,
  cancelHref,
  available,
  paymentMethods,
  hasOpenSession,
}: {
  action: (
    previous: RefundFormState,
    formData: FormData,
  ) => Promise<RefundFormState>;
  target: { field: "clientId" | "saleId"; id: string };
  cancelHref: string;
  // Lo que se puede devolver, por moneda; al menos una.
  available: RefundableAmount[];
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const first = available[0]!;
  const values: RefundFormValues = failed
    ? state.values
    : {
        currency: first.currency,
        paymentMethodId:
          paymentMethods.length === 1 ? paymentMethods[0]!.id : "",
        amount: first.amountInput,
      };
  const [currency, setCurrency] = useState(values.currency);
  const invalid = (field: "paymentMethod" | "amount" | "currency") =>
    failed && state.fields.includes(field);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form
      key={failed ? state.requestId : "nueva"}
      action={formAction}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name={target.field} value={target.id} />
      <div aria-live="polite" aria-atomic="true">
        {failed ? (
          <p
            ref={errorRef}
            tabIndex={-1}
            id="devolucion-error"
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

      {available.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className={`${labelClass} mb-1`}>Moneda *</legend>
          {available.map((row) => (
            <label
              key={row.currency}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="currency"
                value={row.currency}
                required
                defaultChecked={values.currency === row.currency}
                onChange={() => setCurrency(row.currency)}
                aria-invalid={invalid("currency") ? true : undefined}
                className={radioClass}
              />
              <span className="font-mono">{row.currency}</span>
              <span className="text-muted">
                (hasta {formatMoney(row.amount, row.currency)})
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <input type="hidden" name="currency" value={first.currency} />
      )}

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={
          invalid("paymentMethod")
            ? "devolucion-error"
            : "devolucion-medio-ayuda"
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
        <p id="devolucion-medio-ayuda" className="text-sm text-muted">
          {hasOpenSession
            ? "Una devolución en efectivo sale de la sesión de caja abierta."
            : "La caja está cerrada: para devolver en efectivo, primero abrila."}
        </p>
        {invalid("paymentMethod") ? (
          <p className={fieldErrorClass}>Elegí un medio de pago de la lista.</p>
        ) : null}
      </fieldset>

      {/* Al cambiar la moneda, el monto propuesto pasa a ser el disponible en esa moneda. */}
      <AmountField
        key={currency}
        currency={currency}
        defaultValue={
          currency === values.currency
            ? values.amount
            : (available.find((row) => row.currency === currency)
                ?.amountInput ?? "")
        }
        invalid={currency === values.currency && invalid("amount")}
      />

      <div className="flex flex-wrap justify-end gap-3">
        <Link href={cancelHref} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Registrando…" : "Registrar devolución"}
        </button>
      </div>
    </form>
  );
}

// El monto, dentro del formulario, como en el cobro.
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
      <label htmlFor="devolucion-monto" className={labelClass}>
        Monto en <span className="font-mono">{currency}</span> *
      </label>
      <input
        id="devolucion-monto"
        name="amount"
        type="text"
        inputMode="decimal"
        required
        autoComplete="off"
        defaultValue={defaultValue}
        onChange={(event) => setAmount(event.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={
          invalid ? "devolucion-lectura devolucion-error" : "devolucion-lectura"
        }
        className={`${inputClass} tabular-nums`}
      />
      <AmountReading
        id="devolucion-lectura"
        amount={amount}
        currency={currency}
      />
    </div>
  );
}
