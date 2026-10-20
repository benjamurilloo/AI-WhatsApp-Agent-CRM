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
import { formatQuantity, parseQuantityInput } from "@/shared/quantity";
import { Picker } from "../../../pedidos/nuevo/picker";
import { searchPurchaseOrderSuppliersAction } from "../../ordenes/actions";
import {
  estimatePurchaseLineTotal,
  sumPurchaseEstimates,
} from "../../ordenes/estimate";
import {
  createGoodsReceiptAction,
  searchGoodsReceiptProductsAction,
} from "../actions";
import {
  currencyWarning,
  SERIALS_HINT,
  SUPPLIER_REFERENCE_HINT,
  type GoodsReceiptFormLine,
  type GoodsReceiptFormState,
} from "../messages";

// Formulario del alta de una recepción (brief-22.4, D-7 y D-11). Funciona sin JavaScript, como la
// orden de compra.
//
// Con orden: el proveedor y la moneda son los de la orden y no se eligen; propone una fila por cada
// línea con faltante, con lo que falta y el costo esperado. Quien recibe baja la cantidad, la deja en
// 0 para no recibirla o corrige el costo; una fila en 0 no se envía.
//
// Sin orden: el proveedor y cada producto se eligen con el buscador del pedido, y la moneda de la
// lista; arranca con cinco filas y las vacías no se envían.
//
// En los dos, cada fila muestra su total estimado y avisa si el producto se vende en otra moneda
// (D-7). El total que vale lo calcula purchasing.

const INITIAL_ROWS = 5;

type Row = GoodsReceiptFormLine & { key: number };

const blank = (key: number): Row => ({
  key,
  orderLineId: "",
  productId: "",
  productText: "",
  quantity: "",
  unitCost: "",
  priceCurrency: "",
  serials: "",
  tracking: "",
});

const initialState: GoodsReceiptFormState = { status: "idle" };

export type CurrencyOption = { code: string; label: string };

// La orden que se recibe, con sus líneas con faltante.
export type ReceivableOrder = {
  id: string;
  displayNumber: string;
  supplierName: string;
  currency: string;
  lines: (GoodsReceiptFormLine & { pending: string; unit: string })[];
};

type Props = {
  order: ReceivableOrder | null;
  currencies: CurrencyOption[];
  maxLines: number;
};

export function GoodsReceiptForm(props: Props) {
  const [state, formAction, pending] = useActionState(
    createGoodsReceiptAction,
    initialState,
  );
  // Cada rechazo vuelve a montar los campos con lo que se envió.
  return (
    <GoodsReceiptFields
      key={state.status === "error" ? state.requestId : "inicial"}
      state={state}
      formAction={formAction}
      pending={pending}
      {...props}
    />
  );
}

