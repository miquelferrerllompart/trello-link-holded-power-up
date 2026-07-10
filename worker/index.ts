import {
  attachShippedItemsTracking,
  fetchAllPages,
  normalizeV2Document,
  normalizeV2Contact,
  searchContactsV2,
  searchHoldedDocumentsV2,
  searchSalesOrdersV2,
  splitDocumentsForProject,
} from './holded-v2';
import type {
  HoldedDocumentType,
  HoldedV2Contact,
  HoldedV2Document,
  NormalizedHoldedDocument,
} from './holded-v2';

interface Env {
  HOLDED_API_KEY?: string;
  HOLDED_API_V2?: string;
  CACHE: KVNamespace;
}

const HOLDED_BASE = 'https://api.holded.com';
const CONTACTS_CACHE_KEY = 'holded_contacts';
const PROJECTS_CACHE_KEY = 'holded_projects';
const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
const DOCUMENTS_CACHE_TTL_SECONDS = 5 * 60;
const DOCUMENTS_PAGE_SIZE = 10;
const DOCUMENT_TYPES: HoldedDocumentType[] = ['sales-orders', 'waybills', 'estimates'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function getV2ApiKey(env: Env): string {
  return env.HOLDED_API_V2 || env.HOLDED_API_KEY || '';
}

function getV1ApiKey(env: Env): string {
  return env.HOLDED_API_KEY || '';
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Normalize text for accent-insensitive matching */
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const normalizedText = normalize(text);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return words.every((w) => normalizedText.includes(w));
}

interface ContactRecord {
  id: string;
  name: string;
  code: string | null;
  vatnumber: string;
  tradeName: string | null;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  type: string;
  isperson: number;
  billAddress: unknown;
  shippingAddresses: unknown[];
}

async function fetchAllContactsFromHolded(apiKey: string): Promise<ContactRecord[]> {
  const contacts = await fetchAllPages<HoldedV2Contact>(`${HOLDED_BASE}/api/v2/contacts`, apiKey);
  return contacts.map((contact) => normalizeV2Contact(contact) as unknown as ContactRecord);
}

async function getContacts(env: Env, force: boolean): Promise<ContactRecord[]> {
  if (!force) {
    const cached = await env.CACHE.get(CONTACTS_CACHE_KEY, 'json');
    if (cached) return cached as ContactRecord[];
  }

  const contacts = await fetchAllContactsFromHolded(getV2ApiKey(env));

  // Store only the fields we need for search + selection
  const slim = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    vatnumber: c.vatnumber,
    tradeName: c.tradeName,
    email: c.email,
    mobile: c.mobile,
    phone: c.phone,
    type: c.type,
    isperson: c.isperson,
    billAddress: c.billAddress,
    shippingAddresses: c.shippingAddresses,
  }));

  await env.CACHE.put(CONTACTS_CACHE_KEY, JSON.stringify(slim), {
    expirationTtl: CACHE_TTL_SECONDS,
  });

  return slim;
}

async function handleContactsSearch(url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get('q') || '';

  try {
    const results = await searchContactsV2(query, getV2ApiKey(env));
    return jsonResponse({ total: results.length, results });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 502);
  }
}

// ── Projects ──

interface ProjectRecord {
  id: string;
  name: string;
  status?: string;
  archived?: number | null;
}

async function fetchAllProjectsFromHolded(apiKey: string): Promise<ProjectRecord[]> {
  return fetchAllPages<ProjectRecord>(`${HOLDED_BASE}/api/v2/projects`, apiKey);
}

async function getProjects(env: Env, force: boolean): Promise<ProjectRecord[]> {
  if (!force) {
    const cached = await env.CACHE.get(PROJECTS_CACHE_KEY, 'json');
    if (cached) return cached as ProjectRecord[];
  }

  const projects = await fetchAllProjectsFromHolded(getV2ApiKey(env));

  const slim = projects
    .filter((p) => !p.archived)
    .map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
    }));

  await env.CACHE.put(PROJECTS_CACHE_KEY, JSON.stringify(slim), {
    expirationTtl: CACHE_TTL_SECONDS,
  });

  return slim;
}

