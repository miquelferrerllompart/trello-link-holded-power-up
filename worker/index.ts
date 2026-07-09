import {
  fetchAllPages,
  normalizeV2Contact,
  searchContactsV2,
  searchHoldedDocumentsV2,
  searchSalesOrdersV2,
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
  const contacts = await fetchAllPages<Record<string, unknown>>(`${HOLDED_BASE}/api/v2/contacts`, apiKey);
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

async function handleDocumentsSearch(url: URL, env: Env): Promise<Response> {
  const contactId = url.searchParams.get('contactId');
  const projectId = url.searchParams.get('projectId');

  try {
    const results = await searchHoldedDocumentsV2(getV2ApiKey(env), fetch, { contactId, projectId });
    return jsonResponse({
      totals: {
        salesOrders: results.salesOrders.length,
        purchaseOrders: results.purchaseOrders.length,
        waybills: results.waybills.length,
        estimates: results.estimates.length,
      },
      otherTotals: {
        salesOrders: results.other?.salesOrders.length || 0,
        purchaseOrders: results.other?.purchaseOrders.length || 0,
        waybills: results.other?.waybills.length || 0,
        estimates: results.other?.estimates.length || 0,
      },
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
