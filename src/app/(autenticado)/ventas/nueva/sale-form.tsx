"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { formatMoney } from "@/shared/money";
import {
  searchOrderClientsAction,
  searchOrderProductsAction,
  type OrderProductOption,
} from "../../pedidos/actions";
import { estimateLineTotal, sumEstimates } from "../../pedidos/estimate";
import { Picker } from "../../pedidos/nuevo/picker";
import { createSaleAction } from "../actions";
import type { SaleFormLine, SaleFormState } from "../messages";

// Formulario de la venta sin pedido (brief-20.3, D-6), con el del alta del pedido como molde
// (pedidos/nuevo/order-form.tsx): el mismo buscador de clientes y de productos, el precio vigente y
// el subtotal estimado de cada línea, y el total estimado al pie. El cliente es opcional: vacío es
// «Consumidor final». El total que vale lo calcula sales, y el stock lo comprueba al emitir: si no
// alcanza, el rechazo dice lo disponible de cada línea. El id del precio que se mostró viaja con la
// línea: si cambió, el servidor responde CONFLICT y la línea muestra el precio nuevo (D-4).
//
// Arranca con cinco líneas, para que sin JavaScript también se puedan cargar varias; las vacías no
// se envían. Con JavaScript se agregan y se quitan, hasta el máximo de líneas.

const INITIAL_ROWS = 5;

type Row = SaleFormLine & { key: number };

const blank = (key: number): Row => ({
  key,
  productId: "",
  productText: "",
  quantity: "",
  expectedPriceId: "",
  price: null,
});

const initialState: SaleFormState = { status: "idle" };

export function SaleForm({ maxLines }: { maxLines: number }) {
  const [state, formAction, pending] = useActionState(
    createSaleAction,
    initialState,
  );
  // Cada rechazo vuelve a montar los campos con lo que se envió y los precios nuevos: el estado
  // de las filas nace de la respuesta.
  return (
    <SaleFields
      key={state.status === "error" ? state.requestId : "inicial"}
      state={state}
      formAction={formAction}
      pending={pending}
      maxLines={maxLines}
    />
  );
}

