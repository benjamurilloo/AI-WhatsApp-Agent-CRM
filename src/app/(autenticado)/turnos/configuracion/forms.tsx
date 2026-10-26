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
  selectClass,
} from "@/app/_components/form-styles";
import {
  createAppointmentReasonAction,
  moveAppointmentReasonAction,
  renameAppointmentReasonAction,
  saveAppointmentSettingsAction,
  setAppointmentReasonActiveAction,
} from "../actions";
import type { ChangeState, FormState } from "../messages";

// Formularios de la configuración de los turnos (brief-29.10, D-4 y D-5), con el molde del checklist de
// usados. Funcionan sin JavaScript; cada uno conserva lo escrito tras un rechazo y lleva el foco al
// campo inválido o al mensaje general.

const idle: FormState = { status: "idle" };
const idleChange: ChangeState = { status: "idle" };

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

export function AppointmentSettingsForm({
  slotMinutes,
  capacity,
  options,
  maxCapacity,
}: {
  slotMinutes: number | null;
  capacity: number | null;
  options: readonly number[];
  maxCapacity: number;
}) {
  const [state, formAction, pending] = useActionState(
    saveAppointmentSettingsAction,
    idle,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    const target = { slotMinutes: "duracion", capacity: "cupo" }[
      state.field ?? ""
    ];
    if (target) document.getElementById(target)?.focus();
    else errorRef.current?.focus();
  }, [state]);
  const failed = state.status === "error" ? state : null;
  const fieldError = (name: string) =>
    failed && failed.field === name ? failed.message : null;
  const minutesError = fieldError("slotMinutes");
  const capacityError = fieldError("capacity");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="duracion" className={labelClass}>
            Duración de una franja *
          </label>
          <select
            id="duracion"
            name="slotMinutes"
            required
            defaultValue={
              failed?.values.slotMinutes ??
              (slotMinutes === null ? "" : String(slotMinutes))
            }
            aria-invalid={minutesError ? true : undefined}
            aria-describedby={minutesError ? "duracion-error" : undefined}
            className={selectClass}
          >
            <option value="">Elegí una duración</option>
            {options.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutos
              </option>
            ))}
          </select>
          {minutesError ? (
            <p id="duracion-error" className={fieldErrorClass}>
              {minutesError}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="cupo" className={labelClass}>
            Turnos por franja *
          </label>
          <input
            id="cupo"
            name="capacity"
            type="number"
            required
            min={1}
            max={maxCapacity}
            step={1}
            defaultValue={
              failed?.values.capacity ??
              (capacity === null ? "" : String(capacity))
            }
            aria-invalid={capacityError ? true : undefined}
            aria-describedby={capacityError ? "cupo-error" : "cupo-ayuda"}
            className={inputClass}
          />
          {capacityError ? (
            <p id="cupo-error" className={fieldErrorClass}>
              {capacityError}
            </p>
          ) : (
            <p id="cupo-ayuda" className="text-sm text-muted">
              Cuántas personas se atienden a la vez.
            </p>
          )}
        </div>
      </div>
      <p className="text-sm text-muted">
        Cambiar la duración o el cupo no mueve ni cancela los turnos ya dados:
        el calendario marca los que quedan fuera.
      </p>
      <div aria-live="polite" aria-atomic="true">
        {failed && failed.field === null ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {failed.message}
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

export function ReasonForm({
  mode,
  reasonId,
  name = "",
  maxLength,
}: {
  mode: "crear" | "editar";
  reasonId?: string;
  name?: string;
  maxLength: number;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear"
      ? createAppointmentReasonAction
      : renameAppointmentReasonAction,
    idle,
  );
  const id = mode === "crear" ? "nuevo-motivo" : `motivo-${reasonId}`;
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field) document.getElementById(`${id}-name`)?.focus();
    else errorRef.current?.focus();
  }, [state, id]);
  const error =
    state.status === "error" && state.field === "name" ? state.message : null;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {reasonId ? (
        <input type="hidden" name="reasonId" value={reasonId} />
      ) : null}
      <div className="flex max-w-md flex-col gap-1">
        <label htmlFor={`${id}-name`} className={labelClass}>
          Nombre *
        </label>
        <input
          id={`${id}-name`}
          name="name"
          required
          maxLength={maxLength}
          defaultValue={
            state.status === "error" ? (state.values.name ?? name) : name
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-name-error` : undefined}
          className={inputClass}
        />
        {error ? (
          <p id={`${id}-name-error`} className={fieldErrorClass}>
            {error}
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
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending
            ? "Guardando…"
            : mode === "crear"
              ? "Agregar el motivo"
              : "Guardar cambios"}
        </button>
        {mode === "editar" ? (
          <Link href="/turnos/configuracion" className={secondaryLinkClass}>
            Cancelar
          </Link>
        ) : null}
      </div>
    </form>
  );
}

// Desactivar o reactivar: un botón, sin confirmación, porque se deshace con el contrario y no toca los
// turnos.
export function ReasonActiveForm({
  reasonId,
  name,
  isActive,
}: {
  reasonId: string;
  name: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    setAppointmentReasonActiveAction,
    idleChange,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="reasonId" value={reasonId} />
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
          <span className="sr-only"> el motivo {name}</span>
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}

export function ReasonMoveForm({
  reasonId,
  name,
  first,
  last,
}: {
  reasonId: string;
  name: string;
  first: boolean;
  last: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    moveAppointmentReasonAction,
    idleChange,
  );
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="reasonId" value={reasonId} />
      <div className="flex gap-1">
        <button
          type="submit"
          name="direction"
          value="up"
          disabled={pending || first}
          className={secondaryButtonClass}
        >
          <span aria-hidden="true">↑</span>
          <span className="sr-only">Subir el motivo {name}</span>
        </button>
        <button
          type="submit"
          name="direction"
          value="down"
          disabled={pending || last}
          className={secondaryButtonClass}
        >
          <span aria-hidden="true">↓</span>
          <span className="sr-only">Bajar el motivo {name}</span>
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}
