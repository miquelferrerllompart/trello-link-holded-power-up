import { describe, it, expect } from 'vitest';
import { addTag, removeTag } from './description-tags';

describe('addTag', () => {
  it('adds contact tag to empty description', () => {
    expect(addTag('', 'contact', 'José García')).toBe('{{ contact: José García }}');
  });

  it('adds project tag to empty description', () => {
    expect(addTag('', 'project', 'Reforma cocina')).toBe('{{ project: Reforma cocina }}');
  });

  it('appends tag after existing description with blank lines', () => {
    const result = addTag('Existing description', 'contact', 'Alice');
    expect(result).toBe('Existing description\n\n\n{{ contact: Alice }}');
  });

  it('replaces existing tag of same type', () => {
    const desc = 'Some text\n\n\n{{ contact: Old Name }}';
    const result = addTag(desc, 'contact', 'New Name');
    expect(result).toBe('Some text\n\n\n{{ contact: New Name }}');
  });

  it('includes address label when provided', () => {
    const result = addTag('', 'contact', 'Alice', 'C/ Mayor 1, Madrid');
    expect(result).toBe('{{ contact: Alice | C/ Mayor 1, Madrid }}');
  });

  it('does not affect other tag types', () => {
    const desc = 'Text\n\n\n{{ project: My Project }}';
    const result = addTag(desc, 'contact', 'Alice');
    expect(result).toContain('{{ project: My Project }}');
    expect(result).toContain('{{ contact: Alice }}');
  });
});

describe('removeTag', () => {
  it('removes contact tag', () => {
    const desc = 'Some text\n\n\n{{ contact: Alice }}';
    expect(removeTag(desc, 'contact')).toBe('Some text');
  });

  it('removes project tag', () => {
    const desc = 'Text\n\n\n{{ project: Reforma }}';
    expect(removeTag(desc, 'project')).toBe('Text');
  });

  it('returns empty string when only tag exists', () => {
    expect(removeTag('{{ contact: Alice }}', 'contact')).toBe('');
  });

  it('preserves other tag types', () => {
    const desc = '{{ contact: Alice }}\n\n\n{{ project: Reforma }}';
    const result = removeTag(desc, 'contact');
    expect(result).toBe('{{ project: Reforma }}');
  });

  it('handles description with no tags', () => {
    expect(removeTag('Plain text', 'contact')).toBe('Plain text');
  });

  it('removes tag with address label', () => {
    const desc = 'Text\n\n\n{{ contact: Alice | C/ Mayor 1, Madrid }}';
    expect(removeTag(desc, 'contact')).toBe('Text');
  });

  it('removes a tag whose value contains braces', () => {
    expect(removeTag('{{ project: Obra {Fase 2} }}', 'project')).toBe('');
    const desc = 'Nota\n\n\n{{ contact: Empresa {Grupo} S.L. }}';
    expect(removeTag(desc, 'contact')).toBe('Nota');
  });

  it('round-trips add then remove for a braced name', () => {
    const withTag = addTag('Nota previa', 'project', 'Obra {Fase 2}');
    expect(removeTag(withTag, 'project')).toBe('Nota previa');
  });
});
