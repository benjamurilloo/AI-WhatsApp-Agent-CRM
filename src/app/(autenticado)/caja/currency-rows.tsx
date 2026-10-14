"use client";

import { useState } from "react";
import {
  fieldErrorClass,
  inputClass,
  labelClass,
} from "@/app/_components/form-styles";
import type { CurrencyRow } from "./messages";
import { AmountReading, CurrencySelect } from "./money-fields";

// Las filas por moneda de la apertura y del cierre (brief-21.2, D-3, D-4 y D-10). Sin JavaScript:
// el formulario trae filas de más, y una fila vacía no se envía. La moneda se elige de la lista del
// sistema y el monto muestra cómo se lee (recorrido de la 21.2); los formularios vuelven a montar
// las filas con cada rechazo, así que conservan lo enviado.

export const MAX_ROWS = 10;

// Lo que se muestra: las filas dadas y dos vacías, hasta diez.
export function rowsToShow(rows: CurrencyRow[], minimum = 3): CurrencyRow[] {
  const shown = rows.slice(0, MAX_ROWS);
  const target = Math.min(MAX_ROWS, Math.max(minimum, shown.length + 2));
  while (shown.length < target) shown.push({ currency: "", amount: "" });
  return shown;
}

export function CurrencyRowsFields({
  prefix,
  rows,
  currencies,
  amountLabel,
  rowErrors,
  expectedOf,
}: {
  prefix: string;
  rows: CurrencyRow[];
  currencies: string[];
  amountLabel: string;
  rowErrors: Record<number, string>;
  // En el cierre, lo esperado de cada moneda, para mostrarlo al lado.
  expectedOf?: (currency: string) => string | null;
}) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Monedas">
      {rows.map((row, index) => (
        <CurrencyRowFields
          key={index + 1}
          prefix={prefix}
          position={index + 1}
          row={row}
          currencies={currencies}
          amountLabel={amountLabel}
          error={rowErrors[index + 1]}
          expectedOf={expectedOf}
        />
      ))}
    </ol>
  );
}

function CurrencyRowFields({
  prefix,
  position,
  row,
  currencies,
  amountLabel,
  error,
  expectedOf,
}: {
  prefix: string;
  position: number;
  row: CurrencyRow;
  currencies: string[];
  amountLabel: string;
  error: string | undefined;
  expectedOf?: (currency: string) => string | null;
}) {
  const [currency, setCurrency] = useState(row.currency);
  const [amount, setAmount] = useState(row.amount);
  const currencyId = `${prefix}-moneda-${position}`;
  const amountId = `${prefix}-monto-${position}`;
  const readingId = `${prefix}-lectura-${position}`;
  const errorId = `${prefix}-error-${position}`;
  const expectedId = `${prefix}-esperado-${position}`;
  const expected = currency ? expectedOf?.(currency) : null;
  return (
    <li className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_minmax(0,14rem)_1fr] sm:items-start">
      <div className="flex flex-col gap-1">
        <label htmlFor={currencyId} className={labelClass}>
          Moneda {position}
        </label>
        <CurrencySelect
          id={currencyId}
          defaultValue={row.currency}
          currencies={currencies}
          invalid={Boolean(error)}
          describedBy={error ? errorId : undefined}
          onChange={setCurrency}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={amountId} className={labelClass}>
          {amountLabel} {position}
        </label>
        <input
          id={amountId}
          name="amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={row.amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0"
          aria-invalid={error ? true : undefined}
          // Lo esperado se lee junto con el campo de lo contado (R-10).
          aria-describedby={[
            readingId,
            expected ? expectedId : null,
            error ? errorId : null,
          ]
            .filter(Boolean)
            .join(" ")}
          className={`${inputClass} tabular-nums`}
        />
        <AmountReading id={readingId} amount={amount} currency={currency} />
      </div>
      <div className="text-sm sm:pt-7">
        {expected ? (
          <p id={expectedId} className="text-muted">
            Esperado: {expected}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className={fieldErrorClass}>
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
