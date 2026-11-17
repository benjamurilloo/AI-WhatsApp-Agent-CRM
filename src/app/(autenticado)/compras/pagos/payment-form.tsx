"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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
import type { ReceiptExchangeProps } from "@/app/(autenticado)/caja/exchange";
import {
  TenderCurrencyChoice,
  TenderedAmountFields,
} from "@/app/(autenticado)/caja/exchange-fields";
import { Icon } from "@/app/_components/icons";
import { createSupplierPaymentAction } from "./actions";
import type {
  PaymentFormField,
  PaymentFormState,
  PaymentFormValues,
} from "./messages";

// El pago a un proveedor (brief-22.6, D-13), contra una recepción o a cuenta, con el molde del cobro:
// el medio, como grupo de opciones con los activos, y el monto, propuesto en lo que falta, con su
// lectura. Contra una recepción la moneda es la suya; a cuenta, se elige. Un solo paso: el tope lo
// vuelve a calcular cash con el bloqueo tomado. Funciona sin JavaScript. El destino viaja en campos
// ocultos. Desde la 29.4.3, con moneda principal, se paga también en la otra moneda (brief-29.4.3,
// D-7): la moneda que sale se elige con un enlace, como en el cobro, y con la otra el pago se aplica
// en la principal.
//
// Desde la 24.8.2 tiene la forma de las láminas 09 y 12 (brief-24.8.2, V-13 y V-14): **dos
// columnas** en escritorio —los datos del pago a la izquierda, el medio a la derecha— y un
// **resumen** de lo propuesto antes de confirmar. El resumen no se recalcula mientras se escribe:
// sin JavaScript no puede, y el tope lo revalida cash al confirmar, con el bloqueo tomado. El medio
// sigue siendo un grupo de opciones y no un `<select>` (V-11), y la moneda que sale sigue
// eligiéndose con un enlace (V-12).

const initialState: PaymentFormState = { status: "idle" };

export type PaymentTarget =
  | { kind: "goods_receipt"; goodsReceiptId: string; currency: string }
  | { kind: "account"; supplierId: string; currencies: string[] };

// El resumen de lo propuesto (V-14). Lo arma la página, que es la que tiene la cuenta.
export type PaymentSummary = {
  appliedLabel: string;
  applied: string;
  // Cuánto sale en la otra moneda, con lo propuesto y la cotización que la pantalla ofrece. Va
  // solo cuando el pago sale en otra moneda: si no, sería la misma cifra dos veces.
  outgoingLabel: string;
  outgoing: string | null;
  afterLabel: string;
  after: string;
};

