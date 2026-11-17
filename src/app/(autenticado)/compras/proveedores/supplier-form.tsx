"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  cardClass,
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  radioClass,
  secondaryLinkClass,
  sectionTitleClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { useUnsavedChanges } from "@/app/_components/unsaved-changes";
import { UnsavedChangesDialog } from "@/app/_components/unsaved-changes-dialog";
import { createSupplierAction, updateSupplierAction } from "./actions";
import {
  CUIT_HINT,
  PHONE_HINT,
  TECHNICIAN_HINT,
  TECHNICIAN_LABEL,
  UNIQUE_SUPPLIER_NOTE,
  type SupplierFormState,
  type SupplierFormValues,
} from "./messages";

// Formulario de alta y de edición del proveedor (brief-22.2, D-9): el nombre obligatorio y el
// teléfono, el email y el CUIT opcionales, sin texto libre (ADR 0023, punto 2). Funciona sin
// JavaScript, como el del cliente: la Server Action responde con lo escrito y el campo inválido. El
// botón queda deshabilitado mientras responde.
//
// *Desde la 24.8.2-b* ([brief-24.8.2-b](../../../../../docs/decisions/brief-24.8.2-b-compras-proveedores-tecnicos-y-cuenta.md),
// lámina 15 del lote 28): **una sola tarjeta con tres bloques** —«Datos del proveedor»,
// «Identificación» y «Servicio técnico»—, con el aviso de unicidad al pie (V-12 y V-14). **Ninguna
// regla cambió.** La casilla «Es técnico» (D-2) solo se dibuja con la capacidad `repairs`, y cuando
// se dibuja viaja con un campo oculto delante: así el servidor distingue «desmarcada» de «la
// pantalla no la ofreció», que no es lo mismo. **No se adopta** la columna «Resumen» de la lámina
// (V-15) ni su barra de acciones fija (V-16).

const initialState: SupplierFormState = { status: "idle" };

const EMPTY: SupplierFormValues = {
  name: "",
  phone: "",
  email: "",
  cuit: "",
  isTechnician: false,
};

type FieldSpec = {
  name: Exclude<keyof SupplierFormValues, "isTechnician">;
  label: string;
  required: boolean;
  hint?: string;
  type: "text" | "tel" | "email";
  placeholder: string;
  maxLength?: number;
  inputMode?: "numeric";
};

const CONTACT_FIELDS: FieldSpec[] = [
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
];

const CUIT_FIELD: FieldSpec = {
  name: "cuit",
  label: "CUIT",
  required: false,
  hint: CUIT_HINT,
  type: "text",
  placeholder: "Ej. 20-12345678-6",
  maxLength: 20,
  inputMode: "numeric",
};

export function SupplierForm({
  mode,
  supplierId,
  repairs = false,
  values = EMPTY,
}: {
  mode: "crear" | "editar";
  supplierId?: string;
  repairs?: boolean;
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

  // El rótulo del campo: obligatorio con «*», opcional dicho con todas las letras (lámina 15).
  const field = (spec: FieldSpec) => {
    const invalid = failed && state.field === spec.name;
    const hintId = spec.hint ? `${spec.name}-ayuda` : undefined;
    const errorId = invalid ? `${spec.name}-error` : undefined;
    return (
      <div key={spec.name} className="flex min-w-0 flex-col gap-1">
        <label htmlFor={spec.name} className={labelClass}>
          {spec.label}
          {spec.required ? (
            " *"
          ) : (
            <span className="font-normal text-muted"> (opcional)</span>
          )}
        </label>
        <input
          id={spec.name}
          name={spec.name}
          type={spec.type}
          required={spec.required}
          defaultValue={shown[spec.name]}
          maxLength={spec.maxLength}
          inputMode={spec.inputMode}
          placeholder={spec.placeholder}
          autoComplete="off"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={
            [errorId, hintId].filter(Boolean).join(" ") || undefined
          }
          className={inputClass}
        />
        {spec.hint ? (
          <p id={hintId} className="text-sm text-muted">
            {spec.hint}
          </p>
        ) : null}
        {invalid ? (
          <p id={errorId} className={fieldErrorClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form action={formAction} className="flex flex-col gap-6" ref={formRef}>
      {supplierId ? (
        <input type="hidden" name="supplierId" value={supplierId} />
      ) : null}

      <div className={`${cardClass} min-w-0 p-5 sm:p-6`}>
        <section aria-labelledby="form-proveedor-titulo">
          <h2 id="form-proveedor-titulo" className={sectionTitleClass}>
            Datos del proveedor
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CONTACT_FIELDS.map(field)}
          </div>
        </section>

        <section
          aria-labelledby="form-identificacion-titulo"
          className="mt-6 border-t border-border pt-6"
        >
          <h2 id="form-identificacion-titulo" className={sectionTitleClass}>
            Identificación
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {field(CUIT_FIELD)}
          </div>
        </section>

        {repairs ? (
          <section
            aria-labelledby="form-tecnico-titulo"
            className="mt-6 border-t border-border pt-6"
          >
            <h2 id="form-tecnico-titulo" className={sectionTitleClass}>
              Servicio técnico
            </h2>
            <div className="mt-5">
              {/* Delante de la casilla: desmarcada manda «0», marcada manda «0» y «1», y si la
                  sección no se dibuja no manda nada. El servidor se queda con el último valor, y
                  la ausencia del campo es «no la ofrecimos», que no toca la marca. */}
              <input type="hidden" name="tecnico" value="0" />
              {/* La ayuda va fuera del rótulo: adentro entraría en el nombre accesible de la
                  casilla, que ya la nombra por `aria-describedby`. */}
              <label
                htmlFor="tecnico"
                className="flex min-w-0 items-center gap-3"
              >
                <input
                  id="tecnico"
                  name="tecnico"
                  type="checkbox"
                  value="1"
                  defaultChecked={shown.isTechnician}
                  aria-describedby="tecnico-ayuda"
                  className={`shrink-0 ${radioClass}`}
                />
                <span className={`min-w-0 ${labelClass}`}>
                  {TECHNICIAN_LABEL}
                </span>
              </label>
              <p id="tecnico-ayuda" className="mt-2 text-sm text-muted">
                {TECHNICIAN_HINT}
              </p>
            </div>
          </section>
        ) : null}

        <p className="mt-6 flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-muted">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{UNIQUE_SUPPLIER_NOTE}</span>
        </p>
      </div>

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
