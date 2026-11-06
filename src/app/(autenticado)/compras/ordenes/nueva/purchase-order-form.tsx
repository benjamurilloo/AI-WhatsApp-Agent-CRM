"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { StockTracking } from "@/modules/catalog";
import {
  cardClass,
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  outlineButtonClass,
  secondaryButtonClass,
  secondaryLinkClass,
  selectClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { formatMoney } from "@/shared/money";
import {
  formatQuantity,
  parseQuantityInput,
  quantityToDatabase,
} from "@/shared/quantity";
import { Picker } from "../../../pedidos/nuevo/picker";
import {
  createPurchaseOrderAction,
  searchPurchaseOrderProductsAction,
  searchPurchaseOrderSuppliersAction,
} from "../actions";
import { estimatePurchaseLineTotal, sumPurchaseEstimates } from "../estimate";
import {
  TRACKING_LABEL,
  type PurchaseOrderFormLine,
  type PurchaseOrderFormState,
} from "../messages";

// Formulario del alta de una orden de compra (brief-22.3, D-4 a D-6 y D-10). El proveedor y cada
// producto se eligen con el buscador del pedido (H-8); la moneda se elige de la lista, sin una
// preseleccionada (D-5); el costo unitario lo escribe quien carga y no se propone (D-6). Cada línea
// muestra su total estimado y el resumen, el de la orden: el que vale lo calcula purchasing. Cambiar
// la moneda vuelve a leer los costos escritos con sus decimales.
//
// Arranca con cinco líneas, para que sin JavaScript también se puedan cargar varias; las vacías no
// se envían. Con JavaScript se agregan y se quitan, hasta el máximo de líneas por orden.
//
// Desde la 24.8.1 tiene la forma de la lámina 02 del lote V2-11 (brief-24.8.1): la columna
// «Seguimiento» de cada línea (V-8), la columna «Resumen de la orden» con su aviso ámbar (V-9) y la
// barra de pie con «Cancelar» y «Crear orden». **Las cinco líneas iniciales se quedan** (V-7): la
// lámina dibuja una sola porque supone JavaScript, y acá el alta tiene que andar sin él.

const INITIAL_ROWS = 5;

type Row = PurchaseOrderFormLine & {
  key: number;
  // Cómo se lleva el stock del producto elegido, para «Seguimiento». Es null mientras no se eligió
  // uno de la lista, y también después de un rechazo: lo que vuelve del servidor son los valores
  // enviados (`PurchaseOrderFormLine`), que no lo incluyen. Ahí la columna dice «—» hasta que se
  // vuelva a elegir, que es honesto: el dato sale de la sugerencia, no del formulario.
  tracking: StockTracking | null;
};

const blank = (key: number): Row => ({
  key,
  productId: "",
  productText: "",
  quantity: "",
  unitCost: "",
  tracking: null,
});

const initialState: PurchaseOrderFormState = { status: "idle" };

export type CurrencyOption = { code: string; label: string };

export function PurchaseOrderForm({
  initialSupplier,
  currencies,
  defaultCurrency = null,
  maxLines,
}: {
  initialSupplier: { id: string; name: string } | null;
  currencies: CurrencyOption[];
  // La moneda principal, propuesta al empezar (brief-29.4, D-9).
  defaultCurrency?: string | null;
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
      defaultCurrency={defaultCurrency}
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
  defaultCurrency,
  maxLines,
}: {
  state: PurchaseOrderFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  initialSupplier: { id: string; name: string } | null;
  currencies: CurrencyOption[];
  defaultCurrency: string | null;
  maxLines: number;
}) {
  const failed = state.status === "error" ? state : null;
  const [supplier, setSupplier] = useState({
    id: failed ? failed.values.supplierId : (initialSupplier?.id ?? ""),
    text: failed ? failed.values.supplierText : (initialSupplier?.name ?? ""),
  });
  const [currency, setCurrency] = useState(
    failed?.values.currency ?? defaultCurrency ?? "",
  );
  const [rows, setRows] = useState<Row[]>(() => {
    const sent = failed ? failed.values.lines : [];
    const rows: Row[] = sent.map((line, index) => ({
      ...line,
      key: index,
      tracking: null,
    }));
    while (rows.length < INITIAL_ROWS) rows.push(blank(rows.length));
    return rows;
  });
  const nextKey = useRef(rows.length);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (failed) errorRef.current?.focus();
  }, [failed]);

  const update = (key: number, change: Partial<Row>) =>
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
  // Las unidades del resumen: la suma de las cantidades que ya se pueden leer. Una cantidad que
  // todavía no se entiende no suma y no rompe el resumen.
  const units = filled.reduce((sum, row) => {
    const quantity = parseQuantityInput(row.quantity);
    return quantity === null ? sum : sum + quantity;
  }, 0n);
  const currencyLabel =
    currencies.find((option) => option.code === currency)?.label ?? null;

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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard id="orden-proveedor" title="Proveedor" icon="building">
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
                  className={`${selectClass} w-full min-w-0`}
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
          </SectionCard>

          <SectionCard id="orden-productos" title="Productos" icon="package">
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
                      <label
                        htmlFor={`producto-${row.key}`}
                        className={labelClass}
                      >
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
                            tracking: option.tracking,
                          })
                        }
                        onType={(text) =>
                          update(row.key, {
                            productId: "",
                            productText: text,
                            tracking: null,
                          })
                        }
                      />
                      <input
                        type="hidden"
                        name="productId"
                        value={row.productId}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`cantidad-${row.key}`}
                        className={labelClass}
                      >
                        Cantidad
                      </label>
                      <input
                        id={`cantidad-${row.key}`}
                        name="quantity"
                        inputMode="decimal"
                        autoComplete="off"
                        value={row.quantity}
                        onChange={(event) =>
                          update(row.key, {
                            quantity: event.currentTarget.value,
                          })
                        }
                        className={inputClass}
                        aria-invalid={Boolean(error) || undefined}
                        aria-describedby={error ? errorId : undefined}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`costo-${row.key}`}
                        className={labelClass}
                      >
                        Costo unitario
                      </label>
                      <input
                        id={`costo-${row.key}`}
                        name="unitCost"
                        inputMode="decimal"
                        autoComplete="off"
                        value={row.unitCost}
                        onChange={(event) =>
                          update(row.key, {
                            unitCost: event.currentTarget.value,
                          })
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
                    {/* «Seguimiento» (V-8): cómo se lleva el stock del producto elegido. Dice de
                      antemano si al recibir se van a pedir IMEI. */}
                    <p className="text-sm text-muted sm:col-span-4">
                      Seguimiento:{" "}
                      <span className="font-semibold text-foreground">
                        {row.tracking ? TRACKING_LABEL[row.tracking] : "—"}
                      </span>
                    </p>
                    <p className="text-sm text-muted sm:col-span-4">
                      {estimate && currency
                        ? `Total estimado de la línea: ${formatMoney(estimate, currency)}`
                        : currency
                          ? "Escribí la cantidad y el costo unitario, con el IVA incluido."
                          : "Elegí la moneda para ver el total de la línea."}
                    </p>
                    {error ? (
                      <p
                        id={errorId}
                        className={`${fieldErrorClass} sm:col-span-4`}
                      >
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
                className={outlineButtonClass}
                disabled={rows.length >= maxLines}
                onClick={() =>
                  setRows((current) => [...current, blank(nextKey.current++)])
                }
              >
                <Icon name="plus" className="size-4" />
                Agregar producto
              </button>
              <p className="text-sm text-muted">
                Hasta {maxLines} líneas. Las líneas vacías no se envían.
              </p>
            </div>

            {/* El aviso al pie de la lámina 02: las dos cosas que hay que saber antes de escribir
              un costo y antes de esperar que la orden pida IMEI. */}
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-muted">
              <Icon name="info" className="mt-0.5 size-4 shrink-0" />
              <span>
                Costo con IVA incluido.
                <br />
                Los IMEI se cargan al recibir los equipos.
              </span>
            </p>
          </SectionCard>
        </div>

        {/* «Resumen de la orden» (V-9): lo que se está por crear, con el aviso de lo que **no**
            pasa al crearla. Vive al lado en escritorio y arriba del pie en teléfono. */}
        <aside
          aria-live="polite"
          aria-labelledby="resumen-alta"
          className={`flex flex-col gap-3 p-4 ${cardClass}`}
        >
          <h2 id="resumen-alta" className="text-base font-semibold">
            Resumen de la orden
          </h2>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted">Proveedor</dt>
              <dd className="font-semibold">{supplier.text || "Sin elegir"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted">Moneda</dt>
              <dd className="font-semibold">{currencyLabel ?? "Sin elegir"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
              <dt className="text-muted">Productos</dt>
              <dd className="font-semibold tabular-nums">{filled.length}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Unidades</dt>
              <dd className="font-semibold tabular-nums">
                {formatQuantity(quantityToDatabase(units))}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-xl bg-primary-soft px-3 py-2">
              <dt className="font-semibold text-on-primary-soft">Total</dt>
              <dd className="font-semibold tabular-nums text-on-primary-soft">
                {total && currency ? formatMoney(total, currency) : "—"}
              </dd>
            </div>
          </dl>
          <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            Crear la orden no incorpora stock ni registra un pago.
          </p>
          <p className="text-sm text-muted">
            El total que vale es el que calcula el sistema al crear la orden.
          </p>
        </aside>
      </div>

      {/* La barra de pie de la lámina: la acción que se va y la que crea, juntas y al final. */}
      <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
        <Link href="/compras/ordenes" className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" className={inlineButtonClass} disabled={pending}>
          {pending ? "Creando…" : "Crear orden"}
        </button>
      </div>
    </form>
  );
}
