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
import { useUnsavedChanges } from "@/app/_components/unsaved-changes";
import { UnsavedChangesDialog } from "@/app/_components/unsaved-changes-dialog";
import { SectionCard } from "@/app/_components/section-card";
import { SuggestInput } from "@/app/_components/suggest-input";
import { createProductAction, updateProductAction } from "./actions";
import type {
  ProductFormSuggestions,
  VariantFormOptions,
} from "@/modules/catalog";
import {
  CONDITION_LABEL,
  type ProductFormState,
  type ProductFormValues,
  type VariantFormValues,
} from "./messages";

// Formulario de alta y de edición (wireframes 03 y 04). El stock no se edita acá: se ajusta
// en la pantalla 5. El botón queda deshabilitado mientras responde el servidor (brief-4.4, D-4).
// Marca y categoría son texto libre con sugerencias de los valores que ya existen, y la condición
// es una lista cerrada (brief-11.1, D-2 y D-3). Desde la 15.4, los campos van en dos tarjetas;
// el precio y el stock inicial se cargan después, desde el detalle (brief-15.4, D-4). Desde la
// 17.2, el código de barras va debajo del SKU, y peso, dimensiones, ubicación y estante en dos
// tarjetas propias (brief-17.2, D-11). Desde la 29.2, con la capacidad variants, la tarjeta «Modelo y
// variante», debajo de la información básica (brief-29.2, D-5).

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
  barcode: "",
  weightKg: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  location: "",
  shelf: "",
};

const NO_VARIANT: VariantFormValues = { modelId: "", attributes: {} };

const NO_SUGGESTIONS: ProductFormSuggestions = {
  brands: [],
  categories: [],
  locations: [],
};

type FieldSpec = {
  name: keyof ProductFormValues;
  label: string;
  required: boolean;
  hint?: string;
  // Lista de sugerencias del campo, si tiene.
  list?: keyof ProductFormSuggestions;
  // Lista cerrada: se muestra como select.
  options?: Record<string, string>;
  // Texto largo: se muestra como textarea, a todo el ancho.
  long?: boolean;
  placeholder?: string;
  // Número con decimales: teclado numérico en el teléfono.
  decimal?: boolean;
};

// El orden es el del formulario y el del foco al primer error: tiene que coincidir con
// PRODUCT_FIELD_ORDER de messages.ts. Las cuatro tarjetas lo respetan.

