const HOLDED_BASE = 'https://api.holded.com';
const HOLDED_APP_BASE = 'https://app.holded.com';
const V2_LIMIT = '100';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface V2Page<T> {
  items: T[];
  cursor?: string | null;
  has_more?: boolean;
}

export interface HoldedV2Contact {
  id: string;
  custom_id?: string | null;
  name?: string | null;
  code?: string | null;
  vat_number?: string | null;
  trade_name?: string | null;
  is_person?: boolean | number | null;
  email?: string | null;
  mobile?: string | null;
  phone?: string | null;
  type?: string | null;
  bill_address?: unknown;
  shipping_addresses?: unknown[];
  custom_fields?: unknown[];
  [key: string]: unknown;
}

export type HoldedDocumentType = 'sales-orders' | 'purchase-orders' | 'waybills' | 'estimates';

export interface HoldedV2Document {
  id: string;
  document_number?: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  description?: string | null;
  date?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  due_date?: string | null;
  subtotal?: string | null;
  discount?: string | null;
  total?: string | null;
  tax?: string | null;
  currency?: string | null;
  status?: string | null;
  tags?: string[];
  lines?: Array<{ project_id?: string | null; [key: string]: unknown }>;
  project_id?: string | null;
  [key: string]: unknown;
}

export type HoldedV2SalesOrder = HoldedV2Document;

export interface ShippedItemsTracking {
  count: number;
  fields: string[];
  items: unknown[];
  error?: string;
}

export interface NormalizedHoldedDocument {
  type: HoldedDocumentType;
  id: string;
  documentNumber: string | null;
  contactId: string | null;
  contactName: string | null;
  description: string | null;
  date: string | null;
  updatedAt: string | null;
  dueDate: string | null;
  subtotal: string | null;
  discount: string | null;
  total: string | null;
  tax: string | null;
  currency: string | null;
  status: string | null;
  tags: string[];
  lines: Array<{ projectId: string | null; [key: string]: unknown }>;
  projectId: string | null;
  url: string;
  shippedItems?: ShippedItemsTracking;
}

export type NormalizedSalesOrder = NormalizedHoldedDocument;

export interface HoldedDocumentsSearchResult {
  salesOrders: NormalizedHoldedDocument[];
  purchaseOrders: NormalizedHoldedDocument[];
  waybills: NormalizedHoldedDocument[];
  estimates: NormalizedHoldedDocument[];
  other?: {
    salesOrders: NormalizedHoldedDocument[];
    purchaseOrders: NormalizedHoldedDocument[];
    waybills: NormalizedHoldedDocument[];
    estimates: NormalizedHoldedDocument[];
  };
}

export function buildHoldedV2Headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
}

