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
  className = "",
}: {
  id: string;
  defaultValue: string;
  currencies: string[];
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (currency: string) => void;
  // **Agregado en la 24.7.1**, para que las pantallas de caja puedan dejarlo encogerse.
  //
  // Un `<select>` tiene un ancho mínimo propio: el de su opción más larga. Acá la más larga es el
  // nombre completo de una moneda, y a 320 px eso mide 413 px, así que **la página entera
  // desbordaba**: 109 px en el movimiento y 130 px en el cierre. Viene de la 21.2 y lo encontró el
  // barrido de anchos de la 24.7.1 (AC-8), que para la caja no existía.
  //
  // La clase va por prop y no adentro para que las pantallas de otros módulos que usan este
  // componente —cobrar a cuenta, pagos a proveedores— queden exactamente como están. *Desvío de la
  // lista cerrada del brief-24.7.1, que marcaba este archivo «sin tocar»; autorizado el 2026-11-04.*
  className?: string;
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
      className={`${selectClass} ${className}`}
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
