"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  dangerButtonClass,
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  selectClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import {
  cancelServiceOrderAction,
  changeServiceOrderAction,
  deliverServiceOrderAction,
  quoteServiceOrderAction,
  sendServiceOrderAction,
  type QuoteFormState,
} from "../actions";
import { CANCEL_REASON_LABEL, type ChangeState } from "../messages";

// Las acciones de cada estado de la orden de servicio (brief-29.6, D-4 y D-10). Funcionan sin
// JavaScript; ante un rechazo muestran el mensaje y llevan el foco a él.

const idle: ChangeState = { status: "idle" };

function ChangeError({ state }: { state: ChangeState }) {
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);
  return (
    <div aria-live="polite" aria-atomic="true">
      {state.status === "error" ? (
        <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

// Mandarla al técnico: uno de los activos con la marca.
export function SendForm({
  serviceOrderId,
  technicians,
}: {
  serviceOrderId: string;
  technicians: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    sendServiceOrderAction,
    idle,
  );
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="serviceOrderId" value={serviceOrderId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="tecnico" className={labelClass}>
            Técnico
          </label>
          <select
            id="tecnico"
            name="technicianId"
            required
            defaultValue=""
            className={selectClass}
          >
            <option value="">Elegí un técnico</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Mandando…" : "Mandar al técnico"}
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}

export type QuoteRow = {
  repairTypeId: string;
  name: string;
  listPrice: {
    price: string;
    priceCurrency: string;
    cost: string;
    costCurrency: string;
  } | null;
};

const idleQuote: QuoteFormState = { status: "idle" };

// El monto de la lista como se escribe en el campo: con coma decimal.
function amountInput(value: string): string {
  return value.endsWith(".00") ? value.slice(0, -3) : value.replace(".", ",");
}

// El presupuesto (D-4): cada tipo activo con el precio y el costo de la lista del modelo, editables
// antes de guardar. Se marcan los que entran. Las líneas no cambian después.
export function QuoteForm({
  serviceOrderId,
  rows,
  currencies,
  customerCurrency,
  technicianCurrency,
}: {
  serviceOrderId: string;
  rows: QuoteRow[];
  currencies: string[];
  customerCurrency: string;
  technicianCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(
    quoteServiceOrderAction,
    idleQuote,
  );
  const failed = state.status === "error" ? state : null;
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      rows.map((row) => [
        row.repairTypeId,
        failed ? failed.values[`include_${row.repairTypeId}`] === "1" : false,
      ]),
    ),
  );
  const value = (name: string, fallback: string) =>
    failed ? (failed.values[name] ?? fallback) : fallback;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="serviceOrderId" value={serviceOrderId} />
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["customerCurrency", "Moneda del cliente", customerCurrency],
            ["technicianCurrency", "Moneda del técnico", technicianCurrency],
          ] as const
        ).map(([name, label, fallback]) => (
          <div key={name} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`presupuesto-${name}`} className={labelClass}>
              {label}
            </label>
            <select
              id={`presupuesto-${name}`}
              name={name}
              defaultValue={value(name, fallback)}
              required
              className={selectClass}
            >
              {/* Sin moneda principal ni precios del modelo, no se propone ninguna. */}
              <option value="">Elegí una moneda</option>
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Reparaciones del presupuesto"
      >
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Reparaciones del presupuesto, con la lista del modelo
          </caption>
          <thead>
            <tr>
              <th scope="col" className={tableHeadCellClass}>
                Reparación
              </th>
              <th scope="col" className={tableHeadCellClass}>
                Precio al cliente
              </th>
              <th scope="col" className={tableHeadCellClass}>
                Costo del técnico
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = row.repairTypeId;
              const error = failed?.rows[id];
              return (
                <tr key={id}>
                  <td className={tableCellClass}>
                    <input type="hidden" name="typeIds" value={id} />
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        name={`include_${id}`}
                        value="1"
                        checked={checked[id] ?? false}
                        onChange={(event) =>
                          setChecked((current) => ({
                            ...current,
                            [id]: event.currentTarget.checked,
                          }))
                        }
                        aria-describedby={
                          error ? `fila-${id}-error` : undefined
                        }
                        className="size-4 accent-primary"
                      />
                      {row.name}
                    </label>
                    {row.listPrice ? null : (
                      <span className="block text-xs text-muted">
                        Sin precio en la lista: cargalo a mano.
                      </span>
                    )}
                    {error ? (
                      <p id={`fila-${id}-error`} className={fieldErrorClass}>
                        {error}
                      </p>
                    ) : null}
                  </td>
                  <td className={tableCellClass}>
                    <label htmlFor={`precio-${id}`} className="sr-only">
                      Precio al cliente de {row.name}
                    </label>
                    <input
                      id={`precio-${id}`}
                      name={`price_${id}`}
                      inputMode="decimal"
                      autoComplete="off"
                      defaultValue={value(
                        `price_${id}`,
                        row.listPrice ? amountInput(row.listPrice.price) : "",
                      )}
                      className={`${inputClass} w-32 tabular-nums`}
                    />
                    {row.listPrice ? (
                      <span className="ml-1 text-xs text-muted">
                        {row.listPrice.priceCurrency}
                      </span>
                    ) : null}
                  </td>
                  <td className={tableCellClass}>
                    <label htmlFor={`costo-${id}`} className="sr-only">
                      Costo del técnico de {row.name}
                    </label>
                    <input
                      id={`costo-${id}`}
                      name={`cost_${id}`}
                      inputMode="decimal"
                      autoComplete="off"
                      defaultValue={value(
                        `cost_${id}`,
                        row.listPrice ? amountInput(row.listPrice.cost) : "",
                      )}
                      className={`${inputClass} w-32 tabular-nums`}
                    />
                    {row.listPrice ? (
                      <span className="ml-1 text-xs text-muted">
                        {row.listPrice.costCurrency}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {failed ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {failed.message}
          </p>
        ) : null}
      </div>
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Guardando…" : "Guardar el presupuesto"}
        </button>
      </div>
    </form>
  );
}

// Aprobar, rechazar o marcarla reparada: un botón por paso.
export function StepButton({
  serviceOrderId,
  step,
  label,
  pendingLabel,
  variant = "primary",
}: {
  serviceOrderId: string;
  step: "aprobar" | "rechazar" | "reparada";
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(
    changeServiceOrderAction,
    idle,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="serviceOrderId" value={serviceOrderId} />
      <input type="hidden" name="step" value={step} />
      <div>
        <button
          type="submit"
          disabled={pending}
          className={
            variant === "primary" ? inlineButtonClass : secondaryButtonClass
          }
        >
          {pending ? pendingLabel : label}
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}

export function DeliverButton({
  serviceOrderId,
  label,
}: {
  serviceOrderId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    deliverServiceOrderAction,
    idle,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="serviceOrderId" value={serviceOrderId} />
      <div>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Entregando…" : label}
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}

// La cancelación, con el motivo de la lista. No se deshace.
export function CancelForm({ serviceOrderId }: { serviceOrderId: string }) {
  const [state, formAction, pending] = useActionState(
    cancelServiceOrderAction,
    idle,
  );
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="serviceOrderId" value={serviceOrderId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="motivo" className={labelClass}>
            Motivo
          </label>
          <select
            id="motivo"
            name="reason"
            required
            defaultValue=""
            className={selectClass}
          >
            <option value="">Elegí un motivo</option>
            {Object.entries(CANCEL_REASON_LABEL).map(([reason, label]) => (
              <option key={reason} value={reason}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Cancelando…" : "Cancelar la orden"}
        </button>
      </div>
      <ChangeError state={state} />
    </form>
  );
}
