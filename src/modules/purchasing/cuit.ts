// El CUIT del proveedor (ADR 0023, punto 2; brief-22.2, D-2): se valida por su forma, once dígitos
// con el dígito verificador, y no entra en ningún cálculo. Puro: no lee la base.

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

// Separadores que acepta la entrada: guiones, espacios y puntos (`20-12345678-9`).
const SEPARATORS = /[\s\-.]/g;

// Los once dígitos, sin mirar el verificador: también sirve para buscar (D-10).
export function cuitDigits(text: string): string | null {
  const digits = text.trim().replace(SEPARATORS, "");
  return /^[0-9]{11}$/.test(digits) ? digits : null;
}

// El dígito verificador de los diez primeros: 11 menos el resto de la suma ponderada por 11. Un 11
// vale 0, y un 10 no tiene dígito: ese CUIT no existe.
export function cuitCheckDigit(firstTen: string): number | null {
  let sum = 0;
  for (let index = 0; index < WEIGHTS.length; index += 1) {
    sum += Number(firstTen[index]) * WEIGHTS[index]!;
  }
  const digit = 11 - (sum % 11);
  if (digit === 11) return 0;
  if (digit === 10) return null;
  return digit;
}

export function isValidCuit(digits: string): boolean {
  if (!/^[0-9]{11}$/.test(digits)) return false;
  return cuitCheckDigit(digits.slice(0, 10)) === Number(digits[10]);
}

// Entrada de formulario: vacía es «sin CUIT»; cualquier otra cosa tiene que ser un CUIT válido.
export function parseCuitInput(
  value: string | null | undefined,
): { ok: true; cuit: string | null } | { ok: false } {
  if (value == null || value.trim() === "") return { ok: true, cuit: null };
  const digits = cuitDigits(value);
  return digits !== null && isValidCuit(digits)
    ? { ok: true, cuit: digits }
    : { ok: false };
}

// Como se muestra: `20-12345678-9`.
export function formatCuit(digits: string): string {
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}
