import type { MemberRole } from "@/modules/organizations";

// Teléfono del cliente (brief-5.2): normalización de la entrada (D-1) y enmascarado por rol (D-2).

// Misma forma que el CHECK clients_phone_e164_format (brief-5.1, D-1).
const E164 = /^\+[1-9][0-9]{1,14}$/;
const SEPARATORS = /[\s\-.()]/g;

// Solo formato internacional: se quitan separadores y el resultado tiene que ser E.164.
// Sin "+" no se adivina el país: un número mal completado sería otro cliente (D-1).
export function normalizePhone(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("+")) return null;
  const compact = trimmed.replace(SEPARATORS, "");
  return E164.test(compact) ? compact : null;
}

// Entrada de formulario: vacía es "sin teléfono"; cualquier otra cosa tiene que normalizar.
export function parsePhoneInput(
  value: string | null | undefined,
): { ok: true; phone: string | null } | { ok: false } {
  if (value == null || value.trim() === "") return { ok: true, phone: null };
  const phone = normalizePhone(value);
  return phone === null ? { ok: false } : { ok: true, phone };
}

export type ClientPhone =
  | { kind: "full"; e164: string }
  | { kind: "masked"; lastDigits: string }
  | null;

// Un viewer nunca recibe el número completo (FR-CLI-06). Con 4 dígitos o menos, "los últimos 4"
// serían el número entero: no se entrega ninguno (D-2).
export function phoneForRole(
  e164: string | null,
  role: MemberRole,
): ClientPhone {
  if (e164 === null) return null;
  if (role === "admin") return { kind: "full", e164 };
  const digits = e164.slice(1);
  return {
    kind: "masked",
    lastDigits: digits.length > 4 ? digits.slice(-4) : "",
  };
}
