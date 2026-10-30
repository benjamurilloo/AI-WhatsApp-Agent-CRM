"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type Ref } from "react";
import { Avatar } from "@/app/_components/avatar";
import { ErrorSummary } from "@/app/_components/error-summary";
import { FormActionBar } from "@/app/_components/form-action-bar";
import {
  cardClass,
  fieldErrorClass,
  inactiveBadgeClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  primaryLinkClass,
  secondaryButtonClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon, type IconName } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { SuggestInput } from "@/app/_components/suggest-input";
import { useUnsavedChanges } from "@/app/_components/unsaved-changes";
import { UnsavedChangesDialog } from "@/app/_components/unsaved-changes-dialog";
import { createClientAction, updateClientAction } from "./actions";
import { KIND_LABEL } from "./filters";
import {
  DOCUMENT_NUMBER_HINT,
  DUPLICATE_DESCRIPTION,
  DUPLICATE_NOTE,
  DUPLICATE_TITLE,
  INSTAGRAM_HINT,
  NOTES_HINT,
  PHONE_HINT,
  SEGMENT_HINT,
  type ClientFormState,
  type ClientFormValues,
  type DuplicateClient,
} from "./messages";

// Formulario de alta y de edición. Solo lo recibe un admin, así que el teléfono completo que
// precarga nunca llega a un viewer. El botón queda deshabilitado mientras responde.
// Desde la 24.4.2, como 02 de la v2 (brief-24.4.2, D-7): «Datos de contacto», «Identificación y
// domicilio» plegado y «Organización interna», con el resumen de errores y la barra de guardado de
// la 24.1, y el aviso de teléfono duplicado de 08 (D-8). El teléfono sigue siendo un solo campo
// E.164 y opcional (H-8 y H-9). Funciona sin JavaScript: el envío devuelve el formulario con lo
// escrito.

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
  documentNumber: "",
  instagram: "",
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
  // A todo el ancho de la sección.
  wide?: boolean;
};

const FIELDS: FieldSpec[] = [
  {
    name: "displayName",
    label: "Nombre completo",
    required: true,
    placeholder: "Ej. Juan Pérez",
    wide: true,
  },
  {
    name: "phone",
    label: "Teléfono WhatsApp",
    required: false,
    hint: `Usamos el teléfono para vincular conversaciones. ${PHONE_HINT}`,
    type: "tel",
    placeholder: "Ej. +5491155551234",
    wide: true,
  },
  {
    name: "email",
    label: "Correo electrónico",
    required: false,
    type: "email",
    placeholder: "nombre@ejemplo.com",
    maxLength: 254,
    wide: true,
  },
  {
    name: "documentNumber",
    label: "DNI",
    required: false,
    hint: DOCUMENT_NUMBER_HINT,
    placeholder: "Ej. 30123456",
    maxLength: 12,
  },
  {
    name: "instagram",
    label: "Instagram",
    required: false,
    hint: INSTAGRAM_HINT,
    placeholder: "Ej. juanperez",
    maxLength: 31,
  },
  {
    name: "addressLine",
    label: "Calle y número",
    required: false,
    placeholder: "Ej. Av. Corrientes 1234, piso 2",
    maxLength: 200,
    wide: true,
  },
  {
    name: "city",
    label: "Localidad",
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
    name: "segment",
    label: "Segmento",
    required: false,
    hint: SEGMENT_HINT,
    suggest: true,
    placeholder: "Ej. Mayorista",
  },
  {
    name: "notes",
    label: "Observaciones internas",
    required: false,
    hint: `Esta información es visible para el equipo. ${NOTES_HINT}`,
    multiline: true,
    placeholder: "Agregá información relevante sobre el cliente…",
    wide: true,
  },
];

// Los campos de «Identificación y domicilio», plegados mientras estén vacíos (D-7).
const IDENTITY_FIELDS: (keyof ClientFormValues)[] = [
  "documentNumber",
  "instagram",
  "addressLine",
  "city",
  "province",
  "postalCode",
];