function searchProjects(projects: ProjectRecord[], query: string): ProjectRecord[] {
  if (!query) return [];
  return projects.filter((p) => {
    const text = [p.name, p.status].filter(Boolean).join(' ');
    return fuzzyMatch(text, query);
  });
}

async function handleProjectsSearch(url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get('q') || '';
  const force = url.searchParams.get('force') === '1';

  try {
    const projects = await getProjects(env, force);
    const results = searchProjects(projects, query);
    return jsonResponse({ total: projects.length, results });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 502);
  }
}

async function handleProjectsRefresh(env: Env): Promise<Response> {
  try {
    const projects = await getProjects(env, true);
    return jsonResponse({ total: projects.length });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 502);
  }
}

async function handleContactsRefresh(env: Env): Promise<Response> {
  try {
    const contacts = await getContacts(env, true);
    return jsonResponse({ total: contacts.length });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 502);
  }
}

async function handleSalesOrdersSearch(url: URL, env: Env): Promise<Response> {
  const contactId = url.searchParams.get('contactId');
  const projectId = url.searchParams.get('projectId');

  try {
    const results = await searchSalesOrdersV2(getV2ApiKey(env), fetch, { contactId, projectId });
    return jsonResponse({ total: results.length, results });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 502);
  }
}

function parsePositiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function getDocumentSortTime(document: NormalizedHoldedDocument): number {
  const value = document.updatedAt || document.date;
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortDocumentsNewestFirst(documents: NormalizedHoldedDocument[]): NormalizedHoldedDocument[] {
  return documents.sort((left, right) => (
    getDocumentSortTime(right) - getDocumentSortTime(left) ||
    (right.documentNumber || '').localeCompare(left.documentNumber || '', 'es', { numeric: true }) ||
    right.id.localeCompare(left.id)
  ));
}

async function getCustomerDocumentsByType(
  env: Env,
  contactId: string,
  type: HoldedDocumentType,
): Promise<NormalizedHoldedDocument[]> {
  const cacheKey = `holded_documents:v1:${type}:${contactId}`;
  const cached = await env.CACHE.get<NormalizedHoldedDocument[]>(cacheKey, 'json');
  if (Array.isArray(cached)) return cached;

  const rawDocuments = await fetchAllPages<HoldedV2Document>(
    `${HOLDED_BASE}/api/v2/${type}`,
    getV2ApiKey(env),
    fetch,
    { contact_id: contactId },
  );
  const documents = sortDocumentsNewestFirst(
    rawDocuments.map((document) => normalizeV2Document(type, document)),
  );

  try {
    await env.CACHE.put(cacheKey, JSON.stringify(documents), {
      expirationTtl: DOCUMENTS_CACHE_TTL_SECONDS,
    });
  } catch (err) {
    // A cache outage should make this request slower, not make documents unavailable.
    console.warn('Holded documents cache write failed', err);
  }

  return documents;
}

async function handleDocumentsSearch(url: URL, env: Env): Promise<Response> {
  const contactId = url.searchParams.get('contactId');
  const projectId = url.searchParams.get('projectId');
  const type = url.searchParams.get('type') as HoldedDocumentType | null;
  const scope = url.searchParams.get('scope') || 'matched';

  if (!contactId) return jsonResponse({ error: 'contactId is required' }, 400);

  // Keep the grouped response during the Worker/Pages rollout. The paginated
  // card-back always sends `type`, so only older deployed clients use this.
  if (!type) {
    try {
      const grouped = await searchHoldedDocumentsV2(getV2ApiKey(env), fetch, { contactId, projectId });
      return jsonResponse({
        totals: {
          salesOrders: grouped.salesOrders.length,
          purchaseOrders: grouped.purchaseOrders.length,
          waybills: grouped.waybills.length,
          estimates: grouped.estimates.length,
        },
        otherTotals: {
          salesOrders: grouped.other?.salesOrders.length || 0,
          purchaseOrders: grouped.other?.purchaseOrders.length || 0,
          waybills: grouped.other?.waybills.length || 0,
          estimates: grouped.other?.estimates.length || 0,
        },
        results: grouped,
      });
    } catch (err) {
      return jsonResponse({ error: (err as Error).message }, 502);
    }
  }

  if (!DOCUMENT_TYPES.includes(type)) {
    return jsonResponse({ error: 'type must be sales-orders, waybills, or estimates' }, 400);
  }
  if (scope !== 'matched' && scope !== 'other') {
    return jsonResponse({ error: 'scope must be matched or other' }, 400);
  }

  const requestedPage = parsePositiveInteger(url.searchParams.get('page'), 1, 10_000);
  const pageSize = parsePositiveInteger(url.searchParams.get('pageSize'), DOCUMENTS_PAGE_SIZE, DOCUMENTS_PAGE_SIZE);

  try {
    const documents = await getCustomerDocumentsByType(env, contactId, type);
    const split = splitDocumentsForProject(documents, projectId);
    const selected = scope === 'other' ? split.other : split.matched;
    const total = selected.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const start = (page - 1) * pageSize;
    let results = selected.slice(start, start + pageSize);

    // Shipment status is an extra Holded call per sales order. Enrich only the
    // ten rows that are visible instead of every order owned by the customer.
    if (type === 'sales-orders') {
      results = await attachShippedItemsTracking(results, getV2ApiKey(env), fetch);
    }

    return jsonResponse({
      type,
      scope,
      page,
      pageSize,
      total,
      totalPages,
      otherTotal: split.other.length,
      results,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!getV2ApiKey(env) && !getV1ApiKey(env)) {
      return jsonResponse({ error: 'Holded API secret not configured in worker' }, 500);
    }

    const url = new URL(request.url);

    // Custom endpoints
    if (request.method === 'GET' && url.pathname === '/contacts/search') {
      return handleContactsSearch(url, env);
    }
    if (request.method === 'POST' && url.pathname === '/contacts/refresh') {
      return handleContactsRefresh(env);
    }
    if (request.method === 'GET' && url.pathname === '/projects/search') {
      return handleProjectsSearch(url, env);
    }
    if (request.method === 'POST' && url.pathname === '/projects/refresh') {
      return handleProjectsRefresh(env);
    }
    if (request.method === 'GET' && url.pathname === '/sales-orders/search') {
      return handleSalesOrdersSearch(url, env);
    }
    if (request.method === 'GET' && url.pathname === '/documents/search') {
      return handleDocumentsSearch(url, env);
    }

    // Proxy pass-through for other Holded API calls (create contact, etc.)
    const method = request.method;
    if (method !== 'GET' && method !== 'POST' && method !== 'PUT') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const path = url.pathname + url.search;

    const isV1Path = url.pathname.startsWith('/api/invoicing/v1/');
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (isV1Path) {
      const apiKey = getV1ApiKey(env);
      if (!apiKey) return jsonResponse({ error: 'HOLDED_API_KEY secret not configured for V1 Holded calls' }, 500);
      headers.key = apiKey;
    } else {
      const apiKey = getV2ApiKey(env);
      if (!apiKey) return jsonResponse({ error: 'HOLDED_API_V2 secret not configured for V2 Holded calls' }, 500);
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method === 'POST' || method === 'PUT') {
      (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
      fetchOptions.body = await request.text();
    }

    const response = await fetch(`${HOLDED_BASE}${path}`, fetchOptions);

    const body = await response.text();
    const contentType = response.headers.get('Content-Type') || '';

    if (contentType.includes('text/html')) {
      return jsonResponse({ error: 'Invalid API key or unauthorized' }, 401);
    }

    if (response.status !== 200) {
      try {
        JSON.parse(body);
      } catch {
        return jsonResponse({ error: `Unexpected Holded API response (${response.status})` }, 502);
      }
    }

    return new Response(body, {
      status: response.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': contentType || 'application/json',
      },
    });
  },
};
