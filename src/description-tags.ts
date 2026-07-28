import type { CardHoldedData } from './types';

// `[\s\S]*?` (non-greedy, any char incl. newlines and braces) up to the first
// closing `}}`, so tags whose value contains a brace — e.g. "Obra {Fase 2}" —
// are still matched and removed.
const TAG_REGEX: Record<string, RegExp> = {
  contact: /\{\{\s*contact:[\s\S]*?\}\}/g,
  project: /\{\{\s*project:[\s\S]*?\}\}/g,
};

export function addTag(desc: string, type: 'contact' | 'project', name: string, addressLabel?: string): string {
  const cleaned = removeTag(desc, type);
  const value = addressLabel ? `${name} | ${addressLabel}` : name;
  const tag = `{{ ${type}: ${value} }}`;
  return cleaned ? `${cleaned}\n\n\n${tag}` : tag;
}

export function removeTag(desc: string, type: 'contact' | 'project'): string {
  return desc.replace(TAG_REGEX[type], '').replace(/\n{3,}/g, '\n\n').trim();
}

const APP_BASE_URL = 'https://app.electricaferrer.es';
const SECTION_SIGNATURE =
  '## Cliente y proyecto\n\n_Sincronizado automáticamente con Elèctrica Ferrer._';
const ANY_TAG_REGEX = /\{\{\s*(?:contact|project):[\s\S]*?\}\}/g;

function escapeMarkdownLabel(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\[\]*_~`])/g, '\\$1');
}

function stripGeneratedSection(desc: string): string {
  const sectionStart = desc.lastIndexOf(SECTION_SIGNATURE);
  if (sectionStart < 0) return desc;

  const sectionText = desc.slice(sectionStart);
  let sectionEnd = 0;
  for (const match of sectionText.matchAll(ANY_TAG_REGEX)) {
    sectionEnd = (match.index || 0) + match[0].length;
  }
  if (!sectionEnd) return desc;

  const separator = '\n\n---\n\n';
  const prefix = desc.slice(0, sectionStart);
  const removalStart = prefix.endsWith(separator)
    ? sectionStart - separator.length
    : sectionStart;

  return `${desc.slice(0, removalStart)}${desc.slice(sectionStart + sectionEnd)}`;
}

export function syncDescriptionSection(desc: string, data: CardHoldedData): string {
  const withoutSection = stripGeneratedSection(desc);
  const cleaned = removeTag(removeTag(withoutSection, 'contact'), 'project');
  const contactId = data.contactId?.trim();
  const projectId = data.projectId?.trim();
  const contactName = data.contactName?.trim();
  const projectName = data.projectName?.trim();
  const addressMapQuery = data.addressMapQuery?.replace(/\s+/g, ' ').trim();
  const hasContact = Boolean(contactId && contactName);
  const hasProject = Boolean(projectId && projectName);
  if (!hasContact && !hasProject) return cleaned;

  const lines = [
    '## Cliente y proyecto',
    '',
    '_Sincronizado automáticamente con Elèctrica Ferrer._',
  ];

  if (hasContact) {
    lines.push(
      '',
      `**Cliente:** [${escapeMarkdownLabel(contactName!)} ↗](${APP_BASE_URL}/contacto/${encodeURIComponent(contactId!)})`
    );

    if (addressMapQuery) {
      lines.push(
        '',
        `**Dirección:** [${escapeMarkdownLabel(addressMapQuery)} ↗](https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressMapQuery)})`
      );
    }
  }

  if (hasProject) {
    lines.push(
      '',
      `**Proyecto:** [${escapeMarkdownLabel(projectName!)} ↗](${APP_BASE_URL}/proyecto/${encodeURIComponent(projectId!)})`
    );
  }

  if (hasContact && hasProject) {
    const query = `projectId=${encodeURIComponent(projectId!)}&customerId=${encodeURIComponent(contactId!)}`;
    lines.push(
      '',
      '### Acciones rápidas',
      '',
      `- **[🔧 Crear albarán de trabajo ↗](${APP_BASE_URL}/albaran-trabajo/nuevo?${query})**`,
      `- **[⚡ Crear albarán extra ↗](${APP_BASE_URL}/albaran-trabajo-extra/nuevo?${query})**`,
      `- **[📦 Crear pedido de material ↗](${APP_BASE_URL}/pedido/nuevo?${query})**`
    );
  }

  if (hasContact) {
    const value = data.addressLabel
      ? `${contactName} | ${data.addressLabel}`
      : contactName;
    lines.push('', `{{ contact: ${value} }}`);
  }

  if (hasProject) {
    lines.push(`{{ project: ${projectName} }}`);
  }

  const section = lines.join('\n');
  return cleaned ? `${cleaned}\n\n---\n\n${section}` : section;
}
