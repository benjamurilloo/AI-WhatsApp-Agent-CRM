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
import { createSaleReceiptAction } from "./actions";
import type { ReceiptFormState, ReceiptFormValues } from "./messages";

// El cobro de una venta (brief-21.3, D-3 y D-8): el medio, como grupo de opciones con los activos, y
// el monto, propuesto en lo que falta, con su lectura («Se lee: …») como en la caja. Un solo paso:
// el tope lo vuelve a calcular cash con el bloqueo tomado. Funciona sin JavaScript.

const initialState: ReceiptFormState = { status: "idle" };

export function ReceiptForm({
  saleId,
  currency,
  outstanding,
  paymentMethods,
  hasOpenSession,
}: {
  saleId: string;
  currency: string;
  // Lo que falta, como se escribe en el campo.
  outstanding: string;
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createSaleReceiptAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const values: ReceiptFormValues = failed
    ? state.values
    : {
        // Con un solo medio activo, se propone ese.
        paymentMethodId:
          paymentMethods.length === 1 ? paymentMethods[0]!.id : "",
        amount: outstanding,
      };
  const invalid = (field: "paymentMethod" | "amount") =>
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
      <input type="hidden" name="saleId" value={saleId} />
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

      <AmountField
        currency={currency}
        defaultValue={values.amount}
        invalid={invalid("amount")}
      />

      <div className="flex flex-wrap justify-end gap-3">
        <Link href={`/ventas/${saleId}`} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Registrando…" : "Registrar cobro"}
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
