"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useHydrated } from "@/app/_components/disclosure";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  secondaryLinkClass,
  sectionTitleClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { useUnsavedChanges } from "@/app/_components/unsaved-changes";
import { UnsavedChangesDialog } from "@/app/_components/unsaved-changes-dialog";
import { splitLineSerials } from "@/shared/lines";
import { formatMoney } from "@/shared/money";
import {
  searchOrderClientsAction,
  searchOrderProductsAction,
  type OrderProductOption,
} from "../../pedidos/actions";
import { sumEstimates } from "../../pedidos/estimate";
import { Picker } from "../../pedidos/nuevo/picker";
import {
  blankLine,
  estimateRow,
  LineQuantity,
  LineSerials,
  type LineRow,
} from "../../pedidos/nuevo/line-units";
import { UnitDialog } from "../../pedidos/nuevo/unit-dialog";
import { createSaleAction } from "../actions";
import {
  BEFORE_ISSUE_CHECK_NOTE,
  BEFORE_ISSUE_NOTES,
  BEFORE_ISSUE_TITLE,
  beforeIssueCountText,
  CONSUMER_TEXT,
  LEAVE_SALE_LABEL,
  QUANTITY_FROM_UNITS_NOTE,
  type SaleFormState,
} from "../messages";

// Formulario de la venta sin pedido (brief-20.3, D-6), con el del alta del pedido como molde
// (pedidos/nuevo/order-form.tsx): el mismo buscador de clientes y de productos, el precio vigente y
// el subtotal estimado de cada línea, y el total estimado al pie. El cliente es opcional: vacío es
// «Consumidor final». El total que vale lo calcula sales, y el stock lo comprueba al emitir: si no
// alcanza, el rechazo dice lo disponible de cada línea. El id del precio que se mostró viaja con la
// línea: si cambió, el servidor responde CONFLICT y la línea muestra el precio nuevo (D-4).
//
// Arranca con cinco líneas, para que sin JavaScript también se puedan cargar varias; las vacías no
// se envían. Con JavaScript se agregan y se quitan, hasta el máximo de líneas.
//
// Desde la 24.6.2 toma la forma de las láminas 02 y 06 de la v2 (V2-09), que es la misma que el
// alta de un pedido tomó en la 24.6.1-b: en un producto por unidad los equipos se eligen en el
// panel «Elegir unidades», lo elegido se ve como chips, y la cantidad, el precio unitario y el
// subtotal son de solo lectura. Lo propio de esta pantalla es el resumen **«Antes de emitir»**, que
// va en la columna derecha en escritorio y al pie en el teléfono, con «Emitir venta» y «Volver sin
// guardar». El formulario arma su propia tarjeta para que el panel y el resumen vayan al costado.
//
// **Ninguna regla de la emisión cambia**: qué se valida, qué se rechaza y qué se descuenta es lo
// mismo que antes. Lo que cambia es cómo se eligen los equipos y qué se ve antes de emitir.

const INITIAL_ROWS = 5;

// El resumen tiene el botón de enviar y vive fuera del `<form>`, así que lo apunta por su id. Es
// HTML, no JavaScript: sin hidratar el botón envía igual.
const FORM_ID = "venta-nueva";

type Row = LineRow;

const blank = blankLine;

const initialState: SaleFormState = { status: "idle" };

export function SaleForm({
  maxLines,
  unitsEnabled,
  initialClient = null,
}: {
  maxLines: number;
  unitsEnabled: boolean;
  // Desde «Nueva operación» de la ficha del cliente (brief-24.4.3, D-4).
  initialClient?: { id: string; name: string } | null;
}) {
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
      unitsEnabled={unitsEnabled}
      initialClient={initialClient}
    />
  );
}

