import { describe, it, expect } from 'vitest';
import { normalize, fuzzyMatch, fuzzyFilter } from './search-utils';

describe('normalize', () => {
  it('lowercases text', () => {
    expect(normalize('HOLA Mundo')).toBe('hola mundo');
  });

  it('removes common Spanish accents', () => {
    expect(normalize('José García López')).toBe('jose garcia lopez');
  });

  it('removes ñ tilde', () => {
    expect(normalize('España Señor Niño')).toBe('espana senor nino');
  });

  it('removes ü diaeresis', () => {
    expect(normalize('Güell Pingüino')).toBe('guell pinguino');
  });

  it('handles mixed accents', () => {
    expect(normalize('Éléctrica Ferrer')).toBe('electrica ferrer');
  });

  it('handles empty string', () => {
    expect(normalize('')).toBe('');
  });
});

describe('fuzzyMatch', () => {
  it('returns true for empty query', () => {
    expect(fuzzyMatch('anything', '')).toBe(true);
  });

  it('matches partial words', () => {
    expect(fuzzyMatch('Eléctrica Ferrer S.L.', 'ferr')).toBe(true);
  });

  it('is accent-insensitive: query without accents matches accented text', () => {
    expect(fuzzyMatch('José García', 'jose garcia')).toBe(true);
  });

  it('is accent-insensitive: query with accents matches unaccented text', () => {
    expect(fuzzyMatch('Jose Garcia', 'josé garcía')).toBe(true);
  });

  it('matches words in any order', () => {
    expect(fuzzyMatch('García López José', 'jose garcia')).toBe(true);
  });

  it('matches words in any order (reversed)', () => {
    expect(fuzzyMatch('José García López', 'lopez jose')).toBe(true);
  });

  it('requires all words to be present', () => {
    expect(fuzzyMatch('José García', 'jose martinez')).toBe(false);
  });

  it('handles ñ in text with n in query', () => {
    expect(fuzzyMatch('Señor Muñoz', 'senor munoz')).toBe(true);
  });

  it('handles multiple spaces in query', () => {
    expect(fuzzyMatch('José García López', '  jose   lopez  ')).toBe(true);
  });
});

describe('fuzzyFilter', () => {
  const contacts = [
    { name: 'José García López', email: 'jose@test.com' },
    { name: 'María Fernández', email: 'maria@test.com' },
    { name: 'Eléctrica Ferrer S.L.', email: 'info@electricaferrer.com' },
    { name: 'Antonio Muñoz Pérez', email: 'antonio@test.com' },
  ];

  const getText = (c: { name: string; email: string }) => `${c.name} ${c.email}`;

  it('returns all items for empty query', () => {
    expect(fuzzyFilter(contacts, '', getText)).toHaveLength(4);
  });

  it('filters by name without accents', () => {
    const result = fuzzyFilter(contacts, 'garcia', getText);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('José García López');
  });

  it('filters by email', () => {
    const result = fuzzyFilter(contacts, 'electricaferrer', getText);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Eléctrica Ferrer S.L.');
  });

  it('filters with words in different order', () => {
    const result = fuzzyFilter(contacts, 'lopez jose', getText);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('José García López');
  });

  it('filters accent-insensitive with ñ', () => {
    const result = fuzzyFilter(contacts, 'munoz perez', getText);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Antonio Muñoz Pérez');
  });

  it('filters with accented query against accented data', () => {
    const result = fuzzyFilter(contacts, 'fernández', getText);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('María Fernández');
  });

  it('returns empty when no match', () => {
    const result = fuzzyFilter(contacts, 'zzzzz', getText);
    expect(result).toHaveLength(0);
  });

  it('matches across multiple fields', () => {
    const result = fuzzyFilter(contacts, 'maria test.com', getText);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('María Fernández');
  });
});
