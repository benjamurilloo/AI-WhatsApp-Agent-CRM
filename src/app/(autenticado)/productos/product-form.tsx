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
import { createProductAction, updateProductAction } from "./actions";
import type { ProductFormState, ProductFormValues } from "./messages";

// Formulario de alta y de edición (wireframes 03 y 04). El stock no se edita acá: se ajusta
// en la pantalla 5. El botón queda deshabilitado mientras responde el servidor (brief-4.4, D-4).

const initialState: ProductFormState = { status: "idle" };

const EMPTY: ProductFormValues = {
  sku: "",
  name: "",
  description: "",
  unit: "unidad",
  reorderPoint: "0",
};

type FieldSpec = {
  name: keyof ProductFormValues;
  label: string;
  required: boolean;
  hint?: string;
};

const FIELDS: FieldSpec[] = [
  { name: "sku", label: "SKU", required: true, hint: "Sin espacios." },
  { name: "name", label: "Nombre", required: true },
  { name: "description", label: "Descripción", required: false },
  { name: "unit", label: "Unidad", required: true },
  {
    name: "reorderPoint",
    label: "Punto de reposición",
    required: true,
    hint: "Debajo de esta cantidad, el producto queda en bajo stock.",
  },
];

export function ProductForm({
  mode,
  productId,
  values = EMPTY,
}: {
  mode: "crear" | "editar";
  productId?: string;
  values?: ProductFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createProductAction : updateProductAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
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
      {productId ? (
        <input type="hidden" name="productId" value={productId} />
      ) : null}

      {FIELDS.map((field) => {
        const invalid = failed && state.field === field.name;
        const hintId = field.hint ? `${field.name}-ayuda` : undefined;
        const errorId = invalid ? `${field.name}-error` : undefined;
        return (
          <div key={field.name} className="flex flex-col gap-1">
            <label htmlFor={field.name} className={labelClass}>
              {field.label}
              {field.required ? " *" : ""}
            </label>
            <input
              id={field.name}
              name={field.name}
              required={field.required}
              defaultValue={shown[field.name]}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={
                [errorId, hintId].filter(Boolean).join(" ") || undefined
              }
              className={inputClass}
            />
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

      <p className="text-sm text-muted">
        El stock no se edita acá: se ajusta en el historial de movimientos.
      </p>

      <div aria-live="polite" aria-atomic="true">
        {failed && !state.field ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Link
          href={productId ? `/productos/${productId}` : "/productos"}
          className={secondaryLinkClass}
        >
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending
            ? "Guardando…"
            : mode === "crear"
              ? "Crear producto"
              : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