const BASIC_FIELDS: FieldSpec[] = [
  {
    name: "sku",
    label: "SKU",
    required: true,
    hint: "Sin espacios.",
    placeholder: "Ej. DEMO-AUD-001",
  },
  {
    name: "barcode",
    label: "Código de barras",
    required: false,
    hint: "Sin espacios. No puede repetirse en otro producto.",
    placeholder: "Ej. 7790001000017",
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

const LOGISTICS_FIELDS: FieldSpec[] = [
  { name: "weightKg", label: "Peso (kg)", required: false, decimal: true },
  { name: "lengthCm", label: "Largo (cm)", required: false, decimal: true },
  { name: "widthCm", label: "Ancho (cm)", required: false, decimal: true },
  { name: "heightCm", label: "Alto (cm)", required: false, decimal: true },
];

const LOCATION_FIELDS: FieldSpec[] = [
  {
    name: "location",
    label: "Ubicación",
    required: false,
    list: "locations",
    placeholder: "Ej. Depósito",
  },
  {
    name: "shelf",
    label: "Estante",
    required: false,
    placeholder: "Ej. A-3",
  },
];

export function ProductForm({
  mode,
  productId,
  values = EMPTY,
  suggestions = NO_SUGGESTIONS,
  variantOptions = null,
  variantValues = NO_VARIANT,
}: {
  mode: "crear" | "editar";
  productId?: string;
  values?: ProductFormValues;
  suggestions?: ProductFormSuggestions;
  // null sin la capacidad: la tarjeta no se muestra y el formulario no manda el modelo.
  variantOptions?: VariantFormOptions | null;
  variantValues?: VariantFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createProductAction : updateProductAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const { formRef, dialog } = useUnsavedChanges();
  const failed = state.status === "error";
  const shown = failed ? state.values : values;
  const shownVariant = failed
    ? (state.variant ?? variantValues)
    : variantValues;

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
        ) : field.list ? (
          // Sugerencias propias en lugar del datalist (brief-15.2, D-5).
          <SuggestInput
            id={field.name}
            name={field.name}
            required={field.required}
            defaultValue={shown[field.name]}
            placeholder={field.placeholder}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            className={inputClass}
            options={suggestions[field.list]}
          />
        ) : (
          <input
            id={field.name}
            name={field.name}
            required={field.required}
            defaultValue={shown[field.name]}
            placeholder={field.placeholder}
            inputMode={field.decimal ? "decimal" : undefined}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            className={inputClass}
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
  }

  // Un campo del modelo o de un atributo: el id del elemento es el nombre del campo, para que el foco
  // llegue al primero inválido.
  function renderVariantField(
    name: string,
    label: string,
    required: boolean,
    control: (props: {
      id: string;
      name: string;
      required: boolean;
      "aria-invalid": true | undefined;
      "aria-describedby": string | undefined;
      className: string;
    }) => React.ReactNode,
    hint?: string,
  ) {
    const invalid = failed && state.field === name;
    const errorId = invalid ? `${name}-error` : undefined;
    const hintId = hint ? `${name}-ayuda` : undefined;
    return (
      <div key={name} className="flex flex-col gap-1">
        <label htmlFor={name} className={labelClass}>
          {label}
          {required ? " *" : ""}
        </label>
        {control({
          id: name,
          name,
          required: false,
          "aria-invalid": invalid ? true : undefined,
          "aria-describedby":
            [errorId, hintId].filter(Boolean).join(" ") || undefined,
          className: inputClass,
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

  return (
    <form action={formAction} className="flex flex-col gap-6" ref={formRef}>
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

      {variantOptions ? (
        <SectionCard
          id="form-variante-titulo"
          title="Modelo y variante"
          icon="layers"
          description="El modelo agrupa las variantes de un mismo equipo. Los datos con * son obligatorios en un producto con modelo."
        >
          <input type="hidden" name="variantEnabled" value="1" />
          <div className="grid gap-4 sm:grid-cols-2">
            {renderVariantField(
              "modelId",
              "Modelo",
              false,
              (props) => (
                <select {...props} defaultValue={shownVariant.modelId}>
                  <option value="">Sin modelo</option>
                  {variantOptions.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              ),
              "Un accesorio puede no tener modelo.",
            )}
            {variantOptions.definitions.map((definition) => {
              const name = `atributo:${definition.id}`;
              const current = shownVariant.attributes[definition.id] ?? "";
              return renderVariantField(
                name,
                definition.name,
                definition.isRequired,
                (props) =>
                  definition.type === "option" ? (
                    <select {...props} defaultValue={current}>
                      <option value="">Sin elegir</option>
                      {definition.options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : definition.type === "boolean" ? (
                    <select {...props} defaultValue={current}>
                      <option value="">Sin dato</option>
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <input
                      {...props}
                      defaultValue={current}
                      inputMode={
                        definition.type === "number" ? "decimal" : undefined
                      }
                    />
                  ),
              );
            })}
          </div>
        </SectionCard>
      ) : null}

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

      <SectionCard
        id="form-logistica-titulo"
        title="Logística"
        icon="truck"
        description="Para preparar envíos. Largo, ancho y alto van juntos."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOGISTICS_FIELDS.map(renderField)}
        </div>
      </SectionCard>

      <SectionCard
        id="form-ubicacion-titulo"
        title="Ubicación"
        icon="mapPin"
        description="Dónde está el producto."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {LOCATION_FIELDS.map(renderField)}
        </div>
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
      <UnsavedChangesDialog {...dialog} />
    </form>
  );
}
