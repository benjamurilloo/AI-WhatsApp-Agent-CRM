"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { PaymentMethod } from "@/modules/cash";
import {
  cardClass,
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
import { Icon } from "@/app/_components/icons";
import {
  exchangeRateFromDatabase,
  formatExchangeRate,
  formatMoney,
} from "@/shared/money";
import {
  NO_RATE_TEXT,
  STALE_RATE_TEXT,
  type ExchangeRateLabel,
} from "@/app/(autenticado)/caja/exchange";
import {
  AmountReading,
  CurrencySelect,
} from "@/app/(autenticado)/caja/money-fields";
import { accountReceiptAction } from "./actions";
import {
  otherCurrenciesNote,
  REVIEW_AUTOMATIC_NOTE,
  REVIEW_CONTEXT_TITLE,
  REVIEW_ENTERED_TITLE,
  REVIEW_FORECAST_DETAIL,
  REVIEW_FORECAST_TITLE,
  REVIEW_NO_TRANSFER_NOTE,
  REVIEW_SUBTITLE,
  REVIEW_TITLE,
  STEP_DATA_LABEL,
  STEP_REVIEW_LABEL,
  type AccountReceiptFormState,
  type AccountReceiptFormValues,
} from "./messages";

// Los dos pasos, dichos con todas las letras (brief-24.7.2, lámina 03). Es el mismo patrón que el
// cierre de caja de la 24.7.1: el paso en curso lleva `aria-current`, así que un lector de
// pantalla dice dónde estás sin depender del color.
function Stepper({ current }: { current: "datos" | "revision" }) {
  const steps = [
    { id: "datos" as const, label: STEP_DATA_LABEL },
    { id: "revision" as const, label: STEP_REVIEW_LABEL },
  ];
  return (
    <ol className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      {steps.map((step) => (
        <li
          key={step.id}
          aria-current={step.id === current ? "step" : undefined}
          className={step.id === current ? "font-semibold" : "text-muted"}
        >
          {step.label}
        </li>
      ))}
    </ol>
  );
}

// El cobro a cuenta (brief-21.6, D-5): la moneda, propuesta en la de la venta con saldo más vieja; el
// medio, como grupo de opciones con los activos; y el monto, con su lectura como en la caja. Antes de
// registrar, la vista previa de la regla: a qué ventas va y cuánto queda a favor. En la vista previa
// los datos quedan fijos; «Cambiar los datos» vuelve a editarlos. Funciona sin JavaScript. Desde la
// 29.4, con moneda principal, la moneda es la aplicada (la principal o una con saldo), y lo que entra
// puede venir en la otra moneda de la organización: la vista previa muestra lo aplicado (brief-29.4,
// D-6).

export type AccountExchangeProps = {
  mainCurrency: string;
  quoteCurrency: string;
  rate: ExchangeRateLabel | null;
};

export function AccountReceiptForm({
  clientId,
  clientName,
  debts,
  contexto,
  cancelHref,
  defaults,
  currencies,
  paymentMethods,
  hasOpenSession,
  exchange,
}: {
  clientId: string;
  clientName: string;
  // Lo que el cliente debe en cada moneda, **ya leído por la página** para armar su encabezado: la
  // revisión lo usa para el contexto y para avisar qué queda pendiente en otra moneda. No agrega
  // ninguna lectura (brief-24.7.2, AC-13).
  debts: { currency: string; owed: string }[];
  // El contexto del paso 1 —las ventas con saldo y la ayuda—, que la página arma y este
  // componente dibuja **solo mientras se cargan los datos**: en la revisión la lámina 03 muestra
  // solo las dos columnas (brief-24.7.2).
  contexto: React.ReactNode;
  cancelHref: string;
  defaults: AccountReceiptFormValues;
  // Las monedas del sistema, para elegir una (desde el recorrido de la 22.7, 2026-10-17; antes eran
  // las de la cuenta, como sugerencias del navegador).
  currencies: string[];
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
  exchange: AccountExchangeProps | null;
}) {
  const [state, formAction, pending] = useActionState(accountReceiptAction, {
    status: "idle",
  } as AccountReceiptFormState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const failed = state.status === "error";
  const values: AccountReceiptFormValues =
    state.status === "idle" ? (state.values ?? defaults) : state.values;
  const invalid = (
    field:
      | "paymentMethod"
      | "amount"
      | "currency"
      | "tenderedCurrency"
      | "exchangeRate",
  ) => failed && state.fields.includes(field);
  // La moneda elegida, para la lectura del monto. Tras un rechazo o la vista previa, el selector vuelve
  // a montarse con lo enviado, que es lo mismo que guarda este estado.
  const [currency, setCurrency] = useState(values.currency);
  const [tendered, setTendered] = useState(values.tenderedCurrency);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
    if (state.status === "preview") previewRef.current?.focus();
  }, [state]);

  if (state.status === "preview") {
    const { preview } = state;
    const money = (value: string) => formatMoney(value, preview.currency);
    const owedInApplied =
      debts.find((row) => row.currency === preview.currency)?.owed ?? "0.00";
    // Las otras monedas con deuda: el cobro no las toca y la pantalla lo dice.
    const otherDebts = debts.filter(
      (row) => row.currency !== preview.currency && row.owed !== "0.00",
    );
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
        <input
          type="hidden"
          name="tenderedCurrency"
          value={values.tenderedCurrency}
        />
        <input type="hidden" name="exchangeRate" value={values.exchangeRate} />
        <input
          type="hidden"
          name="exchangeRateId"
          value={values.exchangeRateId}
        />
        <Stepper current="revision" />
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className={`${cardClass} p-5 sm:p-6`}>
            <h2
              ref={previewRef}
              tabIndex={-1}
              className="text-base font-semibold focus:outline-none"
            >
              {REVIEW_TITLE}
            </h2>
            <p className="mt-1 text-sm text-muted">{REVIEW_SUBTITLE}</p>

            <p className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm">
              <Icon name="info" className="mt-0.5 size-4 shrink-0" />
              <span>{REVIEW_AUTOMATIC_NOTE}</span>
            </p>

            {preview.tender ? (
              <p className="mt-4 text-sm tabular-nums">
                Entran{" "}
                {formatMoney(preview.tender.amount, preview.tender.currency)} a{" "}
                {formatExchangeRate(
                  exchangeRateFromDatabase(preview.tender.exchangeRate),
                )}{" "}
                por {exchange?.mainCurrency ?? ""}.
              </p>
            ) : null}

            {/* Con nombre, para que una prueba y un lector de pantalla puedan tomarla entera: el
                importe y su destino viven en elementos distintos y por separado no dicen nada. */}
            <div
              role="region"
              aria-label={`Aplicación en la cuenta en ${preview.currency}`}
            >
              <h3 className="mt-5 text-sm font-semibold">
                Aplicación en la cuenta ({preview.currency})
              </h3>
              <dl className="mt-2 flex flex-col divide-y divide-border rounded-xl border border-border">
                {preview.applications.map((row) => (
                  <div
                    key={row.saleId}
                    className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <dt>
                      A <span className="font-mono">{row.displayNumber}</span>
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {money(row.amount)}
                    </dd>
                  </div>
                ))}
                {preview.toFavor !== "0.00" ? (
                  <div className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                    <dt>Quedará a favor en {preview.currency}</dt>
                    <dd className="font-semibold tabular-nums">
                      {money(preview.toFavor)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="font-semibold">{REVIEW_FORECAST_TITLE}</span>{" "}
                {REVIEW_FORECAST_DETAIL}
              </span>
            </p>

            {otherDebts.length > 0 ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm">
                <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {otherCurrenciesNote(
                    otherDebts.map((row) =>
                      formatMoney(row.owed, row.currency),
                    ),
                  )}
                </span>
              </p>
            ) : null}
          </div>

          <aside className="flex flex-col gap-6">
            <div className={`${cardClass} p-5 text-sm sm:p-6`}>
              <h3 className="text-base font-semibold">
                {REVIEW_CONTEXT_TITLE}
              </h3>
              <dl className="mt-3 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Cliente</dt>
                  <dd className="font-medium">{clientName}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">
                    Deuda en {preview.currency} actual
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {money(owedInApplied)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className={`${cardClass} p-5 text-sm sm:p-6`}>
              <h3 className="text-base font-semibold">
                {REVIEW_ENTERED_TITLE}
              </h3>
              <dl className="mt-3 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Moneda aplicada</dt>
                  <dd className="font-mono">{preview.currency}</dd>
                </div>
                {preview.tender ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted">Moneda recibida</dt>
                    <dd className="font-mono">{preview.tender.currency}</dd>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Medio de cobro</dt>
                  <dd className="font-medium">{state.paymentMethodName}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Importe</dt>
                  <dd className="font-semibold tabular-nums">
                    {money(preview.amount)}
                  </dd>
                </div>
              </dl>
            </div>

            <p className="flex items-start gap-2 text-sm text-muted">
              <Icon name="info" className="mt-0.5 size-4 shrink-0" />
              <span>{REVIEW_NO_TRANSFER_NOTE}</span>
            </p>
          </aside>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="submit"
            name="intent"
            value="edit"
            disabled={pending}
            className={secondaryButtonClass}
          >
            Cambiar datos
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
      <Stepper current="datos" />
      {contexto}
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

      {exchange ? (
        <TenderFields
          exchange={exchange}
          tendered={tendered}
          onTenderedChange={setTendered}
          defaultRate={values.exchangeRate}
          invalidTendered={invalid("tenderedCurrency")}
          invalidRate={invalid("exchangeRate")}
        />
      ) : null}

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
        currency={tendered || currency}
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

// La moneda que entra y la cotización (brief-29.4, D-6). Vacía es la misma que la moneda aplicada.
// Lo aplicado lo muestra la vista previa, que lo calcula el servidor.
function TenderFields({
  exchange,
  tendered,
  onTenderedChange,
  defaultRate,
  invalidTendered,
  invalidRate,
}: {
  exchange: AccountExchangeProps;
  tendered: string;
  onTenderedChange: (value: string) => void;
  defaultRate: string;
  invalidTendered: boolean;
  invalidRate: boolean;
}) {
  const { rate } = exchange;
  return (
    <div className="flex flex-col gap-3">
      {rate ? (
        <input type="hidden" name="exchangeRateId" value={rate.id} />
      ) : null}
      <div className="flex max-w-xs flex-col gap-1">
        <label htmlFor="cobro-cuenta-entra" className={labelClass}>
          Moneda que entra
        </label>
        <select
          id="cobro-cuenta-entra"
          name="tenderedCurrency"
          defaultValue={tendered}
          onChange={(event) => onTenderedChange(event.target.value)}
          aria-invalid={invalidTendered ? true : undefined}
          aria-describedby={invalidTendered ? "cobro-cuenta-error" : undefined}
          className={inputClass}
        >
          <option value="">La misma que la moneda</option>
          {/* La otra moneda entra solo contra la principal (revisión independiente, R1-1). */}
          <option value={exchange.quoteCurrency}>
            {exchange.quoteCurrency}, aplicada en {exchange.mainCurrency}
          </option>
        </select>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        {rate ? (
          <p>
            Cotización vigente:{" "}
            <span className="font-medium tabular-nums">{rate.label}</span>{" "}
            <span className="text-muted">({rate.recordedLabel})</span>
          </p>
        ) : (
          <p className="text-muted">{NO_RATE_TEXT}</p>
        )}
        {rate?.stale ? (
          <p className="w-fit rounded-md bg-warning-soft px-2 py-1 text-on-warning-soft">
            {STALE_RATE_TEXT}
          </p>
        ) : null}
      </div>
      <div className="flex max-w-xs flex-col gap-1">
        <label htmlFor="cobro-cuenta-cotizacion" className={labelClass}>
          Cotización acordada (opcional)
        </label>
        <input
          id="cobro-cuenta-cotizacion"
          name="exchangeRate"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={defaultRate}
          aria-invalid={invalidRate ? true : undefined}
          aria-describedby={
            invalidRate
              ? "cobro-cuenta-cotizacion-ayuda cobro-cuenta-error"
              : "cobro-cuenta-cotizacion-ayuda"
          }
          className={`${inputClass} tabular-nums`}
        />
        <p id="cobro-cuenta-cotizacion-ayuda" className="text-sm text-muted">
          1 {exchange.mainCurrency} = {exchange.quoteCurrency}, con coma
          decimal. Solo vale para este cobro: no cambia la vigente.
        </p>
      </div>
    </div>
  );
}

// El monto, con su lectura en la moneda que entra, como en el cobro de una venta.
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
