import type { MemberRole } from "@/modules/organizations";

// Teléfono del cliente (brief-5.2): normalización de la entrada (D-1) y enmascarado por rol (D-2).
// Desde la 22.2, la normalización vive en src/shared/phone, porque el proveedor valida el mismo dato
// (brief-22.2, D-3); se reexporta para que el resto de crm la siga importando de acá.
export { normalizePhone, parsePhoneInput } from "@/shared/phone";

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
