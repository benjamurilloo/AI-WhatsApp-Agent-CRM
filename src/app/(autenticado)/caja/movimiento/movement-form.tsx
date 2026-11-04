"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import type { CashMovementKind, CashMovementReason } from "@/modules/cash";
import {
  cardClass,
  fieldErrorClass,
  formMessageClass,
  inlineButtonClass,
  inputClass,
  labelClass,
  secondaryLinkClass,
  selectClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import {
  currencyDecimals,
  formatMoney,
  moneyToDatabase,
  parseMoneyInput,
} from "@/shared/money";
import { recordCashMovementAction } from "../actions";
import {
  KIND_LABEL,
  MOVEMENT_KIND_NOTE,
  MOVEMENT_PREVIEW_NOTE,
  PREVIEW_TITLE,
  REASON_LABEL,
  type MovementFormState,
  type MovementFormValues,
} from "../messages";
import { AmountReading, CurrencySelect } from "../money-fields";

// Un aporte o un retiro en la sesión abierta (brief-21.2, D-5 y D-10): moneda, monto y un motivo
// de la lista cerrada del tipo. Funciona sin JavaScript.
//
// **Desde la 24.7.1 es la lámina 03** (brief-24.7.1, D-2): un solo acceso desde la caja, el tipo
// elegido acá con el conmutador de la lámina, y **la revisión al costado**, que sigue lo que se
// escribe.
//
// **El conmutador de tipo son dos enlaces, no estado de cliente.** Cada tipo tiene **su propia
// lista de motivos**, que decide el servidor (`CASH_MOVEMENT_REASONS`); un conmutador de cliente no
// puede cambiarla sin JavaScript, y 22 archivos de `tests/e2e/` prueban esta aplicación sin él.
// Con enlaces, el servidor manda la lista correcta y el no-JS anda igual. El costo es que cambiar
// de tipo recarga y vacía lo escrito, que es aceptable porque el tipo se elige primero.

export type ExpectedByCurrency = { currency: string; expected: string };

const initialState: MovementFormState = { status: "idle" };

export function MovementForm({
  sessionId,
  kind,
  reasons,
  currencies,
  defaultCurrency,
  expected,
}: {
  sessionId: string;
  kind: CashMovementKind;
  reasons: readonly CashMovementReason[];
  currencies: string[];
  defaultCurrency: string;
  expected: ExpectedByCurrency[];
}) {
  const [state, formAction, pending] = useActionState(
    recordCashMovementAction,
    initialState,
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  const failed = state.status === "error";
  const values: MovementFormValues = failed
    ? state.values
    : { currency: defaultCurrency, amount: "", reason: "" };
  const invalid = (field: "currency" | "amount" | "reason") =>
    failed && state.fields.includes(field);

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state]);

  return (
    <Fields
      key={failed ? state.requestId : "nuevo"}
      sessionId={sessionId}
      kind={kind}
      reasons={reasons}
      currencies={currencies}
      values={values}
      invalid={invalid}
      failed={failed}
      message={failed ? state.message : null}
      errorRef={errorRef}
      formAction={formAction}
      pending={pending}
      expected={expected}
    />
  );
}

