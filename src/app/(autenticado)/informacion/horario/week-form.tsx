"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import type { Weekday } from "@/modules/knowledge";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { useUnsavedChanges } from "@/app/_components/unsaved-changes";
import { saveWeekAction } from "./actions";
import {
  dayErrorMessage,
  WEEKDAY_LABEL,
  type WeekFormState,
  type WeekFormValues,
} from "./messages";

// El horario semanal se edita y se guarda entero (brief-17.4, D-4): siete grupos, uno por día,
// con dos tramos de hora. Un día con los campos vacíos está cerrado. Tras un rechazo, cada campo
// vuelve a lo enviado y el foco va al primer día inválido.

const initialState: WeekFormState = { status: "idle" };

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

const INPUTS = [
  { suffix: "o1", label: "Abre" },
  { suffix: "c1", label: "Cierra" },
  { suffix: "o2", label: "Segundo tramo, abre" },
  { suffix: "c2", label: "Segundo tramo, cierra" },
] as const;

export function WeekForm({ values }: { values: WeekFormValues }) {
  const [state, formAction, pending] = useActionState(
    saveWeekAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useUnsavedChanges();
  const failed = state.status === "error";
  const shown = failed ? state.values : values;

  useEffect(() => {
    if (state.status !== "error") return;
    const first = state.fields[0];
    if (first) {
      document.getElementById(`d${first.slice(3)}o1`)?.focus();
    } else {
      errorRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4" ref={formRef}>
      <p className="text-sm text-muted">
        Dejá un día vacío si está cerrado. El segundo tramo es para el horario
        cortado.
      </p>
      {DAYS.map((weekday) => {
        const invalid = failed && state.fields.includes(`day${weekday}`);
        const errorId = `d${weekday}-error`;
        return (
          <div
            key={weekday}
            className={weekday === 1 ? "" : "border-t border-border pt-4"}
          >
            <fieldset
              aria-describedby={invalid ? errorId : undefined}
              className="flex flex-col gap-3"
            >
              <legend className="mb-3 font-semibold">
                {WEEKDAY_LABEL[weekday]}
              </legend>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {INPUTS.map((input) => {
                  const id = `d${weekday}${input.suffix}`;
                  return (
                    <div key={id} className="flex flex-col gap-1">
                      <label htmlFor={id} className={labelClass}>
                        {input.label}
                      </label>
                      <input
                        id={id}
                        name={id}
                        type="time"
                        step={60}
                        defaultValue={shown[id] ?? ""}
                        aria-invalid={invalid ? true : undefined}
                        className={inputClass}
                      />
                    </div>
                  );
                })}
              </div>
              {invalid ? (
                <p id={errorId} className={fieldErrorClass}>
                  {dayErrorMessage(weekday)}
                </p>
              ) : null}
            </fieldset>
          </div>
        );
      })}

      <div aria-live="polite" aria-atomic="true">
        {failed && state.message ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/informacion/horario" className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando…" : "Guardar horario"}
        </button>
      </div>
    </form>
  );
}