function GoodsReceiptFields({
  state,
  formAction,
  pending,
  order,
  currencies,
  maxLines,
}: Props & {
  state: GoodsReceiptFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const failed = state.status === "error" ? state : null;
  const [supplier, setSupplier] = useState({
    id: failed?.values.supplierId ?? "",
    text: failed?.values.supplierText ?? "",
  });
  const [currency, setCurrency] = useState(
    order ? order.currency : (failed?.values.currency ?? ""),
  );
  const [reference, setReference] = useState(
    failed?.values.supplierReference ?? "",
  );
  const [rows, setRows] = useState<Row[]>(() => {
    if (order) {
      // Con orden, las filas son las de la orden; tras un rechazo, con lo que se envió.
      const sent = failed?.values.lines ?? [];
      return order.lines.map((line, index) => ({
        ...line,
        quantity: sent[index]?.quantity ?? line.quantity,
        unitCost: sent[index]?.unitCost ?? line.unitCost,
        serials: sent[index]?.serials ?? line.serials,
        key: index,
      }));
    }
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

  const update = (key: number, change: Partial<GoodsReceiptFormLine>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );

  const estimates = rows.map((row) =>
    estimatePurchaseLineTotal(row.unitCost, currency, row.quantity),
  );
  const filled = rows.filter((row) =>
    order
      ? Boolean(row.quantity) && parseQuantityInput(row.quantity) !== 0n
      : row.productId || row.productText || row.quantity || row.unitCost,
  );
  const total =
    currency &&
    filled.length > 0 &&
    rows.every((row, index) => !filled.includes(row) || estimates[index])
      ? sumPurchaseEstimates(
          rows.flatMap((row, index) =>
            filled.includes(row) && estimates[index] ? [estimates[index]] : [],
          ),
        )
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

      <input type="hidden" name="orderId" value={order?.id ?? ""} />

      {order ? (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Orden de compra</dt>
            <dd className="font-mono font-semibold">{order.displayNumber}</dd>
          </div>
          <div>
            <dt className="text-muted">Proveedor</dt>
            <dd className="font-semibold">{order.supplierName}</dd>
          </div>
          <div>
            <dt className="text-muted">Moneda</dt>
            <dd className="font-semibold">{order.currency}</dd>
          </div>
        </dl>
      ) : (
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
              describedBy={
                failed?.supplierError ? "proveedor-error" : undefined
              }
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
                La del costo que cobró el proveedor.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex max-w-md min-w-0 flex-col gap-1">
        <label htmlFor="referencia" className={labelClass}>
          Remito o factura del proveedor
        </label>
        <input
          id="referencia"
          name="supplierReference"
          autoComplete="off"
          maxLength={40}
          value={reference}
          onChange={(event) => setReference(event.currentTarget.value)}
          className={inputClass}
          aria-invalid={Boolean(failed?.referenceError) || undefined}
          aria-describedby={
            failed?.referenceError ? "referencia-error" : "referencia-ayuda"
          }
        />
        {failed?.referenceError ? (
          <p id="referencia-error" className={fieldErrorClass}>
            {failed.referenceError}
          </p>
        ) : (
          <p id="referencia-ayuda" className="text-sm text-muted">
            {SUPPLIER_REFERENCE_HINT}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const position = index + 1;
          const error = failed?.lineErrors[position];
          const errorId = `linea-${row.key}-error`;
          const warningId = `linea-${row.key}-moneda`;
          const estimate = estimates[index];
          const warning = currencyWarning(row.priceCurrency || null, currency);
          const orderLine = order?.lines[index];
          const describedBy =
            [error ? errorId : null, warning ? warningId : null]
              .filter(Boolean)
              .join(" ") || undefined;
          return (
            <fieldset
              key={row.key}
              className={`grid gap-3 rounded-xl border border-border p-4 ${order ? "sm:grid-cols-[minmax(0,1fr)_8rem_10rem]" : "sm:grid-cols-[minmax(0,1fr)_8rem_10rem_auto]"}`}
            >
              <legend className="px-1 text-sm font-semibold">
                Línea {position}
              </legend>
              <input type="hidden" name="orderLineId" value={row.orderLineId} />
              <input
                type="hidden"
                name="priceCurrency"
                value={row.priceCurrency}
              />
              {orderLine ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <p className={labelClass}>Producto</p>
                  <p>{row.productText}</p>
                  <p className="text-sm text-muted">
                    Falta recibir {formatQuantity(orderLine.pending)}{" "}
                    {orderLine.unit}
                  </p>
                  <input type="hidden" name="productId" value={row.productId} />
                  <input
                    type="hidden"
                    name="productText"
                    value={row.productText}
                  />
                </div>
              ) : (
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
                    describedBy={describedBy}
                    load={searchGoodsReceiptProductsAction}
                    onChoose={(option) =>
                      update(row.key, {
                        productId: option.id,
                        productText: `${option.label} (${option.detail})`,
                        priceCurrency: option.priceCurrency,
                        tracking: option.tracking,
                      })
                    }
                    onType={(text) =>
                      update(row.key, {
                        productId: "",
                        productText: text,
                        priceCurrency: "",
                        tracking: "",
                      })
                    }
                  />
                  <input type="hidden" name="productId" value={row.productId} />
                </div>
              )}
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
                  aria-describedby={describedBy}
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
                  aria-describedby={describedBy}
                />
              </div>
              {order ? null : (
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
              )}
              <input type="hidden" name="tracking" value={row.tracking} />
              {row.tracking === "quantity" ? (
                <input type="hidden" name="serials" value="" />
              ) : (
                // Los IMEI (brief-29.5, D-6). Sin JavaScript no se sabe si el producto se lleva por
                // unidad: el campo va plegado y se abre a mano; con JavaScript se abre al elegirlo.
                <details
                  className="sm:col-span-full"
                  open={
                    row.tracking === "unit" || Boolean(row.serials) || undefined
                  }
                >
                  <summary className="cursor-pointer text-sm font-semibold">
                    IMEI de las unidades
                  </summary>
                  <div className="mt-2 flex flex-col gap-1">
                    <label htmlFor={`imei-${row.key}`} className={labelClass}>
                      IMEI o número de serie, uno por renglón
                    </label>
                    <textarea
                      id={`imei-${row.key}`}
                      name="serials"
                      rows={3}
                      autoComplete="off"
                      spellCheck={false}
                      value={row.serials}
                      onChange={(event) =>
                        update(row.key, { serials: event.currentTarget.value })
                      }
                      className={`${inputClass} font-mono`}
                      aria-invalid={Boolean(error) || undefined}
                      aria-describedby={`imei-${row.key}-ayuda`}
                    />
                    <p
                      id={`imei-${row.key}-ayuda`}
                      className="text-sm text-muted"
                    >
                      {SERIALS_HINT}
                    </p>
                  </div>
                </details>
              )}
              <p className="text-sm text-muted sm:col-span-full">
                {estimate && currency
                  ? `Total estimado de la línea: ${formatMoney(estimate, currency)}`
                  : order
                    ? "Dejá la cantidad en 0 para no recibir esta línea ahora."
                    : currency
                      ? "Escribí la cantidad y el costo unitario, con el IVA incluido."
                      : "Elegí la moneda para ver el total de la línea."}
              </p>
              {warning ? (
                <p
                  id={warningId}
                  className="rounded-md bg-warning-soft px-3 py-2 text-sm text-on-warning-soft sm:col-span-full"
                >
                  {warning}
                </p>
              ) : null}
              {error ? (
                <p
                  id={errorId}
                  className={`${fieldErrorClass} sm:col-span-full`}
                >
                  {error}
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      {order ? null : (
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
      )}

      <div aria-live="polite" className="flex flex-col gap-1">
        <p className="text-base font-semibold">
          Total estimado:{" "}
          <span className="tabular-nums">
            {total && currency ? formatMoney(total, currency) : "—"}
          </span>
        </p>
        <p className="text-sm text-muted">
          El total que vale es el que calcula el sistema al registrar la
          recepción. Registrarla suma el stock y deja como costo vigente el
          costo recibido.
        </p>
      </div>

      <div>
        <button type="submit" className={inlineButtonClass} disabled={pending}>
          {pending ? "Registrando…" : "Registrar recepción"}
        </button>
      </div>
    </form>
  );
}
