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
import { createSupplierAction, updateSupplierAction } from "./actions";
import {
  CUIT_HINT,
  PHONE_HINT,
  type SupplierFormState,
  type SupplierFormValues,
} from "./messages";

// Formulario de alta y de edición del proveedor (brief-22.2, D-9): el nombre obligatorio y el
// teléfono, el email y el CUIT opcionales, sin texto libre (ADR 0023, punto 2). Funciona sin
// JavaScript, como el del cliente: la Server Action responde con lo escrito y el campo inválido. El
// botón queda deshabilitado mientras responde.

const initialState: SupplierFormState = { status: "idle" };

const EMPTY: SupplierFormValues = { name: "", phone: "", email: "", cuit: "" };

type FieldSpec = {
  name: keyof SupplierFormValues;
  label: string;
  required: boolean;
  hint?: string;
  type: "text" | "tel" | "email";
  placeholder: string;
  maxLength?: number;
  inputMode?: "numeric";
};

const FIELDS: FieldSpec[] = [
  {
    name: "name",
    label: "Nombre",
    required: true,
    type: "text",
    placeholder: "Ej. Distribuidora Norte",
    maxLength: 120,
  },
  {
    name: "phone",
    label: "Teléfono",
    required: false,
    hint: PHONE_HINT,
    type: "tel",
    placeholder: "Ej. +5491155551234",
  },
  {
    name: "email",
    label: "Email",
    required: false,
    type: "email",
    placeholder: "Ej. ventas@proveedor.com",
    maxLength: 254,
  },
  {
    name: "cuit",
    label: "CUIT",
    required: false,
    hint: CUIT_HINT,
    type: "text",
    placeholder: "Ej. 20-12345678-6",
    maxLength: 20,
    inputMode: "numeric",
  },
];

export function SupplierForm({
  mode,
  supplierId,
  values = EMPTY,
}: {
  mode: "crear" | "editar";
  supplierId?: string;
  values?: SupplierFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createSupplierAction : updateSupplierAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const { formRef, dialog } = useUnsavedChanges();
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

  const cancelHref = supplierId
    ? `/compras/proveedores/${supplierId}`
    : "/compras/proveedores";

  return (
    <form action={formAction} className="flex flex-col gap-6" ref={formRef}>
      {supplierId ? (
        <input type="hidden" name="supplierId" value={supplierId} />
      ) : null}

      <SectionCard id="form-proveedor-titulo" title="Datos" icon="truck">
        <div className="grid gap-4 sm:grid-cols-2">
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
                  type={field.type}
                  required={field.required}
                  defaultValue={shown[field.name]}
                  maxLength={field.maxLength}
                  inputMode={field.inputMode}
                  placeholder={field.placeholder}
                  autoComplete="off"
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
        <Link href={cancelHref} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending
            ? "Guardando…"
            : mode === "crear"
              ? "Crear proveedor"
              : "Guardar cambios"}
        </button>
      </div>
      <UnsavedChangesDialog {...dialog} />
    </form>
  );
}
