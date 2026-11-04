"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { PaymentMethod, PermutaOffer } from "@/modules/cash";
import {
  currencyDecimals,
  formatMoney,
  moneyFromDatabase,
  moneyToDatabase,
  parseMoneyInput,
  type Money,
} from "@/shared/money";
import {
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  linkClass,
  radioClass,
  secondaryLinkClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import type { ReceiptExchangeProps } from "@/app/(autenticado)/caja/exchange";
import {
  TenderCurrencyChoice,
  TenderedAmountFields,
} from "@/app/(autenticado)/caja/exchange-fields";
import { AmountReading } from "@/app/(autenticado)/caja/money-fields";
import type {
  ReceiptFormField,
  ReceiptFormState,
  ReceiptFormValues,
} from "@/app/(autenticado)/ventas/[saleId]/cobrar/messages";

// El cobro de una venta (brief-21.3, D-3 y D-8) y, desde la 21.4, la seña de un pedido (brief-21.4,
// D-8): el medio, como grupo de opciones con los activos, y el monto, propuesto en lo que falta, con
// su lectura («Se lee: …») como en la caja. Un solo paso: el tope lo vuelve a calcular cash con el
// bloqueo tomado. Funciona sin JavaScript. El destino viaja en un campo oculto, y la acción es la
// del cobro o la de la seña. Desde la 29.4, con moneda principal, se puede recibir en la otra moneda
// de la organización (brief-29.4, D-6): la moneda que entra se elige con un enlace y el servidor
// vuelve a armar el formulario con el monto propuesto en ella.
//
// Desde la 29.7.2 (brief-29.7.2, D-6), el cobro de una venta ofrece «Permuta» con cada usado del cliente
// que tiene algo disponible, como una opción más del medio: su valor lleva el medio y el usado
// («medio|usado»), y la acción los separa. Así funciona sin JavaScript y sigue siendo un solo paso.
//
// **Desde la 24.6.2-d vive acá y no en `ventas/[saleId]/cobrar/`** (brief-24.6.2-d, D-1, opción c).
// El motivo no es orden: lo importa también la seña de un pedido, así que una ruta de ventas era una
// frontera equivocada, y el rediseño de esa pantalla tiene su propia lámina y su propia subfase. El
// componente se movió **sin cambiarle la conducta a quien ya lo usaba**: todo lo que agrega esta
// subfase —la previsión y la ficha del usado— cuelga de props opcionales que solo pasa el panel de
// cobro de una venta. La seña de un pedido no los pasa y se dibuja exactamente igual (AC-12).

const initialState: ReceiptFormState = { status: "idle" };

export type PermutaChoice = Omit<PermutaOffer, "tradeIns"> & {
  tradeIns: (PermutaOffer["tradeIns"][number] & { received: string })[];
};

// La «Vista previa» de la lámina 03 (brief-24.6.2-d, D-7): la situación **después** del cobro que se
// está cargando. No es una lectura nueva —es aritmética sobre lo que el panel ya tiene— y es la
// única de las dos vistas previas de la subfase que **sí** se vuelve a comprobar al confirmar, con
// el bloqueo tomado y las reglas de `cash` corriendo dentro de la transacción (H-2).
export type ReceiptPreview = {
  // Lo cobrado y lo que falta hoy, con la escala de la base.
  collected: string;
  outstanding: string;
};

export function ReceiptForm({
  action,
  target,
  cancelHref,
  submitLabel,
  currency,
  outstanding,
  paymentMethods,
  hasOpenSession,
  exchange,
  permuta = null,
  chosenPermuta = null,
  permutaPath,
  preview = null,
}: {
  action: (
    previous: ReceiptFormState,
    formData: FormData,
  ) => Promise<ReceiptFormState>;
  target: { field: "saleId" | "orderId"; id: string };
  cancelHref: string;
  submitLabel: string;
  currency: string;
  // Lo que falta, como se escribe en el campo.
  outstanding: string;
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
  exchange: ReceiptExchangeProps | null;
  // Solo en el cobro de una venta con usados del cliente para descontar, con la fecha de cada uno ya
  // escrita en la zona de la organización.
  permuta?: PermutaChoice | null;
  // El usado elegido por ?usado=, con lo propuesto: el menor entre lo que queda y lo que falta
  // (brief-29.7.2, D-6).
  chosenPermuta?: { tradeInId: string; amount: string } | null;
  // Adónde lleva «Proponer lo que queda» de cada usado.
  permutaPath?: string;
  // Solo el panel de cobro de una venta (brief-24.6.2-d, D-7): sin esto no se dibuja la previsión, y
  // la seña de un pedido queda como estaba.
  preview?: ReceiptPreview | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const values: ReceiptFormValues = failed
    ? state.values
    : {
        // Con un usado elegido, la permuta con ese usado; con un solo medio activo, ese.
        paymentMethodId:
          permuta && chosenPermuta
            ? `${permuta.paymentMethodId}|${chosenPermuta.tradeInId}`
            : paymentMethods.length === 1
              ? paymentMethods[0]!.id
              : "",
        amount: chosenPermuta
          ? chosenPermuta.amount
          : exchange
            ? exchange.proposed
            : outstanding,
        tenderedCurrency: exchange?.tendered ?? currency,
        exchangeRate: "",
      };
  const invalid = (field: ReceiptFormField) =>
    failed && state.fields.includes(field);
  const tendered = exchange?.tendered ?? currency;

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <form
      // Con otra moneda que entra, el formulario se vuelve a montar con su monto propuesto.
      key={
        failed
          ? state.requestId
          : `nuevo-${tendered}-${chosenPermuta?.tradeInId ?? ""}`
      }
      action={formAction}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name={target.field} value={target.id} />
      <div aria-live="polite" aria-atomic="true">
        {failed ? (
          <p
            ref={errorRef}
            tabIndex={-1}
            id="cobro-error"
            className={formMessageClass}
          >
            {state.message}
            {state.openCash ? (
              <>
                {" "}
                <Link href="/caja/abrir" className={linkClass}>
                  Abrir caja
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <ReceiptFields
        values={values}
        invalid={invalid}
        currency={currency}
        paymentMethods={paymentMethods}
        hasOpenSession={hasOpenSession}
        exchange={exchange}
        tendered={tendered}
        permuta={permuta}
        chosenPermuta={chosenPermuta}
        permutaPath={permutaPath}
        preview={preview}
      />

      <div className="flex flex-wrap justify-end gap-3">
        <Link href={cancelHref} className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Registrando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

// El medio y el monto, juntos, porque la previsión depende de los dos: de cuál medio está marcado
// —para saber si descuenta un usado y cuál— y de lo que se escribió. Viven acá y no en `ReceiptForm`
// por el `key` del formulario: con cada rechazo el formulario se vuelve a montar con lo enviado, y
// un estado que viviera más arriba sobreviviría a ese remonte y seguiría mostrando lo anterior.
//
// Sin JavaScript no hay estado y manda lo que el servidor marcó: el usado de `?usado=` y el monto
// propuesto. Las dos vistas, la que sigue lo que se escribe y la que no, dicen lo mismo al abrirse.
function ReceiptFields({
  values,
  invalid,
  currency,
  paymentMethods,
  hasOpenSession,
  exchange,
  tendered,
  permuta,
  chosenPermuta,
  permutaPath,
  preview,
}: {
  values: ReceiptFormValues;
  invalid: (field: ReceiptFormField) => boolean;
  currency: string;
  paymentMethods: PaymentMethod[];
  hasOpenSession: boolean;
  exchange: ReceiptExchangeProps | null;
  tendered: string;
  permuta: PermutaChoice | null;
  chosenPermuta: { tradeInId: string; amount: string } | null;
  permutaPath: string | undefined;
  preview: ReceiptPreview | null;
}) {
  const [method, setMethod] = useState(values.paymentMethodId);
  const [amount, setAmount] = useState(values.amount);
  // El usado que descuenta el medio marcado, si descuenta alguno: su valor es «medio|usado».
  const tradeInId = method.includes("|") ? method.split("|")[1] : undefined;
  const chosen =
    permuta?.tradeIns.find((tradeIn) => tradeIn.id === tradeInId) ?? null;

  return (
    <>
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={
          invalid("paymentMethod") ? "cobro-error" : "cobro-medio-ayuda"
        }
      >
        <legend className={`${labelClass} mb-1`}>Medio de pago *</legend>
        {paymentMethods.map((paymentMethod) => (
          <label
            key={paymentMethod.id}
            className="flex items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name="paymentMethodId"
              value={paymentMethod.id}
              required
              defaultChecked={values.paymentMethodId === paymentMethod.id}
              onChange={() => setMethod(paymentMethod.id)}
              aria-invalid={invalid("paymentMethod") ? true : undefined}
              className={radioClass}
            />
            {paymentMethod.name}
            {paymentMethod.isCash ? (
              <span className="text-muted">(entra a la caja)</span>
            ) : null}
          </label>
        ))}
        {permuta?.tradeIns.map((tradeIn) => (
          <label
            key={tradeIn.id}
            className="flex flex-wrap items-center gap-x-2 text-sm"
          >
            <input
              type="radio"
              name="paymentMethodId"
              value={`${permuta.paymentMethodId}|${tradeIn.id}`}
              required
              defaultChecked={
                values.paymentMethodId ===
                `${permuta.paymentMethodId}|${tradeIn.id}`
              }
              onChange={() =>
                setMethod(`${permuta.paymentMethodId}|${tradeIn.id}`)
              }
              aria-invalid={
                invalid("paymentMethod") || invalid("tradeIn")
                  ? true
                  : undefined
              }
              className={radioClass}
            />
            Permuta con el usado {tradeIn.displayNumber}
            <span className="text-muted">
              (del {tradeIn.received}; queda{" "}
              {formatMoney(tradeIn.available, currency)})
            </span>
            {permutaPath && chosenPermuta?.tradeInId !== tradeIn.id ? (
              <Link
                // `permutaPath` puede traer ya una consulta —el panel de la venta vive en
                // `/ventas/<id>?pestana=cobros&panel=cobro`—, y pegarle un «?» produciría una
                // dirección con dos signos de pregunta, que el navegador manda como parte del
                // valor anterior. Es el mismo cuidado que `receiptExchange` tomó en la 24.6.1.
                href={`${permutaPath}${permutaPath.includes("?") ? "&" : "?"}usado=${tradeIn.id}`}
                className={linkClass}
                aria-label={`Proponer lo que queda de ${tradeIn.displayNumber}`}
              >
                Proponer lo que queda
              </Link>
            ) : null}
          </label>
        ))}
        {/* La ficha del usado marcado, de la lámina 03: de dónde sale lo disponible, que es el tope
            de la permuta. Solo con un usado marcado, y solo en el panel de una venta. */}
        {chosen ? (
          <dl className="mt-1 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg bg-surface-muted px-3 py-2 text-sm">
            <Icon name="tag" className="row-span-3 size-4 text-muted" />
            <dt className="text-muted">Valor reconocido</dt>
            <dd className="text-right tabular-nums">
              {formatMoney(chosen.value, currency)}
            </dd>
            <dt className="text-muted">Ya aplicado</dt>
            <dd className="text-right tabular-nums">
              {formatMoney(chosen.applied, currency)}
            </dd>
            <dt className="text-muted">Disponible</dt>
            <dd className="text-right font-semibold tabular-nums">
              {formatMoney(chosen.available, currency)}
            </dd>
          </dl>
        ) : null}
        <p id="cobro-medio-ayuda" className="text-sm text-muted">
          {hasOpenSession
            ? "Un cobro en efectivo entra a la sesión de caja abierta."
            : "La caja está cerrada: para cobrar en efectivo, primero abrila."}
          {permuta
            ? " La permuta descuenta el usado del cliente, en la moneda de la venta y sin pasar por la caja."
            : null}
        </p>
        {invalid("paymentMethod") ? (
          <p className={fieldErrorClass}>Elegí un medio de pago de la lista.</p>
        ) : null}
      </fieldset>

      {exchange ? <TenderCurrencyChoice exchange={exchange} /> : null}

      {exchange && tendered !== currency ? (
        <TenderedAmountFields
          exchange={exchange}
          target={currency}
          defaultAmount={values.amount}
          defaultRate={values.exchangeRate}
          invalidAmount={invalid("amount")}
          invalidRate={invalid("exchangeRate")}
          errorId="cobro-error"
        />
      ) : (
        <>
          <AmountField
            currency={currency}
            defaultValue={values.amount}
            amount={amount}
            onAmount={setAmount}
            invalid={invalid("amount")}
          />
          {preview ? (
            <ReceiptPreviewBlock
              preview={preview}
              currency={currency}
              amount={amount}
              tradeInAvailable={chosen?.available ?? null}
            />
          ) : null}
        </>
      )}
    </>
  );
}

// El monto, dentro del formulario: se vuelve a montar con él en cada rechazo, así que lo que se lee
// arranca de lo enviado. El valor lo guarda `ReceiptFields`, que también lo necesita para la
// previsión; el campo sigue siendo no controlado, como siempre.
function AmountField({
  currency,
  defaultValue,
  amount,
  onAmount,
  invalid,
}: {
  currency: string;
  defaultValue: string;
  amount: string;
  onAmount: (amount: string) => void;
  invalid: boolean;
}) {
  return (
    <div className="flex max-w-xs flex-col gap-1">
      <label htmlFor="cobro-monto" className={labelClass}>
        Monto en <span className="font-mono">{currency}</span> *
      </label>
      <input
        id="cobro-monto"
        name="amount"
        type="text"
        inputMode="decimal"
        required
        autoComplete="off"
        defaultValue={defaultValue}
        onChange={(event) => onAmount(event.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={
          invalid ? "cobro-lectura cobro-error" : "cobro-lectura"
        }
        className={`${inputClass} tabular-nums`}
      />
      <AmountReading id="cobro-lectura" amount={amount} currency={currency} />
    </div>
  );
}

// Lo escrito en el campo como monto, o null si todavía no se entiende. El cero se entiende: es la
// misma regla que la lectura «Se lee: …» de la caja.
function typedAmount(amount: string, currency: string): Money | null {
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) return null;
  const parsed = parseMoneyInput(amount, decimals.decimals);
  if (parsed.ok) return parsed.amount;
  return parsed.reason === "zero" ? 0n : null;
}

// «Vista previa» de la lámina 03: cobrado después, lo que faltará y lo que le quedaría al usado.
// Dice **Previsión** y que el cobro todavía no se registró, porque eso es lo que es: lo que decide
// es la transacción del registro, que vuelve a comprobar los dos topes con el bloqueo tomado.
function ReceiptPreviewBlock({
  preview,
  currency,
  amount,
  tradeInAvailable,
}: {
  preview: ReceiptPreview;
  currency: string;
  amount: string;
  tradeInAvailable: string | null;
}) {
  const typed = typedAmount(amount, currency);
  const outstanding = moneyFromDatabase(preview.outstanding);
  const available =
    tradeInAvailable === null ? null : moneyFromDatabase(tradeInAvailable);
  // Lo que se escribió de más no produce un número imposible: produce el rechazo que `cash` va a
  // dar al confirmar, y la previsión lo dice en vez de dibujar un saldo negativo.
  const over =
    typed === null
      ? null
      : typed > outstanding
        ? "Supera lo que falta cobrar"
        : available !== null && typed > available
          ? "Supera lo que queda del usado"
          : null;
  const money = (value: Money) => formatMoney(moneyToDatabase(value), currency);
  const clamp = (value: Money) => (value < 0n ? 0n : value);
  const rows: [string, string][] = [
    [
      "Cobrados después",
      typed === null
        ? "—"
        : money(moneyFromDatabase(preview.collected) + typed),
    ],
    ["Faltará", typed === null ? "—" : money(clamp(outstanding - typed))],
  ];
  if (available !== null) {
    rows.push([
      "Disponible del usado después",
      typed === null ? "—" : money(clamp(available - typed)),
    ]);
  }

  return (
    <section
      aria-label="Vista previa del cobro"
      className="rounded-lg bg-surface-muted p-3"
    >
      <h3 className="text-sm font-semibold">Vista previa</h3>
      <dl
        aria-live="polite"
        className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm"
      >
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}:</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
        <Icon name="info" className="mt-0.5 size-4" />
        <span>
          {over
            ? `${over}: el registro lo va a rechazar.`
            : "Previsión. El cobro todavía no se registró."}
        </span>
      </p>
    </section>
  );
}
