// Teléfono en E.164 (brief-5.2, D-1): la normalización de la entrada. Vivía en crm; desde la 22.2
// vive acá para que el cliente y el proveedor validen el mismo dato con la misma regla
// (brief-22.2, D-3), como las reglas de línea de la 20.3. Pura: no lee la base ni importa módulos.

// Misma forma que los CHECK clients_phone_e164_format y suppliers_phone_e164_format.
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
