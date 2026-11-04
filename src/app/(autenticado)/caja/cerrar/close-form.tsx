"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  cardClass,
  dangerButtonClass,
  formMessageClass,
  inlineButtonClass,
  secondaryButtonClass,
  secondaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { Icon } from "@/app/_components/icons";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatMoney } from "@/shared/money";
import { closeCashSessionAction } from "../actions";
import { CurrencyRowsFields, rowsToShow } from "../currency-rows";
import {
  CLOSE_PHYSICAL_NOTE,
  CLOSE_WARNINGS,
  differenceText,
  differenceTone,
  type CloseFormState,
  type CurrencyRow,
} from "../messages";
import { ReferenceLine } from "../reference-total";

// El cierre (brief-21.2, D-4 y D-10), en dos pasos y sin JavaScript: lo contado de cada moneda, con
// lo esperado al lado (no es un arqueo a ciegas), y una confirmación con la diferencia de cada una.
// El cierre vuelve a calcular lo esperado con el bloqueo tomado: lo que guarda es eso.
//
// **Desde la 24.7.1, la forma de la lámina 04** (brief-24.7.1): **los dos pasos se nombran** —«Paso
// 1 de 2: Conteo» y «Paso 2 de 2: Revisión»—, la diferencia es una insignia con ícono en vez de
// texto suelto, y la revisión se parte en dos: el arqueo a la izquierda y, a la derecha, lo que hay
// que leer antes de confirmar. **Ni un paso ni una regla cambian**, y la tarjeta la pone el
// formulario y no la página, porque el paso 1 es una sola tarjeta y el paso 2 son dos.

const initialState: CloseFormState = { status: "idle" };

const numberCell = `${tableCellClass} text-right whitespace-nowrap tabular-nums`;

export function CloseForm({
  sessionId,
  displayNumber,
  required,
  currencies,
}: {
  sessionId: string;
  displayNumber: string;
  // Las monedas que hay que contar, con lo esperado ya formateado.
  required: { currency: string; expected: string }[];
  currencies: string[];
}) {
  const [state, formAction, pending] = useActionState(
    closeCashSessionAction,
    initialState,
  );
  const focusRef = useRef<HTMLParagraphElement>(null);
  const expectedOf = (currency: string) =>
    required.find((row) => row.currency === currency)?.expected ?? null;

  useEffect(() => {
    if (state.status === "error" || state.status === "review") {
      focusRef.current?.focus();
    }
  }, [state]);

  if (state.status === "review") {
    return (
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="sessionId" value={sessionId} />
        {state.rows.map((row) => (
          <span key={row.currency} hidden>
            <input type="hidden" name="currency" value={row.currency} />
            <input type="hidden" name="amount" value={row.amount} />
          </span>
        ))}
        {/* Lo esperado que se muestra: el cierre lo compara con el bloqueo tomado (R-5). */}
        {state.preview.map((row) => (
          <span key={`esperado-${row.currency}`} hidden>
            <input type="hidden" name="expectedCurrency" value={row.currency} />
            <input type="hidden" name="expectedAmount" value={row.expected} />
          </span>
        ))}
        {state.message ? (
          <p role="alert" className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
        <div>
          <p className="text-sm font-semibold text-muted">
            Paso 2 de 2: Revisión
          </p>
          <p
            ref={focusRef}
            tabIndex={-1}
            id="confirmar-cierre"
            className="text-lg font-semibold"
          >
            ¿Cerrar la sesión {displayNumber} con este arqueo?
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
          <div className={`${cardClass} p-5 sm:p-6`}>
            <p className="flex items-start gap-3 rounded-xl border border-border bg-tag-blue-soft px-3 py-2 text-sm text-on-tag-blue-soft">
              <Icon name="info" className="mt-0.5 size-4 shrink-0" />
              <span>{CLOSE_PHYSICAL_NOTE}</span>
            </p>
            <div
              className="mt-4 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-labelledby="confirmar-cierre"
            >
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Arqueo antes de cerrar</caption>
                <thead>
                  <tr>
                    <th scope="col" className={tableHeadCellClass}>
                      Moneda
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Esperado
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Contado
                    </th>
                    <th
                      scope="col"
                      className={`${tableHeadCellClass} text-right`}
                    >
                      Diferencia
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.preview.map((row) => (
                    <tr key={row.currency}>
                      <th scope="row" className={`${tableCellClass} font-mono`}>
                        {row.currency}
                      </th>
                      <td className={numberCell}>
                        {formatMoney(row.expected, row.currency)}
                      </td>
                      <td className={numberCell}>
                        {formatMoney(row.counted, row.currency)}
                      </td>
                      <td className={`${tableCellClass} text-right`}>
                        <StatusBadge {...differenceTone(row.difference)}>
                          {differenceText(row.difference, row.currency)}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <aside className={`${cardClass} flex flex-col gap-4 p-5 sm:p-6`}>
            <h2 className="text-base font-semibold">Revisar antes de cerrar</h2>
            {/* Lo contado de cada moneda, repetido acá a propósito: es lo que se firma. Una
                lista de definiciones admite un solo div por par, así que el par es el div. */}
            <dl className="flex flex-col gap-1 border-b border-border pb-4 text-sm">
              {state.preview.map((row) => (
                <div
                  key={`contado-${row.currency}`}
                  className="flex items-baseline justify-between gap-4"
                >
                  <dt className="text-muted">{row.currency} contados</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatMoney(row.counted, row.currency)}
                  </dd>
                </div>
              ))}
            </dl>
            {state.reference ? (
              <ReferenceLine
                label="Equivalente orientativo"
                text={state.reference}
                className=""
              />
            ) : null}
            <ul className="flex flex-col gap-2 rounded-xl border border-border-strong bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
              {CLOSE_WARNINGS.map((aviso) => (
                <li key={aviso} className="flex items-start gap-3">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                  <span>{aviso}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="submit"
                name="edit"
                value="1"
                formNoValidate
                className={secondaryButtonClass}
              >
                Corregir lo contado
              </button>
              <button
                type="submit"
                name="confirm"
                value="1"
                disabled={pending}
                className={dangerButtonClass}
              >
                {pending ? "Cerrando…" : "Cerrar caja"}
              </button>
            </div>
          </aside>
        </div>
      </form>
    );
  }

  const failed = state.status === "error";
  const rows: CurrencyRow[] =
    state.status === "idle"
      ? required.map((row) => ({ currency: row.currency, amount: "" }))
      : state.rows;

  return (
    <form
      action={formAction}
      className={`${cardClass} flex flex-col gap-4 p-5 sm:p-6`}
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <p className="text-sm font-semibold text-muted">Paso 1 de 2: Conteo</p>
      <div aria-live="polite" aria-atomic="true">
        {failed ? (
          <p ref={focusRef} tabIndex={-1} className={formMessageClass}>
            {state.message}
          </p>
        ) : null}
      </div>
      <CurrencyRowsFields
        key={state.status === "idle" ? "inicio" : state.requestId}
        prefix="cierre"
        rows={rowsToShow(rows, required.length + 1)}
        currencies={currencies}
        amountLabel="Contado"
        rowErrors={failed ? state.rowErrors : {}}
        expectedOf={expectedOf}
      />
      <p className="text-sm text-muted">
        Contá cada moneda que tuvo inicial o movimientos, aunque sea cero. Si
        apareció otra al contar, sumala en una fila vacía.
      </p>
      <div className="flex flex-wrap justify-end gap-3">
        <Link href="/caja" className={secondaryLinkClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={inlineButtonClass}>
          {pending ? "Revisando…" : "Revisar el cierre"}
        </button>
      </div>
    </form>
  );
}