// Las secciones del formulario, con sus campos en el orden de FIELDS.
const CONTACT_FIELDS: (keyof ClientFormValues)[] = [
  "displayName",
  "phone",
  "email",
];
const INTERNAL_FIELDS: (keyof ClientFormValues)[] = [
  "kind",
  "companyName",
  "jobTitle",
  "segment",
  "notes",
];

// Las listas del formulario. Las provincias y los segmentos llegan de la página, que los lee de crm
// en el servidor: este componente no importa valores de crm.
// El DNI y el Instagram se cargan solo con la capacidad trade_ins (brief-29.7, D-6; revisión M-1):
// sin ella, el formulario no cambia, y los valores viajan ocultos para que la edición no los borre.
export type ClientFormOptions = {
  provinces: [code: string, name: string][];
  segments: string[];
  tradeIns: boolean;
};

const TRADE_IN_FIELDS: (keyof ClientFormValues)[] = [
  "documentNumber",
  "instagram",
];

// «Antes de guardar», a la derecha en escritorio, como 02.
const TIPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "phone",
    title: "Revisá el teléfono.",
    text: "Nos permite vincular sus conversaciones de WhatsApp.",
  },
  {
    icon: "users",
    title: "Evitá crear fichas duplicadas.",
    text: "Buscá por nombre o teléfono antes de crear un nuevo cliente.",
  },
  {
    icon: "fileText",
    title: "Los campos opcionales pueden completarse después.",
    text: "Con lo básico ya podés empezar a trabajar.",
  },
];

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
  const summaryRef = useRef<HTMLDivElement>(null);
  const { formRef, dialog } = useUnsavedChanges();
  const failed = state.status === "error";
  const duplicate = failed ? (state.duplicate ?? null) : null;
  // Tras un rechazo, React reinicia el formulario a estos valores: lo escrito se conserva.
  const shown = failed ? state.values : values;
  const identityOpen = IDENTITY_FIELDS.some(
    (name) => shown[name] !== "" || (failed && state.field === name),
  );

  // Después de un rechazo, el foco va al resumen de errores o al aviso de duplicado (brief-24.1,
  // D-8; brief-24.4.2, D-8), que se leen enteros.
  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
  }, [state]);

  const field = (spec: FieldSpec) => {
    const invalid = failed && state.field === spec.name;
    const hintId = spec.hint ? `${spec.name}-ayuda` : undefined;
    const errorId = invalid ? `${spec.name}-error` : undefined;
    const common = {
      id: spec.name,
      name: spec.name,
      required: spec.required,
      defaultValue: shown[spec.name],
      "aria-invalid": invalid ? true : undefined,
      "aria-describedby":
        [errorId, hintId].filter(Boolean).join(" ") || undefined,
      className: inputClass,
      placeholder: spec.placeholder,
    };
    return (
      <div
        key={spec.name}
        className={`flex flex-col gap-1 ${spec.wide ? "sm:col-span-2" : ""}`}
      >
        <label htmlFor={spec.name} className={labelClass}>
          {spec.label}
          {spec.required ? (
            <span className="text-danger"> *</span>
          ) : (
            <span className="font-normal text-muted"> (opcional)</span>
          )}
        </label>
        {spec.multiline ? (
          <textarea {...common} rows={4} />
        ) : spec.choices ? (
          <select
            id={common.id}
            name={common.name}
            defaultValue={common.defaultValue}
            aria-invalid={common["aria-invalid"]}
            aria-describedby={common["aria-describedby"]}
            className={inputClass}
          >
            <option value="">Sin dato</option>
            {choices[spec.choices].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : spec.suggest ? (
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
            type={spec.type ?? "text"}
            maxLength={spec.maxLength}
            autoComplete="off"
          />
        )}
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

  const fieldsOf = (names: (keyof ClientFormValues)[]) =>
    FIELDS.filter(
      (spec) =>
        names.includes(spec.name) &&
        (options.tradeIns || !TRADE_IN_FIELDS.includes(spec.name)),
    ).map(field);

  return (
    <form action={formAction} className="flex flex-col gap-6" ref={formRef}>
      {clientId ? (
        <input type="hidden" name="clientId" value={clientId} />
      ) : null}
      {options.tradeIns
        ? null
        : TRADE_IN_FIELDS.map((name) => (
            <input key={name} type="hidden" name={name} value={shown[name]} />
          ))}

      {duplicate ? (
        <DuplicateNotice ref={summaryRef} client={duplicate} />
      ) : failed ? (
        <ErrorSummary
          ref={summaryRef}
          id="resumen-errores-cliente"
          errors={[{ field: state.field, message: state.message }]}
        />
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard
            id="form-contacto-titulo"
            title="Datos de contacto"
            icon="user"
          >
            <p className="-mt-2 mb-4 text-sm text-muted">
              <span className="text-danger">*</span> Obligatorio
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {fieldsOf(CONTACT_FIELDS)}
            </div>
          </SectionCard>

          <SectionCard
            id="form-identificacion-titulo"
            title="Identificación y domicilio"
            icon="mapPin"
          >
            {/* Plegado mientras esté vacío (D-7): un <details> funciona sin JavaScript. */}
            <details open={identityOpen} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                <Icon
                  name="chevronRight"
                  className="size-4 transition-transform group-open:rotate-90"
                />
                Agregar documento y dirección (opcional)
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {fieldsOf(IDENTITY_FIELDS)}
              </div>
            </details>
          </SectionCard>

          <SectionCard
            id="form-interna-titulo"
            title="Organización interna"
            icon="layers"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {fieldsOf(INTERNAL_FIELDS)}
            </div>
          </SectionCard>
        </div>

        <aside
          aria-labelledby="antes-de-guardar-titulo"
          className={`${cardClass} hidden p-6 lg:block`}
        >
          <h2
            id="antes-de-guardar-titulo"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Icon name="info" className="size-5 text-primary" />
            Antes de guardar
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {TIPS.map((tip) => (
              <li key={tip.title} className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border">
                  <Icon name={tip.icon} className="size-4" />
                </span>
                <span className="text-sm">
                  <span className="block font-semibold">{tip.title}</span>
                  <span className="text-muted">{tip.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-border pt-4 text-sm text-muted">
            Podés empezar con el nombre.{" "}
            <Link
              href="/clientes"
              className="font-semibold text-primary underline underline-offset-4"
            >
              Buscar en la lista
            </Link>
          </p>
        </aside>
      </div>

      <FormActionBar status={mode === "crear" ? "Sin guardar" : undefined}>
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
      </FormActionBar>
      <UnsavedChangesDialog {...dialog} />
    </form>
  );
}

// El aviso de duplicado de 08 (D-8): el otro cliente, con su ficha y la vuelta al formulario. No
// fusiona nada. Lleva el foco después del envío, como el resumen de errores.
function DuplicateNotice({
  client,
  ref,
}: {
  client: DuplicateClient;
  ref: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-labelledby="duplicado-titulo"
      className="flex flex-col gap-4 rounded-xl border border-border-strong bg-warning-soft p-4 text-on-warning-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:p-5"
    >
      <div className="flex gap-3">
        <Icon name="alert" className="mt-0.5 size-6 shrink-0" />
        <div>
          <p id="duplicado-titulo" className="text-lg font-semibold">
            {DUPLICATE_TITLE}
          </p>
          <p className="text-sm">{DUPLICATE_DESCRIPTION}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-foreground">
        <Avatar name={client.displayName} tone="brand" />
        <div className="min-w-0">
          <p className="font-semibold">
            {client.displayName}
            {client.isActive ? null : (
              <span className={`ml-2 ${inactiveBadgeClass}`}>Inactivo</span>
            )}
          </p>
          <p className="text-sm text-muted">{client.phoneE164}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href={`/clientes/${client.id}`} className={primaryLinkClass}>
          Ver ficha existente
        </Link>
        <a
          href="#phone"
          onClick={(event) => {
            const phone = document.getElementById("phone");
            if (!phone) return;
            event.preventDefault();
            phone.focus();
            phone.scrollIntoView({ block: "center" });
          }}
          className={secondaryButtonClass}
        >
          Volver al formulario
        </a>
      </div>
      <p className="flex items-center gap-2 text-sm">
        <Icon name="info" className="size-4 shrink-0" />
        {DUPLICATE_NOTE}
      </p>
    </div>
  );
}
