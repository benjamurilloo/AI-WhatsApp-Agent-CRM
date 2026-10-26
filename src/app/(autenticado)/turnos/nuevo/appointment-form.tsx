"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { AppointmentReference } from "@/modules/appointments";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  radioClass,
  secondaryLinkClass,
  selectClass,
} from "@/app/_components/form-styles";
import { searchOrderClientsAction } from "../../pedidos/actions";
import { Picker } from "../../pedidos/nuevo/picker";
import { createAppointmentAction } from "../actions";
import { formatRange, type FormState } from "../messages";

// El formulario del alta de un turno (brief-29.10, D-5). El cliente se elige con el buscador del pedido,
// que sin JavaScript es un campo de texto con su nombre exacto. La fecha llega fija del formulario de
// la fecha; la franja, entre las libres. Funciona sin JavaScript, conserva lo elegido tras un rechazo y
// lleva el foco al campo inválido.

const idle: FormState = { status: "idle" };

const REFERENCE_LABEL: Record<AppointmentReference["kind"], string> = {
  product: "Producto",
  unit: "Equipo (IMEI)",
};

export function AppointmentForm({
  date,
  freeSlots,
  initialSlot,
  reasons,
  initialClient,
  reference,
  noteMax,
}: {
  date: string;
  freeSlots: { start: string; end: string }[];
  initialSlot: string;
  reasons: { id: string; name: string }[];
  initialClient: { id: string; name: string } | null;
  reference: AppointmentReference | null;
  noteMax: number;
}) {
  const [state, formAction, pending] = useActionState(
    createAppointmentAction,
    idle,
  );
  const failed = state.status === "error" ? state : null;
  const [client, setClient] = useState({
    id: failed ? (failed.values.clientId ?? "") : (initialClient?.id ?? ""),
    text: failed
      ? (failed.values.clientText ?? "")
      : (initialClient?.name ?? ""),
  });
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    const target = {
      client: "cliente",
      reason: "motivo",
      start: "franja-0",
      note: "nota",
    }[state.field ?? ""];
    if (target) document.getElementById(target)?.focus();
    else errorRef.current?.focus();
  }, [state]);
  const fieldError = (name: string) =>
    failed && failed.field === name ? failed.message : null;
  const chosenSlot = failed ? (failed.values.start ?? "") : initialSlot;

  const clientError = fieldError("client");
  const reasonError = fieldError("reason");
  const slotError = fieldError("start");
  const noteError = fieldError("note");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="date" value={date} />
      {reference ? (
        <input
          type="hidden"
          name={reference.kind === "unit" ? "unitId" : "productId"}
          value={reference.id}
        />
      ) : null}

      <div className="flex max-w-md flex-col gap-1">
        <label htmlFor="cliente" className={labelClass}>
          Cliente *
        </label>
        <Picker
          id="cliente"
          name="clientText"
          value={client.text}
          placeholder="Nombre del cliente"
          className={inputClass}
          invalid={Boolean(clientError)}
          describedBy={clientError ? "cliente-error" : undefined}
          load={searchOrderClientsAction}
          onChoose={(option) =>
            setClient({ id: option.id, text: option.label })
          }
          onType={(text) => setClient({ id: "", text })}
        />
        <input type="hidden" name="clientId" value={client.id} />
        {clientError ? (
          <p id="cliente-error" className={fieldErrorClass}>
            {clientError}
          </p>
        ) : null}
      </div>

      <div className="flex max-w-md flex-col gap-1">
        <label htmlFor="motivo" className={labelClass}>
          Motivo *
        </label>
        <select
          id="motivo"
          name="reasonId"
          required
          defaultValue={failed?.values.reasonId ?? ""}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? "motivo-error" : undefined}
          className={selectClass}
        >
          <option value="">Elegí un motivo</option>
          {reasons.map((reason) => (
            <option key={reason.id} value={reason.id}>
              {reason.name}
            </option>
          ))}
        </select>
        {reasonError ? (
          <p id="motivo-error" className={fieldErrorClass}>
            {reasonError}
          </p>
        ) : null}
      </div>

      <fieldset
        aria-describedby={slotError ? "franja-error" : undefined}
        className="flex flex-col gap-2"
      >
        <legend className={labelClass}>Franja *</legend>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {freeSlots.map((slot, index) => (
            <label
              key={slot.start}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <input
                id={`franja-${index}`}
                type="radio"
                name="start"
                value={slot.start}
                required
                defaultChecked={slot.start === chosenSlot}
                className={radioClass}
              />
              {formatRange(slot.start, slot.end)}
            </label>
          ))}
        </div>
        {slotError ? (
          <p id="franja-error" className={fieldErrorClass}>
            {slotError}
          </p>
        ) : null}
      </fieldset>

      {reference ? (
        <p className="text-sm">
          <span className="font-semibold">
            {REFERENCE_LABEL[reference.kind]}:
          </span>{" "}
          <span className={reference.kind === "unit" ? "font-mono" : undefined}>
            {reference.label}
          </span>
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="nota" className={labelClass}>
          Nota
        </label>
        <textarea
          id="nota"
          name="note"
          rows={3}
          maxLength={noteMax}
          defaultValue={failed?.values.note ?? ""}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={noteError ? "nota-error" : "nota-ayuda"}
          className={inputClass}
        />
        {noteError ? (
          <p id="nota-error" className={fieldErrorClass}>
            {noteError}
          </p>
        ) : (
          <p id="nota-ayuda" className="text-sm text-muted">
            Opcional. Lo que haga falta saber para atenderlo.
          </p>
        )}
      </div>

      <div aria-live="polite" aria-atomic="true">
        {failed && failed.field === null ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {failed.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Dando el turno…" : "Dar el turno"}
        </button>
        <Link href="/turnos" className={secondaryLinkClass}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
