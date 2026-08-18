import { describe, it, expect } from 'vitest';
import { removeTag, syncDescriptionSection } from './description-tags';

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
});

describe('syncDescriptionSection', () => {
  it('puts the generated section first and links the customer contact details', () => {
    const result = syncDescriptionSection('Revisar medidas antes de empezar.', {
      contactId: 'customer-1',
      contactName: 'Hotel Mar Blau',
      email: 'cliente@example.com',
      phone: '+34 971 123 456',
    });

    expect(result).toBe(
      '## Cliente y proyecto\n\n' +
      '_Sincronizado automáticamente con Eléctrica Ferrer._\n\n' +
      '**Cliente:** [Hotel Mar Blau ↗](https://app.electricaferrer.es/contacto/customer-1)\n\n' +
      '**Teléfono:** [+34 971 123 456 ↗](tel:+34971123456)\n\n' +
      '**Email:** [cliente@example.com ↗](mailto:cliente%40example.com)\n\n' +
      '{{ contact: Hotel Mar Blau }}\n\n' +
      '---\n\n' +
      'Revisar medidas antes de empezar.'
    );
  });

  it('links the complete selected address to Google Maps', () => {
    const result = syncDescriptionSection('', {
      contactId: 'customer-1',
      contactName: 'Cliente Uno',
      addressLabel: 'Obra Norte',
      addressMapQuery: 'C/ Nord 2, 07002 Palma, Illes Balears',
    });

    expect(result).toContain(
      '**Dirección:** [C/ Nord 2, 07002 Palma, Illes Balears ↗](https://www.google.com/maps/search/?api=1&query=C%2F%20Nord%202%2C%2007002%20Palma%2C%20Illes%20Balears)',
    );
    expect(result).toContain('{{ contact: Cliente Uno | Obra Norte }}');
  });

  it('adds readable mobile actions and keeps the searchable tags at the end', () => {
    const result = syncDescriptionSection('Revisar medidas antes de empezar.', {
      contactId: 'customer-1',
      contactName: 'Hotel Mar Blau',
      addressLabel: 'Passeig Marítim 8',
      projectId: 'project-1',
      projectName: 'Renovación del cuadro general',
    });

    expect(result).toBe(
      '## Cliente y proyecto\n\n' +
      '_Sincronizado automáticamente con Eléctrica Ferrer._\n\n' +
      '**Cliente:** [Hotel Mar Blau ↗](https://app.electricaferrer.es/contacto/customer-1)\n\n' +
      '**Proyecto:** [Renovación del cuadro general ↗](https://app.electricaferrer.es/proyecto/project-1)\n\n' +
      '### Acciones rápidas\n\n' +
      '- **[🔧 Crear albarán de trabajo ↗](https://app.electricaferrer.es/albaran-trabajo/nuevo?projectId=project-1&customerId=customer-1)**\n' +
      '- **[⚡ Crear albarán extra ↗](https://app.electricaferrer.es/albaran-trabajo-extra/nuevo?projectId=project-1&customerId=customer-1)**\n' +
      '- **[📦 Crear pedido de material ↗](https://app.electricaferrer.es/pedido/nuevo?projectId=project-1&customerId=customer-1)**\n\n' +
      '{{ contact: Hotel Mar Blau | Passeig Marítim 8 }}\n' +
      '{{ project: Renovación del cuadro general }}\n\n' +
      '---\n\n' +
      'Revisar medidas antes de empezar.'
    );
  });

  it('shows the linked customer without creation actions until a project is linked', () => {
    const result = syncDescriptionSection('', {
      contactId: 'customer-1',
      contactName: 'Hotel Mar Blau',
    });

    expect(result).toContain('**Cliente:** [Hotel Mar Blau ↗]');
    expect(result).toContain('{{ contact: Hotel Mar Blau }}');
    expect(result).not.toContain('**Proyecto:**');
    expect(result).not.toContain('### Acciones rápidas');
    expect(result).not.toContain('/albaran-trabajo/nuevo');
  });

  it('replaces the previous generated suffix and preserves text added after it', () => {
    const previous = syncDescriptionSection('Nota original.', {
      contactId: 'customer-old',
      contactName: 'Cliente anterior',
      projectId: 'project-old',
      projectName: 'Proyecto anterior',
    });

    const result = syncDescriptionSection(`${previous}\n\nNota añadida después.`, {
      contactId: 'customer-new',
      contactName: 'Cliente nuevo',
      projectId: 'project-new',
      projectName: 'Proyecto nuevo',
    });

    expect(result.match(/## Cliente y proyecto/g)).toHaveLength(1);
    expect(result).not.toContain('customer-old');
    expect(result).not.toContain('project-old');
    expect(result).toContain('Nota original.');
    expect(result).toContain('Nota añadida después.');
    expect(result.startsWith('## Cliente y proyecto\n\n')).toBe(true);
    expect(result.endsWith('Nota original.\n\nNota añadida después.')).toBe(true);
  });

  it('preserves user text and tags appended after the generated section', () => {
    const previous = syncDescriptionSection('Nota original.', {
      contactId: 'customer-old',
      contactName: 'Cliente anterior',
      projectId: 'project-old',
      projectName: 'Proyecto anterior',
    });
    const appended = `${previous}\n\nNota de otra automatización.\n\n{{ contact: Referencia externa }}`;

    const result = syncDescriptionSection(appended, {
      contactId: 'customer-new',
      contactName: 'Cliente nuevo',
      projectId: 'project-new',
      projectName: 'Proyecto nuevo',
    });

    expect(result).toContain('Nota de otra automatización.');
    expect(result).toContain('{{ contact: Referencia externa }}');
    expect(result.match(/## Cliente y proyecto/g)).toHaveLength(1);
  });

  it('migrates the deployed misspelled section without duplicating it', () => {
    const legacy =
      'Nota original.\n\n---\n\n' +
      '## Cliente y proyecto\n\n' +
      '_Sincronizado automáticamente con Elèctrica Ferrer._\n\n' +
      '**Cliente:** [Cliente anterior ↗](https://app.electricaferrer.es/contacto/customer-old)\n\n' +
      '{{ contact: Cliente anterior }}';

    const result = syncDescriptionSection(legacy, {
      contactId: 'customer-new',
      contactName: 'Cliente nuevo',
    });

    expect(result.match(/## Cliente y proyecto/g)).toHaveLength(1);
    expect(result).toContain('_Sincronizado automáticamente con Eléctrica Ferrer._');
    expect(result).not.toContain('Elèctrica');
    expect(result).toContain('Nota original.');
  });

  it('escapes CRM names so they cannot break the Markdown action section', () => {
    const result = syncDescriptionSection('', {
      contactId: 'customer/1',
      contactName: 'Cliente [Norte]',
      projectId: 'project 1',
      projectName: 'Obra *principal*',
    });

    expect(result).toContain(
      '**Cliente:** [Cliente \\[Norte\\] ↗](https://app.electricaferrer.es/contacto/customer%2F1)'
    );
    expect(result).toContain(
      '**Proyecto:** [Obra \\*principal\\* ↗](https://app.electricaferrer.es/proyecto/project%201)'
    );
    expect(result).toContain('projectId=project%201&customerId=customer%2F1');
    expect(result).toContain('{{ contact: Cliente [Norte] }}');
    expect(result).toContain('{{ project: Obra *principal* }}');
  });

  it('migrates the existing searchable tags into the generated suffix', () => {
    const result = syncDescriptionSection(
      'Texto del usuario.\n\n\n{{ contact: Cliente anterior }}\n\n\n{{ project: Proyecto anterior }}',
      {
        contactId: 'customer-new',
        contactName: 'Cliente nuevo',
        projectId: 'project-new',
        projectName: 'Proyecto nuevo',
      }
    );

    expect(result.match(/\{\{ contact:/g)).toHaveLength(1);
    expect(result.match(/\{\{ project:/g)).toHaveLength(1);
    expect(result).not.toContain('Cliente anterior');
    expect(result).not.toContain('Proyecto anterior');
    expect(result.startsWith('## Cliente y proyecto\n\n')).toBe(true);
    expect(result.endsWith('Texto del usuario.')).toBe(true);
  });

  it('removes the whole generated suffix when neither entity remains linked', () => {
    const previous = syncDescriptionSection('Primera nota.', {
      contactId: 'customer-1',
      contactName: 'Cliente',
      projectId: 'project-1',
      projectName: 'Proyecto',
    });

    expect(syncDescriptionSection(`${previous}\n\nÚltima nota.`, {}))
      .toBe('Primera nota.\n\nÚltima nota.');
  });

  it('does not create an unmanageable suffix from an incomplete stored entity', () => {
    expect(syncDescriptionSection('Nota intacta.', { contactId: 'customer-without-name' }))
      .toBe('Nota intacta.');
  });
});
