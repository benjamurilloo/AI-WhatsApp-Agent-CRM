// Filtrado de las sugerencias de una lista fija (brief-15.2, D-5): sin tildes ni mayúsculas,
// primero las que empiezan con el texto y después las que lo contienen, cada grupo en el orden de
// la lista. Sin texto, la lista entera.

export function normalizeForSuggest(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function filterSuggestions(
  options: readonly string[],
  text: string,
): string[] {
  const query = normalizeForSuggest(text);
  if (query === "") return [...options];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const option of options) {
    const normalized = normalizeForSuggest(option);
    if (normalized.startsWith(query)) starts.push(option);
    else if (normalized.includes(query)) contains.push(option);
  }
  return [...starts, ...contains];
}

// Una sugerencia que llega del servidor (brief-15.2, D-6): elegirla abre `href`, el detalle.
export type RemoteSuggestion = {
  id: string;
  label: string;
  detail?: string;
  href: string;
};

// Cuántos caracteres hacen falta para pedir sugerencias al servidor, y cuánto se espera después
// de la última tecla.
export const REMOTE_MIN_LENGTH = 2;
export const REMOTE_DELAY_MS = 250;

// Un texto que parece teléfono: solo dígitos, espacios y + ( ) . -. Es la misma regla de
// `looksLikePhone` en crm, que no se importa acá porque este archivo llega al navegador.
export function looksLikePhone(text: string): boolean {
  return /^[\d\s+().-]+$/.test(text.trim());
}