function appendQuery(url: URL, query?: Record<string, string | null | undefined>): void {
  url.searchParams.set('limit', V2_LIMIT);
  if (!query) return;

  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.text();

  if (!response.ok) {
    let detail = `Holded API error: ${response.status}`;
    try {
      const parsed = JSON.parse(body) as { detail?: string; title?: string; error?: string };
      detail = parsed.detail || parsed.error || parsed.title || detail;
    } catch {
      // Keep the HTTP-status based message.
    }
    throw new Error(detail);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Unexpected Holded API response (${response.status})`);
  }
}

export async function fetchAllPages<T>(
  endpoint: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  query?: Record<string, string | null | undefined>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(endpoint);
    appendQuery(url, query);
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetchImpl(url.toString(), {
      headers: buildHoldedV2Headers(apiKey),
    });
    const page = await parseJsonResponse<V2Page<T>>(response);

    items.push(...(page.items || []));
    cursor = page.cursor || null;
  } while (cursor);

  return items;
}

function camelizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      camelizeValue(nestedValue),
    ]),
  );
}

export function normalizeV2Contact(contact: HoldedV2Contact): Record<string, unknown> {
  const normalized = camelizeValue(contact) as Record<string, unknown>;
  normalized.customId = contact.custom_id ?? null;
  normalized.vatnumber = contact.vat_number ?? '';
  normalized.tradeName = contact.trade_name ?? null;
  normalized.isperson = contact.is_person ? 1 : 0;
  normalized.billAddress = camelizeValue(contact.bill_address || {}) as Record<string, unknown>;
  normalized.shippingAddresses = camelizeValue(contact.shipping_addresses || []) as unknown[];
  normalized.customFields = camelizeValue(contact.custom_fields || []) as unknown[];
  return normalized;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function compactSearchToken(value: string): string {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
}

function stripNonDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const normalizedText = normalizeSearchText(text);
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  return words.every((word) => normalizedText.includes(word));
}

function fieldValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function scoreContactRelevance(contact: HoldedV2Contact, query: string): number {
  const term = normalizeSearchText(query);
  const compactTerm = compactSearchToken(query);
  const digitsTerm = stripNonDigits(query);

  const name = fieldValue(contact.name);
  const tradeName = fieldValue(contact.trade_name);
  const code = fieldValue(contact.code);
  const vatNumber = fieldValue(contact.vat_number);
  const email = fieldValue(contact.email);
  const phone = fieldValue(contact.phone);
  const mobile = fieldValue(contact.mobile);

  const normalizedName = normalizeSearchText(name);
  const normalizedTradeName = normalizeSearchText(tradeName);
  const normalizedEmail = normalizeSearchText(email);
  const compactCode = compactSearchToken(code);
  const compactVatNumber = compactSearchToken(vatNumber);
  const phoneDigits = stripNonDigits(phone);
  const mobileDigits = stripNonDigits(mobile);

  if (compactTerm && (compactCode === compactTerm || compactVatNumber === compactTerm)) return 1000;
  if (term && normalizedEmail === term) return 950;
  if (digitsTerm && (phoneDigits === digitsTerm || mobileDigits === digitsTerm)) return 925;
  if (term && (normalizedName === term || normalizedTradeName === term)) return 900;

  if (compactTerm && (compactCode.startsWith(compactTerm) || compactVatNumber.startsWith(compactTerm))) return 850;
  if (term && normalizedEmail.startsWith(term)) return 825;
  if (term && (normalizedName.startsWith(term) || normalizedTradeName.startsWith(term))) return 800;

  if (compactTerm && (compactCode.includes(compactTerm) || compactVatNumber.includes(compactTerm))) return 760;
  if (term && normalizedEmail.includes(term)) return 740;
  if (digitsTerm && (phoneDigits.includes(digitsTerm) || mobileDigits.includes(digitsTerm))) return 730;

  const words = term.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.every((word) => (
    normalizedName.split(/\s+/).some((part) => part.startsWith(word)) ||
    normalizedTradeName.split(/\s+/).some((part) => part.startsWith(word))
  ))) {
    return 700;
  }

  const searchableText = [
    name,
    email,
    code,
    tradeName,
    vatNumber,
    phone,
    mobile,
    phoneDigits,
    mobileDigits,
  ].filter(Boolean).join(' ');

  return fuzzyMatch(searchableText, query) ? 650 : 0;
}

function sortAndMergeContactsByRelevance(pages: HoldedV2Contact[][], query: string): HoldedV2Contact[] {
  const byId = new Map<string, {
    contact: HoldedV2Contact;
    firstIndex: number;
    sourceIndex: number;
    score: number;
  }>();
  let firstIndex = 0;

  pages.forEach((page, sourceIndex) => {
    page.forEach((contact) => {
      if (!contact.id) return;
      const score = scoreContactRelevance(contact, query);
      const existing = byId.get(contact.id);

      if (!existing) {
        byId.set(contact.id, {
          contact,
          firstIndex,
          sourceIndex,
          score,
        });
      } else {
        existing.score = Math.max(existing.score, score);
        existing.sourceIndex = Math.min(existing.sourceIndex, sourceIndex);
      }

      firstIndex += 1;
    });
  });

  return [...byId.values()]
    .sort((left, right) => (
      right.score - left.score ||
      left.sourceIndex - right.sourceIndex ||
      left.firstIndex - right.firstIndex
    ))
    .map((entry) => entry.contact);
}

export async function searchContactsV2(
  query: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<Array<Record<string, unknown>>> {
  const term = query.trim();
  if (!term) return [];

  const requests = [
    fetchAllPages<HoldedV2Contact>(`${HOLDED_BASE}/api/v2/contacts/search`, apiKey, fetchImpl, { name: term }),
    fetchAllPages<HoldedV2Contact>(`${HOLDED_BASE}/api/v2/contacts`, apiKey, fetchImpl, { code: term }),
    fetchAllPages<HoldedV2Contact>(`${HOLDED_BASE}/api/v2/contacts`, apiKey, fetchImpl, { email: term }),
    fetchAllPages<HoldedV2Contact>(`${HOLDED_BASE}/api/v2/contacts`, apiKey, fetchImpl, { phone: term }),
    fetchAllPages<HoldedV2Contact>(`${HOLDED_BASE}/api/v2/contacts`, apiKey, fetchImpl, { mobile: term }),
  ];

  const pages = await Promise.all(requests);
  return sortAndMergeContactsByRelevance(pages, term).map(normalizeV2Contact);
}

export function buildSalesOrderUrl(id: string): string {
  return `${HOLDED_APP_BASE}/sales/orders#open:salesorder-${id}`;
}

export function buildDocumentUrl(type: HoldedDocumentType, id: string): string {
  if (type === 'sales-orders') return buildSalesOrderUrl(id);
  if (type === 'purchase-orders') return `${HOLDED_APP_BASE}/inventory/purchase-orders#open:purchaseorder-${id}`;
  if (type === 'estimates') return `${HOLDED_APP_BASE}/sales/estimates#open:estimate-${id}`;
  return `${HOLDED_APP_BASE}/sales/waybills#open:waybill-${id}`;
}

export function normalizeV2Document(type: HoldedDocumentType, order: HoldedV2Document): NormalizedHoldedDocument {
  return {
    type,
    id: order.id,
    documentNumber: order.document_number ?? null,
    contactId: order.contact_id ?? null,
    contactName: order.contact_name ?? null,
    description: order.description ?? null,
    date: order.date ?? null,
    updatedAt: order.updated_at ?? order.updatedAt ?? null,
    dueDate: order.due_date ?? null,
    subtotal: order.subtotal ?? null,
    discount: order.discount ?? null,
    total: order.total ?? null,
    tax: order.tax ?? null,
    currency: order.currency ?? null,
    status: order.status ?? null,
    tags: order.tags || [],
    lines: (order.lines || []).map((line) => ({
      ...line,
      projectId: line.project_id ?? null,
    })),
    projectId: order.project_id ?? null,
    url: buildDocumentUrl(type, order.id),
  };
}

export function normalizeV2SalesOrder(order: HoldedV2SalesOrder): NormalizedSalesOrder {
  return normalizeV2Document('sales-orders', order);
}

function collectObjectFields(items: unknown[]): string[] {
  const fields = new Set<string>();

  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    for (const key of Object.keys(item)) fields.add(key);
  }

  return [...fields].sort();
}

