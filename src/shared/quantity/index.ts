// Cantidades numeric(14, 3) como bigint en milésimas: exactas y sin number (brief-4.2, D-2).
// Drizzle las lee y las escribe como texto con la escala de la base ("10.000").

export type Quantity = bigint;

const FACTOR = 1000n;

// El mayor valor que admite numeric(14, 3): 99 999 999 999,999.
export const MAX_QUANTITY: Quantity = 99_999_999_999_999n;

// Entrada de un formulario: hasta 11 dígitos enteros y hasta 3 decimales, con coma o punto.
// Sin signo, sin separador de miles y sin notación científica.
const INPUT_PATTERN = /^(\d{1,11})(?:[.,](\d{1,3}))?$/;

// Valor tal como lo devuelve PostgreSQL para numeric(14, 3).
const DATABASE_PATTERN = /^(-?)(\d+)\.(\d{3})$/;

export function parseQuantityInput(value: string): Quantity | null {
  const match = INPUT_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, integer, fraction = ""] = match;
  return BigInt(integer!) * FACTOR + BigInt(fraction.padEnd(3, "0"));
}

export function quantityFromDatabase(value: string): Quantity {
  const match = DATABASE_PATTERN.exec(value);
  if (!match) {
    throw new Error("Cantidad con un formato distinto de numeric(14, 3).");
  }
  const [, sign, integer, fraction] = match;
  const magnitude = BigInt(integer!) * FACTOR + BigInt(fraction!);
  return sign ? -magnitude : magnitude;
}

// Para mostrar: "2.500" se lee "2,5" (brief-4.4, D-2). Sin ceros finales y con coma decimal,
// como se escribe en español; la entrada sigue aceptando coma o punto.
export function formatQuantity(value: string): string {
  const quantity = quantityFromDatabase(value);
  const sign = quantity < 0n ? "-" : "";
  const magnitude = quantity < 0n ? -quantity : quantity;
  const fraction = (magnitude % FACTOR)
    .toString()
    .padStart(3, "0")
    .replace(/0+$/, "");
  const integer = (magnitude / FACTOR).toString();
  return fraction ? `${sign}${integer},${fraction}` : `${sign}${integer}`;
}

export function quantityToDatabase(value: Quantity): string {
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  const fraction = (magnitude % FACTOR).toString().padStart(3, "0");
  return `${sign}${magnitude / FACTOR}.${fraction}`;
}
