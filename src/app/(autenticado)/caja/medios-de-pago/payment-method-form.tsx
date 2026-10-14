"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  radioClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import {
  createPaymentMethodAction,
  renamePaymentMethodAction,
} from "../actions";
import type {
  PaymentMethodFormState,
  PaymentMethodFormValues,
} from "../messages";

// Alta y renombre de un medio de pago (brief-21.2, D-6 y D-10). «Es efectivo» se elige solo al
// crearlo, con dos opciones, y no se edita: un cobro viejo no cambia de caja (ADR 0022, punto 10).

const initialState: PaymentMethodFormState = { status: "idle" };

const EMPTY: PaymentMethodFormValues = { name: "", isCash: false };

export function PaymentMethodForm({
  mode,
  paymentMethodId,
  values = EMPTY,
}: {
  mode: "crear" | "editar";
  paymentMethodId?: string;
  values?: PaymentMethodFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createPaymentMethodAction : renamePaymentMethodAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const shown = failed ? state.values : values;
  const prefix = mode === "crear" ? "nuevo-medio" : "editar-medio";
  const nameId = `${prefix}-nombre`;
  const nameInvalid = failed && state.field === "name";

  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field === "name") document.getElementById(nameId)?.focus();
    else errorRef.current?.focus();
  }, [state, nameId]);

  return (
    <form
      key={failed ? state.requestId : prefix}
      action={formAction}
      className="flex flex-col gap-4"
    >
      {paymentMethodId ? (
        <input type="hidden" name="paymentMethodId" value={paymentMethodId} />
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className={labelClass}>
          Nombre *
        </label>
        <input
          id={nameId}
          name="name"
          type="text"
          required
          maxLength={40}
          defaultValue={shown.name}
          placeholder="Ej. Transferencia"
          aria-invalid={nameInvalid ? true : undefined}
          aria-describedby={
            [nameInvalid ? `${nameId}-error` : null, `${nameId}-ayuda`]
              .filter(Boolean)
              .join(" ") || undefined
          }
          className={inputClass}
        />
        <p id={`${nameId}-ayuda`} className="text-sm text-muted">
          Hasta 40 caracteres. No puede repetirse.
        </p>
        {nameInvalid ? (
          <p id={`${nameId}-error`} className={fieldErrorClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      {mode === "crear" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className={`${labelClass} mb-1`}>¿Es efectivo?</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="isCash"
              value="0"
              defaultChecked={!shown.isCash}
              className={radioClass}
            />
            No: no pasa por la caja
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="isCash"
              value="1"
              defaultChecked={shown.isCash}
              className={radioClass}
            />
            Sí: entra a la caja del efectivo
          </label>
          <p className="text-sm text-muted">
            No se puede cambiar después de crearlo.
          </p>
        </fieldset>
      ) : null}

      <div aria-live="polite" aria-atomic="true">
        {failed && !state.field ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        {mode === "editar" ? (
          <Link href="/caja/medios-de-pago" className={secondaryLinkClass}>
            Cancelar
          </Link>
        ) : null}
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending
            ? "Guardando…"
            : mode === "crear"
              ? "Crear medio de pago"
              : "Guardar nombre"}
        </button>
      </div>
    </form>
  );
}
