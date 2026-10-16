"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  selectClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { formatMoney } from "@/shared/money";
import { Picker } from "../../../pedidos/nuevo/picker";
import {
  createPurchaseOrderAction,
  searchPurchaseOrderProductsAction,
  searchPurchaseOrderSuppliersAction,
} from "../actions";
import { estimatePurchaseLineTotal, sumPurchaseEstimates } from "../estimate";
import type {
  PurchaseOrderFormLine,
  PurchaseOrderFormState,
} from "../messages";

// Formulario del alta de una orden de compra (brief-22.3, D-4 a D-6 y D-10). El proveedor y cada
// producto se eligen con el buscador del pedido (H-8); la moneda se elige de la lista, sin una
// preseleccionada (D-5); el costo unitario lo escribe quien carga y no se propone (D-6). Cada línea
// muestra su total estimado y el pie, el de la orden: el que vale lo calcula purchasing. Cambiar la
// moneda vuelve a leer los costos escritos con sus decimales.
//
// Arranca con cinco líneas, para que sin JavaScript también se puedan cargar varias; las vacías no
// se envían. Con JavaScript se agregan y se quitan, hasta el máximo de líneas por orden.

const INITIAL_ROWS = 5;

type Row = PurchaseOrderFormLine & { key: number };

const blank = (key: number): Row => ({
  key,
  productId: "",
  productText: "",
  quantity: "",
  unitCost: "",
});

const initialState: PurchaseOrderFormState = { status: "idle" };

export type CurrencyOption = { code: string; label: string };

export function PurchaseOrderForm({
  initialSupplier,
  currencies,
  maxLines,
}: {
  initialSupplier: { id: string; name: string } | null;
  currencies: CurrencyOption[];
  maxLines: number;
}) {
  const [state, formAction, pending] = useActionState(
    createPurchaseOrderAction,
    initialState,
  );
  // Cada rechazo vuelve a montar los campos con lo que se envió: el estado de las filas nace de la
  // respuesta.
  return (
    <PurchaseOrderFields
      key={state.status === "error" ? state.requestId : "inicial"}
      state={state}
      formAction={formAction}
      pending={pending}
      initialSupplier={initialSupplier}
      currencies={currencies}
      maxLines={maxLines}
    />
  );
}

function PurchaseOrderFields({
  state,
  formAction,
  pending,
  initialSupplier,
  currencies,
  maxLines,
}: {
  state: PurchaseOrderFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  initialSupplier: { id: string; name: string } | null;
  currencies: CurrencyOption[];
  maxLines: number;
}) {
  const failed = state.status === "error" ? state : null;
  const [supplier, setSupplier] = useState({
    id: failed ? failed.values.supplierId : (initialSupplier?.id ?? ""),
    text: failed ? failed.values.supplierText : (initialSupplier?.name ?? ""),
  });
  const [currency, setCurrency] = useState(failed?.values.currency ?? "");
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

  const update = (key: number, change: Partial<PurchaseOrderFormLine>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );

  const estimates = rows.map((row) =>
    estimatePurchaseLineTotal(row.unitCost, currency, row.quantity),
  );
  const filled = rows.filter(
    (row) => row.productId || row.productText || row.quantity || row.unitCost,
  );
  const total =
    currency &&
    filled.length > 0 &&
    rows.every((row, index) => !filled.includes(row) || estimates[index])
      ? sumPurchaseEstimates(estimates.filter((value) => value !== null))
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

      <div className="grid gap-4 sm:grid-cols-[minmax(0,28rem)_minmax(0,16rem)]">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="proveedor" className={labelClass}>
            Proveedor
          </label>
          <Picker
            id="proveedor"
            name="supplierText"
            value={supplier.text}
            placeholder="Nombre o CUIT del proveedor"
            className={inputClass}
            invalid={Boolean(failed?.supplierError)}
            describedBy={failed?.supplierError ? "proveedor-error" : undefined}
            load={searchPurchaseOrderSuppliersAction}
            onChoose={(option) =>
              setSupplier({ id: option.id, text: option.label })
            }
            onType={(text) => setSupplier({ id: "", text })}
          />
          <input type="hidden" name="supplierId" value={supplier.id} />
          {failed?.supplierError ? (
            <p id="proveedor-error" className={fieldErrorClass}>
              {failed.supplierError}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="moneda" className={labelClass}>
            Moneda
          </label>
          <select
            id="moneda"
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.currentTarget.value)}
            className={selectClass}
            aria-invalid={Boolean(failed?.currencyError) || undefined}
            aria-describedby={
              failed?.currencyError ? "moneda-error" : "moneda-ayuda"
            }
          >
            <option value="">Elegí la moneda</option>
            {currencies.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          {failed?.currencyError ? (
            <p id="moneda-error" className={fieldErrorClass}>
              {failed.currencyError}
            </p>
          ) : (
            <p id="moneda-ayuda" className="text-sm text-muted">
              Todas las líneas van en esta moneda.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const position = index + 1;
          const error = failed?.lineErrors[position];
          const errorId = `linea-${row.key}-error`;
          const estimate = estimates[index];
          return (
            <fieldset
              key={row.key}
              className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[minmax(0,1fr)_8rem_10rem_auto]"
            >
              <legend className="px-1 text-sm font-semibold">
                Línea {position}
              </legend>
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`producto-${row.key}`} className={labelClass}>
                  Producto
                </label>
                <Picker
                  id={`producto-${row.key}`}
                  name="productText"
                  value={row.productText}
                  placeholder="Nombre, SKU o código de barras"
                  className={inputClass}
                  invalid={Boolean(error)}
                  describedBy={error ? errorId : undefined}
                  load={searchPurchaseOrderProductsAction}
                  onChoose={(option) =>
                    update(row.key, {
                      productId: option.id,
                      productText: `${option.label} (${option.detail})`,
                    })
                  }
                  onType={(text) =>
                    update(row.key, { productId: "", productText: text })
                  }
                />
                <input type="hidden" name="productId" value={row.productId} />
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
              <div className="flex flex-col gap-1">
                <label htmlFor={`costo-${row.key}`} className={labelClass}>
                  Costo unitario
                </label>
                <input
                  id={`costo-${row.key}`}
                  name="unitCost"
                  inputMode="decimal"
                  autoComplete="off"
                  value={row.unitCost}
                  onChange={(event) =>
                    update(row.key, { unitCost: event.currentTarget.value })
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
              <p className="text-sm text-muted sm:col-span-4">
                {estimate && currency
                  ? `Total estimado de la línea: ${formatMoney(estimate, currency)}`
                  : currency
                    ? "Escribí la cantidad y el costo unitario, con el IVA incluido."
                    : "Elegí la moneda para ver el total de la línea."}
              </p>
              {error ? (
                <p id={errorId} className={`${fieldErrorClass} sm:col-span-4`}>
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
        <p className="text-sm text-muted">
          El total que vale es el que calcula el sistema al crear la orden.
        </p>
      </div>

      <div>
        <button type="submit" className={inlineButtonClass} disabled={pending}>
          {pending ? "Creando…" : "Crear orden de compra"}
        </button>
      </div>
    </form>
  );
}
