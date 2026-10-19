"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  radioClass,
} from "@/app/_components/form-styles";
import { updateExchangeSettingsAction } from "./actions";
import {
  AUTOMATIC_SOURCE_TEXT,
  BACK_TO_AUTOMATIC_TEXT,
  MANUAL_SOURCE_TEXT,
  type SettingsFormState,
} from "./messages";

// La fuente y el ajuste de la cotización (ADR 0025, punto 4; brief-29.4.2, D-9). Solo para un admin
// de una organización con USD y ARS. Con la fuente en manual, avisa que volver a la automática hace
// que la próxima lectura reemplace a la vigente (D-5), y el aviso de después de guardar lo repite.
// Funciona sin JavaScript.

const initialState: SettingsFormState = { status: "idle" };

export function SettingsForm({
  source,
  adjustment,
  quoteCurrency,
}: {
  source: string;
  // Como se escribe: «10», «-5,50».
  adjustment: string;
  quoteCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateExchangeSettingsAction,
    initialState,
  );
  const messageRef = useRef<HTMLParagraphElement>(null);
  const shown = state.status === "idle" ? { source, adjustment } : state.values;
  const invalidAdjustment =
    state.status === "error" && state.field === "adjustment";

  useEffect(() => {
    if (state.status !== "idle") messageRef.current?.focus();
  }, [state]);

  return (
    <form
      key={state.status === "idle" ? "fuente" : state.requestId}
      action={formAction}
      className="flex flex-col gap-4"
    >
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" ? (
          <p
            ref={messageRef}
            tabIndex={-1}
            id="fuente-error"
            className={formMessageClass}
          >
            {state.message}
          </p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Fuente</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="source"
            value="dolarapi_blue"
            defaultChecked={shown.source === "dolarapi_blue"}
            className={radioClass}
          />
          {AUTOMATIC_SOURCE_TEXT}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="source"
            value="manual"
            defaultChecked={shown.source === "manual"}
            className={radioClass}
          />
          {MANUAL_SOURCE_TEXT}
        </label>
        {source === "manual" ? (
          <p className="text-sm text-muted">{BACK_TO_AUTOMATIC_TEXT}</p>
        ) : null}
      </fieldset>

      <div className="flex max-w-xs flex-col gap-1">
        <label htmlFor="fuente-ajuste" className={labelClass}>
          Ajuste en {quoteCurrency} *
        </label>
        <input
          id="fuente-ajuste"
          name="adjustment"
          type="text"
          inputMode="decimal"
          required
          autoComplete="off"
          defaultValue={shown.adjustment}
          aria-invalid={invalidAdjustment ? true : undefined}
          aria-describedby={
            invalidAdjustment
              ? "fuente-ajuste-ayuda fuente-error"
              : "fuente-ajuste-ayuda"
          }
          className={`${inputClass} tabular-nums`}
        />
        <p id="fuente-ajuste-ayuda" className="text-sm text-muted">
          Con coma decimal, y un signo menos si resta: 10 o -5,50.
        </p>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando…" : "Guardar fuente y ajuste"}
        </button>
      </div>
    </form>
  );
}
