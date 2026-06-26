import { describe, expect, it } from 'vitest';
import { extractTrelloCustomField } from './holded-custom-fields';

describe('extractTrelloCustomField', () => {
  it('finds the trello custom field case-insensitively', () => {
    expect(extractTrelloCustomField([
      { field: 'Internal', value: 'ignored' },
      { field: 'Trello', value: 'Cliente Moroso' },
    ])).toBe('Cliente Moroso');
  });

  it('supports alternate key names and multiple values', () => {
    expect(extractTrelloCustomField([
      { key: 'trello', value: 'Primer aviso' },
      { name: 'TRELLO', value: 'Segundo aviso' },
    ])).toBe('Primer aviso\nSegundo aviso');
  });

  it('returns undefined when no trello field has a value', () => {
    expect(extractTrelloCustomField([{ field: 'trello', value: '' }])).toBeUndefined();
    expect(extractTrelloCustomField(null)).toBeUndefined();
  });
});
