"use client";

import { selectClass } from "@/app/_components/form-styles";
import {
  currencyDecimals,
  formatMoney,
  moneyToDatabase,
  parseMoneyInput,
} from "@/shared/money";

// La moneda y la lectura del monto de la caja, observación del recorrido de la 21.2: la moneda se
// elige de la lista del sistema, como en precios y costos, y debajo del monto se muestra cómo se
// lee, con los separadores de miles («$ 100.000,00»). Los formularios se vuelven a montar con cada
// rechazo, así que el select conserva lo enviado (la lección del select de la 11.1).

const names = new Intl.DisplayNames("es", { type: "currency" });

// «USD — dólar estadounidense».
export function currencyLabel(code: string): string {
  return `${code} — ${names.of(code) ?? code}`;
}

export function CurrencySelect({
  id,
  defaultValue,
  currencies,
  required,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  defaultValue: string;
  currencies: string[];
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (currency: string) => void;
}) {
  return (
    <select
      id={id}
      name="currency"
      required={required}
      defaultValue={defaultValue}
      onChange={(event) => onChange(event.target.value)}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      className={selectClass}
    >
      <option value="">{required ? "Elegí una moneda" : "Sin moneda"}</option>
      {currencies.map((code) => (
        <option key={code} value={code}>
          {currencyLabel(code)}
        </option>
      ))}
    </select>
  );
}

// El monto como se va a guardar, formateado en su moneda; null si todavía no se entiende. El cero
// se muestra: la apertura y el cierre lo admiten.
export function amountReading(amount: string, currency: string): string | null {
  const decimals = currencyDecimals(currency);
  if (!decimals.ok) return null;
  const parsed = parseMoneyInput(amount, decimals.decimals);
  if (parsed.ok) return formatMoney(moneyToDatabase(parsed.amount), currency);
  return parsed.reason === "zero"
    ? formatMoney(moneyToDatabase(0n), currency)
    : null;
}

export function AmountReading({
  id,
  amount,
  currency,
}: {
  id: string;
  amount: string;
  currency: string;
}) {
  const reading = amountReading(amount, currency);
  return (
    <p
      id={id}
      aria-live="polite"
      aria-atomic="true"
      className="min-h-5 text-sm tabular-nums text-muted"
    >
      {reading ? <>Se lee: {reading}</> : null}
    </p>
  );
}
