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
  TAG_COLOR_LABEL,
  TAG_COLOR_OPTIONS,
  TagChip,
} from "@/app/_components/tag-chip";
import type { TagFormState, TagFormValues } from "../messages";
import { createTagAction, updateTagAction } from "./actions";

// Alta y edición de una etiqueta (brief-16.1, D-4 y D-9): nombre y uno de los seis colores. El
// color es un grupo de radios con la muestra del chip, no un select: tras un rechazo, React
// reinicia el formulario a sus valores por defecto, que son los enviados (brief-11.1, lección del
// select).

const initialState: TagFormState = { status: "idle" };

const EMPTY: TagFormValues = { name: "", color: "gray" };

export function TagForm({
  mode,
  tagId,
  values = EMPTY,
}: {
  mode: "crear" | "editar";
  tagId?: string;
  values?: TagFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createTagAction : updateTagAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const shown = failed ? state.values : values;
  const prefix = mode === "crear" ? "nueva" : "editar";
  const nameId = `${prefix}-name`;
  const nameInvalid = failed && state.field === "name";
  const colorInvalid = failed && state.field === "color";

  // El foco va al campo inválido, o al mensaje general (Screens.md, reglas comunes).
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field === "name") {
      document.getElementById(nameId)?.focus();
    } else if (state.field === "color") {
      document
        .querySelector<HTMLInputElement>(
          `input[name="color"][data-form="${prefix}"]`,
        )
        ?.focus();
    } else {
      errorRef.current?.focus();
    }
  }, [state, nameId, prefix]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {tagId ? <input type="hidden" name="tagId" value={tagId} /> : null}

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
          placeholder="Ej. Interesado"
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

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={colorInvalid ? `${prefix}-color-error` : undefined}
      >
        <legend className={`${labelClass} mb-1`}>Color</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {TAG_COLOR_OPTIONS.map((color) => (
            <label key={color} className="flex items-center gap-2">
              <input
                type="radio"
                name="color"
                value={color}
                data-form={prefix}
                defaultChecked={shown.color === color}
                className={radioClass}
              />
              <TagChip name={TAG_COLOR_LABEL[color]} color={color} />
            </label>
          ))}
        </div>
        {colorInvalid ? (
          <p id={`${prefix}-color-error`} className={fieldErrorClass}>
            {state.message}
          </p>
        ) : null}
      </fieldset>

      <div aria-live="polite" aria-atomic="true">
        {failed && !state.field ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        {mode === "editar" ? (
          <Link href="/clientes/etiquetas" className={secondaryLinkClass}>
            Cancelar
          </Link>
        ) : null}
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending
            ? "Guardando…"
            : mode === "crear"
              ? "Crear etiqueta"
              : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
