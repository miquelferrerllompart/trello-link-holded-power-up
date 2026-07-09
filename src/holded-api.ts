import type { HoldedContact, HoldedProject, HoldedSalesOrder, PendingShippingAddress, CreateContactPayload, CreateContactResponse } from './types';
import { HOLDED_PROXY_URL } from './config';

const PROXY_BASE = HOLDED_PROXY_URL;

async function fetchHolded<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    let msg = `Holded API error: ${response.status}`;
    try { msg = JSON.parse(body).error || msg; } catch {}
    throw new Error(msg);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Respuesta inesperada del servidor (${response.status})`);
  }
}

export interface ContactSearchResult {
  total: number;
  results: HoldedContact[];
}

export async function searchContacts(query: string, force = false): Promise<ContactSearchResult> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (force) params.set('force', '1');
  return fetchHolded<ContactSearchResult>(`${PROXY_BASE}/contacts/search?${params}`);
}

export async function refreshContacts(): Promise<{ total: number }> {
  const response = await fetch(`${PROXY_BASE}/contacts/refresh`, { method: 'POST' });
  const body = await response.text();
  if (!response.ok) {
    let msg = `Holded API error: ${response.status}`;
    try { msg = JSON.parse(body).error || msg; } catch {}
    throw new Error(msg);
  }
  return JSON.parse(body);
}

export interface ProjectSearchResult {
  total: number;
  results: HoldedProject[];
}

export async function searchProjects(query: string, force = false): Promise<ProjectSearchResult> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (force) params.set('force', '1');
  return fetchHolded<ProjectSearchResult>(`${PROXY_BASE}/projects/search?${params}`);
}

export async function refreshProjects(): Promise<{ total: number }> {
  const response = await fetch(`${PROXY_BASE}/projects/refresh`, { method: 'POST' });
  const body = await response.text();
  if (!response.ok) {
    let msg = `Holded API error: ${response.status}`;
    try { msg = JSON.parse(body).error || msg; } catch {}
    throw new Error(msg);
  }
  return JSON.parse(body);
}

export interface SalesOrderSearchResult {
  total: number;
  results: HoldedSalesOrder[];
}

export async function searchSalesOrders(contactId: string, projectId?: string): Promise<SalesOrderSearchResult> {
  const params = new URLSearchParams({ contactId });
  if (projectId) params.set('projectId', projectId);
  return fetchHolded<SalesOrderSearchResult>(`${PROXY_BASE}/sales-orders/search?${params}`);
}

function omitEmpty<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ''),
  ) as T;
}

function toV2ContactPayload(payload: CreateContactPayload): Record<string, unknown> {
  const billAddress = payload.billAddress
    ? omitEmpty({
      address: payload.billAddress.address,
      city: payload.billAddress.city,
      postal_code: payload.billAddress.postalCode,
      province: payload.billAddress.province,
      country: payload.billAddress.country,
      country_code: payload.billAddress.countryCode,
    })
    : undefined;

  const defaults = payload.defaults
    ? omitEmpty({
      sales_tax: payload.defaults.salesTax,
      purchases_tax: payload.defaults.purchasesTax,
    })
    : undefined;

  return omitEmpty({
    name: payload.name,
    code: payload.code,
    vat_number: payload.vatnumber,
    trade_name: payload.tradeName,
    is_person: payload.isperson === 1,
    email: payload.email,
    phone: payload.phone,
    mobile: payload.mobile,
    type: payload.type,
    bill_address: billAddress,
    defaults,
  });
}

export async function createContact(payload: CreateContactPayload): Promise<CreateContactResponse> {
  const response = await fetch(`${PROXY_BASE}/api/v2/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toV2ContactPayload(payload)),
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
  existing: PendingShippingAddress[],
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
