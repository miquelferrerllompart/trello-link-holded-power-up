import { buildDocumentUrl } from './holded-v2';
import { InternalApiError, internalApiGet, internalApiPost } from './internal-api';

interface Env {
  EF_INTERNAL_API_KEY?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function parsePositiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

// ── Contact & project search ──

/** Localized, key-safe error for the search popups (they show `error` verbatim). */
function internalSearchError(err: unknown): Response {
  const message = err instanceof InternalApiError && err.code === 'DATA_NOT_READY'
    ? 'Sincronizando datos… inténtalo de nuevo en un momento.'
    : 'No se pudieron cargar los resultados.';
  return jsonResponse({ error: message }, 502);
}

function mapInternalContactSummary(item: Record<string, any>) {
  return {
    id: item.id,
    name: item.name ?? '',
    code: item.code ?? null,
    vatnumber: item.vatnumber ?? '',
    tradeName: item.tradeName ?? null,
    email: item.email ?? null,
    phone: item.phone ?? null,
    mobile: item.mobile ?? null,
    type: item.type ?? null,
    customId: item.customId ?? null,
  };
}

async function handleContactsSearch(url: URL, env: Env): Promise<Response> {
  const apiKey = env.EF_INTERNAL_API_KEY;
  if (!apiKey) return jsonResponse({ error: 'Internal API key not configured in worker' }, 500);

  const query = (url.searchParams.get('q') || '').trim();
  if (!query) return jsonResponse({ total: 0, results: [] });

  try {
    const page = await internalApiGet<{ items?: Array<Record<string, any>> }>('/contacts', apiKey, {
      query: { query, limit: '30' },
    });
    const results = (page.items ?? []).map(mapInternalContactSummary);
    return jsonResponse({ total: results.length, results });
  } catch (err) {
    return internalSearchError(err);
  }
}

function mapInternalProject(item: Record<string, any>) {
  return {
    id: item.id,
    name: item.name ?? '',
    contactName: item.contactName || null,
    key: item.key || null,
  };
}

async function handleProjectsSearch(url: URL, env: Env): Promise<Response> {
  const apiKey = env.EF_INTERNAL_API_KEY;
  if (!apiKey) return jsonResponse({ error: 'Internal API key not configured in worker' }, 500);

  const query = (url.searchParams.get('q') || '').trim();
  if (!query) return jsonResponse({ total: 0, results: [] });

  try {
    const page = await internalApiGet<{ items?: Array<Record<string, any>> }>('/projects', apiKey, {
      query: { query, limit: '30' },
    });
    const results = (page.items ?? []).map(mapInternalProject);
    return jsonResponse({ total: results.length, results });
  } catch (err) {
    return internalSearchError(err);
  }
}

// ── Card-back document tabs ──

const V2_PAGE_SIZE = 10;
type V2DocumentType = 'sales-orders' | 'waybills' | 'estimates';
const V2_DOCUMENT_TYPES: V2DocumentType[] = ['sales-orders', 'waybills', 'estimates'];

interface InternalProjectRef {
  id: string;
  name: string;
  color: string | null;
}

interface InternalSourceOrderRef {
  id: string;
  docNumber: string;
}

function mapInternalSalesOrder(item: Record<string, any>) {
  return {
    type: 'sales-orders' as const,
    id: item.id,
    documentNumber: item.docNumber ?? null,
    url: buildDocumentUrl('sales-orders', item.id),
    internalStatus: item.internalStatus ?? null,
    issueDate: item.issueDate ?? null,
    dueDate: item.dueDate ?? null,
    deliveryCount: item.deliveryCount ?? 0,
    totalUnits: item.totalUnits ?? 0,
    projects: (item.projects ?? []) as InternalProjectRef[],
  };
}

function mapInternalWaybill(item: Record<string, any>) {
  return {
    type: 'waybills' as const,
    id: item.id,
    documentNumber: item.docNumber ?? null,
    url: buildDocumentUrl('waybills', item.id),
    issueDate: item.issueDate ?? null,
    workflowStatus: item.workflowStatus ?? null,
    approvedAt: item.approvedAt ?? null,
    sourceOrder: (item.sourceOrder ?? null) as InternalSourceOrderRef | null,
    projects: (item.projects ?? []) as InternalProjectRef[],
  };
}

function mapInternalPurchaseOrder(item: Record<string, any>) {
  return {
    type: 'purchase-orders' as const,
    id: item.id,
    documentNumber: item.docNumber ?? null,
    url: buildDocumentUrl('purchase-orders', item.id),
    internalStatus: item.internalStatus ?? null,
    issueDate: item.issueDate ?? null,
    supplier: (item.supplier ?? null) as { id: string; name: string } | null,
    total: item.total ?? null,
    currency: item.currency ?? null,
    projects: (item.projects ?? []) as InternalProjectRef[],
  };
}

function mapInternalEstimate(item: Record<string, any>) {
  return {
    type: 'estimates' as const,
    id: item.id,
    documentNumber: item.docNumber ?? null,
    url: buildDocumentUrl('estimates', item.id),
    issueDate: item.issueDate ?? null,
    dueDate: item.dueDate ?? null,
    displayStatus: item.displayStatus ?? null,
    total: item.total ?? null,
    currency: item.currency ?? null,
    projects: (item.projects ?? []) as InternalProjectRef[],
  };
}

interface InternalPage {
  items?: Array<Record<string, any>>;
  pagination?: { page?: number; pageSize?: number; hasMore?: boolean };
  hasMore?: boolean;
  nextCursor?: string | null;
}

function internalErrorResponse(err: unknown): Response {
  if (err instanceof InternalApiError) {
    if (err.code === 'AUTH_INVALID' || err.code === 'CONFIG') {
      return jsonResponse({ error: { code: 'CONFIG', message: 'Internal API request was rejected.' } }, 500);
    }
    if (err.code === 'DATA_NOT_READY') {
      return jsonResponse({ error: { code: 'DATA_NOT_READY', message: 'Sincronizando datos de Holded…' } }, 503);
    }
    const status = err.status >= 400 ? err.status : 502;
    return jsonResponse({ error: { code: err.code, message: 'No se pudieron cargar los documentos.' } }, status);
  }
  return jsonResponse({ error: { code: 'UNKNOWN', message: 'Error inesperado.' } }, 502);
}

const PURCHASE_ORDER_PAGE_SIZE = 100;
const PURCHASE_ORDER_MAX_PAGES = 10;

// Purchase orders are fetched by the customer relation (resolved through each
// PO's source sales order) with a bounded page loop, then grouped under the
// sales orders that are visible on the current page. Orphans (no sourceOrder)
// and POs whose source order is not on this page are dropped.
async function fetchCustomerPurchaseOrders(
  apiKey: string,
  contactId: string,
  projectId: string | null,
): Promise<Array<Record<string, any>>> {
  const items: Array<Record<string, any>> = [];
  for (let page = 1; page <= PURCHASE_ORDER_MAX_PAGES; page += 1) {
    const result = await internalApiGet<InternalPage>('/purchase-orders', apiKey, {
      query: {
        customerId: contactId,
        projectId,
        page: String(page),
        pageSize: String(PURCHASE_ORDER_PAGE_SIZE),
      },
    });
    items.push(...(result.items ?? []));
    if (!result.pagination?.hasMore) break;
  }
  return items;
}

function nestPurchaseOrders(
  salesOrders: ReturnType<typeof mapInternalSalesOrder>[],
  purchaseOrders: Array<Record<string, any>>,
) {
  const byOrderId = new Map<string, ReturnType<typeof mapInternalPurchaseOrder>[]>();
  for (const purchaseOrder of purchaseOrders) {
    const sourceId = purchaseOrder.sourceOrder?.id;
    if (!sourceId) continue;
    const bucket = byOrderId.get(sourceId);
    if (bucket) bucket.push(mapInternalPurchaseOrder(purchaseOrder));
    else byOrderId.set(sourceId, [mapInternalPurchaseOrder(purchaseOrder)]);
  }
  return salesOrders.map((order) => ({
    ...order,
    purchaseOrders: byOrderId.get(order.id) ?? [],
  }));
}

async function handleV2DocumentsSearch(url: URL, env: Env): Promise<Response> {
  const apiKey = env.EF_INTERNAL_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: { code: 'CONFIG', message: 'Internal API key not configured in worker' } }, 500);
  }

  const contactId = url.searchParams.get('contactId');
  const type = url.searchParams.get('type') as V2DocumentType | null;
  const scope = url.searchParams.get('scope') || 'matched';
  const projectId = url.searchParams.get('projectId');

  if (!contactId) return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'contactId is required' } }, 400);
  if (!type || !V2_DOCUMENT_TYPES.includes(type)) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'type must be sales-orders, waybills, or estimates' } }, 400);
  }
  if (scope !== 'matched' && scope !== 'all') {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'scope must be matched or all' } }, 400);
  }

  // In the "all" scope the linked project is intentionally dropped so the list
  // spans every document the customer owns.
  const effectiveProjectId = scope === 'matched' ? projectId : null;

  try {
    if (type === 'estimates') {
      const cursor = url.searchParams.get('cursor');
      const page = await internalApiGet<InternalPage>('/estimates', apiKey, {
        query: { customerId: contactId, projectId: effectiveProjectId, cursor, limit: String(V2_PAGE_SIZE) },
      });
      return jsonResponse({
        type,
        scope,
        hasMore: Boolean(page.hasMore),
        nextCursor: page.nextCursor ?? null,
        results: (page.items ?? []).map(mapInternalEstimate),
      });
    }

    const requestedPage = parsePositiveInteger(url.searchParams.get('page'), 1, 10_000);
    const path = type === 'sales-orders' ? '/sales-orders' : '/waybills';
    const page = await internalApiGet<InternalPage>(path, apiKey, {
      query: {
        customerId: contactId,
        projectId: effectiveProjectId,
        page: String(requestedPage),
        pageSize: String(V2_PAGE_SIZE),
      },
    });

    if (type === 'sales-orders') {
      const salesOrders = (page.items ?? []).map(mapInternalSalesOrder);
      let results = salesOrders.map((order) => ({ ...order, purchaseOrders: [] as ReturnType<typeof mapInternalPurchaseOrder>[] }));
      let purchaseOrdersError = false;
      try {
        const purchaseOrders = await fetchCustomerPurchaseOrders(apiKey, contactId, effectiveProjectId);
        results = nestPurchaseOrders(salesOrders, purchaseOrders);
      } catch {
        // The relation is supplementary — never fail the whole view because the
        // purchase-order fetch is degraded.
        purchaseOrdersError = true;
      }
      return jsonResponse({
        type,
        scope,
        page: requestedPage,
        pageSize: V2_PAGE_SIZE,
        hasMore: Boolean(page.pagination?.hasMore),
        results,
        ...(purchaseOrdersError ? { purchaseOrdersError: true } : {}),
      });
    }

    return jsonResponse({
      type,
      scope,
      page: requestedPage,
      pageSize: V2_PAGE_SIZE,
      hasMore: Boolean(page.pagination?.hasMore),
      results: (page.items ?? []).map(mapInternalWaybill),
    });
  } catch (err) {
    return internalErrorResponse(err);
  }
}

