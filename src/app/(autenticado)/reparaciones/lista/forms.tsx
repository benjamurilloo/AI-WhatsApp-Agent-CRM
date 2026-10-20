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
  createRepairTypeAction,
  moveRepairTypeAction,
  renameRepairTypeAction,
  setRepairPriceAction,
  setRepairTypeActiveAction,
} from "../actions";
import type { ChangeState, FormState } from "../messages";

// Formularios de la lista de reparaciones (brief-29.6, D-2 y D-10), con el molde de los grados.
// Funcionan sin JavaScript; cada uno conserva lo escrito tras un rechazo y lleva el foco al campo
// inválido o al mensaje general. Cada uno lleva el modelo que se está mirando, para volver a él.

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

export function RepairTypeForm({
  mode,
  repairTypeId,
  name = "",
  modelId,
  cancelHref,
}: {
  mode: "crear" | "editar";
  repairTypeId?: string;
  name?: string;
  modelId: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createRepairTypeAction : renameRepairTypeAction,
    idle,
  );
  const id = mode === "crear" ? "nuevo-tipo-name" : `tipo-${repairTypeId}-name`;
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field) document.getElementById(id)?.focus();
    else errorRef.current?.focus();
  }, [state, id]);
  const error =
    state.status === "error" && state.field === "name" ? state.message : null;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {repairTypeId ? (
        <input type="hidden" name="repairTypeId" value={repairTypeId} />
      ) : null}
      <input type="hidden" name="modelId" value={modelId} />
      <div className="flex max-w-md flex-col gap-1">
        <label htmlFor={id} className={labelClass}>
          Nombre *
        </label>
        <input
          id={id}
          name="name"
          required
          maxLength={60}
          defaultValue={
            state.status === "error" ? (state.values.name ?? name) : name
          }
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
              ? "Crear tipo"
              : "Guardar cambios"}
        </button>
        {mode === "editar" ? (
          <Link href={cancelHref} className={secondaryLinkClass}>
            Cancelar
          </Link>
        ) : null}
      </div>
    </form>
  );
}

// Desactivar o reactivar: un botón, sin confirmación, porque se deshace con el contrario y no toca las
// órdenes.
export function RepairTypeActiveForm({
  repairTypeId,
  name,
  isActive,
  modelId,
}: {
  repairTypeId: string;
  name: string;
  isActive: boolean;
  modelId: string;
}) {
  const [state, formAction, pending] = useActionState(
    setRepairTypeActiveAction,
    idleChange,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="repairTypeId" value={repairTypeId} />
      <input type="hidden" name="modelId" value={modelId} />
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
          <span className="sr-only"> el tipo {name}</span>
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}

export function RepairTypeMoveForm({
  repairTypeId,
  name,
  first,
  last,
  modelId,
}: {
  repairTypeId: string;
  name: string;
  first: boolean;
  last: boolean;
  modelId: string;
}) {
  const [state, formAction, pending] = useActionState(
    moveRepairTypeAction,
    idleChange,
  );
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="repairTypeId" value={repairTypeId} />
      <input type="hidden" name="modelId" value={modelId} />
      <div className="flex gap-1">
        <button
          type="submit"
          name="direction"
          value="up"
          disabled={pending || first}
          className={secondaryButtonClass}
        >
          <span aria-hidden="true">↑</span>
          <span className="sr-only">Subir el tipo {name}</span>
        </button>
        <button
          type="submit"
          name="direction"
          value="down"
          disabled={pending || last}
          className={secondaryButtonClass}
        >
          <span aria-hidden="true">↓</span>
          <span className="sr-only">Bajar el tipo {name}</span>
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}

// El precio de un tipo para un modelo: lo que paga el cliente y lo que cobra el técnico, cada uno en
// su moneda.
export function RepairPriceForm({
  repairTypeId,
  typeName,
  modelId,
  currencies,
  values,
}: {
  repairTypeId: string;
  typeName: string;
  modelId: string;
  currencies: string[];
  values: {
    price: string;
    priceCurrency: string;
    cost: string;
    costCurrency: string;
  };
}) {
  const [state, formAction, pending] = useActionState(
    setRepairPriceAction,
    idle,
  );
  const prefix = `precio-${repairTypeId}`;
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field)
      document.getElementById(`${prefix}-${state.field}`)?.focus();
    else errorRef.current?.focus();
  }, [state, prefix]);
  const value = (name: keyof typeof values) =>
    state.status === "error"
      ? (state.values[name] ?? values[name])
      : values[name];
  const error = state.status === "error" && state.field !== null ? state : null;
  return (
    <form
      action={formAction}
      aria-label={`Precio de ${typeName}`}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="repairTypeId" value={repairTypeId} />
      <input type="hidden" name="modelId" value={modelId} />
      <div className="flex flex-wrap items-end gap-2">
        {(
          [
            ["price", "priceCurrency", "Precio al cliente"],
            ["cost", "costCurrency", "Costo del técnico"],
          ] as const
        ).map(([amount, currency, label]) => (
          <fieldset key={amount} className="flex flex-col gap-1">
            <legend className="text-xs font-semibold text-muted">
              {label}
            </legend>
            <div className="flex gap-1">
              <label htmlFor={`${prefix}-${amount}`} className="sr-only">
                {label} de {typeName}
              </label>
              <input
                id={`${prefix}-${amount}`}
                name={amount}
                inputMode="decimal"
                autoComplete="off"
                required
                defaultValue={value(amount)}
                aria-invalid={error?.field === amount ? true : undefined}
                className={`${inputClass} w-28 tabular-nums`}
              />
              <label htmlFor={`${prefix}-${currency}`} className="sr-only">
                Moneda de {label.toLowerCase()} de {typeName}
              </label>
              <select
                id={`${prefix}-${currency}`}
                name={currency}
                defaultValue={value(currency)}
                aria-invalid={error?.field === currency ? true : undefined}
                className={selectClass}
              >
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
        ))}
        <button
          type="submit"
          disabled={pending}
          className={secondaryButtonClass}
        >
          {pending ? "Guardando…" : "Guardar"}
          <span className="sr-only"> el precio de {typeName}</span>
        </button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "error" ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
