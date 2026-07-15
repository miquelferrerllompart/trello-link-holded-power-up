import type { HoldedContact, HoldedProject, CreateContactPayload, CreateContactResponse } from './types';
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

export async function searchContacts(query: string): Promise<ContactSearchResult> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  return fetchHolded<ContactSearchResult>(`${PROXY_BASE}/contacts/search?${params}`);
}

/** Full contact detail (shipping/bill addresses, custom fields) from the internal API. */
export async function getContactDetail(id: string): Promise<HoldedContact> {
  return fetchHolded<HoldedContact>(`${PROXY_BASE}/v2/contacts/${encodeURIComponent(id)}`);
}

export interface ProjectSearchResult {
  total: number;
  results: HoldedProject[];
}

export async function searchProjects(query: string): Promise<ProjectSearchResult> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  return fetchHolded<ProjectSearchResult>(`${PROXY_BASE}/projects/search?${params}`);
}

function omitEmpty<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ''),
  ) as T;
}

/** Stable-per-submit key so a network retry of the same write can't duplicate it. */
function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Internal CreateContact payload (camelCase). `defaults` is sent forward-compatibly:
// the internal API will start honouring salesTax/purchasesTax once it adds support.
function toInternalContactPayload(payload: CreateContactPayload): Record<string, unknown> {
  const billAddress = payload.billAddress
    ? omitEmpty({
      address: payload.billAddress.address,
      city: payload.billAddress.city,
      postalCode: payload.billAddress.postalCode,
      province: payload.billAddress.province,
      country: payload.billAddress.country,
      countryCode: payload.billAddress.countryCode,
    })
    : undefined;

  const defaults = payload.defaults
    ? omitEmpty({
      salesTax: payload.defaults.salesTax,
      purchasesTax: payload.defaults.purchasesTax,
    })
    : undefined;

  return omitEmpty({
    name: payload.name,
    code: payload.code,
    vatnumber: payload.vatnumber,
    tradeName: payload.tradeName,
    isperson: payload.isperson,
    email: payload.email,
    phone: payload.phone,
    mobile: payload.mobile,
    type: payload.type,
    billAddress,
    defaults,
  });
}

export async function createContact(payload: CreateContactPayload): Promise<CreateContactResponse> {
  const idempotencyKey = generateIdempotencyKey();
  const response = await fetch(`${PROXY_BASE}/v2/contacts?idempotencyKey=${idempotencyKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toInternalContactPayload(payload)),
  });
  if (!response.ok) {
    const body = await response.text();
    let msg = `Error ${response.status}`;
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

/** Appends a shipping address to an existing contact through the internal API. */
export async function addShippingAddress(contactId: string, newAddr: NewShippingAddress): Promise<void> {
  const idempotencyKey = generateIdempotencyKey();
  const response = await fetch(
    `${PROXY_BASE}/v2/contacts/${encodeURIComponent(contactId)}/shipping-addresses?idempotencyKey=${idempotencyKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newAddr.name,
        address: newAddr.address,
        city: newAddr.city,
        postalCode: newAddr.postalCode,
        province: newAddr.province,
        country: newAddr.country || 'España',
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    let msg = `Error ${response.status}`;
    try { msg = JSON.parse(body).error || msg; } catch {}
    throw new Error(msg);
  }
}
