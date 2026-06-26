interface HoldedCustomField {
  field?: unknown;
  key?: unknown;
  name?: unknown;
  value?: unknown;
}

function normalizeKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(stringifyValue).filter(Boolean).join(', ');
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value || '').trim();
}

export function extractTrelloCustomField(customFields: unknown): string | undefined {
  if (!Array.isArray(customFields)) return undefined;

  const values = customFields
    .filter((field): field is HoldedCustomField => Boolean(field && typeof field === 'object'))
    .filter((field) => {
      const key = field.field ?? field.key ?? field.name;
      return normalizeKey(key) === 'trello';
    })
    .map((field) => stringifyValue(field.value))
    .filter(Boolean);

  return values.length > 0 ? values.join('\n') : undefined;
}
