import type { HoldedContact, HoldedProject } from './types';

const BASE_URL = 'https://api.holded.com/api/invoicing/v1';

async function fetchHolded<T>(apiKey: string, path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { key: apiKey },
  });
  if (!response.ok) {
    throw new Error(`Holded API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function searchContacts(apiKey: string, query: string): Promise<HoldedContact[]> {
  const contacts = await fetchHolded<HoldedContact[]>(apiKey, '/contacts');
  if (!query) return contacts;
  const q = query.toLowerCase();
  return contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.vatnumber && c.vatnumber.toLowerCase().includes(q))
  );
}

export async function getProjects(apiKey: string): Promise<HoldedProject[]> {
  return fetchHolded<HoldedProject[]>(apiKey, '/projects');
}
