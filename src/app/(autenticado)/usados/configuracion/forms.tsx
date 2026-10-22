"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/app/_components/form-styles";
import { setTradeInMarginAction, updateQuoteSettingsAction } from "../actions";
import type { FormState } from "../messages";

// Formularios de la configuración de la cotización (brief-29.7.3, D-1, D-2 y D-5), con el molde del
// checklist. Funcionan sin JavaScript; cada uno conserva lo escrito tras un rechazo y lleva el foco al
// campo inválido o al mensaje general.

const idle: FormState = { status: "idle" };

type Option = { id: string; name: string; isActive: boolean };

function useFocusOnError(state: FormState, prefix: string) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field)
      document.getElementById(`${prefix}-${state.field}`)?.focus();
    else errorRef.current?.focus();
  }, [state, prefix]);
  return errorRef;
}

function FieldError({
  state,
  field,
  id,
}: {
  state: FormState;
  field: string;
  id: string;
}) {
  return state.status === "error" && state.field === field ? (
    <p id={`${id}-error`} className={fieldErrorClass}>
      {state.message}
    </p>
  ) : null;
}

function invalid(state: FormState, field: string, id: string) {
  return state.status === "error" && state.field === field
    ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` }
    : {};
}

export function QuoteSettingsForm({
  values,
  repairTypes,
  currencies,
}: {
  values: {
    batteryThreshold: string;
    rangePercent: string;
    roundingStep: string;
    roundingCurrency: string;
    batteryRepairTypeId: string;
  };
  // Null sin repairs: no hay reparación de la batería que elegir.
  repairTypes: Option[] | null;
  currencies: string[];
}) {
  const [state, formAction, pending] = useActionState(
    updateQuoteSettingsAction,
    idle,
  );
  const prefix = "valores";
  const errorRef = useFocusOnError(state, prefix);
  const value = (name: keyof typeof values) =>
    state.status === "error"
      ? (state.values[name] ?? values[name])
      : values[name];
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${prefix}-batteryThreshold`} className={labelClass}>
            Umbral de batería (%) *
          </label>
          <input
            id={`${prefix}-batteryThreshold`}
            name="batteryThreshold"
            inputMode="numeric"
            required
            defaultValue={value("batteryThreshold")}
            className={inputClass}
            {...invalid(
              state,
              "batteryThreshold",
              `${prefix}-batteryThreshold`,
            )}
          />
          <p className="text-sm text-muted">
            Con la batería por debajo, la cotización descuenta su cambio.
          </p>
          <FieldError
            state={state}
            field="batteryThreshold"
            id={`${prefix}-batteryThreshold`}
          />
        </div>
        {repairTypes ? (
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${prefix}-batteryRepairTypeId`}
              className={labelClass}
            >
              Reparación de la batería
            </label>
            <select
              id={`${prefix}-batteryRepairTypeId`}
              name="batteryRepairTypeId"
              defaultValue={value("batteryRepairTypeId")}
              className={selectClass}
              {...invalid(
                state,
                "batteryRepairTypeId",
                `${prefix}-batteryRepairTypeId`,
              )}
            >
              <option value="">Ninguna</option>
              {repairTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.isActive ? type.name : `${type.name} (inactiva)`}
                </option>
              ))}
            </select>
            <FieldError
              state={state}
              field="batteryRepairTypeId"
              id={`${prefix}-batteryRepairTypeId`}
            />
          </div>
        ) : (
          <input type="hidden" name="batteryRepairTypeId" value="" />
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${prefix}-rangePercent`} className={labelClass}>
            Porcentaje del rango (%) *
          </label>
          <input
            id={`${prefix}-rangePercent`}
            name="rangePercent"
            inputMode="decimal"
            required
            defaultValue={value("rangePercent")}
            className={inputClass}
            {...invalid(state, "rangePercent", `${prefix}-rangePercent`)}
          />
          <p className="text-sm text-muted">
            El rango va del valor al valor menos este porcentaje.
          </p>
          <FieldError
            state={state}
            field="rangePercent"
            id={`${prefix}-rangePercent`}
          />
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${prefix}-roundingStep`} className={labelClass}>
              Redondeo *
            </label>
            <input
              id={`${prefix}-roundingStep`}
              name="roundingStep"
              inputMode="decimal"
              required
              defaultValue={value("roundingStep")}
              className={`${inputClass} max-w-32`}
              {...invalid(state, "roundingStep", `${prefix}-roundingStep`)}
            />
            <FieldError
              state={state}
              field="roundingStep"
              id={`${prefix}-roundingStep`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${prefix}-roundingCurrency`}
              className={labelClass}
            >
              Moneda *
            </label>
            <select
              id={`${prefix}-roundingCurrency`}
              name="roundingCurrency"
              defaultValue={value("roundingCurrency")}
              className={selectClass}
              {...invalid(
                state,
                "roundingCurrency",
                `${prefix}-roundingCurrency`,
              )}
            >
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
            <FieldError
              state={state}
              field="roundingCurrency"
              id={`${prefix}-roundingCurrency`}
            />
          </div>
          <p className="basis-full text-sm text-muted">
            Los dos extremos se redondean hacia abajo a un múltiplo de este
            monto. Va en la moneda de los precios: con otra, no hay cotización.
          </p>
        </div>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" && state.field === null ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando…" : "Guardar los valores"}
        </button>
      </div>
    </form>
  );
}

export function MarginForm({
  modelId,
  modelName,
  amount,
  currency,
  currencies,
}: {
  modelId: string;
  modelName: string;
  amount: string;
  currency: string;
  currencies: string[];
}) {
  const [state, formAction, pending] = useActionState(
    setTradeInMarginAction,
    idle,
  );
  const prefix = `margen-${modelId}`;
  const errorRef = useFocusOnError(state, prefix);
  const value = (name: "amount" | "currency", fallback: string) =>
    state.status === "error" ? (state.values[name] ?? fallback) : fallback;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="modelId" value={modelId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${prefix}-amount`} className={labelClass}>
            Margen<span className="sr-only"> de {modelName}</span>
          </label>
          <input
            id={`${prefix}-amount`}
            name="amount"
            inputMode="decimal"
            required
            defaultValue={value("amount", amount)}
            className={`${inputClass} max-w-32`}
            {...invalid(state, "amount", `${prefix}-amount`)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${prefix}-currency`} className={labelClass}>
            Moneda<span className="sr-only"> del margen de {modelName}</span>
          </label>
          <select
            id={`${prefix}-currency`}
            name="currency"
            defaultValue={value("currency", currency)}
            className={selectClass}
            {...invalid(state, "currency", `${prefix}-currency`)}
          >
            {currencies.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando…" : "Guardar"}
          <span className="sr-only"> el margen de {modelName}</span>
        </button>
      </div>
      <FieldError state={state} field="amount" id={`${prefix}-amount`} />
      <FieldError state={state} field="currency" id={`${prefix}-currency`} />
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" && state.field === null ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
