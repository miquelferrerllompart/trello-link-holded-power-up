interface Env {
  HOLDED_API_KEY: string;
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

const PAGE_SIZE = 500;

async function fetchAllContactsFromHolded(apiKey: string): Promise<ContactRecord[]> {
  const all: ContactRecord[] = [];
  for (let page = 1; ; page++) {
    const response = await fetch(
      `${HOLDED_BASE}/api/invoicing/v1/contacts?page=${page}`,
      { headers: { key: apiKey, Accept: 'application/json' } },
    );
    if (!response.ok) {
      throw new Error(`Holded API error: ${response.status}`);
    }
    const body = await response.text();
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('Invalid API key or unauthorized');
    }
    let batch: ContactRecord[];
    try {
      batch = JSON.parse(body);
    } catch {
      throw new Error(`Unexpected Holded API response (${response.status})`);
    }
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return all;
}

async function getContacts(env: Env, force: boolean): Promise<ContactRecord[]> {
  if (!force) {
    const cached = await env.CACHE.get(CONTACTS_CACHE_KEY, 'json');
    if (cached) return cached as ContactRecord[];
  }

  const contacts = await fetchAllContactsFromHolded(env.HOLDED_API_KEY);

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

function stripNonDigits(v: string | null | undefined): string {
  return v ? v.replace(/\D/g, '') : '';
}

function searchContacts(contacts: ContactRecord[], query: string): ContactRecord[] {
  if (!query) return [];
  return contacts.filter((c) => {
    const text = [c.name, c.email, c.code, c.tradeName, c.vatnumber, c.phone, c.mobile,
      stripNonDigits(c.phone), stripNonDigits(c.mobile)].filter(Boolean).join(' ');
    return fuzzyMatch(text, query);
  });
}

async function handleContactsSearch(url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get('q') || '';
  const force = url.searchParams.get('force') === '1';

  try {
    const contacts = await getContacts(env, force);
    const results = searchContacts(contacts, query);
    return jsonResponse({ total: contacts.length, results });
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
  const response = await fetch(
    `${HOLDED_BASE}/api/projects/v1/projects`,
    { headers: { key: apiKey, Accept: 'application/json' } },
  );
  if (!response.ok) {
    throw new Error(`Holded API error: ${response.status}`);
  }
  const body = await response.text();
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('Invalid API key or unauthorized');
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Unexpected Holded API response (${response.status})`);
  }
}

async function getProjects(env: Env, force: boolean): Promise<ProjectRecord[]> {
  if (!force) {
    const cached = await env.CACHE.get(PROJECTS_CACHE_KEY, 'json');
    if (cached) return cached as ProjectRecord[];
  }

  const projects = await fetchAllProjectsFromHolded(env.HOLDED_API_KEY);

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!env.HOLDED_API_KEY) {
      return jsonResponse({ error: 'HOLDED_API_KEY secret not configured in worker' }, 500);
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

    // Proxy pass-through for other Holded API calls (create contact, etc.)
    const method = request.method;
    if (method !== 'GET' && method !== 'POST' && method !== 'PUT') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const path = url.pathname + url.search;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        key: env.HOLDED_API_KEY,
        Accept: 'application/json',
      },
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
