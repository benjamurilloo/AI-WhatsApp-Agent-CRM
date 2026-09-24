// Montos numeric(14, 2) como bigint en centésimas: exactos y sin number (brief-11.1, D-5 y D-6).
// Drizzle los lee y los escribe como texto con la escala de la base ("1234.50").
//
// No reutiliza src/shared/quantity: su parser lee «300.000» como 300, correcto para una cantidad
// y un error de mil veces para un precio en una moneda sin decimales (brief-11.1, D-6).

export type Money = bigint;

const FACTOR = 100n;

// El mayor valor que admite numeric(14, 2): 999 999 999 999,99.
export const MAX_AMOUNT: Money = 99_999_999_999_999n;

const MAX_INTEGER_DIGITS = 12;

// Valor tal como lo devuelve PostgreSQL para numeric(14, 2).
const DATABASE_PATTERN = /^(\d+)\.(\d{2})$/;

// Monedas: ISO 4217 según Intl. Una moneda que Intl no conoce se rechaza, porque Intl le
// asignaría dos decimales por defecto y el parser no sabría si eso es cierto.
export type CurrencyRejection = "unknown" | "too_many_decimals";

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

function intlDecimals(currency: string): number {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits!;
}

// Decimales de la moneda, o por qué no se acepta: desconocida, o con más de dos decimales, que
// numeric(14, 2) no puede guardar (D-5).
export function currencyDecimals(
  currency: string,
): { ok: true; decimals: number } | { ok: false; reason: CurrencyRejection } {
  if (!/^[A-Z]{3}$/.test(currency) || !SUPPORTED_CURRENCIES.has(currency)) {
    return { ok: false, reason: "unknown" };
  }
  const decimals = intlDecimals(currency);
  if (decimals > 2) return { ok: false, reason: "too_many_decimals" };
  return { ok: true, decimals };
}

// Monedas que se pueden elegir al fijar un precio, en orden alfabético.
export function acceptedCurrencies(): string[] {
  return [...SUPPORTED_CURRENCIES].filter(
    (currency) => currencyDecimals(currency).ok,
  );
}

// Por qué no se acepta un monto escrito:
// - separator: la moneda no tiene decimales y el monto tiene un punto o una coma. Es el caso de
//   «300.000» en pesos chilenos, que no se adivina: se pide escribirlo sin separadores (D-6);
// - decimals: más decimales de los que tiene la moneda, o «1.234» en una moneda con dos, que
//   podría ser mil doscientos o uno con veintitrés;
// - too_large: más de doce dígitos enteros;
// - zero: un precio es mayor que cero;
// - invalid: cualquier otra forma.
export type AmountRejection =
  "separator" | "decimals" | "too_large" | "zero" | "invalid";

// Con decimales: dígitos solos, dígitos con un separador decimal (coma o punto), o miles con el
// otro signo en grupos de tres y después el separador decimal: «1.234,5» o «1,234.5».
const PLAIN = /^(\d+)$/;
const WITH_DECIMALS = /^(\d+)[.,](\d+)$/;
// Con separador de miles, el primer grupo no empieza en cero: «0.000,5» no es una forma de escribir 0,50.
const GROUPED_COMMA_DECIMAL = /^([1-9]\d{0,2}(?:\.\d{3})+),(\d+)$/;
const GROUPED_POINT_DECIMAL = /^([1-9]\d{0,2}(?:,\d{3})+)\.(\d+)$/;

export function parseMoneyInput(
  value: string,
  decimals: number,
): { ok: true; amount: Money } | { ok: false; reason: AmountRejection } {
  const text = value.trim();
  let integer: string;
  let fraction = "";

  const plain = PLAIN.exec(text);
  if (plain) {
    integer = plain[1]!;
  } else {
    if (!/^[\d.,]+$/.test(text)) return { ok: false, reason: "invalid" };
    if (decimals === 0) return { ok: false, reason: "separator" };
    const match =
      WITH_DECIMALS.exec(text) ??
      GROUPED_COMMA_DECIMAL.exec(text) ??
      GROUPED_POINT_DECIMAL.exec(text);
    if (!match) return { ok: false, reason: "invalid" };
    integer = match[1]!.replace(/[.,]/g, "");
    fraction = match[2]!;
    if (fraction.length > decimals) return { ok: false, reason: "decimals" };
  }

  if (integer.replace(/^0+(?=\d)/, "").length > MAX_INTEGER_DIGITS) {
    return { ok: false, reason: "too_large" };
  }
  const amount = BigInt(integer) * FACTOR + BigInt(fraction.padEnd(2, "0"));
  if (amount === 0n) return { ok: false, reason: "zero" };
  return { ok: true, amount };
}

export function moneyFromDatabase(value: string): Money {
  const match = DATABASE_PATTERN.exec(value);
  if (!match) {
    throw new Error("Monto con un formato distinto de numeric(14, 2).");
  }
  return BigInt(match[1]!) * FACTOR + BigInt(match[2]!);
}

export function moneyToDatabase(value: Money): string {
  if (value < 0n) throw new Error("Monto negativo.");
  const fraction = (value % FACTOR).toString().padStart(2, "0");
  return `${value / FACTOR}.${fraction}`;
}

// Para mostrar, con los decimales de la moneda: «CLP 300.000», «US$ 1.234,50». Intl recibe el
// texto de la base, no un number: formatea el decimal exacto (ECMA-402, formato de strings).
export function formatMoney(amount: string, currency: string): string {
  moneyFromDatabase(amount);
  return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(
    amount as `${number}`,
  );
}