export function SupplierPaymentForm({
  target,
  cancelHref,
  defaultCurrency,
  defaultAmount,
  paymentMethods,
  hasOpenSession,
  exchange,
  summary = null,
  preview = null,
}: {
  target: PaymentTarget;
  cancelHref: string;
  defaultCurrency: string;
  // Lo propuesto, como se escribe en el campo.
  defaultAmount: string;
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
  exchange: ReceiptExchangeProps | null;
  summary?: PaymentSummary | null;
  // La vista previa de la lámina 12 (D-4), dibujada por la página en el servidor y pasada como
  // contenido: así entra **adentro** del formulario, arriba de las acciones, sin que este módulo
  // tenga que saber nada de la cuenta del proveedor.
  preview?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(
    createSupplierPaymentAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const tenderedOther =
    exchange !== null && exchange.tendered !== exchange.mainCurrency;
  const values: PaymentFormValues = failed
    ? state.values
    : {
        // Con un solo medio activo, se propone ese.
        paymentMethodId:
          paymentMethods.length === 1 ? paymentMethods[0]!.id : "",
        amount: tenderedOther ? exchange.proposed : defaultAmount,
        currency: tenderedOther ? exchange.mainCurrency : defaultCurrency,
        tenderedCurrency: exchange?.tendered ?? defaultCurrency,
        exchangeRate: "",
      };
  const invalid = (field: PaymentFormField) =>
    failed && state.fields.includes(field);
  // La moneda elegida a cuenta, para la lectura del monto. Tras un rechazo, el selector vuelve a
  // montarse con lo enviado, que es lo mismo que guarda este estado.
  const [accountCurrency, setAccountCurrency] = useState(values.currency);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form
      key={failed ? state.requestId : `nuevo-${exchange?.tendered ?? ""}`}
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

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <h2 className="text-base font-semibold">Datos del pago</h2>
          {target.kind === "account" && tenderedOther ? (
            <input
              type="hidden"
              name="currency"
              value={exchange.mainCurrency}
            />
          ) : target.kind === "account" ? (
            <div className="flex min-w-0 max-w-xs flex-col gap-1">
              <label htmlFor="pago-moneda" className={labelClass}>
                Moneda *
              </label>
              {/* La lista del sistema, como en la caja, y no las sugerencias del navegador (pedido del
              usuario en el recorrido de la 22.7, 2026-10-17). */}
              <CurrencySelect
                // Que pueda encogerse: a 320 px su opción más larga desbordaba la tarjeta.
                className="w-full min-w-0"
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

          {/* A cuenta, la moneda que sale solo se elige para un pago en la principal: con otra moneda
          elegida arriba, sale esa (revisión R1-1 de la 29.4.3). */}
          {exchange &&
          (tenderedOther ||
            target.kind === "goods_receipt" ||
            accountCurrency === exchange.mainCurrency) ? (
            <TenderCurrencyChoice exchange={exchange} />
          ) : null}

          {tenderedOther ? (
            <TenderedAmountFields
              exchange={exchange}
              target={exchange.mainCurrency}
              defaultAmount={values.amount}
              defaultRate={values.exchangeRate}
              invalidAmount={invalid("amount")}
              invalidRate={invalid("exchangeRate")}
              errorId="pago-error"
            />
          ) : (
            <AmountField
              currency={
                target.kind === "goods_receipt"
                  ? target.currency
                  : accountCurrency
              }
              defaultValue={values.amount}
              invalid={invalid("amount")}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <h2 className="text-base font-semibold">Tipo de pago</h2>
          <fieldset
            className="flex flex-col gap-2"
            aria-describedby={
              invalid("paymentMethod") ? "pago-error" : "pago-medio-ayuda"
            }
          >
            <legend className={`${labelClass} mb-1`}>Medio de pago *</legend>
            {paymentMethods.map((method) => (
              <label
                key={method.id}
                className="flex items-center gap-2 text-sm"
              >
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
              <p className={fieldErrorClass}>
                Elegí un medio de pago de la lista.
              </p>
            ) : null}
          </fieldset>
        </div>
      </div>

      {summary ? <PaymentSummaryCard summary={summary} /> : null}
      {preview}

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

// El resumen de la lámina (V-14): qué se aplica y qué queda pendiente **con lo propuesto**. Lo dice
// en una línea, porque sin JavaScript las cifras no se recalculan mientras se escribe y el tope lo
// revalida cash al confirmar. «Registrar salida» sale solo cuando el pago sale en otra moneda: si
// no, sería la cifra de arriba repetida.
function PaymentSummaryCard({ summary }: { summary: PaymentSummary }) {
  const figures: {
    icon: "fileText" | "banknote" | "clock";
    label: string;
    value: string;
  }[] = [
    { icon: "fileText", label: summary.appliedLabel, value: summary.applied },
    ...(summary.outgoing
      ? [
          {
            icon: "banknote" as const,
            label: summary.outgoingLabel,
            value: summary.outgoing,
          },
        ]
      : []),
    { icon: "clock", label: summary.afterLabel, value: summary.after },
  ];
  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4">
      <h2 className="text-base font-semibold">Resumen</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="grid min-w-0 grid-cols-[auto_1fr] items-center gap-x-3"
          >
            <Icon
              name={figure.icon}
              className="row-span-2 size-5 shrink-0 text-muted"
            />
            <dt className="min-w-0 text-muted">{figure.label}</dt>
            <dd className="min-w-0 text-xl font-bold tabular-nums">
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted">
        Son las cifras de lo propuesto: si cambiás el monto, se recalculan al
        confirmar.
      </p>
    </div>
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
