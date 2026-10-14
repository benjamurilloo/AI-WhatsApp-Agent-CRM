"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import {
  dangerButtonClass,
  formMessageClass,
  inlineButtonClass,
  secondaryButtonClass,
  secondaryLinkClass,
  tableCellClass,
  tableHeadCellClass,
} from "@/app/_components/form-styles";
import { formatMoney } from "@/shared/money";
import { closeCashSessionAction } from "../actions";
import { CurrencyRowsFields, rowsToShow } from "../currency-rows";
import {
  differenceText,
  type CloseFormState,
  type CurrencyRow,
} from "../messages";

// El cierre (brief-21.2, D-4 y D-10), en dos pasos y sin JavaScript: lo contado de cada moneda, con
// lo esperado al lado (no es un arqueo a ciegas), y una confirmación con la diferencia de cada una.
// El cierre vuelve a calcular lo esperado con el bloqueo tomado: lo que guarda es eso.

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
        <p
          ref={focusRef}
          tabIndex={-1}
          id="confirmar-cierre"
          className="font-semibold"
        >
          ¿Cerrar la sesión {displayNumber} con este arqueo?
        </p>
        <div
          className="overflow-x-auto"
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
                <th scope="col" className={`${tableHeadCellClass} text-right`}>
                  Esperado
                </th>
                <th scope="col" className={`${tableHeadCellClass} text-right`}>
                  Contado
                </th>
                <th scope="col" className={`${tableHeadCellClass} text-right`}>
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
                  <td className={`${numberCell} font-semibold`}>
                    {differenceText(row.difference, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm">
          Una sesión cerrada no cambia: su arqueo queda guardado tal como está.
        </p>
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
            {pending ? "Cerrando…" : "Sí, cerrar la caja"}
          </button>
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
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="sessionId" value={sessionId} />
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