async function handleV2ContactDetail(url: URL, env: Env): Promise<Response> {
  const apiKey = env.EF_INTERNAL_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: { code: 'CONFIG', message: 'Internal API key not configured in worker' } }, 500);
  }

  const contactId = url.pathname.slice('/v2/contacts/'.length);
  if (!contactId) return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'contact id is required' } }, 400);

  try {
    const contact = await internalApiGet<unknown>(`/contacts/${encodeURIComponent(contactId)}`, apiKey);
    return jsonResponse(contact);
  } catch (err) {
    return internalErrorResponse(err);
  }
}

// ── Contact writes ──

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** Use the client-supplied idempotency key when valid, else mint one per request. */
function readIdempotencyKey(url: URL): string {
  const provided = url.searchParams.get('idempotencyKey');
  if (provided && IDEMPOTENCY_KEY_PATTERN.test(provided)) return provided;
  return crypto.randomUUID();
}

/** Write errors surface a friendly `{ error: string }` for the popups. */
function internalWriteError(err: unknown): Response {
  if (err instanceof InternalApiError) {
    if (err.code === 'AUTH_INVALID') return jsonResponse({ error: 'Configuración del servidor inválida.' }, 500);
    if (err.code === 'DATA_NOT_READY') return jsonResponse({ error: 'Sincronizando datos… inténtalo de nuevo en un momento.' }, 503);
    if (err.status === 409) return jsonResponse({ error: 'La operación ya se procesó o está en curso.' }, 409);
    if (err.code === 'INVALID_REQUEST' && err.detail) return jsonResponse({ error: err.detail }, 400);
    return jsonResponse({ error: err.detail || 'No se pudo completar la operación.' }, err.status >= 400 ? err.status : 502);
  }
  return jsonResponse({ error: 'Error inesperado.' }, 502);
}

