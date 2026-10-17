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
import {
  AmountReading,
  CurrencySelect,
} from "@/app/(autenticado)/caja/money-fields";
import { createSupplierPaymentAction } from "./actions";
import type { PaymentFormState, PaymentFormValues } from "./messages";

// El pago a un proveedor (brief-22.6, D-13), contra una recepción o a cuenta, con el molde del cobro:
// el medio, como grupo de opciones con los activos, y el monto, propuesto en lo que falta, con su
// lectura. Contra una recepción la moneda es la suya; a cuenta, se elige. Un solo paso: el tope lo
// vuelve a calcular cash con el bloqueo tomado. Funciona sin JavaScript. El destino viaja en campos
// ocultos.

const initialState: PaymentFormState = { status: "idle" };

export type PaymentTarget =
  | { kind: "goods_receipt"; goodsReceiptId: string; currency: string }
  | { kind: "account"; supplierId: string; currencies: string[] };

export function SupplierPaymentForm({
  target,
  cancelHref,
  defaultCurrency,
  defaultAmount,
  paymentMethods,
  hasOpenSession,
}: {
  target: PaymentTarget;
  cancelHref: string;
  defaultCurrency: string;
  // Lo propuesto, como se escribe en el campo.
  defaultAmount: string;
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createSupplierPaymentAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const values: PaymentFormValues = failed
    ? state.values
    : {
        // Con un solo medio activo, se propone ese.
        paymentMethodId:
          paymentMethods.length === 1 ? paymentMethods[0]!.id : "",
        amount: defaultAmount,
        currency: defaultCurrency,
      };
  const invalid = (field: "paymentMethod" | "amount" | "currency") =>
    failed && state.fields.includes(field);
  // La moneda elegida a cuenta, para la lectura del monto. Tras un rechazo, el selector vuelve a
  // montarse con lo enviado, que es lo mismo que guarda este estado.
  const [accountCurrency, setAccountCurrency] = useState(values.currency);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form
      key={failed ? state.requestId : "nuevo"}
      action={formAction}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="target" value={target.kind} />
      {target.kind === "goods_receipt" ? (
        <>
          <input
            type="hidden"
            name="goodsReceiptId"
            value={target.goodsReceiptId}
          />
          <input type="hidden" name="currency" value={target.currency} />
        </>
      ) : (
        <input type="hidden" name="supplierId" value={target.supplierId} />
      )}
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

      {target.kind === "account" ? (
        <div className="flex max-w-xs flex-col gap-1">
          <label htmlFor="pago-moneda" className={labelClass}>
            Moneda *
          </label>
          {/* La lista del sistema, como en la caja, y no las sugerencias del navegador (pedido del
              usuario en el recorrido de la 22.7, 2026-10-17). */}
          <CurrencySelect
            id="pago-moneda"
            required
            defaultValue={values.currency}
            currencies={target.currencies}
            invalid={invalid("currency")}
            describedBy={invalid("currency") ? "pago-error" : undefined}
            onChange={setAccountCurrency}
          />
        </div>
      ) : null}

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

      <AmountField
        currency={
          target.kind === "goods_receipt" ? target.currency : accountCurrency
        }
        defaultValue={values.amount}
        invalid={invalid("amount")}
      />

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
        Monto *
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
      {/^[A-Z]{3}$/.test(currency) ? (
        <AmountReading id="pago-lectura" amount={amount} currency={currency} />
      ) : (
        <p id="pago-lectura" className="text-sm text-muted" />
      )}
    </div>
  );
}
