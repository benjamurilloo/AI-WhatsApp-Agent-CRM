"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
} from "@/app/_components/form-styles";
import type { WarrantySettingsState } from "./settings-state";

// Los días de garantía de la organización (brief-29.9, D-1). Funciona sin JavaScript; conserva lo
// escrito tras un rechazo y lleva el foco al campo o al mensaje general. Guardar apaga la marca de
// ejemplo del perfil.

const idle: WarrantySettingsState = { status: "idle" };

export function WarrantySettingsForm({
  action,
  prefix,
  warrantyDays,
  hint,
}: {
  action: (
    previous: WarrantySettingsState,
    formData: FormData,
  ) => Promise<WarrantySettingsState>;
  prefix: string;
  warrantyDays: string;
  hint: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const id = `${prefix}-warrantyDays`;
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field) document.getElementById(id)?.focus();
    else errorRef.current?.focus();
  }, [state, id]);
  const fieldError =
    state.status === "error" && state.field === "warrantyDays"
      ? state.message
      : null;
  const describedBy = [`${id}-ayuda`, fieldError ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex max-w-xs flex-col gap-1">
        <label htmlFor={id} className={labelClass}>
          Días de garantía *
        </label>
        <input
          id={id}
          name="warrantyDays"
          required
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          defaultValue={
            state.status === "error" ? state.values.warrantyDays : warrantyDays
          }
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={describedBy}
          className={inputClass}
        />
        <p id={`${id}-ayuda`} className="text-sm text-muted">
          {hint}
        </p>
        {fieldError ? (
          <p id={`${id}-error`} className={fieldErrorClass}>
            {fieldError}
          </p>
        ) : null}
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
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
