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
  createChecklistItemAction,
  moveChecklistItemAction,
  setChecklistItemActiveAction,
  setChecklistItemRepairTypeAction,
  updateChecklistItemAction,
} from "../actions";
import type { ChangeState, FormState } from "../messages";

// Formularios del checklist de un usado (brief-29.7, D-3 y D-7), con el molde de la lista de
// reparaciones. Funcionan sin JavaScript; cada uno conserva lo escrito tras un rechazo y lleva el foco
// al campo inválido o al mensaje general.

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

export function ChecklistItemForm({
  mode,
  itemId,
  name = "",
  isMandatory = false,
}: {
  mode: "crear" | "editar";
  itemId?: string;
  name?: string;
  isMandatory?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createChecklistItemAction : updateChecklistItemAction,
    idle,
  );
  const id = mode === "crear" ? "nuevo-punto" : `punto-${itemId}`;
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field) document.getElementById(`${id}-name`)?.focus();
    else errorRef.current?.focus();
  }, [state, id]);
  const error =
    state.status === "error" && state.field === "name" ? state.message : null;
  const mandatory =
    state.status === "error" ? state.values.isMandatory === "1" : isMandatory;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {itemId ? <input type="hidden" name="itemId" value={itemId} /> : null}
      <div className="flex max-w-md flex-col gap-1">
        <label htmlFor={`${id}-name`} className={labelClass}>
          Nombre *
        </label>
        <input
          id={`${id}-name`}
          name="name"
          required
          maxLength={80}
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
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="isMandatory"
          value="1"
          defaultChecked={mandatory}
          className="mt-0.5 size-4"
        />
        <span>
          Obligatorio para aceptar el equipo
          <span className="block text-muted">
            Si no pasa, el equipo no se recibe.
          </span>
        </span>
      </label>
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
              ? "Agregar el punto"
              : "Guardar cambios"}
        </button>
        {mode === "editar" ? (
          <Link href="/usados/checklist" className={secondaryLinkClass}>
            Cancelar
          </Link>
        ) : null}
      </div>
    </form>
  );
}

// Desactivar o reactivar: un botón, sin confirmación, porque se deshace con el contrario y no toca las
// recepciones.
export function ChecklistItemActiveForm({
  itemId,
  name,
  isActive,
}: {
  itemId: string;
  name: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    setChecklistItemActiveAction,
    idleChange,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="itemId" value={itemId} />
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
          <span className="sr-only"> el punto {name}</span>
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}

export function ChecklistItemMoveForm({
  itemId,
  name,
  first,
  last,
}: {
  itemId: string;
  name: string;
  first: boolean;
  last: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    moveChecklistItemAction,
    idleChange,
  );
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex gap-1">
        <button
          type="submit"
          name="direction"
          value="up"
          disabled={pending || first}
          className={secondaryButtonClass}
        >
          <span aria-hidden="true">↑</span>
          <span className="sr-only">Subir el punto {name}</span>
        </button>
        <button
          type="submit"
          name="direction"
          value="down"
          disabled={pending || last}
          className={secondaryButtonClass}
        >
          <span aria-hidden="true">↓</span>
          <span className="sr-only">Bajar el punto {name}</span>
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}

// La reparación que necesita el equipo si el punto no pasa (brief-29.7.3, D-3), para la cotización.
// «Ninguna» la saca: el punto no descuenta nada.
export function ChecklistItemRepairTypeForm({
  itemId,
  name,
  repairTypeId,
  repairTypes,
}: {
  itemId: string;
  name: string;
  repairTypeId: string | null;
  repairTypes: { id: string; name: string; isActive: boolean }[];
}) {
  const [state, formAction, pending] = useActionState(
    setChecklistItemRepairTypeAction,
    idleChange,
  );
  const id = `punto-${itemId}-reparacion`;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className={labelClass}>
            Si no pasa, necesita
            <span className="sr-only"> (punto {name})</span>
          </label>
          <select
            id={id}
            name="repairTypeId"
            defaultValue={repairTypeId ?? ""}
            className={selectClass}
          >
            <option value="">Ninguna reparación</option>
            {repairTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.isActive ? type.name : `${type.name} (inactiva)`}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className={secondaryButtonClass}
        >
          {pending ? "Guardando…" : "Guardar"}
          <span className="sr-only"> la reparación del punto {name}</span>
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}
