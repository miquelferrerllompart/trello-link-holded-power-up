const SPANISH_LOWERCASE_WORDS = new Set([
  'a',
  'al',
  'de',
  'del',
  'e',
  'el',
  'en',
  'la',
  'las',
  'los',
  'o',
  'u',
  'y',
]);

const SPANISH_UPPERCASE_WORDS = new Map([
  ['cb', 'CB'],
  ['cif', 'CIF'],
  ['dni', 'DNI'],
  ['iva', 'IVA'],
  ['nie', 'NIE'],
  ['sa', 'SA'],
  ['sl', 'SL'],
  ['slu', 'SLU'],
  ['ute', 'UTE'],
]);

function isAllUppercaseOrLowercase(text: string): boolean {
  const letters = Array.from(text.matchAll(/\p{L}/gu), (match) => match[0]);
  if (letters.length === 0) return false;

  const allUppercase = letters.every((letter) => letter === letter.toLocaleUpperCase('es-ES'));
  const allLowercase = letters.every((letter) => letter === letter.toLocaleLowerCase('es-ES'));

  return allUppercase || allLowercase;
}

function capitalizeWord(word: string): string {
  const uppercaseWord = SPANISH_UPPERCASE_WORDS.get(word);
  if (uppercaseWord) return uppercaseWord;

  return word.charAt(0).toLocaleUpperCase('es-ES') + word.slice(1);
}

export function formatSpanishTextCase(value: string): string {
  const trimmed = value.trim();
  if (!isAllUppercaseOrLowercase(trimmed)) return trimmed;

  let wordIndex = 0;
  return trimmed
    .toLocaleLowerCase('es-ES')
    .replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => {
      const isFirstWord = wordIndex === 0;
      wordIndex += 1;

      if (!isFirstWord && SPANISH_LOWERCASE_WORDS.has(word)) return word;
      return capitalizeWord(word);
    });
}
