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
import { SectionCard } from "@/app/_components/section-card";
import { createProductAction, updateProductAction } from "./actions";
import type { ProductSuggestions } from "@/modules/catalog";
import {
  CONDITION_LABEL,
  type ProductFormState,
  type ProductFormValues,
} from "./messages";

// Formulario de alta y de edición (wireframes 03 y 04). El stock no se edita acá: se ajusta
// en la pantalla 5. El botón queda deshabilitado mientras responde el servidor (brief-4.4, D-4).
// Marca y categoría son texto libre con sugerencias de los valores que ya existen, y la condición
// es una lista cerrada (brief-11.1, D-2 y D-3). Desde la 15.4, los campos van en dos tarjetas;
// el precio y el stock inicial se cargan después, desde el detalle (brief-15.4, D-4).

const initialState: ProductFormState = { status: "idle" };

const EMPTY: ProductFormValues = {
  sku: "",
  name: "",
  description: "",
  unit: "unidad",
  reorderPoint: "0",
  brand: "",
  category: "",
  condition: "new",
};

const NO_SUGGESTIONS: ProductSuggestions = { brands: [], categories: [] };

type FieldSpec = {
  name: keyof ProductFormValues;
  label: string;
  required: boolean;
  hint?: string;
  // Lista de sugerencias del campo, si tiene.
  list?: keyof ProductSuggestions;
  // Lista cerrada: se muestra como select.
  options?: Record<string, string>;
  // Texto largo: se muestra como textarea, a todo el ancho.
  long?: boolean;
  placeholder?: string;
};

// El orden es el del formulario y el del foco al primer error: tiene que coincidir con
// PRODUCT_FIELD_ORDER de messages.ts. Las dos tarjetas lo respetan.

const BASIC_FIELDS: FieldSpec[] = [
  {
    name: "sku",
    label: "SKU",
    required: true,
    hint: "Sin espacios.",
    placeholder: "Ej. DEMO-AUD-001",
  },
  {
    name: "name",
    label: "Nombre",
    required: true,
    placeholder: "Ej. Auriculares inalámbricos",
  },
  { name: "brand", label: "Marca", required: false, list: "brands" },
  { name: "category", label: "Categoría", required: false, list: "categories" },
  {
    name: "condition",
    label: "Condición",
    required: true,
    options: CONDITION_LABEL,
  },
  {
    name: "description",
    label: "Descripción",
    required: false,
    long: true,
    hint: "Hasta 2000 caracteres.",
    placeholder: "Describí las características del producto…",
  },
];

const STOCK_FIELDS: FieldSpec[] = [
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
  suggestions = NO_SUGGESTIONS,
}: {
  mode: "crear" | "editar";
  productId?: string;
  values?: ProductFormValues;
  suggestions?: ProductSuggestions;
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

  function renderField(field: FieldSpec) {
    const invalid = failed && state.field === field.name;
    const hintId = field.hint ? `${field.name}-ayuda` : undefined;
    const errorId = invalid ? `${field.name}-error` : undefined;
    const listId = field.list ? `${field.name}-sugerencias` : undefined;
    const describedBy =
      [errorId, hintId].filter(Boolean).join(" ") || undefined;
    return (
      <div
        key={field.name}
        className={`flex flex-col gap-1 ${field.long ? "sm:col-span-2" : ""}`}
      >
        <label htmlFor={field.name} className={labelClass}>
          {field.label}
          {field.required ? " *" : ""}
        </label>
        {field.options ? (
          <select
            id={field.name}
            name={field.name}
            required={field.required}
            defaultValue={shown[field.name]}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={errorId}
            className={inputClass}
          >
            {Object.entries(field.options).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : field.long ? (
          <textarea
            id={field.name}
            name={field.name}
            required={field.required}
            defaultValue={shown[field.name]}
            rows={4}
            placeholder={field.placeholder}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            className={inputClass}
          />
        ) : (
          <input
            id={field.name}
            name={field.name}
            required={field.required}
            defaultValue={shown[field.name]}
            list={listId}
            // Sin el historial del navegador: solo las sugerencias de la lista.
            autoComplete={field.list ? "off" : undefined}
            placeholder={field.placeholder}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            className={inputClass}
          />
        )}
        {field.list ? (
          <datalist id={listId}>
            {suggestions[field.list].map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        ) : null}
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
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {productId ? (
        <input type="hidden" name="productId" value={productId} />
      ) : null}

      <SectionCard
        id="form-basica-titulo"
        title="Información básica"
        icon="package"
        description="Cómo se identifica y se describe el producto."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {BASIC_FIELDS.map(renderField)}
        </div>
      </SectionCard>

      <SectionCard
        id="form-stock-titulo"
        title="Stock y reposición"
        icon="layers"
        description="El stock no se edita acá: se ajusta en el historial de movimientos."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {STOCK_FIELDS.map(renderField)}
        </div>
        {mode === "crear" ? (
          <p className="mt-4 text-sm text-muted">
            El precio y el stock inicial se cargan después de crear el producto,
            desde su detalle.
          </p>
        ) : null}
      </SectionCard>

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
