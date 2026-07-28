import type { CardHoldedData } from './types';
import { buildElectricaferrerEntityUrl } from './document-links';

// `[\s\S]*?` (non-greedy, any char incl. newlines and braces) up to the first
// closing `}}`, so tags whose value contains a brace — e.g. "Obra {Fase 2}" —
// are still matched and removed.
const TAG_REGEX: Record<string, RegExp> = {
  contact: /\{\{\s*contact:[\s\S]*?\}\}/g,
  project: /\{\{\s*project:[\s\S]*?\}\}/g,
};

export function removeTag(desc: string, type: 'contact' | 'project'): string {
  return desc.replace(TAG_REGEX[type], '').replace(/\n{3,}/g, '\n\n').trim();
}

const ACTION_BASE_URL = 'https://app.electricaferrer.es';
const SECTION_SIGNATURES = [
  '## Cliente y proyecto\n\n_Sincronizado automáticamente con Eléctrica Ferrer._',
  '## Cliente y proyecto\n\n_Sincronizado automáticamente con Elèctrica Ferrer._',
];
const ANY_TAG_REGEX = /\{\{\s*(?:contact|project):[\s\S]*?\}\}/g;

function escapeMarkdownLabel(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([\\[\]*_~`])/g, '\\$1');
}

function stripGeneratedSection(desc: string): { description: string; found: boolean } {
  const sectionStart = Math.max(
    ...SECTION_SIGNATURES.map((signature) => desc.lastIndexOf(signature)),
  );
  if (sectionStart < 0) return { description: desc, found: false };

  const sectionText = desc.slice(sectionStart);
  const tagMatches = sectionText.matchAll(ANY_TAG_REGEX);
  const firstTag = tagMatches.next().value;
  if (!firstTag) return { description: desc, found: false };

  const generatedContent = sectionText.slice(0, firstTag.index || 0);
  const expectedTagCount =
    Number(generatedContent.includes('**Cliente:**')) +
    Number(generatedContent.includes('**Proyecto:**'));
  let sectionEnd = (firstTag.index || 0) + firstTag[0].length;

  for (let index = 1; index < expectedTagCount; index += 1) {
    const nextTag = sectionText
      .slice(sectionEnd)
      .match(/^\s*(\{\{\s*(?:contact|project):[\s\S]*?\}\})/);
    if (!nextTag) break;
    sectionEnd += nextTag[0].length;
  }

  const separator = '\n\n---\n\n';
  const prefix = desc.slice(0, sectionStart);
  const removalStart = prefix.endsWith(separator)
    ? sectionStart - separator.length
    : sectionStart;

  return {
    description: `${desc.slice(0, removalStart)}${desc.slice(sectionStart + sectionEnd)}`,
    found: true,
  };
}

export function syncDescriptionSection(desc: string, data: CardHoldedData): string {
  const stripped = stripGeneratedSection(desc);
  const cleaned = stripped.found
    ? stripped.description.replace(/\n{3,}/g, '\n\n').trim()
    : removeTag(removeTag(stripped.description, 'contact'), 'project');
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
    '_Sincronizado automáticamente con Eléctrica Ferrer._',
  ];

  if (hasContact) {
    const contactUrl = buildElectricaferrerEntityUrl('contact', contactId)!;
    lines.push(
      '',
      `**Cliente:** [${escapeMarkdownLabel(contactName!)} ↗](${contactUrl})`
    );

    if (addressMapQuery) {
      lines.push(
        '',
        `**Dirección:** [${escapeMarkdownLabel(addressMapQuery)} ↗](https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressMapQuery)})`
      );
    }
  }

  if (hasProject) {
    const projectUrl = buildElectricaferrerEntityUrl('project', projectId)!;
    lines.push(
      '',
      `**Proyecto:** [${escapeMarkdownLabel(projectName!)} ↗](${projectUrl})`
    );
  }

  if (hasContact && hasProject) {
    const query = `projectId=${encodeURIComponent(projectId!)}&customerId=${encodeURIComponent(contactId!)}`;
    lines.push(
      '',
      '### Acciones rápidas',
      '',
      `- **[🔧 Crear albarán de trabajo ↗](${ACTION_BASE_URL}/albaran-trabajo/nuevo?${query})**`,
      `- **[⚡ Crear albarán extra ↗](${ACTION_BASE_URL}/albaran-trabajo-extra/nuevo?${query})**`,
      `- **[📦 Crear pedido de material ↗](${ACTION_BASE_URL}/pedido/nuevo?${query})**`
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