function SaleFields({
  state,
  formAction,
  pending,
  maxLines,
  unitsEnabled,
  initialClient,
}: {
  state: SaleFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  maxLines: number;
  unitsEnabled: boolean;
  initialClient: { id: string; name: string } | null;
}) {
  const failed = state.status === "error" ? state : null;
  const [client, setClient] = useState({
    id: failed ? failed.values.clientId : (initialClient?.id ?? ""),
    text: failed ? failed.values.clientText : (initialClient?.name ?? ""),
  });
  const [rows, setRows] = useState<Row[]>(() => {
    const sent = failed ? failed.values.lines : [];
    const rows = sent.map((line, index) => ({ ...line, key: index }));
    while (rows.length < INITIAL_ROWS) rows.push(blank(rows.length));
    return rows;
  });
  const nextKey = useRef(rows.length);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const hydrated = useHydrated();
  const panelTitleId = useId();
  const summaryId = useId();
  // «Volver sin guardar» y el enlace de volver preguntan solo si hay algo cargado (brief-24.6.2,
  // D-4): el diálogo de la 23.2 compara el formulario con lo que tenía al montarse.
  const { formRef, dialog } = useUnsavedChanges();
  // Qué línea tiene abierto el panel «Elegir unidades»: una sola a la vez. No va en la URL por el
  // mismo motivo que en el alta de un pedido (brief-24.6.1-b, D-1): el borrador vive acá, en estado
  // de cliente, y una navegación de ruta lo perdería.
  const [unitsFor, setUnitsFor] = useState<number | null>(null);
  const openRow = rows.find((row) => row.key === unitsFor) ?? null;
  const panelRow =
    openRow && openRow.productId !== "" && openRow.unitTracked ? openRow : null;
  const panelOpen = panelRow !== null;
  // Si la línea se quitó o cambió de producto mientras el panel estaba abierto, se cierra solo.
  if (unitsFor !== null && panelRow === null) setUnitsFor(null);

  useEffect(() => {
    if (failed) errorRef.current?.focus();
  }, [failed]);

  const update = (key: number, change: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );

  // El total estimado, en la moneda de la primera línea con precio.
  const priced = rows.filter((row) => row.price);
  const currency = priced[0]?.price?.currency ?? null;
  const estimates = priced.flatMap((row) =>
    row.price && row.price.currency === currency
      ? [estimateRow(row).estimate]
      : [],
  );
  const mixed = priced.some((row) => row.price?.currency !== currency);
  const total =
    currency && estimates.length > 0 && estimates.every((value) => value)
      ? sumEstimates(estimates as string[])
      : null;

  // Lo que el resumen cuenta: los equipos elegidos y, si no hay ninguno, las líneas con producto.
  const chosenUnits = rows.reduce(
    (count, row) =>
      count + (row.unitTracked ? splitLineSerials(row.serials).length : 0),
    0,
  );
  const loadedLines = rows.filter((row) => row.productId !== "").length;

  return (
    <>
      <div className="mt-6 lg:flex lg:items-start lg:gap-8">
        {/* El cuerpo queda inerte mientras el panel está abierto, como en la 24.5.3, la 24.6.1 y el
            alta de un pedido. `inert` cubre el cuerpo de la pantalla y **no** el marco de la
            aplicación, así que el panel no se declara `aria-modal`: diría que atrapa un foco que no
            atrapa. */}
        <div
          className={`min-w-0 flex-1 ${panelOpen ? "opacity-60" : ""}`}
          inert={panelOpen ? true : undefined}
        >
          <SectionCard
            id="venta-titulo"
            title="Cliente y líneas"
            icon="receipt"
          >
            <form
              id={FORM_ID}
              ref={formRef}
              action={formAction}
              className="flex flex-col gap-6"
              noValidate
            >
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
                  const { estimate, expectedLineTotal } = estimateRow(row);
                  // Un producto por unidad, ya hidratado: la línea toma la forma de la lámina 02.
                  const byUnit = unitsEnabled && hydrated && row.unitTracked;
                  return (
                    <fieldset
                      key={row.key}
                      className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
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
                              unitTracked: option.unitTracked,
                              serials: "",
                              unitOptions: undefined,
                            })
                          }
                          onType={(text) =>
                            update(row.key, {
                              productId: "",
                              productText: text,
                              expectedPriceId: "",
                              price: null,
                              unitTracked: false,
                              unitOptions: undefined,
                            })
                          }
                        />
                        <input
                          type="hidden"
                          name="productId"
                          value={row.productId}
                        />
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
                      {/* Donde la lámina pone el precio unitario, al lado del producto. Sin
                          equipos, sigue estando la cantidad, que es editable. */}
                      {byUnit ? (
                        <ReadOnlyField
                          label="Precio unitario"
                          value={
                            row.price
                              ? formatMoney(
                                  row.price.amount,
                                  row.price.currency,
                                )
                              : "Sin precio"
                          }
                        />
                      ) : (
                        <LineQuantity
                          row={row}
                          unitsEnabled={unitsEnabled}
                          invalid={Boolean(error)}
                          describedBy={error ? errorId : undefined}
                          onChange={(change) => update(row.key, change)}
                        />
                      )}
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
                      <LineSerials
                        row={row}
                        unitsEnabled={unitsEnabled}
                        expectedLineTotal={expectedLineTotal}
                        invalid={Boolean(error)}
                        describedBy={error ? errorId : undefined}
                        onChange={(change) => update(row.key, change)}
                        chooseUnits={{
                          open: unitsFor === row.key,
                          onOpen: () => setUnitsFor(row.key),
                        }}
                      />
                      {byUnit ? (
                        // La fila de abajo de la lámina: la cantidad, que es la cantidad de
                        // equipos, y el subtotal. Los dos de solo lectura, porque los dos salen de
                        // lo elegido.
                        <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-1">
                            <LineQuantity
                              row={row}
                              unitsEnabled={unitsEnabled}
                              invalid={Boolean(error)}
                              describedBy={error ? errorId : undefined}
                              onChange={(change) => update(row.key, change)}
                              unitNoun={{ one: "equipo", many: "equipos" }}
                            />
                            <p className="text-sm text-muted">
                              {QUANTITY_FROM_UNITS_NOTE}
                            </p>
                          </div>
                          <ReadOnlyField
                            label="Subtotal"
                            value={
                              estimate && row.price
                                ? formatMoney(estimate, row.price.currency)
                                : "—"
                            }
                          />
                        </div>
                      ) : (
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
                      )}
                      {error ? (
                        <p
                          id={errorId}
                          className={`${fieldErrorClass} sm:col-span-3`}
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

              {mixed ? (
                <p className="text-sm text-danger">
                  Hay líneas en monedas distintas: la venta toma la moneda de la
                  primera, y las otras se rechazan.
                </p>
              ) : null}
              <p className="text-sm text-muted">
                El total que vale es el que calcula el sistema al emitir la
                venta, con los precios vigentes. Al emitir se descuenta el
                stock: si no alcanza lo disponible, no se emite nada.
              </p>
            </form>
          </SectionCard>
        </div>

        {/* La columna derecha de la lámina 02, que en el teléfono queda al pie (lámina 06): el
            panel cuando está abierto, y el resumen «Antes de emitir», que tiene las dos acciones. */}
        {/* El ancho de la columna es el del panel, `lg:w-96`: con `lg:w-80` el panel, que es
            `shrink-0`, se salía de su columna y el documento desbordaba 32 px a 1024 px. Lo midió
            el barrido de anchos de AC-13, no la vista. */}
        <div className="mt-6 flex flex-col gap-6 lg:sticky lg:top-8 lg:mt-0 lg:w-96 lg:shrink-0">
          {panelRow ? (
            <UnitDialog
              // Al cambiar de línea el panel nace de nuevo, con la selección de esa línea.
              key={panelRow.key}
              titleId={panelTitleId}
              productId={panelRow.productId}
              productText={panelRow.productText}
              price={panelRow.price}
              image={panelRow.unitImage}
              units={panelRow.unitOptions ?? []}
              chosen={splitLineSerials(panelRow.serials)}
              onUse={(serials) => {
                update(panelRow.key, { serials: serials.join("\n") });
                setUnitsFor(null);
              }}
              onClose={() => setUnitsFor(null)}
            />
          ) : null}

          <aside
            aria-labelledby={summaryId}
            className={`flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 ${panelOpen ? "opacity-60" : ""}`}
            inert={panelOpen ? true : undefined}
          >
            <h2 id={summaryId} className={sectionTitleClass}>
              {BEFORE_ISSUE_TITLE}
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li className="flex items-center gap-3 rounded-lg bg-surface-muted px-3 py-2">
                <Icon name="user" className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 break-words">
                  {client.text.trim() === "" ? CONSUMER_TEXT : client.text}
                </span>
              </li>
              <li className="flex items-center gap-3 rounded-lg bg-surface-muted px-3 py-2">
                <Icon
                  name="smartphone"
                  className="size-4 shrink-0 text-muted"
                />
                <span aria-live="polite">
                  {beforeIssueCountText(chosenUnits, loadedLines)}
                </span>
              </li>
            </ul>
            {/* Un solo párrafo que empieza con «Total estimado:», como en el alta de un pedido:
                la etiqueta y el monto quedan en las dos puntas, pero el texto sigue entero. */}
            <p
              aria-live="polite"
              className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-4 text-sm font-semibold"
            >
              <span>Total estimado:</span>{" "}
              <span className="text-lg font-bold tabular-nums">
                {total && currency ? formatMoney(total, currency) : "—"}
              </span>
            </p>
            <ul className="flex flex-col gap-2 border-t border-border pt-4 text-sm text-muted">
              {BEFORE_ISSUE_NOTES.map((note, index) => (
                <li key={note} className="flex items-start gap-2">
                  <Icon
                    name={
                      index === 0
                        ? "package"
                        : index === 1
                          ? "banknote"
                          : "info"
                    }
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                form={FORM_ID}
                className={`${inlineButtonClass} w-full justify-center`}
                // Con el panel abierto queda deshabilitado. El `inert` ya lo vuelve inalcanzable;
                // `disabled` lo dice además en el árbol de accesibilidad.
                disabled={pending || panelOpen}
              >
                {pending ? "Emitiendo…" : "Emitir venta"}
              </button>
              <Link
                href="/ventas"
                className={`${secondaryLinkClass} w-full justify-center`}
              >
                {LEAVE_SALE_LABEL}
              </Link>
            </div>
            <p className="text-sm text-muted">{BEFORE_ISSUE_CHECK_NOTE}</p>
          </aside>
        </div>
      </div>

      <UnsavedChangesDialog {...dialog} />
    </>
  );
}

// Un campo de solo lectura con la forma de la lámina: la etiqueta arriba y el valor en una caja
// apagada. No es un `<input disabled>` porque no hay nada que editar ni que enviar —el valor sale
// de lo elegido—, así que es texto y no un control que el lector de pantalla anuncie como campo.
// Está duplicado del alta de un pedido a propósito (brief-24.6.2, D-2): extraerlo obliga a tocar
// `/pedidos/nuevo`, que está cerrado, para ahorrar diez líneas en dos pantallas.
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm tabular-nums">
        {value}
      </p>
    </div>
  );
}
