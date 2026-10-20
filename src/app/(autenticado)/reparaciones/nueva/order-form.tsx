"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryLinkClass,
  selectClass,
} from "@/app/_components/form-styles";
import { searchOrderClientsAction } from "../../pedidos/actions";
import { Picker } from "../../pedidos/nuevo/picker";
import { createServiceOrderAction } from "../actions";
import type { FormState } from "../messages";

// El formulario del alta de una orden de servicio (brief-29.6, D-10). El cliente se elige con el
// buscador del pedido, que sin JavaScript es un campo de texto con su nombre exacto. Funciona sin
// JavaScript, conserva lo escrito tras un rechazo y lleva el foco al campo inválido.

const idle: FormState = { status: "idle" };

export function ServiceOrderForm({
  initialClient,
  models,
}: {
  initialClient: { id: string; name: string } | null;
  models: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createServiceOrderAction,
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
      model: "modelo",
      deviceSerial: "imei",
      reportedIssue: "reporte",
    }[state.field ?? ""];
    if (target) document.getElementById(target)?.focus();
    else errorRef.current?.focus();
  }, [state]);
  const fieldError = (name: string) =>
    failed && failed.field === name ? failed.message : null;
  const value = (name: string) => failed?.values[name] ?? "";

  const clientError = fieldError("client");
  const modelError = fieldError("model");
  const serialError = fieldError("deviceSerial");
  const issueError = fieldError("reportedIssue");

  return (
    <form action={formAction} className="flex flex-col gap-5">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="modelo" className={labelClass}>
            Modelo del equipo *
          </label>
          <select
            id="modelo"
            name="modelId"
            required
            defaultValue={value("modelId")}
            aria-invalid={modelError ? true : undefined}
            aria-describedby={modelError ? "modelo-error" : undefined}
            className={selectClass}
          >
            <option value="">Elegí un modelo</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          {modelError ? (
            <p id="modelo-error" className={fieldErrorClass}>
              {modelError}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="imei" className={labelClass}>
            IMEI o número de serie
          </label>
          <input
            id="imei"
            name="deviceSerial"
            maxLength={32}
            autoComplete="off"
            defaultValue={value("deviceSerial")}
            aria-invalid={serialError ? true : undefined}
            aria-describedby={serialError ? "imei-error" : "imei-ayuda"}
            className={`${inputClass} font-mono`}
          />
          {serialError ? (
            <p id="imei-error" className={fieldErrorClass}>
              {serialError}
            </p>
          ) : (
            <p id="imei-ayuda" className="text-sm text-muted">
              Opcional. No es una unidad del stock.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reporte" className={labelClass}>
          Lo que reporta el cliente *
        </label>
        <textarea
          id="reporte"
          name="reportedIssue"
          required
          rows={4}
          maxLength={1000}
          defaultValue={value("reportedIssue")}
          aria-invalid={issueError ? true : undefined}
          aria-describedby={issueError ? "reporte-error" : undefined}
          className={inputClass}
        />
        {issueError ? (
          <p id="reporte-error" className={fieldErrorClass}>
            {issueError}
          </p>
        ) : null}
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
          {pending ? "Creando…" : "Crear la orden"}
        </button>
        <Link href="/reparaciones" className={secondaryLinkClass}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
