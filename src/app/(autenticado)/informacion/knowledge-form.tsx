"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { ErrorSummary } from "@/app/_components/error-summary";
import { FormActionBar } from "@/app/_components/form-action-bar";
import {
  fieldErrorClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { useUnsavedChanges } from "@/app/_components/unsaved-changes";
import { UnsavedChangesDialog } from "@/app/_components/unsaved-changes-dialog";
import type { IconName } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { SuggestInput } from "@/app/_components/suggest-input";
import { createKnowledgeAction, updateKnowledgeAction } from "./actions";
import {
  FIELD_ORDER,
  type KnowledgeFormState,
  type KnowledgeFormValues,
} from "./messages";

// Formulario de alta y de edición de una entrada (brief-11.2, D-7). El botón queda deshabilitado
// mientras responde el servidor. La categoría es texto libre con sugerencias de las que ya usa la
// organización (D-2). Ningún campo es un select: tras un rechazo, React reinicia el formulario y
// cada campo vuelve a su valor por defecto, que es lo enviado (brief-11.1, lección del select).
// Desde la 15.4, los campos van en dos tarjetas, en el mismo orden (brief-15.4). Desde la 24.1, el
// formulario de referencia del patrón de la v2 (brief-24.1, D-8): un envío rechazado muestra el
// resumen de errores al comienzo, con el foco y un enlace al campo, y las acciones van en la barra
// de guardado del pie.

const initialState: KnowledgeFormState = { status: "idle" };

const EMPTY: KnowledgeFormValues = {
  title: "",
  category: "",
  content: "",
  validFrom: "",
  validUntil: "",
};

type FieldSpec = {
  name: keyof KnowledgeFormValues;
  label: string;
  required: boolean;
  kind: "text" | "textarea" | "date";
  hint?: string;
  placeholder?: string;
};

const SPECS: Record<keyof KnowledgeFormValues, FieldSpec> = {
  title: {
    name: "title",
    label: "Título",
    required: true,
    kind: "text",
    hint: "Por ejemplo, «Horario de atención». No puede repetirse.",
    placeholder: "Ej. Horario de atención",
  },
  category: {
    name: "category",
    label: "Categoría",
    required: true,
    kind: "text",
    hint: "Por ejemplo, «Horarios», «Pagos» o «Envíos».",
  },
  content: {
    name: "content",
    label: "Contenido",
    required: true,
    kind: "textarea",
    hint: "Texto plano, hasta 4000 caracteres.",
    placeholder: "Escribí el contenido de la entrada…",
  },
  validFrom: {
    name: "validFrom",
    label: "Vigente desde",
    required: false,
    kind: "date",
    hint: "Opcional. Vacío: vale desde ya.",
  },
  validUntil: {
    name: "validUntil",
    label: "Vigente hasta",
    required: false,
    kind: "date",
    hint: "Opcional, inclusive. Vacío: sin vencimiento.",
  },
};

// El orden del formulario es el del foco al primer error (FIELD_ORDER de messages.ts).
const FIELDS = FIELD_ORDER.map((name) => SPECS[name]);

// Las tarjetas del formulario, con sus campos en el orden de FIELD_ORDER.
const GROUPS: {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  fields: (keyof KnowledgeFormValues)[];
}[] = [
  {
    id: "form-entrada-titulo",
    title: "Datos de la entrada",
    description: "Lo que el agente va a leer de esta entrada.",
    icon: "fileText",
    fields: ["title", "category", "content"],
  },
  {
    id: "form-vigencia-titulo",
    title: "Vigencia (opcional)",
    description: "Un período en el que esta información vale.",
    icon: "calendar",
    fields: ["validFrom", "validUntil"],
  },
];

export function KnowledgeForm({
  mode,
  entryId,
  values = EMPTY,
  categories = [],
}: {
  mode: "crear" | "editar";
  entryId?: string;
  values?: KnowledgeFormValues;
  categories?: string[];
}) {
  const [state, formAction, pending] = useActionState(
    mode === "crear" ? createKnowledgeAction : updateKnowledgeAction,
    initialState,
  );
  const summaryRef = useRef<HTMLDivElement>(null);
  const { formRef, dialog } = useUnsavedChanges();
  const failed = state.status === "error";
  const shown = failed ? state.values : values;

  // El foco va al resumen, que dice qué revisar y lleva al campo (brief-24.1, D-8).
  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-6" ref={formRef}>
      {entryId ? <input type="hidden" name="entryId" value={entryId} /> : null}

      {failed ? (
        <ErrorSummary
          ref={summaryRef}
          id="resumen-errores"
          errors={[{ field: state.field, message: state.message }]}
        />
      ) : null}

      {GROUPS.map((group) => (
        <SectionCard
          key={group.id}
          id={group.id}
          title={group.title}
          description={group.description}
          icon={group.icon}
        >
          <div
            className={`grid gap-4 ${group.fields.length === 2 ? "sm:grid-cols-2" : ""}`}
          >
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
                  <div key={field.name} className="flex flex-col gap-1">
                    <label htmlFor={field.name} className={labelClass}>
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                    {field.kind === "textarea" ? (
                      <textarea {...common} rows={8} />
                    ) : field.name === "category" ? (
                      // Sugerencias propias en lugar del datalist (brief-15.2, D-5).
                      <SuggestInput {...common} options={categories} />
                    ) : (
                      <input {...common} type={field.kind} />
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

      <FormActionBar>
        <Link
          href={entryId ? `/informacion/${entryId}` : "/informacion"}
          className={secondaryLinkClass}
        >
          Cancelar edición
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending
            ? "Guardando…"
            : mode === "crear"
              ? "Crear entrada"
              : "Guardar cambios"}
        </button>
      </FormActionBar>
      <UnsavedChangesDialog {...dialog} />
    </form>
  );
}