// El cuerpo, con la moneda y el monto como estado: va adentro del `key` del formulario, así que un
// rechazo lo vuelve a montar con lo enviado y la revisión arranca de ahí.
function Fields({
  sessionId,
  kind,
  reasons,
  currencies,
  values,
  invalid,
  failed,
  message,
  errorRef,
  formAction,
  pending,
  expected,
}: {
  sessionId: string;
  kind: CashMovementKind;
  reasons: readonly CashMovementReason[];
  currencies: string[];
  values: MovementFormValues;
  invalid: (field: "currency" | "amount" | "reason") => boolean;
  failed: boolean;
  message: string | null;
  errorRef: React.RefObject<HTMLParagraphElement | null>;
  formAction: (payload: FormData) => void;
  pending: boolean;
  expected: ExpectedByCurrency[];
}) {
  const [currency, setCurrency] = useState(values.currency);
  const [amount, setAmount] = useState(values.amount);
  const retiro = kind === "withdrawal";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      {/* **El formulario va en su tarjeta**, como la lámina, y con su propio título adentro: el
          encabezado de la página nombra la sesión —que es dónde cae el movimiento— y la tarjeta
          nombra lo que estás haciendo. Sin la tarjeta el formulario quedaba suelto sobre el fondo,
          al lado de una revisión que sí la tenía. */}
      <form
        action={formAction}
        className={`${cardClass} flex flex-col gap-4 p-5 sm:p-6`}
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="kind" value={kind} />
        <h2 className="text-lg font-semibold">Registrar movimiento</h2>

        <div aria-live="polite" aria-atomic="true">
          {failed ? (
            <p
              ref={errorRef}
              tabIndex={-1}
              id="movimiento-error"
              className={formMessageClass}
            >
              {message}
            </p>
          ) : null}
        </div>

        {/* El conmutador de la lámina: dos enlaces, con el activo marcado. */}
        <nav aria-label="Tipo de movimiento" className="grid grid-cols-2 gap-3">
          {(
            [
              ["aporte", "contribution", "Aporte"],
              ["retiro", "withdrawal", "Retiro"],
            ] as const
          ).map(([param, valor, etiqueta]) => (
            <Link
              key={valor}
              href={`/caja/movimiento?tipo=${param}`}
              aria-current={kind === valor ? "page" : undefined}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                kind === valor
                  ? "border-primary bg-primary-soft text-on-primary-soft"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              <Icon
                name={valor === "withdrawal" ? "trendingUp" : "undo"}
                className="size-4"
              />
              {etiqueta}
            </Link>
          ))}
        </nav>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,14rem)] sm:items-start">
          <div className="flex flex-col gap-1">
            <label htmlFor="movimiento-moneda" className={labelClass}>
              Moneda *
            </label>
            <CurrencySelect
              // Que pueda encogerse: a 320 px su opción más larga desbordaba la página (AC-8).
              className="w-full min-w-0"
              id="movimiento-moneda"
              defaultValue={values.currency}
              currencies={currencies}
              required
              invalid={invalid("currency")}
              describedBy={invalid("currency") ? "movimiento-error" : undefined}
              onChange={setCurrency}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="movimiento-monto" className={labelClass}>
              Importe *
            </label>
            <input
              id="movimiento-monto"
              name="amount"
              type="text"
              inputMode="decimal"
              required
              autoComplete="off"
              defaultValue={values.amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={invalid("amount") ? true : undefined}
              aria-describedby={
                invalid("amount")
                  ? "movimiento-lectura movimiento-error"
                  : "movimiento-lectura"
              }
              className={`${inputClass} tabular-nums`}
            />
            <AmountReading
              id="movimiento-lectura"
              amount={amount}
              currency={currency}
            />
          </div>
        </div>

        {/* El motivo es un desplegable desde la 24.7.1, como la lámina 03. Sigue siendo la lista
            cerrada del tipo y sigue siendo obligatorio. */}
        <div className="flex flex-col gap-1">
          <label htmlFor="movimiento-motivo" className={labelClass}>
            Motivo *
          </label>
          <select
            id="movimiento-motivo"
            name="reason"
            required
            defaultValue={values.reason}
            aria-invalid={invalid("reason") ? true : undefined}
            aria-describedby={
              invalid("reason") ? "movimiento-error" : undefined
            }
            className={selectClass}
          >
            <option value="">Elegí un motivo</option>
            {reasons.map((reason) => (
              <option key={reason} value={reason}>
                {REASON_LABEL[reason]}
              </option>
            ))}
          </select>
          {invalid("reason") ? (
            <p className={fieldErrorClass}>Elegí un motivo de la lista.</p>
          ) : null}
        </div>

        <p className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm">
          <Icon name="info" className="mt-0.5 size-4 shrink-0 text-muted" />
          <span>{MOVEMENT_KIND_NOTE[kind]}</span>
        </p>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/caja" className={secondaryLinkClass}>
            Volver
          </Link>
          <button
            type="submit"
            disabled={pending}
            className={inlineButtonClass}
          >
            {pending
              ? "Registrando…"
              : `Registrar ${KIND_LABEL[kind].toLowerCase()}`}
          </button>
        </div>
      </form>

      <MovementPreview
        kind={kind}
        currency={currency}
        amount={amount}
        expected={expected}
        retiro={retiro}
      />
    </div>
  );
}

