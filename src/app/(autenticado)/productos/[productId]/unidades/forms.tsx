"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import {
  dangerButtonClass,
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  radioClass,
  secondaryLinkClass,
  selectClass,
} from "@/app/_components/form-styles";
import {
  changeTrackingAction,
  correctUnitAction,
  registerUnitAction,
  writeOffUnitAction,
} from "./actions";
import { TRACKING_HINT, TRACKING_LABEL, type FormState } from "./messages";

// Formularios de las unidades de un producto (brief-29.5, D-6). Funcionan sin JavaScript. Cada uno
// conserva lo escrito tras un rechazo y lleva el foco al campo inválido o al mensaje general.

const idle: FormState = { status: "idle" };

export type GradeOption = { id: string; name: string };

function useFocusError(state: FormState, prefix: string) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field)
      document.getElementById(`${prefix}-${state.field}`)?.focus();
    else errorRef.current?.focus();
  }, [state, prefix]);
  return errorRef;
}

function Field({
  state,
  prefix,
  name,
  label,
  required,
  hint,
  children,
}: {
  state: FormState;
  prefix: string;
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: (props: {
    id: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}) {
  const id = `${prefix}-${name}`;
  const invalid = state.status === "error" && state.field === name;
  const errorId = invalid ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-ayuda` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
        {required ? " *" : ""}
      </label>
      {children({
        id,
        "aria-invalid": invalid ? true : undefined,
        "aria-describedby":
          [errorId, hintId].filter(Boolean).join(" ") || undefined,
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

function GeneralError({
  state,
  errorRef,
}: {
  state: FormState;
  errorRef: React.RefObject<HTMLParagraphElement | null>;
}) {
  const general = state.status === "error" && state.field === null;
  return (
    <div aria-live="polite" aria-atomic="true">
      {general ? (
        <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function value(state: FormState, name: string, fallback: string): string {
  return state.status === "error" ? (state.values[name] ?? fallback) : fallback;
}

// Cómo se lleva el stock (D-3): solo mientras el producto no tiene movimientos.
export function TrackingForm({
  productId,
  current,
}: {
  productId: string;
  current: "quantity" | "unit";
}) {
  const [state, formAction, pending] = useActionState(
    changeTrackingAction,
    idle,
  );
  const errorRef = useFocusError(state, "seguimiento");
  const selected = value(state, "tracking", current);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />
      <fieldset className="flex flex-col gap-3">
        <legend className={labelClass}>Se lleva por</legend>
        {(["quantity", "unit"] as const).map((option) => (
          <div key={option} className="flex items-start gap-2">
            <input
              type="radio"
              id={`seguimiento-${option}`}
              name="tracking"
              value={option}
              defaultChecked={selected === option}
              className={`${radioClass} mt-1`}
              aria-describedby={`seguimiento-${option}-ayuda`}
            />
            <div>
              <label htmlFor={`seguimiento-${option}`} className="font-medium">
                {TRACKING_LABEL[option]}
              </label>
              <p
                id={`seguimiento-${option}-ayuda`}
                className="text-sm text-muted"
              >
                {TRACKING_HINT[option]}
              </p>
            </div>
          </div>
        ))}
      </fieldset>
      <GeneralError state={state} errorRef={errorRef} />
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}

function GradeSelect({
  props,
  grades,
  selected,
}: {
  props: {
    id: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  };
  grades: GradeOption[];
  selected: string;
}) {
  return (
    <select
      {...props}
      name="gradeId"
      defaultValue={selected}
      className={selectClass}
    >
      <option value="">Sin grado</option>
      {grades.map((grade) => (
        <option key={grade.id} value={grade.id}>
          {grade.name}
        </option>
      ))}
    </select>
  );
}

// El precio propio de la unidad (brief-29.5.2, D-2): opcional, con su moneda. Vacíos los dos, la
// unidad vale el precio del producto.
function PriceFields({
  state,
  prefix,
  currencies,
  price,
  priceCurrency,
}: {
  state: FormState;
  prefix: string;
  currencies: { code: string; label: string }[];
  price: string;
  priceCurrency: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
      <Field
        state={state}
        prefix={prefix}
        name="price"
        label="Precio propio"
        hint="Opcional. Sin él, la unidad vale el precio del producto."
      >
        {(props) => (
          <input
            {...props}
            name="price"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={value(state, "price", price)}
            className={inputClass}
          />
        )}
      </Field>
      <Field
        state={state}
        prefix={prefix}
        name="priceCurrency"
        label="Moneda del precio"
      >
        {(props) => (
          <select
            {...props}
            name="priceCurrency"
            defaultValue={value(state, "priceCurrency", priceCurrency)}
            className={selectClass}
          >
            <option value="">—</option>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.label}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  );
}

// El alta manual de una unidad (D-4): su IMEI, su costo, su grado y su batería; desde la 29.5.2, su
// precio propio (brief-29.5.2, D-2).
export function RegisterUnitForm({
  productId,
  grades,
  currencies,
  defaultCurrency,
}: {
  productId: string;
  grades: GradeOption[];
  currencies: { code: string; label: string }[];
  defaultCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(registerUnitAction, idle);
  const prefix = "nueva-unidad";
  const errorRef = useFocusError(state, prefix);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          state={state}
          prefix={prefix}
          name="serial"
          label="IMEI o número de serie"
          required
          hint="No se edita: si se carga mal, se da de baja y se carga de nuevo."
        >
          {(props) => (
            <input
              {...props}
              name="serial"
              required
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              defaultValue={value(state, "serial", "")}
              className={`${inputClass} font-mono`}
            />
          )}
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <Field
            state={state}
            prefix={prefix}
            name="cost"
            label="Costo"
            required
          >
            {(props) => (
              <input
                {...props}
                name="cost"
                required
                inputMode="decimal"
                autoComplete="off"
                defaultValue={value(state, "cost", "")}
                className={inputClass}
              />
            )}
          </Field>
          <Field state={state} prefix={prefix} name="currency" label="Moneda">
            {(props) => (
              <select
                {...props}
                name="currency"
                defaultValue={value(state, "currency", defaultCurrency)}
                className={selectClass}
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field state={state} prefix={prefix} name="gradeId" label="Grado">
          {(props) => (
            <GradeSelect
              props={props}
              grades={grades}
              selected={value(state, "gradeId", "")}
            />
          )}
        </Field>
        <Field
          state={state}
          prefix={prefix}
          name="batteryHealth"
          label="Batería (%)"
          hint="La salud de la batería, de 0 a 100. Opcional."
        >
          {(props) => (
            <input
              {...props}
              name="batteryHealth"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              defaultValue={value(state, "batteryHealth", "")}
              className={inputClass}
            />
          )}
        </Field>
        <PriceFields
          state={state}
          prefix={prefix}
          currencies={currencies}
          price=""
          priceCurrency=""
        />
      </div>
      <GeneralError state={state} errorRef={errorRef} />
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Cargando…" : "Cargar unidad"}
        </button>
      </div>
    </form>
  );
}

// La baja manual (D-4), con su motivo y la confirmación en la misma pantalla.
export function WriteOffForm({
  productId,
  unitId,
  serial,
}: {
  productId: string;
  unitId: string;
  serial: string;
}) {
  const [state, formAction, pending] = useActionState(writeOffUnitAction, idle);
  const prefix = `baja-${unitId}`;
  const errorRef = useFocusError(state, prefix);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="unitId" value={unitId} />
      <p>
        Dar de baja la unidad{" "}
        <span className="font-mono font-semibold">{serial}</span>: sale del
        stock y no vuelve. Su IMEI queda libre para cargarlo de nuevo.
      </p>
      <Field
        state={state}
        prefix={prefix}
        name="reason"
        label="Motivo"
        required
      >
        {(props) => (
          <textarea
            {...props}
            name="reason"
            required
            rows={3}
            maxLength={500}
            defaultValue={value(state, "reason", "")}
            className={inputClass}
          />
        )}
      </Field>
      <GeneralError state={state} errorRef={errorRef} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Dando de baja…" : "Dar de baja"}
        </button>
        <Link
          href={`/productos/${productId}/unidades`}
          className={secondaryLinkClass}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

// La corrección del grado o la batería (D-4) y, desde la 29.5.2, del precio propio (brief-29.5.2,
// D-2). El IMEI y el costo no se corrigen.
export function CorrectUnitForm({
  productId,
  unitId,
  serial,
  grades,
  gradeId,
  batteryHealth,
  currencies,
  price,
  priceCurrency,
}: {
  productId: string;
  unitId: string;
  serial: string;
  grades: GradeOption[];
  gradeId: string;
  batteryHealth: string;
  currencies: { code: string; label: string }[];
  price: string;
  priceCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(correctUnitAction, idle);
  const prefix = `corregir-${unitId}`;
  const errorRef = useFocusError(state, prefix);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="unitId" value={unitId} />
      <p>
        Corregir la unidad{" "}
        <span className="font-mono font-semibold">{serial}</span>.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field state={state} prefix={prefix} name="gradeId" label="Grado">
          {(props) => (
            <GradeSelect
              props={props}
              grades={grades}
              selected={value(state, "gradeId", gradeId)}
            />
          )}
        </Field>
        <Field
          state={state}
          prefix={prefix}
          name="batteryHealth"
          label="Batería (%)"
        >
          {(props) => (
            <input
              {...props}
              name="batteryHealth"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              defaultValue={value(state, "batteryHealth", batteryHealth)}
              className={inputClass}
            />
          )}
        </Field>
        <PriceFields
          state={state}
          prefix={prefix}
          currencies={currencies}
          price={price}
          priceCurrency={priceCurrency}
        />
      </div>
      <GeneralError state={state} errorRef={errorRef} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <Link
          href={`/productos/${productId}/unidades`}
          className={secondaryLinkClass}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
