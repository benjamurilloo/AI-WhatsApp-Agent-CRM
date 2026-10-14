import {
  fieldErrorClass,
  inputClass,
  labelClass,
} from "@/app/_components/form-styles";
import type { CurrencyRow } from "./messages";

// Las filas por moneda de la apertura y del cierre (brief-21.2, D-3, D-4 y D-10). Sin JavaScript:
// el formulario trae filas de más, y una fila vacía no se envía. La moneda es un campo de texto con
// la lista de las aceptadas, no un select, para que tras un rechazo conserve lo escrito (lección del
// select de la 11.1).

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
  const listId = `${prefix}-monedas`;
  return (
    <>
      <datalist id={listId}>
        {currencies.map((currency) => (
          <option key={currency} value={currency} />
        ))}
      </datalist>
      <ol className="flex flex-col gap-3" aria-label="Monedas">
        {rows.map((row, index) => {
          const position = index + 1;
          const error = rowErrors[position];
          const currencyId = `${prefix}-moneda-${position}`;
          const amountId = `${prefix}-monto-${position}`;
          const errorId = `${prefix}-error-${position}`;
          const expectedId = `${prefix}-esperado-${position}`;
          const expected = row.currency ? expectedOf?.(row.currency) : null;
          return (
            <li
              key={position}
              className="grid gap-3 sm:grid-cols-[8rem_minmax(0,16rem)_1fr] sm:items-end"
            >
              <div className="flex flex-col gap-1">
                <label htmlFor={currencyId} className={labelClass}>
                  Moneda {position}
                </label>
                <input
                  id={currencyId}
                  name="currency"
                  type="text"
                  list={listId}
                  maxLength={3}
                  autoComplete="off"
                  defaultValue={row.currency}
                  placeholder="ARS"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  className={`${inputClass} font-mono uppercase`}
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
                  placeholder="0"
                  aria-invalid={error ? true : undefined}
                  // Lo esperado se lee junto con el campo de lo contado (R-10).
                  aria-describedby={
                    [expected ? expectedId : null, error ? errorId : null]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  className={`${inputClass} tabular-nums`}
                />
              </div>
              <div className="text-sm">
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
        })}
      </ol>
    </>
  );
}
