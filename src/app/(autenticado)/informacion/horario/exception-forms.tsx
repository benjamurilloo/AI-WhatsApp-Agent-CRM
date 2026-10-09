"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { addExceptionAction, removeExceptionAction } from "./actions";
import type {
  ExceptionFormState,
  ExceptionFormValues,
  HoursChangeState,
} from "./messages";

// Alta y baja de un día especial (brief-17.4, D-2 y D-4): una fecha cerrada o con sus propios
// tramos, y un motivo opcional. Se crea y se quita; no se edita.

const EMPTY: ExceptionFormValues = {
  date: "",
  opens1: "",
  closes1: "",
  opens2: "",
  closes2: "",
  reason: "",
};

const initialForm: ExceptionFormState = { status: "idle" };

const TIMES = [
  { name: "opens1", label: "Abre" },
  { name: "closes1", label: "Cierra" },
  { name: "opens2", label: "Segundo tramo, abre" },
  { name: "closes2", label: "Segundo tramo, cierra" },
] as const;

export function AddExceptionForm() {
  const [state, formAction, pending] = useActionState(
    addExceptionAction,
    initialForm,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const shown = failed ? state.values : EMPTY;

  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field === "slots") document.getElementById("opens1")?.focus();
    else if (state.field) document.getElementById(state.field)?.focus();
    else errorRef.current?.focus();
  }, [state]);

  function error(field: "date" | "slots" | "reason") {
    return failed && state.field === field ? (
      <p id={`${field}-error`} className={fieldErrorClass}>
        {state.message}
      </p>
    ) : null;
  }

  const slotsInvalid = failed && state.field === "slots";

  return (
    <form
      action={formAction}
      aria-labelledby="agregar-dia-titulo"
      className="flex flex-col gap-4"
    >
      <h3 id="agregar-dia-titulo" className="font-semibold">
        Agregar un día especial
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="date" className={labelClass}>
            Fecha *
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={shown.date}
            aria-invalid={failed && state.field === "date" ? true : undefined}
            aria-describedby={
              failed && state.field === "date" ? "date-error" : undefined
            }
            className={inputClass}
          />
          {error("date")}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="reason" className={labelClass}>
            Motivo
          </label>
          <input
            id="reason"
            name="reason"
            type="text"
            maxLength={100}
            placeholder="Ej. Feriado"
            defaultValue={shown.reason}
            aria-invalid={failed && state.field === "reason" ? true : undefined}
            aria-describedby={
              failed && state.field === "reason" ? "reason-error" : undefined
            }
            className={inputClass}
          />
          {error("reason")}
        </div>
      </div>
      <fieldset
        aria-describedby={`tramos-ayuda${slotsInvalid ? " slots-error" : ""}`}
        className="flex flex-col gap-3"
      >
        <legend className="mb-1 text-sm font-semibold">
          Horario de ese día
        </legend>
        <p id="tramos-ayuda" className="text-sm text-muted">
          Vacío: cerrado todo el día.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {TIMES.map((input) => (
            <div key={input.name} className="flex flex-col gap-1">
              <label htmlFor={input.name} className={labelClass}>
                {input.label}
              </label>
              <input
                id={input.name}
                name={input.name}
                type="time"
                step={60}
                defaultValue={shown[input.name]}
                aria-invalid={slotsInvalid ? true : undefined}
                className={inputClass}
              />
            </div>
          ))}
        </div>
        {error("slots")}
      </fieldset>

      <div aria-live="polite" aria-atomic="true">
        {failed && !state.field ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Agregando…" : "Agregar día especial"}
        </button>
      </div>
    </form>
  );
}

const initialChange: HoursChangeState = { status: "idle" };

export function RemoveExceptionForm({
  exceptionId,
  label,
}: {
  exceptionId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    removeExceptionAction,
    initialChange,
  );
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") ref.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Quitar ${label}`}
        className={secondaryButtonClass}
      >
        {pending ? "Quitando…" : "Quitar"}
      </button>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" ? (
          <p ref={ref} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
