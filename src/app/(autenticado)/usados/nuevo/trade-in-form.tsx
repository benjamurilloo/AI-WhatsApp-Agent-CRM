"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { TradeInForm as TradeInFormData } from "@/modules/tradeins";
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
import { createTradeInAction } from "../actions";
import { DESTINATION_LABEL, type FormState } from "../messages";

// El formulario de la recepción de un usado (brief-29.7, D-7). El cliente se elige con el buscador del
// pedido, que sin JavaScript es un campo de texto con su nombre exacto. El checklist es un casillero por
// punto: marcado, pasó; los obligatorios lo dicen. Funciona sin JavaScript, conserva lo escrito tras un
// rechazo y lleva el foco al campo inválido.

const idle: FormState = { status: "idle" };

const FIELD_TARGET: Record<string, string> = {
  client: "cliente",
  product: "producto",
  serial: "imei",
  batteryHealth: "bateria",
  grade: "grado",
  value: "valor",
  currency: "moneda",
  destination: "destino-sale_credit",
};

export function TradeInForm({
  initialClient,
  form,
}: {
  initialClient: { id: string; name: string } | null;
  form: TradeInFormData;
}) {
  const [state, formAction, pending] = useActionState(
    createTradeInAction,
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
    const target = FIELD_TARGET[state.field ?? ""];
    if (target) document.getElementById(target)?.focus();
    else errorRef.current?.focus();
  }, [state]);
  const fieldError = (name: string) =>
    failed && failed.field === name ? failed.message : null;
  const value = (name: string) => failed?.values[name] ?? "";
  const passed = new Set(failed?.passed ?? []);
  const describedBy = (name: string, id: string, help?: string) =>
    fieldError(name) ? `${id}-error` : help;

  const clientError = fieldError("client");

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
          <label htmlFor="producto" className={labelClass}>
            Producto usado *
          </label>
          <select
            id="producto"
            name="productId"
            required
            defaultValue={value("productId")}
            aria-invalid={fieldError("product") ? true : undefined}
            aria-describedby={describedBy(
              "product",
              "producto",
              "producto-ayuda",
            )}
            className={selectClass}
          >
            <option value="">Elegí un producto</option>
            {form.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku})
              </option>
            ))}
          </select>
          {fieldError("product") ? (
            <p id="producto-error" className={fieldErrorClass}>
              {fieldError("product")}
            </p>
          ) : (
            <p id="producto-ayuda" className="text-sm text-muted">
              El equipo entra como una unidad de este producto.
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="imei" className={labelClass}>
            IMEI o número de serie *
          </label>
          <input
            id="imei"
            name="serial"
            required
            maxLength={32}
            autoComplete="off"
            defaultValue={value("serial")}
            aria-invalid={fieldError("serial") ? true : undefined}
            aria-describedby={describedBy("serial", "imei")}
            className={`${inputClass} font-mono`}
          />
          {fieldError("serial") ? (
            <p id="imei-error" className={fieldErrorClass}>
              {fieldError("serial")}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="bateria" className={labelClass}>
            Salud de la batería (%) *
          </label>
          <input
            id="bateria"
            name="batteryHealth"
            required
            inputMode="numeric"
            pattern="[0-9]{1,3}"
            maxLength={3}
            autoComplete="off"
            defaultValue={value("batteryHealth")}
            aria-invalid={fieldError("batteryHealth") ? true : undefined}
            aria-describedby={describedBy("batteryHealth", "bateria")}
            className={inputClass}
          />
          {fieldError("batteryHealth") ? (
            <p id="bateria-error" className={fieldErrorClass}>
              {fieldError("batteryHealth")}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="grado" className={labelClass}>
            Grado propuesto *
          </label>
          <select
            id="grado"
            name="gradeId"
            required
            defaultValue={value("gradeId")}
            aria-invalid={fieldError("grade") ? true : undefined}
            aria-describedby={describedBy("grade", "grado")}
            className={selectClass}
          >
            <option value="">Elegí un grado</option>
            {form.grades.map((grade) => (
              <option key={grade.id} value={grade.id}>
                {grade.description
                  ? `${grade.name} — ${grade.description}`
                  : grade.name}
              </option>
            ))}
          </select>
          {fieldError("grade") ? (
            <p id="grado-error" className={fieldErrorClass}>
              {fieldError("grade")}
            </p>
          ) : null}
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Checklist</legend>
        {form.checklist.length === 0 ? (
          <p className="text-sm text-muted">
            No hay puntos en el checklist: el equipo se recibe sin revisarlos.
          </p>
        ) : (
          <>
            <p id="checklist-ayuda" className="text-sm text-muted">
              Marcá lo que funciona. Si un punto obligatorio no pasa, el equipo
              no se recibe.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {form.checklist.map((item) => (
                <li key={item.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="passed"
                      value={item.id}
                      defaultChecked={passed.has(item.id)}
                      className="mt-0.5 size-4"
                    />
                    <span>
                      {item.name}
                      {item.isMandatory ? (
                        <span className="font-semibold"> (obligatorio)</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="valor" className={labelClass}>
            Valor reconocido *
          </label>
          <input
            id="valor"
            name="value"
            required
            inputMode="decimal"
            autoComplete="off"
            defaultValue={value("value")}
            aria-invalid={fieldError("value") ? true : undefined}
            aria-describedby={describedBy("value", "valor", "valor-ayuda")}
            className={inputClass}
          />
          {fieldError("value") ? (
            <p id="valor-error" className={fieldErrorClass}>
              {fieldError("value")}
            </p>
          ) : (
            <p id="valor-ayuda" className="text-sm text-muted">
              Es el costo de la unidad.
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="moneda" className={labelClass}>
            Moneda *
          </label>
          <select
            id="moneda"
            name="currency"
            required
            defaultValue={value("currency") || (form.mainCurrency ?? "")}
            aria-invalid={fieldError("currency") ? true : undefined}
            aria-describedby={describedBy("currency", "moneda")}
            className={selectClass}
          >
            <option value="">Elegí una moneda</option>
            {form.currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          {fieldError("currency") ? (
            <p id="moneda-error" className={fieldErrorClass}>
              {fieldError("currency")}
            </p>
          ) : null}
        </div>
      </div>

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={
          fieldError("destination") ? "destino-error" : "destino-ayuda"
        }
      >
        <legend className={labelClass}>Destino del valor *</legend>
        {(["sale_credit", "purchase"] as const).map((destination) => (
          <label key={destination} className="flex items-center gap-2 text-sm">
            <input
              id={`destino-${destination}`}
              type="radio"
              name="destination"
              value={destination}
              required
              defaultChecked={value("destination") === destination}
              className="size-4"
            />
            {DESTINATION_LABEL[destination]}
          </label>
        ))}
        {fieldError("destination") ? (
          <p id="destino-error" className={fieldErrorClass}>
            {fieldError("destination")}
          </p>
        ) : (
          <p id="destino-ayuda" className="text-sm text-muted">
            No cambia después. La permuta se descuenta al cobrar una venta del
            cliente, y la compra se le paga desde el usado.
          </p>
        )}
      </fieldset>

      <div aria-live="polite" aria-atomic="true">
        {failed && failed.field === null ? (
          <p ref={errorRef} tabIndex={-1} className={formMessageClass}>
            {failed.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Recibiendo…" : "Recibir el usado"}
        </button>
        <Link href="/usados" className={secondaryLinkClass}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
