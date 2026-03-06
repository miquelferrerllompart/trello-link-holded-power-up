const TAG_REGEX: Record<string, RegExp> = {
  contact: /\{\{\s*contact:\s*[^}]*\}\}/g,
  project: /\{\{\s*project:\s*[^}]*\}\}/g,
};

export function addTag(desc: string, type: 'contact' | 'project', name: string): string {
  const cleaned = removeTag(desc, type);
  const tag = `{{ ${type}: ${name} }}`;
  return cleaned ? `${cleaned}\n${tag}` : tag;
}

export function removeTag(desc: string, type: 'contact' | 'project'): string {
  return desc.replace(TAG_REGEX[type], '').replace(/\n{3,}/g, '\n\n').trim();
}
