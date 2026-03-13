/**
 * Normalizes text for fuzzy searching:
 * - Lowercases
 * - Removes diacritics/accents (é→e, ñ→n, ü→u, etc.)
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Checks if a text matches a search query.
 * - Accent-insensitive
 * - Word-order independent (all words must appear, in any order)
 * - Partial word matching
 */
export function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const normalizedText = normalize(text);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return words.every((w) => normalizedText.includes(w));
}

/**
 * Filters an array of items using fuzzy matching against specified fields.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getSearchText: (item: T) => string,
): T[] {
  if (!query) return items;
  return items.filter((item) => fuzzyMatch(getSearchText(item), query));
}
