"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  radioClass,
  secondaryButtonClass,
  secondaryLinkClass,
  selectClass,
} from "@/app/_components/form-styles";
import {
  addOptionAction,
  createAttributeAction,
  createModelAction,
  moveAttributeAction,
  moveModelAction,
  moveOptionAction,
  setAttributeActiveAction,
  setModelActiveAction,
  updateAttributeAction,
  updateModelAction,
  updateOptionAction,
} from "./actions";
import {
  ATTRIBUTE_TYPE_LABEL,
  type ChangeState,
  type FormState,
} from "./messages";

// Formularios de Modelos y Atributos (brief-29.2, D-4 y D-5). Cada uno conserva lo escrito tras un
// rechazo y lleva el foco al campo inválido o al mensaje general (Screens.md, reglas comunes).

const idle: FormState = { status: "idle" };
const idleChange: ChangeState = { status: "idle" };

function useFocusError(state: FormState, prefix: string) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field)
      document.getElementById(`${prefix}-${state.field}`)?.focus();
    else errorRef.current?.focus();
  }, [state, prefix]);
  return errorRef;
}

function Field({
  state,
  prefix,
  name,
  label,
  required,
  hint,
  children,
}: {
  state: FormState;
  prefix: string;
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: (props: {
    id: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}) {
  const id = `${prefix}-${name}`;
  const invalid = state.status === "error" && state.field === name;
  const errorId = invalid ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-ayuda` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required ? " *" : ""}
      </label>
      {children({
        id,
        "aria-invalid": invalid ? true : undefined,
        "aria-describedby":
          [errorId, hintId].filter(Boolean).join(" ") || undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {invalid ? (
        <p id={errorId} className={fieldErrorClass}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function GeneralError({
  state,
  errorRef,
}: {
  state: FormState | ChangeState;
  errorRef: React.RefObject<HTMLParagraphElement | null>;
}) {
  const general =
    state.status === "error" && (!("field" in state) || state.field === null);
  return (
    <div aria-live="polite" aria-atomic="true">
      {general ? (
        <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function value(state: FormState, name: string, fallback: string): string {
  return state.status === "error" ? (state.values[name] ?? fallback) : fallback;
}

export function ModelForm({
  mode,
  modelId,
  values = { name: "", brand: "" },
}: {
  mode: "crear" | "editar";
  modelId?: string;
  values?: { name: string; brand: string };
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createModelAction : updateModelAction,
    idle,
  );
  const prefix = mode === "crear" ? "nuevo-modelo" : "editar-modelo";
  const errorRef = useFocusError(state, prefix);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {modelId ? <input type="hidden" name="modelId" value={modelId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          state={state}
          prefix={prefix}
          name="name"
          label="Nombre"
          required
        >
          {(props) => (
            <input
              {...props}
              name="name"
              required
              maxLength={120}
              defaultValue={value(state, "name", values.name)}
              placeholder="Ej. iPhone 13"
              className={inputClass}
            />
          )}
        </Field>
        <Field state={state} prefix={prefix} name="brand" label="Marca">
          {(props) => (
            <input
              {...props}
              name="brand"
              maxLength={100}
              defaultValue={value(state, "brand", values.brand)}
              placeholder="Ej. Apple"
              className={inputClass}
            />
          )}
        </Field>
      </div>
      <GeneralError state={state} errorRef={errorRef} />
      <div className="flex flex-wrap justify-end gap-3">
        {mode === "editar" && modelId ? (
          <Link href={`/modelos/${modelId}`} className={secondaryLinkClass}>
            Cancelar
          </Link>
        ) : null}
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending
            ? "Guardando…"
            : mode === "crear"
              ? "Crear modelo"
              : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

// Desactivar o reactivar un modelo o un atributo: un botón, sin confirmación, porque se deshace con
// el botón contrario y no toca los productos.
export function ActiveToggleForm({
  kind,
  id,
  name,
  isActive,
}: {
  kind: "model" | "attribute";
  id: string;
  name: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    kind === "model" ? setModelActiveAction : setAttributeActiveAction,
    idleChange,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input
        type="hidden"
        name={kind === "model" ? "modelId" : "definitionId"}
        value={id}
      />
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
          <span className="sr-only"> {name}</span>
        </button>
      </div>
      <GeneralError state={state} errorRef={errorRef} />
    </form>
  );
}

// Subir o bajar un lugar un modelo, un atributo o una opción (revisión independiente, H-2). Los
// botones del primero y del último lugar se deshabilitan.
const MOVE_ACTION = {
  model: { action: moveModelAction, field: "modelId" },
  attribute: { action: moveAttributeAction, field: "definitionId" },
  option: { action: moveOptionAction, field: "optionId" },
} as const;

export function MoveForm({
  kind,
  id,
  name,
  first,
  last,
}: {
  kind: keyof typeof MOVE_ACTION;
  id: string;
  name: string;
  first: boolean;
  last: boolean;
}) {
  const { action, field } = MOVE_ACTION[kind];
  const [state, formAction, pending] = useActionState(action, idleChange);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name={field} value={id} />
      <div className="flex gap-1">
        <button
          type="submit"
          name="direction"
          value="up"
          disabled={pending || first}
          className={secondaryButtonClass}
        >
          <span aria-hidden="true">↑</span>
          <span className="sr-only">Subir {name}</span>
        </button>
        <button
          type="submit"
          name="direction"
          value="down"
          disabled={pending || last}
          className={secondaryButtonClass}
        >
          <span aria-hidden="true">↓</span>
          <span className="sr-only">Bajar {name}</span>
        </button>
      </div>
      <GeneralError state={state} errorRef={errorRef} />
    </form>
  );
}

export function AttributeCreateForm() {
  const [state, formAction, pending] = useActionState(
    createAttributeAction,
    idle,
  );
  const prefix = "nuevo-atributo";
  const errorRef = useFocusError(state, prefix);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          state={state}
          prefix={prefix}
          name="name"
          label="Nombre"
          required
        >
          {(props) => (
            <input
              {...props}
              name="name"
              required
              maxLength={60}
              defaultValue={value(state, "name", "")}
              placeholder="Ej. Origen"
              className={inputClass}
            />
          )}
        </Field>
        <Field
          state={state}
          prefix={prefix}
          name="type"
          label="Tipo de dato"
          required
        >
          {(props) => (
            <select
              {...props}
              name="type"
              defaultValue={value(state, "type", "option")}
              className={selectClass}
            >
              {Object.entries(ATTRIBUTE_TYPE_LABEL).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field
        state={state}
        prefix={prefix}
        name="options"
        label="Opciones"
        hint="Solo para «Lista de opciones»: una por línea."
      >
        {(props) => (
          <textarea
            {...props}
            name="options"
            rows={4}
            defaultValue={value(state, "options", "")}
            className={inputClass}
          />
        )}
      </Field>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isRequired"
            value="1"
            defaultChecked={value(state, "isRequired", "") === "1"}
            className={radioClass}
          />
          Obligatorio en un producto con modelo
        </label>
        <label
          className="flex items-center gap-2"
          htmlFor={`${prefix}-isVariant`}
        >
          <input
            id={`${prefix}-isVariant`}
            type="checkbox"
            name="isVariant"
            value="1"
            defaultChecked={value(state, "isVariant", "") === "1"}
            aria-describedby={`${prefix}-isVariant-ayuda`}
            className={radioClass}
          />
          De variante
        </label>
        <p id={`${prefix}-isVariant-ayuda`} className="text-sm text-muted">
          Distingue las combinaciones de un modelo, como la capacidad o el
          color. Es obligatorio y de opciones.
        </p>
        {state.status === "error" && state.field === "isVariant" ? (
          <p className={fieldErrorClass}>{state.message}</p>
        ) : null}
      </div>
      <GeneralError state={state} errorRef={errorRef} />
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando…" : "Crear atributo"}
        </button>
      </div>
    </form>
  );
}

export function AttributeEditForm({
  definitionId,
  name,
  isRequired,
  isVariant,
}: {
  definitionId: string;
  name: string;
  isRequired: boolean;
  isVariant: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateAttributeAction,
    idle,
  );
  const prefix = `atributo-${definitionId}`;
  const errorRef = useFocusError(state, prefix);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="definitionId" value={definitionId} />
      <Field state={state} prefix={prefix} name="name" label="Nombre" required>
        {(props) => (
          <input
            {...props}
            name="name"
            required
            maxLength={60}
            defaultValue={value(state, "name", name)}
            className={inputClass}
          />
        )}
      </Field>
      {isVariant ? null : (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isRequired"
            value="1"
            defaultChecked={isRequired}
            className={radioClass}
          />
          Obligatorio en un producto con modelo
        </label>
      )}
      {isVariant ? <input type="hidden" name="isRequired" value="1" /> : null}
      <GeneralError state={state} errorRef={errorRef} />
      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/modelos/atributos" className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

export function OptionAddForm({
  definitionId,
  definitionName,
}: {
  definitionId: string;
  definitionName: string;
}) {
  const [state, formAction, pending] = useActionState(addOptionAction, idle);
  const prefix = `opcion-nueva-${definitionId}`;
  const errorRef = useFocusError(state, prefix);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="definitionId" value={definitionId} />
      <div className="flex flex-wrap items-end gap-3">
        <Field
          state={state}
          prefix={prefix}
          name="label"
          label={`Nueva opción de ${definitionName}`}
        >
          {(props) => (
            <input
              {...props}
              name="label"
              required
              maxLength={60}
              defaultValue={value(state, "label", "")}
              className={inputClass}
            />
          )}
        </Field>
        <button
          type="submit"
          disabled={pending}
          className={secondaryButtonClass}
        >
          {pending ? "Agregando…" : "Agregar"}
        </button>
      </div>
      <GeneralError state={state} errorRef={errorRef} />
    </form>
  );
}

export function OptionEditForm({
  optionId,
  label,
  isActive,
}: {
  optionId: string;
  label: string;
  isActive: boolean;
}) {
  const [renameState, renameAction, renaming] = useActionState(
    updateOptionAction,
    idle,
  );
  const [toggleState, toggleAction, toggling] = useActionState(
    updateOptionAction,
    idle,
  );
  const prefix = `opcion-${optionId}`;
  const errorRef = useFocusError(renameState, prefix);
  const toggleErrorRef = useRef<HTMLParagraphElement>(null);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form action={renameAction} className="flex flex-col gap-2">
        <input type="hidden" name="optionId" value={optionId} />
        <div className="flex flex-wrap items-end gap-2">
          <Field
            state={renameState}
            prefix={prefix}
            name="label"
            label="Opción"
          >
            {(props) => (
              <input
                {...props}
                name="label"
                required
                maxLength={60}
                defaultValue={value(renameState, "label", label)}
                className={inputClass}
              />
            )}
          </Field>
          <button
            type="submit"
            disabled={renaming}
            className={secondaryButtonClass}
          >
            {renaming ? "Guardando…" : "Renombrar"}
            <span className="sr-only"> {label}</span>
          </button>
        </div>
        <GeneralError state={renameState} errorRef={errorRef} />
      </form>
      <form action={toggleAction} className="flex flex-col gap-2">
        <input type="hidden" name="optionId" value={optionId} />
        <input type="hidden" name="label" value={label} />
        <input type="hidden" name="isActive" value={isActive ? "0" : "1"} />
        <button
          type="submit"
          disabled={toggling}
          className={secondaryButtonClass}
        >
          {toggling
            ? isActive
              ? "Desactivando…"
              : "Reactivando…"
            : isActive
              ? "Desactivar"
              : "Reactivar"}
          <span className="sr-only"> {label}</span>
        </button>
        <GeneralError state={toggleState} errorRef={toggleErrorRef} />
      </form>
    </div>
  );
}
