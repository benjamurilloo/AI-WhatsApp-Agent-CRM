"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import Link from "next/link";
import {
  cardClass,
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  secondaryLinkClass,
  selectClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { formatMoney } from "@/shared/money";
import {
  formatQuantity,
  parseQuantityInput,
  quantityFromDatabase,
  quantityToDatabase,
} from "@/shared/quantity";
import { Picker } from "../../../pedidos/nuevo/picker";
import { searchPurchaseOrderSuppliersAction } from "../../ordenes/actions";
import {
  estimatePurchaseLineTotal,
  sumPurchaseEstimates,
} from "../../ordenes/estimate";
import { TRACKING_LABEL, byQuantity } from "../../ordenes/messages";
import { PurchaseOrderStatusBadge } from "../../ordenes/status-badge";
import {
  createGoodsReceiptAction,
  searchGoodsReceiptProductsAction,
} from "../actions";
import {
  currencyWarning,
  receiptEffectNote,
  RECEIPT_CLOSES_ORDER_NOTE,
  RECEIPT_NO_PAYMENT_NOTE,
  RECEIPT_REVIEW_BUTTON,
  RECEIPT_REVIEW_HINT,
  RECEIPT_STEP_LABELS,
  RECEIPT_SUMMARY_TITLE,
  SERIAL_TAKEN_NOTE,
  SERIALS_HINT,
  SUPPLIER_REFERENCE_HINT,
  type GoodsReceiptFormLine,
  type GoodsReceiptFormState,
  type GoodsReceiptReviewLine,
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
//
// Desde la 24.8.1-b son **dos pasos** (brief-24.8.1-b, V-10), con el molde del cierre de caja
// (H-1): el primer envío devuelve la revisión y el segundo, con «confirm», registra. Volver al
// paso 1 manda «edit» y no valida nada. Todas las filas viajan como campos ocultos en el paso 2,
// también las vacías: las posiciones del formulario son las que usan los errores por línea.

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

// «Nombre (SKU)» como lo arma el buscador, partido solo para mostrarlo en dos columnas (V-20). Lo
// que se envía sigue siendo el texto entero: partirlo es cosa de la pantalla.
function splitProductText(text: string): { name: string; sku: string } {
  const match = /^(.*)\(([^()]*)\)\s*$/.exec(text.trim());
  return match
    ? { name: match[1]!.trim(), sku: match[2]!.trim() }
    : { name: text, sku: "" };
}

export function GoodsReceiptForm(props: Props) {
  const [state, formAction, pending] = useActionState(
    createGoodsReceiptAction,
    initialState,
  );
  // Cada respuesta del servidor vuelve a montar los campos con lo que se envió.
  return (
    <GoodsReceiptFields
      key={state.status === "idle" ? "inicial" : state.requestId}
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
  const review = state.status === "review" ? state : null;
  const previous = state.status === "idle" ? null : state.values;
  const [supplier, setSupplier] = useState({
    id: previous?.supplierId ?? "",
    text: previous?.supplierText ?? "",
  });
  const [currency, setCurrency] = useState(
    order ? order.currency : (previous?.currency ?? ""),
  );
  const [reference, setReference] = useState(previous?.supplierReference ?? "");
  const [rows, setRows] = useState<Row[]>(() => {
    if (order) {
      // Con orden, las filas son las de la orden; tras una respuesta, con lo que se envió.
      const sent = previous?.lines ?? [];
      return order.lines.map((line, index) => ({
        ...line,
        quantity: sent[index]?.quantity ?? line.quantity,
        unitCost: sent[index]?.unitCost ?? line.unitCost,
        serials: sent[index]?.serials ?? line.serials,
        key: index,
      }));
    }
    const sent = previous ? previous.lines : [];
    const rows = sent.map((line, index) => ({ ...line, key: index }));
    while (rows.length < INITIAL_ROWS) rows.push(blank(rows.length));
    return rows;
  });
  const nextKey = useRef(rows.length);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const reviewRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (failed) errorRef.current?.focus();
    else if (review) reviewRef.current?.focus();
  }, [failed, review]);

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

  // Las unidades que entran: la suma de las cantidades cargadas, con la misma convención que la
  // lista y la ficha (brief-24.8.1-b, H-2).
  const units = quantityToDatabase(
    filled.reduce(
      (sum, row) => sum + (parseQuantityInput(row.quantity) ?? 0n),
      0n,
    ),
  );
  // El costo vigente nuevo es un número solo cuando hay una línea sola: con varias, cada producto
  // queda con el suyo y decir uno sería falso.
  const singleCost =
    filled.length === 1 && currency && filled[0]!.unitCost
      ? estimatePurchaseLineTotal(filled[0]!.unitCost, currency, "1")
      : null;
  // «Completaría la orden»: toda línea con faltante se recibe entera. Lo que vale lo decide
  // purchasing al registrar; acá es lo que se le anticipa a quien carga.
  const closesOrder = Boolean(
    order &&
    filled.length === order.lines.length &&
    rows.every((row, index) => {
      const line = order.lines[index];
      if (!line) return true;
      const written = parseQuantityInput(row.quantity);
      return written !== null && written >= quantityFromDatabase(line.pending);
    }),
  );

  const cancelHref = order
    ? `/compras/ordenes/${order.id}`
    : "/compras/recepciones";

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <StepStrip step={review ? 2 : 1} />

      <div aria-live="polite" aria-atomic="true">
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
      </div>

      <input type="hidden" name="orderId" value={order?.id ?? ""} />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {review ? (
            <ReviewStep
              ref={reviewRef}
              lines={review.lines}
              rows={rows}
              currency={currency}
              order={order}
              supplierName={order ? order.supplierName : supplier.text}
              reference={reference}
              estimates={estimates}
            />
          ) : (
            <>
              {order ? (
                <OrderCard order={order} />
              ) : (
                <section className={`${cardClass} flex flex-col gap-4 p-5`}>
                  <h2 className="text-base font-bold">Datos de la recepción</h2>
                  <div className="grid gap-4 sm:grid-cols-3">
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
                      <input
                        type="hidden"
                        name="supplierId"
                        value={supplier.id}
                      />
                      {failed?.supplierError ? (
                        <p id="proveedor-error" className={fieldErrorClass}>
                          {failed.supplierError}
                        </p>
                      ) : null}
                    </div>
                    <ReferenceField
                      value={reference}
                      onChange={setReference}
                      error={failed?.referenceError ?? null}
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <label htmlFor="moneda" className={labelClass}>
                        Moneda de la recepción
                      </label>
                      {/* `w-full min-w-0`: el desbordamiento del `<select>` de H-6 no se repite. */}
                      <select
                        id="moneda"
                        name="currency"
                        value={currency}
                        onChange={(event) =>
                          setCurrency(event.currentTarget.value)
                        }
                        className={`${selectClass} w-full min-w-0`}
                        aria-invalid={
                          Boolean(failed?.currencyError) || undefined
                        }
                        aria-describedby={
                          failed?.currencyError
                            ? "moneda-error"
                            : "moneda-ayuda"
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
                </section>
              )}

              {order ? (
                <ReferenceField
                  value={reference}
                  onChange={setReference}
                  error={failed?.referenceError ?? null}
                  className="max-w-md"
                />
              ) : null}

              <section className={`${cardClass} flex flex-col gap-4 p-5`}>
                <h2 className="text-base font-bold">
                  {order ? "Producto" : "Productos"}
                </h2>
                {order ? (
                  <p className="text-sm text-muted">
                    Las cantidades y los costos arrancan en lo que falta recibir
                    y en el costo esperado de la orden: corregilos con lo que
                    llegó y lo que cobró el proveedor.
                  </p>
                ) : (
                  <FreeLineHeader currency={currency} />
                )}
                <div className="flex flex-col gap-4">
                  {rows.map((row, index) => {
                    const position = index + 1;
                    const error = failed?.lineErrors[position];
                    const serialError = failed?.serialErrors[position];
                    const errorId = `linea-${row.key}-error`;
                    const warningId = `linea-${row.key}-moneda`;
                    const estimate = estimates[index];
                    const warning = currencyWarning(
                      row.priceCurrency || null,
                      currency,
                    );
                    const orderLine = order?.lines[index];
                    const describedBy =
                      [error ? errorId : null, warning ? warningId : null]
                        .filter(Boolean)
                        .join(" ") || undefined;
                    const serials =
                      row.tracking === "quantity" ? null : (
                        <SerialsField
                          rowKey={row.key}
                          value={row.serials}
                          tracking={row.tracking}
                          error={serialError ?? null}
                          invalid={Boolean(error)}
                          onChange={(serials) => update(row.key, { serials })}
                        />
                      );
                    return orderLine ? (
                      <OrderLineFields
                        key={row.key}
                        row={row}
                        position={position}
                        line={orderLine}
                        currency={currency}
                        error={error ?? null}
                        errorId={errorId}
                        describedBy={describedBy}
                        estimate={estimate ?? null}
                        warning={warning}
                        warningId={warningId}
                        onChange={(change) => update(row.key, change)}
                        serials={serials}
                      />
                    ) : (
                      <FreeLineFields
                        key={row.key}
                        row={row}
                        position={position}
                        currency={currency}
                        error={error ?? null}
                        errorId={errorId}
                        describedBy={describedBy}
                        estimate={estimate ?? null}
                        warning={warning}
                        warningId={warningId}
                        removable={rows.length > 1}
                        onChange={(change) => update(row.key, change)}
                        onRemove={() =>
                          setRows((current) =>
                            current.filter((other) => other.key !== row.key),
                          )
                        }
                        serials={serials}
                      />
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
                        setRows((current) => [
                          ...current,
                          blank(nextKey.current++),
                        ])
                      }
                    >
                      <Icon name="plus" className="size-4" />
                      Agregar producto
                    </button>
                    <p className="text-sm text-muted">
                      Hasta {maxLines} líneas. Las líneas vacías no se envían.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <ReceiptSummary
          currency={currency}
          products={filled.length}
          units={units}
          singleCost={singleCost}
          total={total}
          order={Boolean(order)}
          closesOrder={closesOrder}
        />
      </div>

      {review ? (
        <HiddenRows
          supplier={supplier}
          currency={currency}
          reference={reference}
          rows={rows}
        />
      ) : null}

      <FooterBar
        cancelHref={cancelHref}
        cancelLabel={order ? "Volver" : "Cancelar"}
        currency={currency}
        total={total}
        review={Boolean(review)}
        pending={pending}
      />
    </form>
  );
}

// La tira de pasos de las láminas 02 y 05 (V-10): los dos pasos en pantalla ancha, «Paso N de 2» en
// el teléfono.
function StepStrip({ step }: { step: 1 | 2 }) {
  return (
    <div>
      <p className="text-sm font-semibold text-muted sm:hidden">
        Paso {step} de 2: {RECEIPT_STEP_LABELS[step - 1]}
      </p>
      <ol className="hidden items-center gap-3 sm:flex">
        {RECEIPT_STEP_LABELS.map((label, index) => {
          const number = index + 1;
          const current = number === step;
          return (
            <li key={label} className="flex items-center gap-3">
              {index > 0 ? (
                <span aria-hidden className="h-px w-12 bg-border sm:w-24" />
              ) : null}
              <span
                aria-hidden
                className={`inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                  current
                    ? "bg-primary text-on-primary"
                    : "bg-surface-muted text-muted"
                }`}
              >
                {number}
              </span>
              <span
                className={`text-sm font-semibold ${current ? "text-primary" : "text-muted"}`}
                aria-current={current ? "step" : undefined}
              >
                {/* El número de al lado es decorativo: el paso se dice entero acá, donde el
                    lector de pantalla lo encuentra. En la pantalla se ve solo el nombre. */}
                <span className="sr-only">Paso {number} de 2: </span>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// La tarjeta de la orden de la lámina 05 (V-33). La cabecera de la página ya dice «OC-… · proveedor
// · moneda» (V-12): acá suma el estado, que la cabecera no dice.
function OrderCard({ order }: { order: ReceivableOrder }) {
  return (
    <section className="flex items-start gap-3 rounded-xl bg-primary-soft px-4 py-3 text-on-primary-soft">
      <Icon name="fileText" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-mono font-semibold">{order.displayNumber}</p>
        <p className="text-sm">{order.supplierName}</p>
        <p className="text-sm">{order.currency}</p>
      </div>
      {/* La misma insignia de la lista de órdenes: la orden que se recibe siempre está abierta. */}
      <PurchaseOrderStatusBadge status="open" hasPending />
    </section>
  );
}

function ReferenceField({
  value,
  onChange,
  error,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor="referencia" className={labelClass}>
        Remito o factura del proveedor{" "}
        <span className="font-normal text-muted">(opcional)</span>
      </label>
      <input
        id="referencia"
        name="supplierReference"
        autoComplete="off"
        maxLength={40}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={inputClass}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? "referencia-error" : "referencia-ayuda"}
      />
      {error ? (
        <p id="referencia-error" className={fieldErrorClass}>
          {error}
        </p>
      ) : (
        <p id="referencia-ayuda" className="text-sm text-muted">
          {SUPPLIER_REFERENCE_HINT}
        </p>
      )}
    </div>
  );
}

// Los IMEI (brief-29.5, D-6). Sin JavaScript no se sabe si el producto se lleva por unidad: el
// campo va plegado y se abre a mano; con JavaScript se abre al elegirlo. Desde la 24.8.1-b, el
// IMEI duplicado se señala acá, con el texto de la tarjeta 17-2 (V-37).
function SerialsField({
  rowKey,
  value,
  tracking,
  error,
  invalid,
  onChange,
}: {
  rowKey: number;
  value: string;
  tracking: string;
  error: string | null;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const errorId = `imei-${rowKey}-error`;
  return (
    <details
      className="sm:col-span-full"
      open={
        tracking === "unit" || Boolean(value) || Boolean(error) || undefined
      }
    >
      <summary className="cursor-pointer text-sm font-semibold">
        IMEI o número de serie
      </summary>
      <div className="mt-2 flex flex-col gap-1">
        <label htmlFor={`imei-${rowKey}`} className={labelClass}>
          IMEI o número de serie, uno por renglón
        </label>
        <textarea
          id={`imei-${rowKey}`}
          name="serials"
          rows={3}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          className={`${inputClass} font-mono`}
          aria-invalid={Boolean(error) || invalid || undefined}
          aria-describedby={error ? errorId : `imei-${rowKey}-ayuda`}
        />
        {error ? (
          <>
            <p id={errorId} className={fieldErrorClass}>
              {error}
            </p>
            <p className="flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-on-primary-soft">
              <Icon name="info" className="mt-0.5 size-4 shrink-0" />
              <span>{SERIAL_TAKEN_NOTE}</span>
            </p>
          </>
        ) : (
          <p id={`imei-${rowKey}-ayuda`} className="text-sm text-muted">
            {SERIALS_HINT}
          </p>
        )}
      </div>
    </details>
  );
}

function LineNotes({
  error,
  errorId,
  warning,
  warningId,
  estimate,
  currency,
  fallback,
}: {
  error: string | null;
  errorId: string;
  warning: { title: string; detail: string } | null;
  warningId: string;
  estimate: string | null;
  currency: string;
  fallback: string;
}) {
  return (
    <>
      <p className="text-sm text-muted sm:col-span-full">
        {estimate && currency
          ? `Total estimado de la línea: ${formatMoney(estimate, currency)}`
          : fallback}
      </p>
      {warning ? (
        <div
          id={warningId}
          className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-on-warning-soft sm:col-span-full"
        >
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">{warning.title}</span>{" "}
            {warning.detail}
          </span>
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className={`${fieldErrorClass} sm:col-span-full`}>
          {error}
        </p>
      ) : null}
    </>
  );
}

// Una línea de la orden, con la forma de la lámina 02 (V-13): lo que falta y el costo esperado de
// solo lectura, al lado de lo que se recibe y de lo que cobró el proveedor.
function OrderLineFields({
  row,
  position,
  line,
  currency,
  error,
  errorId,
  describedBy,
  estimate,
  warning,
  warningId,
  onChange,
  serials,
}: {
  row: Row;
  position: number;
  line: ReceivableOrder["lines"][number];
  currency: string;
  error: string | null;
  errorId: string;
  describedBy: string | undefined;
  estimate: string | null;
  warning: { title: string; detail: string } | null;
  warningId: string;
  onChange: (change: Partial<GoodsReceiptFormLine>) => void;
  serials: ReactNode;
}) {
  const expected = estimatePurchaseLineTotal(line.unitCost, currency, "1");
  return (
    <fieldset className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-4">
      {/* El nombre accesible del grupo sigue siendo «Línea N»: la lámina pone el producto como
          título del bloque, y eso se dibuja abajo, visible. */}
      <legend className="sr-only">Línea {position}</legend>
      <p className="text-base font-semibold sm:col-span-4">
        {row.productText || `Línea ${position}`}
      </p>
      <input type="hidden" name="orderLineId" value={row.orderLineId} />
      <input type="hidden" name="priceCurrency" value={row.priceCurrency} />
      <input type="hidden" name="productId" value={row.productId} />
      <input type="hidden" name="productText" value={row.productText} />
      <input type="hidden" name="tracking" value={row.tracking} />
      {row.tracking === "quantity" ? (
        <input type="hidden" name="serials" value="" />
      ) : null}
      <div className="flex flex-col gap-1">
        <span className={labelClass}>Falta recibir</span>
        <p className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-muted tabular-nums">
          {formatQuantity(line.pending)}
          {line.unit ? ` ${line.unit}` : null}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`cantidad-${row.key}`} className={labelClass}>
          Cantidad a recibir
        </label>
        <input
          id={`cantidad-${row.key}`}
          name="quantity"
          inputMode="decimal"
          autoComplete="off"
          value={row.quantity}
          onChange={(event) =>
            onChange({ quantity: event.currentTarget.value })
          }
          className={inputClass}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className={labelClass}>
          Costo esperado{currency ? ` (${currency})` : ""}
        </span>
        <p className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm text-muted tabular-nums">
          {expected && currency ? formatMoney(expected, currency) : "—"}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`costo-${row.key}`} className={labelClass}>
          Costo unitario recibido{currency ? ` (${currency})` : ""}
        </label>
        <input
          id={`costo-${row.key}`}
          name="unitCost"
          inputMode="decimal"
          autoComplete="off"
          value={row.unitCost}
          onChange={(event) =>
            onChange({ unitCost: event.currentTarget.value })
          }
          className={inputClass}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
        />
      </div>
      {serials}
      <LineNotes
        error={error}
        errorId={errorId}
        warning={warning}
        warningId={warningId}
        estimate={estimate}
        currency={currency}
        fallback="Dejá la cantidad en 0 para no recibir esta línea ahora."
      />
    </fieldset>
  );
}

// La cabecera de la tabla de la lámina 03 (V-20), solo en pantalla ancha: abajo de `lg` cada fila se
// apila y lleva su propia etiqueta.
const FREE_LINE_GRID =
  "lg:grid-cols-[minmax(0,1fr)_7rem_7rem_6rem_8rem_7rem_3rem]";

function FreeLineHeader({ currency }: { currency: string }) {
  const labels = [
    "Producto",
    "SKU",
    "Seguimiento",
    "Cantidad",
    `Costo unitario${currency ? ` (${currency})` : ""}`,
    `Total${currency ? ` (${currency})` : ""}`,
    "",
  ];
  return (
    <div
      aria-hidden
      className={`hidden gap-3 px-1 text-sm font-semibold text-muted lg:grid ${FREE_LINE_GRID}`}
    >
      {labels.map((label, index) => (
        <span key={index}>{label}</span>
      ))}
    </div>
  );
}

// Una línea sin orden, con las columnas de la lámina 03 (V-20).
function FreeLineFields({
  row,
  position,
  currency,
  error,
  errorId,
  describedBy,
  estimate,
  warning,
  warningId,
  removable,
  onChange,
  onRemove,
  serials,
}: {
  row: Row;
  position: number;
  currency: string;
  error: string | null;
  errorId: string;
  describedBy: string | undefined;
  estimate: string | null;
  warning: { title: string; detail: string } | null;
  warningId: string;
  removable: boolean;
  onChange: (change: Partial<GoodsReceiptFormLine>) => void;
  onRemove: () => void;
  serials: ReactNode;
}) {
  const { sku } = splitProductText(row.productText);
  return (
    <fieldset
      className={`grid gap-3 rounded-xl border border-border p-4 lg:items-start ${FREE_LINE_GRID}`}
    >
      <legend className="px-1 text-sm font-semibold lg:sr-only">
        Línea {position}
      </legend>
      <input type="hidden" name="orderLineId" value={row.orderLineId} />
      <input type="hidden" name="priceCurrency" value={row.priceCurrency} />
      <input type="hidden" name="tracking" value={row.tracking} />
      {row.tracking === "quantity" ? (
        <input type="hidden" name="serials" value="" />
      ) : null}
      <div className="flex min-w-0 flex-col gap-1">
        <label
          htmlFor={`producto-${row.key}`}
          className={`${labelClass} lg:sr-only`}
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
          describedBy={describedBy}
          load={searchGoodsReceiptProductsAction}
          onChoose={(option) =>
            onChange({
              productId: option.id,
              productText: `${option.label} (${option.detail})`,
              priceCurrency: option.priceCurrency,
              tracking: option.tracking,
            })
          }
          onType={(text) =>
            onChange({
              productId: "",
              productText: text,
              priceCurrency: "",
              tracking: "",
            })
          }
        />
        <input type="hidden" name="productId" value={row.productId} />
      </div>
      <p className="min-w-0 text-sm text-muted">
        <span className="font-semibold lg:hidden">SKU: </span>
        <span className="font-mono break-all">{sku || "—"}</span>
      </p>
      <p className="text-sm">
        {row.tracking ? (
          <span className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted">
            {/* El rótulo sale de `ordenes/messages`, que lo tipa contra `StockTracking` y lo
                fija con una prueba. `row.tracking` es un `string` del estado del formulario, así
                que se comprueba antes de indexar, como en `productos/[productId]/audit-summary`.
                Hallazgo 7 de la revisión independiente de la 24.8.1-b: acá había una tercera copia
                del rótulo, más floja de tipo y sin prueba que la fijara. */}
            {Object.hasOwn(TRACKING_LABEL, row.tracking)
              ? TRACKING_LABEL[row.tracking as keyof typeof TRACKING_LABEL]
              : row.tracking}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </p>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`cantidad-${row.key}`}
          className={`${labelClass} lg:sr-only`}
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
            onChange({ quantity: event.currentTarget.value })
          }
          className={inputClass}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`costo-${row.key}`}
          className={`${labelClass} lg:sr-only`}
        >
          Costo unitario{currency ? ` (${currency})` : ""}
        </label>
        <input
          id={`costo-${row.key}`}
          name="unitCost"
          inputMode="decimal"
          autoComplete="off"
          value={row.unitCost}
          onChange={(event) =>
            onChange({ unitCost: event.currentTarget.value })
          }
          className={inputClass}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
        />
      </div>
      <p className="text-sm font-semibold tabular-nums">
        <span className="font-normal text-muted lg:hidden">Total: </span>
        {estimate && currency ? formatMoney(estimate, currency) : "—"}
      </p>
      <div className="flex items-start">
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={onRemove}
          disabled={!removable}
        >
          {/* La lámina dibuja un tacho; el juego de íconos del proyecto no tiene uno, e
              `icons.tsx` está fuera de la lista cerrada de archivos. Queda el texto. */}
          Quitar
          <span className="sr-only"> la línea {position}</span>
        </button>
      </div>
      {serials}
      <LineNotes
        error={error}
        errorId={errorId}
        warning={warning}
        warningId={warningId}
        estimate={null}
        currency={currency}
        fallback={
          currency
            ? "Escribí la cantidad y el costo unitario que cobró el proveedor."
            : "Elegí la moneda para ver el total de la línea."
        }
      />
    </fieldset>
  );
}

// El resumen de la derecha de las láminas 02 y 03 (V-11 y V-21).
function ReceiptSummary({
  currency,
  products,
  units,
  singleCost,
  total,
  order,
  closesOrder,
}: {
  currency: string;
  products: number;
  units: string;
  singleCost: string | null;
  total: string | null;
  order: boolean;
  closesOrder: boolean;
}) {
  return (
    <aside
      aria-live="polite"
      aria-labelledby="resumen-alta"
      className={`${cardClass} flex flex-col gap-3 p-5 lg:sticky lg:top-6`}
    >
      <h2 id="resumen-alta" className="text-base font-bold">
        {RECEIPT_SUMMARY_TITLE}
      </h2>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Productos</dt>
          <dd className="font-semibold tabular-nums">
            {products} {products === 1 ? "producto" : "productos"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Unidades</dt>
          <dd className="font-semibold tabular-nums">
            {formatQuantity(units)} {byQuantity(units, "unidad", "unidades")}
          </dd>
        </div>
        {singleCost && currency ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">Costo recibido ({currency})</dt>
            <dd className="font-semibold tabular-nums">
              {formatMoney(singleCost, currency)}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="flex items-baseline justify-between gap-3 rounded-xl bg-primary-soft px-3 py-2 text-on-primary-soft">
        <span className="text-sm font-semibold">
          Total{currency ? ` (${currency})` : ""}
        </span>
        <span className="text-lg font-bold tabular-nums">
          {total && currency ? formatMoney(total, currency) : "—"}
        </span>
      </div>
      {order ? (
        <div
          className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
            closesOrder
              ? "bg-warning-soft text-on-warning-soft"
              : "bg-primary-soft text-on-primary-soft"
          }`}
        >
          <Icon
            name={closesOrder ? "alert" : "info"}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            {closesOrder ? (
              <>
                <span className="font-semibold">
                  {RECEIPT_CLOSES_ORDER_NOTE}
                </span>{" "}
              </>
            ) : null}
            {RECEIPT_NO_PAYMENT_NOTE}
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm text-on-primary-soft">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          <span>
            {receiptEffectNote(
              formatQuantity(units),
              singleCost && currency ? formatMoney(singleCost, currency) : null,
            )}
          </span>
        </div>
      )}
    </aside>
  );
}

// El paso 2 (V-10): lo cargado, de solo lectura, con el recuento de los IMEI que hizo el servidor
// (V-15). Los campos viajan aparte, ocultos, para que volver al paso 1 no pierda nada.
function ReviewStep({
  ref,
  lines,
  rows,
  currency,
  order,
  supplierName,
  reference,
  estimates,
}: {
  ref: Ref<HTMLParagraphElement>;
  lines: GoodsReceiptReviewLine[];
  rows: Row[];
  currency: string;
  order: ReceivableOrder | null;
  supplierName: string;
  reference: string;
  estimates: (string | null)[];
}) {
  return (
    <section className={`${cardClass} flex flex-col gap-4 p-5`}>
      <p ref={ref} tabIndex={-1} className="text-lg font-semibold">
        ¿Registrar esta recepción?
      </p>
      <p className="text-sm text-muted">{RECEIPT_REVIEW_HINT}</p>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {order ? (
          <div>
            <dt className="text-muted">Orden de compra</dt>
            <dd className="font-mono font-semibold">{order.displayNumber}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted">Proveedor</dt>
          <dd className="font-semibold">{supplierName || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Remito o factura</dt>
          <dd className="font-semibold">{reference || "—"}</dd>
        </div>
      </dl>
      <ul className="flex flex-col gap-3">
        {lines.map((line) => {
          const index = line.position - 1;
          const row = rows[index];
          const estimate = estimates[index];
          const expected = parseQuantityInput(line.quantity);
          // «1 de 1 cargado» (V-15): lo escrito contra lo que pide la cantidad.
          const loaded =
            row && row.tracking !== "quantity" && expected !== null
              ? {
                  written: line.serials.length,
                  expected: formatQuantity(quantityToDatabase(expected)),
                  complete: expected === BigInt(line.serials.length) * 1000n,
                }
              : null;
          return (
            <li
              key={line.position}
              className="flex flex-col gap-1 rounded-xl border border-border p-4"
            >
              <p className="font-semibold">{line.productText}</p>
              <p className="text-sm text-muted tabular-nums">
                {line.quantity} × {line.unitCost}
                {currency ? ` ${currency}` : ""}
                {estimate && currency
                  ? ` · ${formatMoney(estimate, currency)}`
                  : ""}
              </p>
              {loaded ? (
                <p className="flex items-center gap-2 text-sm">
                  {loaded.complete ? (
                    <Icon
                      name="circleCheck"
                      className="size-4 shrink-0 text-success"
                    />
                  ) : (
                    <Icon
                      name="alert"
                      className="size-4 shrink-0 text-warning"
                    />
                  )}
                  <span>
                    {loaded.written} de {loaded.expected} cargado
                    {loaded.written === 1 ? "" : "s"}
                  </span>
                </p>
              ) : null}
              {line.serials.length > 0 ? (
                <ul className="flex flex-wrap gap-2 font-mono text-sm">
                  {line.serials.map((serial) => (
                    <li
                      key={serial}
                      className="rounded-md bg-surface-muted px-2 py-0.5 break-all"
                    >
                      {serial}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Todas las filas, también las vacías: las posiciones del formulario son las que usan los errores
// por línea, y comprimirlas rompería el camino de vuelta al paso 1.
function HiddenRows({
  supplier,
  currency,
  reference,
  rows,
}: {
  supplier: { id: string; text: string };
  currency: string;
  reference: string;
  rows: Row[];
}) {
  return (
    <div hidden>
      <input type="hidden" name="supplierId" value={supplier.id} />
      <input type="hidden" name="supplierText" value={supplier.text} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="supplierReference" value={reference} />
      {rows.map((row) => (
        <span key={row.key}>
          <input type="hidden" name="orderLineId" value={row.orderLineId} />
          <input type="hidden" name="productId" value={row.productId} />
          <input type="hidden" name="productText" value={row.productText} />
          <input type="hidden" name="quantity" value={row.quantity} />
          <input type="hidden" name="unitCost" value={row.unitCost} />
          <input type="hidden" name="priceCurrency" value={row.priceCurrency} />
          <input type="hidden" name="serials" value={row.serials} />
          <input type="hidden" name="tracking" value={row.tracking} />
        </span>
      ))}
    </div>
  );
}

// La barra de pie de las láminas 02, 03 y 05 (V-16 y V-34). En el teléfono lleva el total, que en
// pantalla ancha vive en el resumen de la derecha.
function FooterBar({
  cancelHref,
  cancelLabel,
  currency,
  total,
  review,
  pending,
}: {
  cancelHref: string;
  cancelLabel: string;
  currency: string;
  total: string | null;
  review: boolean;
  pending: boolean;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-4 py-3 sm:mx-0 sm:rounded-xl sm:border sm:px-5">
      {review ? (
        <button
          type="submit"
          name="edit"
          value="1"
          formNoValidate
          className={secondaryButtonClass}
        >
          <Icon name="chevronLeft" className="size-4" />
          Corregir
        </button>
      ) : (
        <Link href={cancelHref} className={secondaryLinkClass}>
          <Icon name="chevronLeft" className="size-4" />
          {cancelLabel}
        </Link>
      )}
      <p className="text-sm lg:hidden">
        <span className="text-muted">
          Total a recibir{currency ? ` (${currency})` : ""}
        </span>
        <span className="ml-2 font-bold tabular-nums">
          {total && currency ? formatMoney(total, currency) : "—"}
        </span>
      </p>
      {review ? (
        <button
          type="submit"
          name="confirm"
          value="1"
          disabled={pending}
          className={`${inlineButtonClass} ml-auto`}
        >
          {pending ? "Registrando…" : "Registrar recepción"}
        </button>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className={`${inlineButtonClass} ml-auto`}
        >
          {RECEIPT_REVIEW_BUTTON}
          <Icon name="chevronRight" className="size-4" />
        </button>
      )}
    </div>
  );
}
