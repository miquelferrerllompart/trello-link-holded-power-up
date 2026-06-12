import { describe, expect, it } from 'vitest';
import { formatSpanishTextCase } from './spanish-text-case';

describe('formatSpanishTextCase', () => {
  it('formats all-uppercase Spanish names', () => {
    expect(formatSpanishTextCase('JOSE GARCIA DE LA CRUZ')).toBe('Jose Garcia de la Cruz');
  });

  it('formats all-lowercase Spanish names', () => {
    expect(formatSpanishTextCase('jose garcia de la cruz')).toBe('Jose Garcia de la Cruz');
  });

  it('leaves mixed-case text untouched', () => {
    expect(formatSpanishTextCase('José García de la Cruz')).toBe('José García de la Cruz');
    expect(formatSpanishTextCase('iPhone Servicios')).toBe('iPhone Servicios');
  });

  it('formats address-style text and keeps common abbreviations uppercase', () => {
    expect(formatSpanishTextCase('C/ MAYOR 12, 1º B')).toBe('C/ Mayor 12, 1º B');
    expect(formatSpanishTextCase('ELECTRICA FERRER SL')).toBe('Electrica Ferrer SL');
  });
});
