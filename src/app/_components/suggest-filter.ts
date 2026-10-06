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
