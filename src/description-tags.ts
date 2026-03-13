const TAG_REGEX: Record<string, RegExp> = {
  contact: /\{\{\s*contact:\s*[^}]*\}\}/g,
  project: /\{\{\s*project:\s*[^}]*\}\}/g,
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
