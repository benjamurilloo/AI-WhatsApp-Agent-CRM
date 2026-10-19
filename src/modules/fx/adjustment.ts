// El ajuste de la cotización automática (ADR 0025, punto 3, R-M7; brief-29.4.2, D-9): lo que se suma
// a la fuente, en la otra moneda. Puede ser cero o negativo, así que no es dinero de
// src/shared/money/, que rechaza los negativos. Centésimos con signo como bigint, leídos y escritos
// como texto: nunca number. En la base es numeric(14, 2).

export type Adjustment = bigint;

const CENTS = 100n;

// numeric(14, 2): doce dígitos enteros.
const MAX_INTEGER_DIGITS = 12;

const DATABASE_PATTERN = /^(-?)(\d+)\.(\d{2})$/;

export function adjustmentFromDatabase(value: string): Adjustment {
  const match = DATABASE_PATTERN.exec(value);
  if (!match) {
    throw new Error("Ajuste con un formato distinto de numeric(14, 2).");
  }
  const magnitude = BigInt(match[2]!) * CENTS + BigInt(match[3]!);
  return match[1] === "-" ? -magnitude : magnitude;
}

export function adjustmentToDatabase(value: Adjustment): string {
  const magnitude = value < 0n ? -value : value;
  const integer = magnitude / CENTS;
  if (integer.toString().length > MAX_INTEGER_DIGITS) {
    throw new Error("Ajuste fuera de rango.");
  }
  const fraction = (magnitude % CENTS).toString().padStart(2, "0");
  return `${value < 0n ? "-" : ""}${integer}.${fraction}`;
}

// Por qué no se acepta un ajuste escrito:
// - invalid: otra forma que la de abajo;
// - decimals: más de dos decimales;
// - too_large: más de doce dígitos enteros.
export type AdjustmentRejection = "invalid" | "decimals" | "too_large";

// Como la cotización: la coma separa los decimales y el punto, los miles. Un signo menos adelante
// lo vuelve negativo. «10», «-5,50», «1.000».
const PLAIN = /^(-?)(\d+)(?:,(\d+))?$/;
const GROUPED = /^(-?)([1-9]\d{0,2}(?:\.\d{3})+)(?:,(\d+))?$/;

export function parseAdjustmentInput(
  value: string,
):
  | { ok: true; adjustment: Adjustment }
  | { ok: false; reason: AdjustmentRejection } {
  const text = value.trim();
  const match = PLAIN.exec(text) ?? GROUPED.exec(text);
  if (!match) return { ok: false, reason: "invalid" };
  const integer = match[2]!.replace(/\./g, "").replace(/^0+(?=\d)/, "");
  const fraction = match[3] ?? "";
  if (fraction.length > 2) return { ok: false, reason: "decimals" };
  if (integer.length > MAX_INTEGER_DIGITS) {
    return { ok: false, reason: "too_large" };
  }
  const magnitude = BigInt(integer) * CENTS + BigInt(fraction.padEnd(2, "0"));
  return { ok: true, adjustment: match[1] === "-" ? -magnitude : magnitude };
}

// Para mostrar: «10,00», «-5,50», «1.000,00». El signo va solo si es negativo.
export function formatAdjustment(value: Adjustment): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(adjustmentToDatabase(value) as `${number}`);
}
