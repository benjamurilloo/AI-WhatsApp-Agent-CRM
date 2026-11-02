"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useHydrated } from "@/app/_components/disclosure";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { SectionCard } from "@/app/_components/section-card";
import { splitLineSerials } from "@/shared/lines";
import { formatMoney } from "@/shared/money";
import {
  createOrderAction,
  searchOrderClientsAction,
  searchOrderProductsAction,
  type OrderProductOption,
} from "../actions";
import { sumEstimates } from "../estimate";
import type { OrderFormState } from "../messages";
import { Picker } from "./picker";
import {
  blankLine,
  estimateRow,
  LineQuantity,
  LineSerials,
  type LineRow,
} from "./line-units";
import { UnitDialog } from "./unit-dialog";

// Formulario del alta de un pedido (brief-19.2, D-5 a D-7). El cliente y cada producto se eligen
// con un buscador; cada línea muestra el precio vigente y su subtotal estimado, y el total estimado
// va al pie. El total que vale lo calcula orders. El id del precio que se mostró viaja con la línea:
// si cambió, el servidor responde CONFLICT y la línea muestra el precio nuevo.
//
// Arranca con cinco líneas, para que sin JavaScript también se puedan cargar varias; las vacías no
// se envían. Con JavaScript se agregan y se quitan, hasta el máximo de líneas por pedido.
//
// Desde la 24.6.1-b toma la forma de la lámina 02 de la v2 (V2-09) en un producto por unidad: los
// equipos se eligen en el panel «Elegir unidades», lo elegido se ve como chips, y la cantidad, el
// precio unitario y el subtotal son campos de solo lectura. El formulario arma su propia tarjeta
// para que el panel vaya al costado, y es quien sabe qué línea lo tiene abierto.

const INITIAL_ROWS = 5;

type Row = LineRow;

const blank = blankLine;

const initialState: OrderFormState = { status: "idle" };

export function OrderForm({
  initialClient,
  maxLines,
  unitsEnabled,
}: {
  initialClient: { id: string; name: string } | null;
  maxLines: number;
  unitsEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createOrderAction,
    initialState,
  );
  // Cada rechazo vuelve a montar los campos con lo que se envió y los precios nuevos: el estado
  // de las filas nace de la respuesta.
  return (
    <OrderFields
      key={state.status === "error" ? state.requestId : "inicial"}
      state={state}
      formAction={formAction}
      pending={pending}
      initialClient={initialClient}
      maxLines={maxLines}
      unitsEnabled={unitsEnabled}
    />
  );
}

function OrderFields({
  state,
  formAction,
  pending,
  initialClient,
  maxLines,
  unitsEnabled,
}: {
  state: OrderFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  initialClient: { id: string; name: string } | null;
  maxLines: number;
  unitsEnabled: boolean;
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
  // Qué línea tiene abierto el panel «Elegir unidades» (24.6.1-b, D-1): una sola a la vez. No va en
  // la URL —como sí van los cinco paneles de la 24.6.1— porque el borrador vive acá, en estado de
  // cliente, y una navegación de ruta lo perdería.
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

  return (
    <div className="mt-6 lg:flex lg:items-start lg:gap-8">
      {/* El cuerpo queda inerte mientras el panel está abierto, como en la 24.5.3 y la 24.6.1
          (AC-6). `inert` cubre el cuerpo de la pantalla y **no** el marco de la aplicación, así que
          el panel no se declara `aria-modal`: diría que atrapa un foco que no atrapa (V-4). */}
      <div
        className={`min-w-0 flex-1 ${panelOpen ? "opacity-60" : ""}`}
        inert={panelOpen ? true : undefined}
      >
        <SectionCard id="pedido-titulo" title="Cliente y líneas" icon="list">
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
                Cliente
              </label>
              <Picker
                id="cliente"
                name="clientText"
                value={client.text}
                placeholder="Nombre del cliente"
                className={inputClass}
                invalid={Boolean(failed?.clientError)}
                describedBy={failed?.clientError ? "cliente-error" : undefined}
                load={searchOrderClientsAction}
                onChoose={(option) =>
                  setClient({ id: option.id, text: option.label })
                }
                onType={(text) => setClient({ id: "", text })}
              />
              <input type="hidden" name="clientId" value={client.id} />
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
                    {/* Donde la lámina pone el precio unitario, al lado del producto. Sin equipos, sigue
                  estando la cantidad, que es editable. */}
                    {byUnit ? (
                      <ReadOnlyField
                        label="Precio unitario"
                        value={
                          row.price
                            ? formatMoney(row.price.amount, row.price.currency)
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
                      // La fila de abajo de la lámina: la cantidad, que es la cantidad de equipos, y el
                      // subtotal. Los dos de solo lectura, porque los dos salen de lo elegido.
                      <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2">
                        <LineQuantity
                          row={row}
                          unitsEnabled={unitsEnabled}
                          invalid={Boolean(error)}
                          describedBy={error ? errorId : undefined}
                          onChange={(change) => update(row.key, change)}
                          unitNoun={{ one: "equipo", many: "equipos" }}
                        />
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

            <div className="grid gap-4 sm:grid-cols-2">
              {/* El aviso que la lámina pone al pie. No es decoración: el ADR 0020 dice que el pedido
            nace pendiente y que elegir un equipo no lo reserva, y hasta ahora no estaba escrito
            en ninguna parte de la pantalla. */}
              <p className="flex items-start gap-2 rounded-xl border border-border bg-primary-soft/40 px-4 py-3 text-sm">
                <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                <span>
                  El pedido se crea pendiente. Elegir un equipo no lo reserva.
                </span>
              </p>
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted p-4">
                {/* La etiqueta y el monto quedan en las dos puntas de la caja, como en la lámina,
                    pero siguen siendo **un solo párrafo**: su texto completo es el de antes, así
                    que la prueba del alta que lo busca entero pasa sin tocarla (AC-10). */}
                <p
                  aria-live="polite"
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold"
                >
                  <span>Total estimado:</span>{" "}
                  <span className="text-lg font-bold tabular-nums">
                    {total && currency ? formatMoney(total, currency) : "—"}
                  </span>
                </p>
                <button
                  type="submit"
                  className={`${inlineButtonClass} w-full justify-center`}
                  // Con el panel abierto queda deshabilitado (AC-6). El `inert` del cuerpo ya lo vuelve
                  // inalcanzable; `disabled` lo dice además en el árbol de accesibilidad.
                  disabled={pending || panelOpen}
                >
                  {pending ? "Creando…" : "Crear pedido"}
                </button>
              </div>
            </div>

            {mixed ? (
              <p className="text-sm text-danger">
                Hay líneas en monedas distintas: el pedido toma la moneda de la
                primera, y las otras se rechazan.
              </p>
            ) : null}
            <p className="text-sm text-muted">
              El total que vale es el que calcula el sistema al crear el pedido,
              con los precios vigentes.
            </p>
          </form>
        </SectionCard>
      </div>

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
    </div>
  );
}

// Un campo de solo lectura con la forma de la lámina: la etiqueta arriba y el valor en una caja
// apagada. No es un `<input disabled>` porque no hay nada que editar ni que enviar —el valor sale
// de lo elegido—, así que es texto y no un control que el lector de pantalla anuncie como campo.
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
