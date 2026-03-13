import type { HoldedContact, HoldedProject, HoldedShippingAddress, CreateContactPayload, CreateContactResponse } from './types';

const PROXY_BASE = 'https://holded-proxy.mferrer.workers.dev';

async function fetchHolded<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    let msg = `Holded API error: ${response.status}`;
    try { msg = JSON.parse(body).error || msg; } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export async function searchContacts(query: string): Promise<HoldedContact[]> {
  const contacts = await fetchHolded<HoldedContact[]>(`${PROXY_BASE}/api/invoicing/v1/contacts`);
  if (!query) return contacts;
  const q = query.toLowerCase();
  return contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.code && c.code.toLowerCase().includes(q)) ||
      (c.tradeName && c.tradeName.toLowerCase().includes(q)) ||
      (c.vatnumber && c.vatnumber.toLowerCase().includes(q))
  );
}

export async function getProjects(): Promise<HoldedProject[]> {
  return fetchHolded<HoldedProject[]>(`${PROXY_BASE}/api/projects/v1/projects`);
}

export async function createContact(payload: CreateContactPayload): Promise<CreateContactResponse> {
  const response = await fetch(`${PROXY_BASE}/api/invoicing/v1/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    let msg = `Holded API error: ${response.status}`;
    try { msg = JSON.parse(body).error || msg; } catch {}
    throw new Error(msg);
  }
  return response.json();
}

export interface NewShippingAddress {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  country?: string;
}

/** Adds a shipping address to an existing contact via PUT */
export async function addShippingAddress(
  contactId: string,
  existing: HoldedShippingAddress[],
  newAddr: NewShippingAddress,
): Promise<void> {
  const shippingAddresses = [
    ...existing.map((a) => ({
      name: a.name,
      address: a.address,
      city: a.city,
      postalCode: a.postalCode,
      province: a.province,
      country: a.country,
    })),
    { ...newAddr, country: newAddr.country || 'España' },
  ];
  const response = await fetch(`${PROXY_BASE}/api/invoicing/v1/contacts/${contactId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shippingAddresses }),
  });
  if (!response.ok) {
    const body = await response.text();
    let msg = `Holded API error: ${response.status}`;
    try { msg = JSON.parse(body).error || msg; } catch {}
    throw new Error(msg);
  }
}