function SaleFields({
  state,
  formAction,
  pending,
  maxLines,
}: {
  state: SaleFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  maxLines: number;
}) {
  const failed = state.status === "error" ? state : null;
  const [client, setClient] = useState({
    id: failed ? failed.values.clientId : "",
    text: failed ? failed.values.clientText : "",
  });
  const [rows, setRows] = useState<Row[]>(() => {
    const sent = failed ? failed.values.lines : [];
    const rows = sent.map((line, index) => ({ ...line, key: index }));
    while (rows.length < INITIAL_ROWS) rows.push(blank(rows.length));
    return rows;
  });
  const nextKey = useRef(rows.length);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (failed) errorRef.current?.focus();
  }, [failed]);

  const update = (key: number, change: Partial<SaleFormLine>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );

  // El total estimado, en la moneda de la primera línea con precio.
  const priced = rows.filter((row) => row.price);
  const currency = priced[0]?.price?.currency ?? null;
  const estimates = priced.flatMap((row) =>
    row.price && row.price.currency === currency
      ? [estimateLineTotal(row.price.amount, row.price.currency, row.quantity)]
      : [],
  );
  const mixed = priced.some((row) => row.price?.currency !== currency);
  const total =
    currency && estimates.length > 0 && estimates.every((value) => value)
      ? sumEstimates(estimates as string[])
      : null;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {failed ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className={formMessageClass}
        >
          {failed.message}
        </p>
      ) : null}

      <div className="flex max-w-md flex-col gap-1">
        <label htmlFor="cliente" className={labelClass}>
          Cliente (opcional)
        </label>
        <Picker
          id="cliente"
          name="clientText"
          value={client.text}
          placeholder="Nombre del cliente"
          className={inputClass}
          invalid={Boolean(failed?.clientError)}
          describedBy={
            failed?.clientError
              ? "cliente-ayuda cliente-error"
              : "cliente-ayuda"
          }
          load={searchOrderClientsAction}
          onChoose={(option) =>
            setClient({ id: option.id, text: option.label })
          }
          onType={(text) => setClient({ id: "", text })}
        />
        <input type="hidden" name="clientId" value={client.id} />
        <p id="cliente-ayuda" className="text-sm text-muted">
          Vacío, la venta es a «Consumidor final».
        </p>
        {failed?.clientError ? (
          <p id="cliente-error" className={fieldErrorClass}>
            {failed.clientError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const position = index + 1;
          const error = failed?.lineErrors[position];
          const errorId = `linea-${row.key}-error`;
          const estimate = row.price
            ? estimateLineTotal(
                row.price.amount,
                row.price.currency,
                row.quantity,
              )
            : null;
          return (
            <fieldset
              key={row.key}
              className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
            >
              <legend className="px-1 text-sm font-semibold">
                Línea {position}
              </legend>
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`producto-${row.key}`} className={labelClass}>
                  Producto
                </label>
                <Picker<OrderProductOption>
                  id={`producto-${row.key}`}
                  name="productText"
                  value={row.productText}
                  placeholder="Nombre, SKU o código de barras"
                  className={inputClass}
                  invalid={Boolean(error)}
                  describedBy={error ? errorId : undefined}
                  load={searchOrderProductsAction}
                  onChoose={(option) =>
                    update(row.key, {
                      productId: option.id,
                      productText: `${option.label} (${option.detail})`,
                      expectedPriceId: option.price?.id ?? "",
                      price: option.price
                        ? {
                            amount: option.price.amount,
                            currency: option.price.currency,
                          }
                        : null,
                    })
                  }
                  onType={(text) =>
                    update(row.key, {
                      productId: "",
                      productText: text,
                      expectedPriceId: "",
                      price: null,
                    })
                  }
                />
                <input type="hidden" name="productId" value={row.productId} />
                <input
                  type="hidden"
                  name="expectedPriceId"
                  value={row.expectedPriceId}
                />
                <input
                  type="hidden"
                  name="priceAmount"
                  value={row.price?.amount ?? ""}
                />
                <input
                  type="hidden"
                  name="priceCurrency"
                  value={row.price?.currency ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`cantidad-${row.key}`} className={labelClass}>
                  Cantidad
                </label>
                <input
                  id={`cantidad-${row.key}`}
                  name="quantity"
                  inputMode="decimal"
                  autoComplete="off"
                  value={row.quantity}
                  onChange={(event) =>
                    update(row.key, { quantity: event.currentTarget.value })
                  }
                  className={inputClass}
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? errorId : undefined}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((other) => other.key !== row.key),
                    )
                  }
                  disabled={rows.length === 1}
                >
                  Quitar
                  <span className="sr-only"> la línea {position}</span>
                </button>
              </div>
              <p className="text-sm text-muted sm:col-span-3">
                {row.price
                  ? `Precio: ${formatMoney(row.price.amount, row.price.currency)}`
                  : row.productId
                    ? "Sin precio"
                    : "Elegí un producto para ver su precio."}
                {estimate
                  ? ` · Subtotal estimado: ${formatMoney(estimate, row.price!.currency)}`
                  : null}
              </p>
              {error ? (
                <p id={errorId} className={`${fieldErrorClass} sm:col-span-3`}>
                  {error}
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={rows.length >= maxLines}
          onClick={() =>
            setRows((current) => [...current, blank(nextKey.current++)])
          }
        >
          <Icon name="plus" className="size-4" />
          Agregar línea
        </button>
        <p className="text-sm text-muted">
          Hasta {maxLines} líneas. Las líneas vacías no se envían.
        </p>
      </div>

      <div aria-live="polite" className="flex flex-col gap-1">
        <p className="text-base font-semibold">
          Total estimado:{" "}
          <span className="tabular-nums">
            {total && currency ? formatMoney(total, currency) : "—"}
          </span>
        </p>
        {mixed ? (
          <p className="text-sm text-danger">
            Hay líneas en monedas distintas: la venta toma la moneda de la
            primera, y las otras se rechazan.
          </p>
        ) : null}
        <p className="text-sm text-muted">
          El total que vale es el que calcula el sistema al emitir la venta, con
          los precios vigentes. Al emitir se descuenta el stock: si no alcanza
          lo disponible, no se emite nada.
        </p>
      </div>

      <div>
        <button type="submit" className={inlineButtonClass} disabled={pending}>
          {pending ? "Emitiendo…" : "Emitir venta"}
        </button>
      </div>
    </form>
  );
}
