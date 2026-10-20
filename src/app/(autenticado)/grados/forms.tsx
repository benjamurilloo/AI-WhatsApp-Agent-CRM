"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import {
  createGradeAction,
  moveGradeAction,
  setGradeActiveAction,
  updateGradeAction,
} from "./actions";
import type { ChangeState, FormState } from "./messages";

// Formularios de los grados (brief-29.5, D-5). Funcionan sin JavaScript; cada uno conserva lo escrito
// tras un rechazo y lleva el foco al campo inválido o al mensaje general.

const idle: FormState = { status: "idle" };
const idleChange: ChangeState = { status: "idle" };

function value(state: FormState, name: string, fallback: string): string {
  return state.status === "error" ? (state.values[name] ?? fallback) : fallback;
}

export function GradeForm({
  mode,
  gradeId,
  values = { name: "", description: "" },
}: {
  mode: "crear" | "editar";
  gradeId?: string;
  values?: { name: string; description: string };
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createGradeAction : updateGradeAction,
    idle,
  );
  const prefix = mode === "crear" ? "nuevo-grado" : `grado-${gradeId}`;
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field)
      document.getElementById(`${prefix}-${state.field}`)?.focus();
    else errorRef.current?.focus();
  }, [state, prefix]);
  const fieldError = (name: string) =>
    state.status === "error" && state.field === name ? state.message : null;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {gradeId ? <input type="hidden" name="gradeId" value={gradeId} /> : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        {(
          [
            { name: "name", label: "Nombre", max: 40, required: true },
            {
              name: "description",
              label: "Descripción",
              max: 120,
              required: false,
            },
          ] as const
        ).map((field) => {
          const id = `${prefix}-${field.name}`;
          const error = fieldError(field.name);
          return (
            <div key={field.name} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={id} className={labelClass}>
                {field.label}
                {field.required ? " *" : ""}
              </label>
              <input
                id={id}
                name={field.name}
                required={field.required}
                maxLength={field.max}
                defaultValue={value(state, field.name, values[field.name])}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={inputClass}
              />
              {error ? (
                <p id={`${id}-error`} className={fieldErrorClass}>
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" && state.field === null ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending
            ? "Guardando…"
            : mode === "crear"
              ? "Crear grado"
              : "Guardar cambios"}
        </button>
        {mode === "editar" ? (
          <Link href="/grados" className={secondaryLinkClass}>
            Cancelar
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function ChangeError({ state }: { state: ChangeState }) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);
  return (
    <div aria-live="polite" aria-atomic="true">
      {state.status === "error" ? (
        <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

// Desactivar o reactivar: un botón, sin confirmación, porque se deshace con el contrario y no toca
// las unidades.
export function GradeActiveForm({
  gradeId,
  name,
  isActive,
}: {
  gradeId: string;
  name: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    setGradeActiveAction,
    idleChange,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="gradeId" value={gradeId} />
      <input type="hidden" name="isActive" value={isActive ? "0" : "1"} />
      <div>
        <button
          type="submit"
          disabled={pending}
          className={secondaryButtonClass}
        >
          {pending
            ? isActive
              ? "Desactivando…"
              : "Reactivando…"
            : isActive
              ? "Desactivar"
              : "Reactivar"}
          <span className="sr-only"> el grado {name}</span>
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}

export function GradeMoveForm({
  gradeId,
  name,
  first,
  last,
}: {
  gradeId: string;
  name: string;
  first: boolean;
  last: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    moveGradeAction,
    idleChange,
  );
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="gradeId" value={gradeId} />
      <div className="flex gap-1">
        <button
          type="submit"
          name="direction"
          value="up"
          disabled={pending || first}
          className={secondaryButtonClass}
        >
          <span aria-hidden="true">↑</span>
          <span className="sr-only">Subir el grado {name}</span>
        </button>
        <button
          type="submit"
          name="direction"
          value="down"
          disabled={pending || last}
          className={secondaryButtonClass}
        >
          <span aria-hidden="true">↓</span>
          <span className="sr-only">Bajar el grado {name}</span>
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}