export async function fetchSalesOrderShippedItems(
  salesOrderId: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<ShippedItemsTracking> {
  const response = await fetchImpl(`${HOLDED_BASE}/api/v2/sales-orders/${salesOrderId}/shipped-items`, {
    headers: buildHoldedV2Headers(apiKey),
  });
  const result = await parseJsonResponse<{ items?: unknown[] }>(response);
  const items = Array.isArray(result.items) ? result.items : [];

  return {
    count: items.length,
    fields: collectObjectFields(items),
    items,
  };
}

export async function attachShippedItemsTracking(
  orders: NormalizedHoldedDocument[],
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<NormalizedHoldedDocument[]> {
  return Promise.all(orders.map(async (order) => {
    try {
      return {
        ...order,
        shippedItems: await fetchSalesOrderShippedItems(order.id, apiKey, fetchImpl),
      };
    } catch (err) {
      return {
        ...order,
        shippedItems: {
          count: 0,
          fields: [],
          items: [],
          error: (err as Error).message,
        },
      };
    }
  }));
}

export function filterSalesOrdersForProject(
  orders: NormalizedHoldedDocument[],
  projectId?: string | null,
): NormalizedHoldedDocument[] {
  if (!projectId) return orders;

  return orders.filter((order) => (
    order.projectId === projectId ||
    order.lines.some((line) => line.projectId === projectId)
  ));
}

export function splitDocumentsForProject(
  documents: NormalizedHoldedDocument[],
  projectId?: string | null,
): { matched: NormalizedHoldedDocument[]; other: NormalizedHoldedDocument[] } {
  if (!projectId) return { matched: documents, other: [] };

  const matched: NormalizedHoldedDocument[] = [];
  const other: NormalizedHoldedDocument[] = [];

  for (const document of documents) {
    const isMatch = document.projectId === projectId ||
      document.lines.some((line) => line.projectId === projectId);
    if (isMatch) matched.push(document);
    else other.push(document);
  }

  return { matched, other };
}

export async function searchDocumentsByTypeV2(
  type: HoldedDocumentType,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  params: { contactId?: string | null; projectId?: string | null } = {},
): Promise<NormalizedHoldedDocument[]> {
  if (!params.contactId) return [];

  const documents = await fetchAllPages<HoldedV2Document>(
    `${HOLDED_BASE}/api/v2/${type}`,
    apiKey,
    fetchImpl,
    { contact_id: params.contactId },
  );

  const filtered = filterSalesOrdersForProject(documents.map((document) => normalizeV2Document(type, document)), params.projectId);

  if (type === 'sales-orders') {
    return attachShippedItemsTracking(filtered, apiKey, fetchImpl);
  }

  return filtered;
}

export async function searchDocumentsByTypeWithOtherV2(
  type: HoldedDocumentType,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  params: { contactId?: string | null; projectId?: string | null } = {},
): Promise<{ matched: NormalizedHoldedDocument[]; other: NormalizedHoldedDocument[] }> {
  if (!params.contactId) return { matched: [], other: [] };

  const documents = await fetchAllPages<HoldedV2Document>(
    `${HOLDED_BASE}/api/v2/${type}`,
    apiKey,
    fetchImpl,
    { contact_id: params.contactId },
  );

  let normalized = documents.map((document) => normalizeV2Document(type, document));

  if (type === 'sales-orders') {
    normalized = await attachShippedItemsTracking(normalized, apiKey, fetchImpl);
  }

  return splitDocumentsForProject(normalized, params.projectId);
}

export async function searchSalesOrdersV2(
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  params: { contactId?: string | null; projectId?: string | null } = {},
): Promise<NormalizedSalesOrder[]> {
  return searchDocumentsByTypeV2('sales-orders', apiKey, fetchImpl, params);
}

export async function searchHoldedDocumentsV2(
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  params: { contactId?: string | null; projectId?: string | null } = {},
): Promise<HoldedDocumentsSearchResult> {
  const [salesOrders, purchaseOrders, waybills, estimates] = await Promise.all([
    searchDocumentsByTypeWithOtherV2('sales-orders', apiKey, fetchImpl, params),
    searchDocumentsByTypeWithOtherV2('purchase-orders', apiKey, fetchImpl, params),
    searchDocumentsByTypeWithOtherV2('waybills', apiKey, fetchImpl, params),
    searchDocumentsByTypeWithOtherV2('estimates', apiKey, fetchImpl, params),
  ]);

  return {
    salesOrders: salesOrders.matched,
    purchaseOrders: purchaseOrders.matched,
    waybills: waybills.matched,
    estimates: estimates.matched,
    other: {
      salesOrders: salesOrders.other,
      purchaseOrders: purchaseOrders.other,
      waybills: waybills.other,
      estimates: estimates.other,
    },
  };
}
