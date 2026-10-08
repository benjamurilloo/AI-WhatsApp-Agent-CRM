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
import type { IconName } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { SuggestInput } from "@/app/_components/suggest-input";
import { createClientAction, updateClientAction } from "./actions";
import { KIND_LABEL } from "./filters";
import {
  NOTES_HINT,
  PHONE_HINT,
  SEGMENT_HINT,
  type ClientFormState,
  type ClientFormValues,
} from "./messages";

// Formulario de alta y de edición (wireframe 07). Solo lo recibe un admin, así que el teléfono
// completo que precarga nunca llega a un viewer. El botón queda deshabilitado mientras responde.
// Desde la 15.4, los campos van en dos tarjetas, en el mismo orden (brief-15.4). El teléfono sigue
// siendo un solo campo (D-5). Desde la 17.1, cuatro tarjetas más, todas opcionales (brief-17.1, D-11):
// el tipo y la provincia son listas cerradas, y el segmento sugiere los ya cargados.

const initialState: ClientFormState = { status: "idle" };

const EMPTY: ClientFormValues = {
  displayName: "",
  phone: "",
  notes: "",
  email: "",
  kind: "",
  companyName: "",
  jobTitle: "",
  addressLine: "",
  city: "",
  province: "",
  postalCode: "",
  segment: "",
};

type FieldSpec = {
  name: keyof ClientFormValues;
  label: string;
  required: boolean;
  hint?: string;
  multiline?: boolean;
  type?: "text" | "tel" | "email";
  placeholder?: string;
  // Lista cerrada: un selector con «Sin dato» primero.
  choices?: "kind" | "province";
  // Sugerencias de los valores ya cargados (brief-15.2, D-5). SuggestInput no recibe maxLength:
  // el largo del segmento lo valida el servidor.
  suggest?: boolean;
  maxLength?: number;
};

const FIELDS: FieldSpec[] = [
  {
    name: "displayName",
    label: "Nombre",
    required: true,
    placeholder: "Ej. Juan Pérez",
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
    name: "notes",
    label: "Notas",
    required: false,
    hint: NOTES_HINT,
    multiline: true,
    placeholder: "Agregá información relevante sobre el cliente…",
  },
  {
    name: "email",
    label: "Email",
    required: false,
    type: "email",
    placeholder: "Ej. juan@ejemplo.com",
    maxLength: 254,
  },
  { name: "kind", label: "Tipo", required: false, choices: "kind" },
  {
    name: "companyName",
    label: "Empresa",
    required: false,
    placeholder: "Ej. Ferretería Norte",
    maxLength: 120,
  },
  {
    name: "jobTitle",
    label: "Cargo",
    required: false,
    placeholder: "Ej. Encargado de compras",
    maxLength: 120,
  },
  {
    name: "addressLine",
    label: "Calle y número",
    required: false,
    placeholder: "Ej. Av. Corrientes 1234, piso 2",
    maxLength: 200,
  },
  {
    name: "city",
    label: "Ciudad",
    required: false,
    placeholder: "Ej. Rosario",
    maxLength: 120,
  },
  {
    name: "province",
    label: "Provincia",
    required: false,
    choices: "province",
  },
  {
    name: "postalCode",
    label: "Código postal",
    required: false,
    placeholder: "Ej. C1425ABC",
    maxLength: 10,
  },
  {
    name: "segment",
    label: "Segmento",
    required: false,
    hint: SEGMENT_HINT,
    suggest: true,
    placeholder: "Ej. Mayorista",
  },
];

// Las tarjetas del formulario, con sus campos en el orden de FIELDS.
const GROUPS: {
  id: string;
  title: string;
  icon: IconName;
  fields: (keyof ClientFormValues)[];
}[] = [
  {
    id: "form-principal-titulo",
    title: "Información principal",
    icon: "user",
    fields: ["displayName", "phone"],
  },
  {
    id: "form-adicional-titulo",
    title: "Información adicional",
    icon: "fileText",
    fields: ["notes"],
  },
  {
    id: "form-contacto-titulo",
    title: "Contacto",
    icon: "mail",
    fields: ["email"],
  },
  {
    id: "form-empresa-titulo",
    title: "Empresa",
    icon: "building",
    fields: ["kind", "companyName", "jobTitle"],
  },
  {
    id: "form-direccion-titulo",
    title: "Dirección",
    icon: "mapPin",
    fields: ["addressLine", "city", "province", "postalCode"],
  },
  {
    id: "form-clasificacion-titulo",
    title: "Clasificación",
    icon: "layers",
    fields: ["segment"],
  },
];

// Las listas del formulario. Las provincias y los segmentos llegan de la página, que los lee de crm
// en el servidor: este componente no importa valores de crm.
export type ClientFormOptions = {
  provinces: [code: string, name: string][];
  segments: string[];
};

export function ClientForm({
  mode,
  clientId,
  values = EMPTY,
  options,
}: {
  mode: "crear" | "editar";
  clientId?: string;
  values?: ClientFormValues;
  options: ClientFormOptions;
}) {
  const choices = {
    kind: Object.entries(KIND_LABEL),
    province: options.provinces,
  };
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
    <form action={formAction} className="flex flex-col gap-6">
      {clientId ? (
        <input type="hidden" name="clientId" value={clientId} />
      ) : null}

      {GROUPS.map((group) => (
        <SectionCard
          key={group.id}
          id={group.id}
          title={group.title}
          icon={group.icon}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.filter((field) => group.fields.includes(field.name)).map(
              (field) => {
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
                  placeholder: field.placeholder,
                };
                return (
                  <div
                    key={field.name}
                    className={`flex flex-col gap-1 ${field.multiline ? "sm:col-span-2" : ""}`}
                  >
                    <label htmlFor={field.name} className={labelClass}>
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                    {field.multiline ? (
                      <textarea {...common} rows={4} />
                    ) : field.choices ? (
                      <select
                        id={common.id}
                        name={common.name}
                        defaultValue={common.defaultValue}
                        aria-invalid={common["aria-invalid"]}
                        aria-describedby={common["aria-describedby"]}
                        className={inputClass}
                      >
                        <option value="">Sin dato</option>
                        {choices[field.choices].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : field.suggest ? (
                      <SuggestInput
                        id={common.id}
                        name={common.name}
                        required={common.required}
                        defaultValue={common.defaultValue}
                        placeholder={common.placeholder}
                        aria-invalid={common["aria-invalid"]}
                        aria-describedby={common["aria-describedby"]}
                        className={inputClass}
                        options={options.segments}
                      />
                    ) : (
                      <input
                        {...common}
                        type={field.type ?? "text"}
                        maxLength={field.maxLength}
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
              },
            )}
          </div>
        </SectionCard>
      ))}

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