async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: JSON.parse((await request.text()) || '{}') };
  } catch {
    return { ok: false };
  }
}

async function handleV2CreateContact(request: Request, url: URL, env: Env): Promise<Response> {
  const apiKey = env.EF_INTERNAL_API_KEY;
  if (!apiKey) return jsonResponse({ error: 'Internal API key not configured in worker' }, 500);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return jsonResponse({ error: 'Cuerpo JSON no válido.' }, 400);

  try {
    const contact = await internalApiPost<unknown>('/contacts', apiKey, parsed.body, readIdempotencyKey(url));
    return jsonResponse(contact, 201);
  } catch (err) {
    return internalWriteError(err);
  }
}

async function handleV2AddShippingAddress(request: Request, url: URL, env: Env): Promise<Response> {
  const apiKey = env.EF_INTERNAL_API_KEY;
  if (!apiKey) return jsonResponse({ error: 'Internal API key not configured in worker' }, 500);

  const match = url.pathname.match(/^\/v2\/contacts\/([^/]+)\/shipping-addresses$/);
  const contactId = match ? decodeURIComponent(match[1]) : '';
  if (!contactId) return jsonResponse({ error: 'Falta el identificador del contacto.' }, 400);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return jsonResponse({ error: 'Cuerpo JSON no válido.' }, 400);

  try {
    const result = await internalApiPost<unknown>(
      `/contacts/${encodeURIComponent(contactId)}/shipping-addresses`,
      apiKey,
      parsed.body,
      readIdempotencyKey(url),
    );
    return jsonResponse(result, 201);
  } catch (err) {
    return internalWriteError(err);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/v2/documents/search') {
      return handleV2DocumentsSearch(url, env);
    }
    if (request.method === 'POST' && url.pathname === '/v2/contacts') {
      return handleV2CreateContact(request, url, env);
    }
    if (request.method === 'POST' && /^\/v2\/contacts\/[^/]+\/shipping-addresses$/.test(url.pathname)) {
      return handleV2AddShippingAddress(request, url, env);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/v2/contacts/')) {
      return handleV2ContactDetail(url, env);
    }
    if (request.method === 'GET' && url.pathname === '/contacts/search') {
      return handleContactsSearch(url, env);
    }
    if (request.method === 'GET' && url.pathname === '/projects/search') {
      return handleProjectsSearch(url, env);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};
