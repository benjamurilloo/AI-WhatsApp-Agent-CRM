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
  // El detalle se muestra como código (un SKU), salvo que diga «text» (brief-23.3).
  detailStyle?: "code" | "text";
  href: string;
  // La búsqueda global agrupa por tipo (brief-23.3, D-5): el título del grupo y el tipo que dice
  // cada opción, para el lector de pantalla que no anuncia el grupo.
  group?: string;
  spokenKind?: string;
};

// Las opciones en grupos consecutivos, en el orden en que llegan. Sin `group`, un solo grupo sin
// título: la lista de siempre.
export function groupSuggestions<T extends { group?: string }>(
  items: readonly T[],
): { title: string | null; items: { item: T; index: number }[] }[] {
  const groups: {
    title: string | null;
    items: { item: T; index: number }[];
  }[] = [];
  items.forEach((item, index) => {
    const title = item.group ?? null;
    const last = groups.at(-1);
    if (last && last.title === title) last.items.push({ item, index });
    else groups.push({ title, items: [{ item, index }] });
  });
  return groups;
}

// Cuántos caracteres hacen falta para pedir sugerencias al servidor, y cuánto se espera después
// de la última tecla.
export const REMOTE_MIN_LENGTH = 2;
export const REMOTE_DELAY_MS = 250;

// Un texto que parece teléfono: solo dígitos, espacios y + ( ) . -. Es la misma regla de
// `looksLikePhone` en crm, que no se importa acá porque este archivo llega al navegador.
export function looksLikePhone(text: string): boolean {
  return /^[\d\s+().-]+$/.test(text.trim());
}