// **La revisión** (lámina 03). Es aritmética sobre lo esperado por moneda, que la sesión ya trae:
// no es una lectura nueva, igual que la vista previa del cobro de la 24.6.2-d.
//
// **No lleva la salvedad de «calculado ahora»** que sí lleva la anulación de una venta: acá la
// regla la vuelve a comprobar el servidor dentro de la transacción, así que esto anticipa el
// rechazo y no promete nada que la escritura no compruebe.
function MovementPreview({
  kind,
  currency,
  amount,
  expected,
  retiro,
}: {
  kind: CashMovementKind;
  currency: string;
  amount: string;
  expected: ExpectedByCurrency[];
  retiro: boolean;
}) {
  // **Una moneda que la sesión todavía no tiene espera cero**, no un mensaje. El desplegable
  // ofrece todas las aceptadas y un aporte en una moneda nueva es legal: `recordCashMovement`
  // resuelve lo esperado con `?? 0n`. La primera versión mostraba «Elegí la moneda» con la moneda
  // ya elegida, que era el único lugar donde la revisión no decía lo que el registro deja. Lo
  // encontró la revisión independiente.
  const actual = expected.find((row) => row.currency === currency);
  if (!currency) {
    return (
      <Panel>
        <p className="text-sm text-muted">
          Elegí la moneda para ver cómo queda la caja.
        </p>
      </Panel>
    );
  }
  const actualCents = actual
    ? (parseAmount(actual.expected, currency) ?? 0n)
    : 0n;
  const actualTexto = formatMoney(moneyToDatabase(actualCents), currency);
  const escrito = parseAmount(amount, currency);
  const despues =
    escrito === null
      ? null
      : retiro
        ? actualCents - escrito
        : actualCents + escrito;
  const excede = despues !== null && despues < 0n;
  const otras = expected.filter((row) => row.currency !== currency);

  return (
    <Panel>
      <h2 className="text-base font-bold tracking-tight">
        {PREVIEW_TITLE[kind]}
      </h2>
      <dl className="mt-4 flex flex-col gap-3 text-sm">
        <Row
          label={`Efectivo esperado actual (${currency})`}
          value={actualTexto}
        />
        <Row
          label={`${retiro ? "Retiro" : "Aporte"} por registrar (${currency})`}
          value={
            escrito === null
              ? "—"
              : formatMoney(moneyToDatabase(escrito), currency)
          }
        />
        <Row
          label={`Esperado después (${currency})`}
          value={
            despues === null || excede
              ? "—"
              : formatMoney(moneyToDatabase(despues), currency)
          }
          strong
          className="rounded-xl bg-primary-soft px-3 py-2"
        />
      </dl>

      {excede ? (
        <p className="mt-3 flex items-start gap-3 rounded-xl border border-border-strong bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          <span>
            El retiro supera lo esperado en {currency}, que es {actualTexto}. El
            registro lo va a rechazar.
          </span>
        </p>
      ) : null}

      {otras.length > 0 ? (
        <div className="mt-4 rounded-xl border border-border px-3 py-2">
          <p className="text-sm font-semibold">
            Efectivo en {otras.map((row) => row.currency).join(" y ")} (sin
            cambios)
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm tabular-nums">
            {otras.map((row) => (
              <li key={row.currency}>
                {formatMoney(row.expected, row.currency)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm text-muted">
            La operación se registra en {currency}. Las demás monedas no se
            tocan.
          </p>
        </div>
      ) : null}

      <p className="mt-3 text-sm text-muted">{MOVEMENT_PREVIEW_NOTE}</p>
    </Panel>
  );
}

// El importe escrito, en la escala de la moneda, o null si todavía no se entiende.
function parseAmount(amount: string, currency: string): bigint | null {
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) return null;
  const parsed = parseMoneyInput(amount, decimals.decimals);
  if (parsed.ok) return parsed.amount;
  return parsed.reason === "zero" ? 0n : null;
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Revisión del movimiento"
      className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
    >
      {children}
    </section>
  );
}

// **Una `<dl>` solo admite un `<div>` por par `dt`/`dd`.** La primera versión envolvía la fila
// destacada en un div extra para pintarle el fondo, y axe lo marcó con «definition-list» y
// «dlitem»: el envoltorio de más rompe la estructura de la lista de definiciones. El fondo va en el
// mismo div que agrupa el par. Lo encontró la batería, no la lectura.
function Row({
  label,
  value,
  strong = false,
  className = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${className}`}>
      <dt className={strong ? "font-bold" : "text-muted"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-lg font-bold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
