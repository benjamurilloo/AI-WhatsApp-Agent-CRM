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
  secondaryButtonClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { formatMoney } from "@/shared/money";
import {
  AmountReading,
  CurrencySelect,
} from "@/app/(autenticado)/caja/money-fields";
import { accountReceiptAction } from "./actions";
import type {
  AccountReceiptFormState,
  AccountReceiptFormValues,
} from "./messages";

// El cobro a cuenta (brief-21.6, D-5): la moneda, propuesta en la de la venta con saldo más vieja; el
// medio, como grupo de opciones con los activos; y el monto, con su lectura como en la caja. Antes de
// registrar, la vista previa de la regla: a qué ventas va y cuánto queda a favor. En la vista previa
// los datos quedan fijos; «Cambiar los datos» vuelve a editarlos. Funciona sin JavaScript.

export function AccountReceiptForm({
  clientId,
  cancelHref,
  defaults,
  currencies,
  paymentMethods,
  hasOpenSession,
}: {
  clientId: string;
  cancelHref: string;
  defaults: AccountReceiptFormValues;
  // Las monedas del sistema, para elegir una (desde el recorrido de la 22.7, 2026-10-17; antes eran
  // las de la cuenta, como sugerencias del navegador).
  currencies: string[];
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
}) {
  const [state, formAction, pending] = useActionState(accountReceiptAction, {
    status: "idle",
  } as AccountReceiptFormState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const failed = state.status === "error";
  const values: AccountReceiptFormValues =
    state.status === "idle" ? (state.values ?? defaults) : state.values;
  const invalid = (field: "paymentMethod" | "amount" | "currency") =>
    failed && state.fields.includes(field);
  // La moneda elegida, para la lectura del monto. Tras un rechazo o la vista previa, el selector vuelve
  // a montarse con lo enviado, que es lo mismo que guarda este estado.
  const [currency, setCurrency] = useState(values.currency);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
    if (state.status === "preview") previewRef.current?.focus();
  }, [state]);

  if (state.status === "preview") {
    const { preview } = state;
    const money = (value: string) => formatMoney(value, preview.currency);
    return (
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="currency" value={values.currency} />
        <input
          type="hidden"
          name="paymentMethodId"
          value={values.paymentMethodId}
        />
        <input type="hidden" name="amount" value={values.amount} />
        <h2
          ref={previewRef}
          tabIndex={-1}
          className="text-base font-semibold focus:outline-none"
        >
          Cómo se aplica {money(preview.amount)} en {state.paymentMethodName}
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {preview.applications.map((row) => (
            <li key={row.saleId}>
              A la venta <span className="font-mono">{row.displayNumber}</span>:{" "}
              <span className="tabular-nums">{money(row.amount)}</span>
            </li>
          ))}
          {preview.toFavor !== "0.00" ? (
            <li>
              Queda a favor del cliente:{" "}
              <span className="tabular-nums">{money(preview.toFavor)}</span>
            </li>
          ) : null}
        </ul>
        <p className="text-sm text-muted">
          Es la cuenta de hoy: si después se anula un cobro, una venta o una
          devolución, la imputación cambia.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="submit"
            name="intent"
            value="edit"
            disabled={pending}
            className={secondaryButtonClass}
          >
            Cambiar los datos
          </button>
          <button
            type="submit"
            name="intent"
            value="confirm"
            disabled={pending}
            className={inlineButtonClass}
          >
            {pending ? "Registrando…" : "Registrar cobro"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      key={failed ? state.requestId : "datos"}
      action={formAction}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <div aria-live="polite" aria-atomic="true">
        {failed ? (
          <p
            ref={errorRef}
            tabIndex={-1}
            id="cobro-cuenta-error"
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

      <div className="flex max-w-xs flex-col gap-1">
        <label htmlFor="cobro-cuenta-moneda" className={labelClass}>
          Moneda *
        </label>
        <CurrencySelect
          id="cobro-cuenta-moneda"
          required
          defaultValue={values.currency}
          currencies={currencies}
          invalid={invalid("currency")}
          describedBy={invalid("currency") ? "cobro-cuenta-error" : undefined}
          onChange={setCurrency}
        />
      </div>

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={
          invalid("paymentMethod")
            ? "cobro-cuenta-error"
            : "cobro-cuenta-medio-ayuda"
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
        <p id="cobro-cuenta-medio-ayuda" className="text-sm text-muted">
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
        <Link href={cancelHref} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button
          type="submit"
          name="intent"
          value="preview"
          disabled={pending}
          className={inlineButtonClass}
        >
          {pending ? "Calculando…" : "Ver cómo se aplica"}
        </button>
      </div>
    </form>
  );
}

// El monto, con su lectura en la moneda propuesta, como en el cobro de una venta.
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
      <label htmlFor="cobro-cuenta-monto" className={labelClass}>
        Monto *
      </label>
      <input
        id="cobro-cuenta-monto"
        name="amount"
        type="text"
        inputMode="decimal"
        required
        autoComplete="off"
        defaultValue={defaultValue}
        onChange={(event) => setAmount(event.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={
          invalid
            ? "cobro-cuenta-lectura cobro-cuenta-error"
            : "cobro-cuenta-lectura"
        }
        className={`${inputClass} tabular-nums`}
      />
      {/^[A-Z]{3}$/.test(currency) ? (
        <AmountReading
          id="cobro-cuenta-lectura"
          amount={amount}
          currency={currency}
        />
      ) : (
        <p id="cobro-cuenta-lectura" className="text-sm text-muted" />
      )}
    </div>
  );
}
