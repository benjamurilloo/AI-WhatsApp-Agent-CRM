"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { createClientAction, updateClientAction } from "./actions";
import {
  NOTES_HINT,
  PHONE_HINT,
  type ClientFormState,
  type ClientFormValues,
} from "./messages";

// Formulario de alta y de edición (wireframe 07). Solo lo recibe un admin, así que el teléfono
// completo que precarga nunca llega a un viewer. El botón queda deshabilitado mientras responde.

const initialState: ClientFormState = { status: "idle" };

const EMPTY: ClientFormValues = { displayName: "", phone: "", notes: "" };

type FieldSpec = {
  name: keyof ClientFormValues;
  label: string;
  required: boolean;
  hint?: string;
  multiline?: boolean;
  type?: "text" | "tel";
};

const FIELDS: FieldSpec[] = [
  { name: "displayName", label: "Nombre", required: true },
  {
    name: "phone",
    label: "Teléfono",
    required: false,
    hint: PHONE_HINT,
    type: "tel",
  },
  {
    name: "notes",
    label: "Notas",
    required: false,
    hint: NOTES_HINT,
    multiline: true,
  },
];

export function ClientForm({
  mode,
  clientId,
  values = EMPTY,
}: {
  mode: "crear" | "editar";
  clientId?: string;
  values?: ClientFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createClientAction : updateClientAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  // Tras un rechazo, React reinicia el formulario a estos valores: lo escrito se conserva.
  const shown = failed ? state.values : values;

  // El foco va al primer campo inválido, o al mensaje general (Screens.md, reglas comunes).
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field) {
      document.getElementById(state.field)?.focus();
    } else {
      errorRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {clientId ? (
        <input type="hidden" name="clientId" value={clientId} />
      ) : null}

      {FIELDS.map((field) => {
        const invalid = failed && state.field === field.name;
        const hintId = field.hint ? `${field.name}-ayuda` : undefined;
        const errorId = invalid ? `${field.name}-error` : undefined;
        const common = {
          id: field.name,
          name: field.name,
          required: field.required,
          defaultValue: shown[field.name],
          "aria-invalid": invalid ? true : undefined,
          "aria-describedby":
            [errorId, hintId].filter(Boolean).join(" ") || undefined,
          className: inputClass,
        };
        return (
          <div key={field.name} className="flex flex-col gap-1">
            <label htmlFor={field.name} className={labelClass}>
              {field.label}
              {field.required ? " *" : ""}
            </label>
            {field.multiline ? (
              <textarea {...common} rows={4} />
            ) : (
              <input
                {...common}
                type={field.type ?? "text"}
                autoComplete="off"
              />
            )}
            {field.hint ? (
              <p id={hintId} className="text-sm text-muted">
                {field.hint}
              </p>
            ) : null}
            {invalid ? (
              <p id={errorId} className={fieldErrorClass}>
                {state.message}
              </p>
            ) : null}
          </div>
        );
      })}

      <div aria-live="polite" aria-atomic="true">
        {failed && !state.field ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Link
          href={clientId ? `/clientes/${clientId}` : "/clientes"}
          className={secondaryLinkClass}
        >
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending
            ? "Guardando…"
            : mode === "crear"
              ? "Crear cliente"
              : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
