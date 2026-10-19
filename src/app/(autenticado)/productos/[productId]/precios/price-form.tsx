"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ProductPrice } from "@/modules/catalog";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/app/_components/form-styles";
import {
  currencyDecimals,
  formatMoney,
  moneyToDatabase,
  parseMoneyInput,
} from "@/shared/money";
import { setPriceAction } from "./actions";
import {
  PRICE_UNCHANGED_NOTICE,
  priceText,
  type PriceFormState,
} from "./messages";

// Formulario de precio (brief-11.1, FR-PROD-12). Antes de confirmar, muestra el monto formateado
// en su moneda, anunciado con aria-live: es la segunda defensa de D-6, para quien escribe bien
// los dígitos pero piensa en otra moneda. El id del precio vigente viaja en el formulario: si
// cambió, el servidor responde CONFLICT y acá se muestra el vigente nuevo (D-7).

const initialState: PriceFormState = { status: "idle" };

// El monto que se va a guardar, en la escala de la base; null si todavía no se entiende.
function parsedAmount(amount: string, currency: string): string | null {
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) return null;
  const parsed = parseMoneyInput(amount, decimals.decimals);
  return parsed.ok ? moneyToDatabase(parsed.amount) : null;
}

export function PriceForm({
  productId,
  current,
  currencies,
  defaultCurrency = null,
}: {
  productId: string;
  current: ProductPrice | null;
  currencies: { code: string; label: string }[];
  // La moneda principal, propuesta si no hay uno vigente (brief-29.4, D-9).
  defaultCurrency?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    setPriceAction,
    initialState,
  );
  // No controlados, con lo que se envió como valor por defecto: React reinicia el formulario al
  // terminar la acción, y un select controlado quedaría en la primera opción, vacía, mientras el
  // estado dice otra cosa; el navegador bloquearía el envío siguiente sin avisar. Así, el reinicio
  // vuelve a lo que se escribió. amount y currency solo reflejan los campos para la vista previa.
  // El select se vuelve a montar con cada rechazo: React fija su opción por defecto solo al
  // montarlo, y sin la key volvería a la del primer render.
  const submitted =
    state.status === "idle"
      ? {
          amount: "",
          currency: current?.currency ?? defaultCurrency ?? "",
          expectedPriceId: current?.id ?? "",
        }
      : state.values;
  const [amount, setAmount] = useState(submitted.amount);
  const [currency, setCurrency] = useState(submitted.currency);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Tras un CONFLICT el servidor devuelve el precio vigente: es el que hay que confirmar, y su id
  // pasa a ser el esperado. Fuera de eso, el esperado es el que se envió, nunca la prop, que la
  // página puede traer ya cambiada (M-1).
  const conflict = state.status === "error" && state.currentPrice !== undefined;
  const vigente = conflict ? (state.currentPrice ?? null) : current;
  const expectedPriceId = conflict
    ? (state.currentPrice?.id ?? "")
    : submitted.expectedPriceId;
  const failed = state.status === "error";
  const next = parsedAmount(amount, currency);
  const shown = next === null ? "" : formatMoney(next, currency);
  const unchanged =
    next !== null &&
    vigente !== null &&
    vigente.amount === next &&
    vigente.currency === currency;

  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field) {
      document.getElementById(state.field)?.focus();
    } else {
      errorRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />
      <input
        type="hidden"
        name="expectedPriceId"
        value={expectedPriceId}
        readOnly
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="currency" className={labelClass}>
          Moneda *
        </label>
        <select
          key={state.status === "idle" ? "inicial" : state.requestId}
          id="currency"
          name="currency"
          required
          defaultValue={submitted.currency}
          onChange={(event) => setCurrency(event.target.value)}
          aria-invalid={failed && state.field === "currency" ? true : undefined}
          aria-describedby={
            failed && state.field === "currency" ? "currency-error" : undefined
          }
          className={`${selectClass} sm:w-96`}
        >
          <option value="">Elegí una moneda</option>
          {currencies.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
        {failed && state.field === "currency" ? (
          <p id="currency-error" className={fieldErrorClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="amount" className={labelClass}>
          Monto *
        </label>
        <input
          id="amount"
          name="amount"
          required
          inputMode="decimal"
          autoComplete="off"
          defaultValue={submitted.amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-invalid={failed && state.field === "amount" ? true : undefined}
          aria-describedby={
            failed && state.field === "amount" ? "amount-error" : undefined
          }
          className={`${inputClass} sm:w-48`}
        />
        {failed && state.field === "amount" ? (
          <p id="amount-error" className={fieldErrorClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <p aria-live="polite" aria-atomic="true" className="text-sm">
        {shown ? (
          unchanged ? (
            <>Es el precio vigente: {shown}. No cambia nada.</>
          ) : (
            <>
              Precio nuevo:{" "}
              <span className="font-semibold tabular-nums">{shown}</span>
            </>
          )
        ) : (
          <>Precio vigente: {priceText(vigente)}</>
        )}
      </p>

      <div aria-live="polite" aria-atomic="true">
        {state.status === "unchanged" ? (
          <p className="text-sm">{PRICE_UNCHANGED_NOTICE}</p>
        ) : null}
        {failed && !state.field ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Confirmando…" : "Confirmar precio"}
        </button>
      </div>
    </form>
  );
}
