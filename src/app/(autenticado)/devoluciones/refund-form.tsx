"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { PaymentMethod, RefundableAmount } from "@/modules/cash";
import {
  cardClass,
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  secondaryLinkClass,
  selectClass,
  sectionTitleClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import {
  currencyDecimals,
  formatMoney,
  moneyFromDatabase,
  moneyToDatabase,
  parseMoneyInput,
} from "@/shared/money";
import type { ReceiptExchangeProps } from "@/app/(autenticado)/caja/exchange";
import {
  TenderCurrencyChoice,
  TenderedAmountFields,
} from "@/app/(autenticado)/caja/exchange-fields";
import { AmountReading } from "@/app/(autenticado)/caja/money-fields";
import type {
  RefundFormField,
  RefundFormState,
  RefundFormValues,
} from "./messages";

// La devolución (brief-21.5, D-7 y D-9), desde la cuenta de un cliente o desde una venta sin cliente
// anulada: la moneda (si hay más de una con algo a devolver), el medio y el importe, propuesto en lo
// disponible, con su lectura como en la caja. Un solo paso: el tope lo vuelve a calcular cash con el
// bloqueo tomado. Funciona sin JavaScript: sin él, el importe propuesto es el de la primera moneda.
// Desde la 29.4.3, con moneda principal, lo que está a favor en ella se puede devolver en la otra
// (brief-29.4.3, D-7): la moneda que sale se elige con un enlace, como en el cobro.
//
// Desde la 24.7.2-b tiene la forma de la lámina 07 del lote V2-10, **y la tiene en sus dos
// entradas**, que son la misma pantalla con dos caminos (`Screens.md` §35): «Datos de la
// devolución» a la izquierda y «Revisión de importes» a la derecha. El medio pasó a ser un
// `<select>` y el importe se llama «Importe»; la nota del efectivo bajó del renglón del medio a la
// ayuda del control, que es donde no se pierde. *Desvío de la lista cerrada autorizado el
// 2026-11-05: los localizadores de `tests/e2e/exchange.spec.ts`.*

const initialState: RefundFormState = { status: "idle" };

export const PREVIEW_TITLE = "Previsión.";
export const PREVIEW_DETAIL = "La devolución aún no se registró.";
export const DELIVERY_TITLE = "Confirmá que el dinero fue entregado.";
export const DELIVERY_DETAIL = "Registrar no ejecuta una transferencia.";

// Los dos avisos de la lámina 07. Viven acá, con el formulario, para que **las dos entradas digan
// lo mismo**: la 24.7.2 pagó el precio de rediseñar una sola de las dos entradas de una pantalla.
export function RefundPreviewNotice() {
  return (
    <p className="flex items-start gap-3 rounded-xl border border-warning bg-warning-soft px-3 py-2.5 text-sm text-on-warning-soft">
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong className="font-semibold">{PREVIEW_TITLE}</strong>{" "}
        {PREVIEW_DETAIL}
      </span>
    </p>
  );
}

function RefundDeliveryNotice() {
  return (
    <p className="flex items-start gap-3 rounded-xl border border-warning bg-warning-soft px-3 py-2.5 text-sm text-on-warning-soft">
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong className="block font-semibold">{DELIVERY_TITLE}</strong>
        {DELIVERY_DETAIL}
      </span>
    </p>
  );
}

export type RefundReviewLabels = {
  // «A devolver actual» desde una venta; «A favor actual» desde la cuenta.
  current: string;
  // «Quedará por devolver» / «Quedará a favor».
  remaining: string;
};

export function RefundForm({
  action,
  target,
  cancelHref,
  cancelLabel = "Volver",
  available,
  paymentMethods,
  hasOpenSession,
  exchange,
  reviewLabels,
}: {
  action: (
    previous: RefundFormState,
    formData: FormData,
  ) => Promise<RefundFormState>;
  target: { field: "clientId" | "saleId"; id: string };
  cancelHref: string;
  cancelLabel?: string;
  // Lo que se puede devolver, por moneda; al menos una.
  available: RefundableAmount[];
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
  exchange: ReceiptExchangeProps | null;
  reviewLabels: RefundReviewLabels;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  // Con la otra moneda, se aplica en la principal: la única que se puede devolver así.
  const tenderedOther =
    exchange !== null && exchange.tendered !== exchange.mainCurrency;
  const first = tenderedOther
    ? (available.find((row) => row.currency === exchange.mainCurrency) ??
      available[0]!)
    : available[0]!;
  const values: RefundFormValues = failed
    ? state.values
    : {
        currency: first.currency,
        paymentMethodId:
          paymentMethods.length === 1 ? paymentMethods[0]!.id : "",
        amount: tenderedOther ? exchange.proposed : first.amountInput,
        tenderedCurrency: exchange?.tendered ?? first.currency,
        exchangeRate: "",
      };
  const [currency, setCurrency] = useState(values.currency);
  const [amount, setAmount] = useState(values.amount);
  const invalid = (field: RefundFormField) =>
    failed && state.fields.includes(field);
  const row = available.find((option) => option.currency === currency) ?? first;

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form
      key={failed ? state.requestId : `nueva-${exchange?.tendered ?? ""}`}
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="devolucion-datos"
          className={`${cardClass} flex min-w-0 flex-col gap-4 p-5`}
        >
          <h2 id="devolucion-datos" className={sectionTitleClass}>
            Datos de la devolución
          </h2>

          {tenderedOther ? (
            <input
              type="hidden"
              name="currency"
              value={exchange.mainCurrency}
            />
          ) : available.length > 1 ? (
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="devolucion-moneda" className={labelClass}>
                Moneda *
              </label>
              <select
                id="devolucion-moneda"
                name="currency"
                required
                defaultValue={values.currency}
                onChange={(event) => {
                  setCurrency(event.target.value);
                  setAmount(
                    available.find(
                      (option) => option.currency === event.target.value,
                    )?.amountInput ?? "",
                  );
                }}
                aria-invalid={invalid("currency") ? true : undefined}
                className={`${selectClass} w-full min-w-0`}
              >
                {available.map((option) => (
                  <option key={option.currency} value={option.currency}>
                    {option.currency} (hasta{" "}
                    {formatMoney(option.amount, option.currency)})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="currency" value={first.currency} />
          )}

          {/* El `<select>` del medio lleva `w-full min-w-0`: su ancho mínimo es el de su opción más
              larga, y sin eso desborda a 320 px (medido en la 24.7.1). */}
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="devolucion-medio" className={labelClass}>
              Medio de pago *
            </label>
            <select
              id="devolucion-medio"
              name="paymentMethodId"
              required
              defaultValue={values.paymentMethodId}
              aria-invalid={invalid("paymentMethod") ? true : undefined}
              aria-describedby={
                invalid("paymentMethod")
                  ? "devolucion-error devolucion-medio-ayuda"
                  : "devolucion-medio-ayuda"
              }
              className={`${selectClass} w-full min-w-0`}
            >
              <option value="" disabled>
                Elegí un medio de pago
              </option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                  {method.isCash ? " (sale de la caja)" : ""}
                </option>
              ))}
            </select>
            <p id="devolucion-medio-ayuda" className="text-sm text-muted">
              {hasOpenSession
                ? "Una devolución en efectivo sale de la sesión de caja abierta."
                : "La caja está cerrada: para devolver en efectivo, primero abrila."}
            </p>
            {invalid("paymentMethod") ? (
              <p className={fieldErrorClass}>
                Elegí un medio de pago de la lista.
              </p>
            ) : null}
          </div>

          {/* La moneda que sale solo se elige para lo que está a favor en la principal: con otra
              moneda elegida arriba, sale esa (revisión R1-1 de la 29.4.3). Cuando no hay nada que
              elegir, la lámina dibuja un `<select>` apagado con la moneda de la venta. */}
          {exchange && (tenderedOther || currency === exchange.mainCurrency) ? (
            <TenderCurrencyChoice exchange={exchange} />
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="devolucion-moneda-sale" className={labelClass}>
                Moneda que sale
              </label>
              <select
                id="devolucion-moneda-sale"
                disabled
                value={currency}
                aria-describedby="devolucion-moneda-sale-ayuda"
                className={`${selectClass} w-full min-w-0 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <option value={currency}>{currency}</option>
              </select>
              <p
                id="devolucion-moneda-sale-ayuda"
                className="text-sm text-muted"
              >
                Sale en {currency}, la moneda de lo que hay que devolver.
              </p>
            </div>
          )}

          {/* Al cambiar la moneda, el importe propuesto pasa a ser el disponible en esa moneda. */}
          {tenderedOther ? (
            <TenderedAmountFields
              exchange={exchange}
              target={exchange.mainCurrency}
              defaultAmount={values.amount}
              defaultRate={values.exchangeRate}
              invalidAmount={invalid("amount")}
              invalidRate={invalid("exchangeRate")}
              errorId="devolucion-error"
            />
          ) : (
            <AmountField
              key={currency}
              currency={currency}
              value={amount}
              onChange={setAmount}
              invalid={currency === values.currency && invalid("amount")}
            />
          )}
        </section>

        {/* La «Revisión de importes» de la lámina. **Es aritmética y no una lectura**: las tres
            filas salen de lo que la página ya leyó más lo que se escribe, como la previsión del
            movimiento de la 24.7.1 (D-2). **Sin JavaScript no sigue lo que se escribe**, y eso es
            inherente al no-JavaScript, no un defecto: lo que decide el tope es el servidor.

            Con **conversión** no se restan los dos números, y es a propósito: lo que se escribe
            está en la moneda que sale y lo disponible está en la principal. La primera versión
            los restaba igual —formateaba los 157.000 que salían en pesos como si fueran dólares y
            anunciaba en rojo un rechazo que el servidor no hacía—, y lo encontró la revisión
            independiente (B-1). **Convertirlo acá sería reimplementar una regla de dinero en el
            navegador**, que es justo lo que esta subfase tiene excluido: lo aplicado lo calcula el
            servidor con la cotización, al registrar. */}
        <AmountReview
          currency={row.currency}
          available={row.amount}
          typed={tenderedOther ? null : amount}
          tendered={tenderedOther ? { currency: exchange.tendered } : null}
          labels={reviewLabels}
        />
      </div>

      <RefundDeliveryNotice />

      <div className="flex flex-wrap justify-end gap-3">
        <Link href={cancelHref} className={secondaryLinkClass}>
          {cancelLabel}
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Registrando…" : "Registrar devolución"}
        </button>
      </div>
    </form>
  );
}

// El importe, dentro del formulario, como en el cobro. La moneda va de prefijo dentro del control,
// como dibuja la lámina, y **también en el nombre accesible**: «Importe en ARS» y no solo
// «Importe», para que el campo se pueda nombrar sin mirar la pantalla.
function AmountField({
  currency,
  value,
  onChange,
  invalid,
}: {
  currency: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  return (
    <div className="flex min-w-0 max-w-xs flex-col gap-1">
      <label htmlFor="devolucion-monto" className={labelClass}>
        Importe en <span className="font-mono">{currency}</span> *
      </label>
      <div className="flex min-w-0 items-stretch">
        <span
          aria-hidden="true"
          className="flex shrink-0 items-center rounded-l-xl border border-r-0 border-border-strong bg-surface-muted px-3 font-mono text-sm text-muted"
        >
          {currency}
        </span>
        <input
          id="devolucion-monto"
          name="amount"
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={
            invalid
              ? "devolucion-lectura devolucion-error"
              : "devolucion-lectura"
          }
          className={`${inputClass} rounded-l-none tabular-nums`}
        />
      </div>
      <AmountReading
        id="devolucion-lectura"
        amount={value}
        currency={currency}
      />
    </div>
  );
}

// Las tres filas de la lámina. Lo que queda nunca se dibuja en negativo: si se escribe de más, lo
// dice y **el servidor lo rechaza igual**, que es donde vale el tope.
//
// `typed` es `null` cuando la plata sale en la otra moneda: ahí lo escrito **no es comparable**
// con lo disponible, y en vez de restar dos monedas distintas se dice en qué moneda sale y cuál es
// la equivalencia que la página ya calculó. Restar igual es lo que hacía la primera versión (B-1).
function AmountReview({
  currency,
  available,
  typed,
  tendered,
  labels,
}: {
  currency: string;
  available: string;
  typed: string | null;
  tendered: { currency: string } | null;
  labels: RefundReviewLabels;
}) {
  const decimals = currencyDecimals(currency);
  const parsed =
    typed !== null && decimals.ok
      ? parseMoneyInput(typed, decimals.decimals)
      : { ok: false as const, reason: "format" as const };
  const total = moneyFromDatabase(available);
  const now = parsed.ok ? parsed.amount : null;
  const over = now !== null && now > total;
  const remaining = now === null ? null : total - now;

  return (
    <aside
      aria-labelledby="devolucion-revision"
      className={`${cardClass} p-5 lg:sticky lg:top-6`}
    >
      <h2 id="devolucion-revision" className={sectionTitleClass}>
        Revisión de importes
      </h2>
      <dl className="mt-4 flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt className="text-muted">{labels.current}</dt>
          <dd className="tabular-nums">{formatMoney(available, currency)}</dd>
        </div>
        {tendered === null ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted">Por devolver ahora</dt>
              <dd className="font-semibold tabular-nums">
                {now === null
                  ? "—"
                  : formatMoney(moneyToDatabase(now), currency)}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3">
              <dt className="text-muted">{labels.remaining}</dt>
              <dd className="font-semibold tabular-nums">
                {remaining === null || remaining < 0n
                  ? "—"
                  : formatMoney(moneyToDatabase(remaining), currency)}
              </dd>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <dt className="text-muted">Sale en</dt>
            <dd className="font-semibold">
              <span className="font-mono">{tendered.currency}</span>
            </dd>
            {/* La equivalencia **no se repite acá**: ya la dice el selector de moneda, arriba
                del formulario. Repetirla hacía que el mismo texto apareciera dos veces en la
                pantalla, que es el defecto que la 24.6.2-e corrigió en el listado de ventas. */}
            <dd className="text-muted">
              Lo que se aplica a la cuenta lo calcula el registro con la
              cotización: acá no se resta una moneda de la otra.
            </dd>
          </div>
        )}
      </dl>
      {over ? (
        <p className={`mt-3 ${fieldErrorClass}`}>
          Es más de lo que hay para devolver: el registro lo rechaza.
        </p>
      ) : null}
    </aside>
  );
}
