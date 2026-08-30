import { buildDocumentUrl } from './holded-v2';
import {
  INTERNAL_API_BASE,
  InternalApiError,
  internalApiGet,
  internalApiPost,
  internalApiResponse,
} from './internal-api';

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
type V2DocumentType = 'sales-orders' | 'waybills' | 'estimates' | 'invoices';
const V2_DOCUMENT_TYPES: V2DocumentType[] = ['sales-orders', 'waybills', 'estimates', 'invoices'];
type WaybillCategory = 'work' | 'warehouse';
const WAYBILL_CATEGORIES: WaybillCategory[] = ['work', 'warehouse'];
const WAYBILL_CATEGORY_KINDS: Record<WaybillCategory, string[]> = {
  work: ['labour', 'mixed', 'extra', 'unclassified'],
  warehouse: ['material', 'refund', 'unclassified'],
};
type V2AttachmentDocumentType = V2DocumentType | 'purchase-orders';
const V2_ATTACHMENT_DOCUMENT_TYPES: V2AttachmentDocumentType[] = [
  'sales-orders',
  'purchase-orders',
  'waybills',
  'estimates',
  'invoices',
];

interface InternalProjectRef {
  id: string;
  name: string;
  color: string | null;
}

interface InternalSourceOrderRef {
  id: string;
  docNumber: string;
}

function attachmentProxyPath(type: V2AttachmentDocumentType, documentId: string): string {
  return `/v2/documents/${type}/${encodeURIComponent(documentId)}/attachments`;
}

function mapDocumentPreview(
  item: Record<string, any>,
  type: V2AttachmentDocumentType,
  documentId: string,
) {
  return {
    ...(('notes' in item || 'description' in item)
      ? { notes: item.notes ?? item.description ?? null }
      : {}),
    ...('internalNotes' in item ? { internalNotes: item.internalNotes ?? null } : {}),
    ...(typeof item.attachmentsUrl === 'string' && item.attachmentsUrl
      ? { attachmentsUrl: attachmentProxyPath(type, documentId) }
      : {}),
    // Keep accepting the former inline shape while cached Pages responses age
    // out; v1.3 consumers use attachmentsUrl and lazy-load the metadata.
    ...(Array.isArray(item.attachments) ? {
      attachments: item.attachments
        .filter((attachment: unknown) => attachment && typeof attachment === 'object')
        .map((attachment: Record<string, any>) => ({
          id: attachment.id ?? null,
          name: attachment.name ?? null,
          url: attachment.url ?? null,
          mimeType: attachment.mimeType ?? null,
          thumbnailUrl: attachment.thumbnailUrl ?? null,
        })),
    } : {}),
  };
}

function mapInternalSalesOrder(item: Record<string, any>) {
  return {
    type: 'sales-orders' as const,
    id: item.id,
    documentNumber: item.docNumber ?? null,
    url: buildDocumentUrl('sales-orders', item.id),
    internalStatus: item.internalStatus ?? null,
    issueDate: item.issueDate ?? null,
    approvedAt: item.approvedAt ?? null,
    dueDate: item.dueDate ?? null,
    deliveryCount: item.deliveryCount ?? 0,
    totalUnits: item.totalUnits ?? 0,
    ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}),
    ...(typeof item.createdBy === 'string' ? { createdBy: item.createdBy } : {}),
    ...mapDocumentPreview(item, 'sales-orders', item.id),
    projects: (item.projects ?? []) as InternalProjectRef[],
  };
}

async function enrichDocumentCreationMetadata(
  items: Array<Record<string, any>>,
  apiKey: string,
  documentType: 'sales-order' | 'purchase-order' | 'waybill' | 'estimate' | 'invoice',
): Promise<Array<Record<string, any>>> {
  return Promise.all(items.map(async (item) => {
    if (!item.id || (typeof item.createdAt === 'string' && typeof item.createdBy === 'string')) {
      return item;
    }

    try {
      const events = await internalApiGet<{
        items?: Array<Record<string, any>>;
      }>(`/documents/${documentType}/${encodeURIComponent(String(item.id))}/events`, apiKey, {
        query: { limit: '50' },
      });
      const createdEvent = (events.items ?? []).find((event) =>
        event.type === 'document.created' || event.type === 'work.registered');
      const createdAt = typeof createdEvent?.occurredAt === 'string' ? createdEvent.occurredAt : null;
      const createdBy = typeof createdEvent?.user?.name === 'string' ? createdEvent.user.name : null;
      if (!createdAt && !createdBy) return item;
      return {
        ...item,
        ...(createdAt ? { createdAt } : {}),
        ...(createdBy ? { createdBy } : {}),
      };
    } catch {
      // Creation metadata is supplemental; a failed event lookup must not hide the order.
      return item;
    }
  }));
}

function mapInternalWaybill(item: Record<string, any>) {
  return {
    type: 'waybills' as const,
    id: item.id,
    documentNumber: item.docNumber ?? null,
    url: buildDocumentUrl('waybills', item.id),
    kind: item.kind ?? null,
    issueDate: item.issueDate ?? null,
    workflowStatus: item.workflowStatus ?? null,
    approvedAt: item.approvedAt ?? null,
    ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}),
    ...(typeof item.createdBy === 'string' ? { createdBy: item.createdBy } : {}),
    ...mapDocumentPreview(item, 'waybills', item.id),
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
    ...(typeof item.dueDate === 'string' ? { dueDate: item.dueDate } : {}),
    approvedAt: item.approvedAt ?? null,
    ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}),
    ...(typeof item.createdBy === 'string' ? { createdBy: item.createdBy } : {}),
    supplier: (item.supplier ?? null) as { id: string; name: string } | null,
    total: item.total ?? null,
    currency: item.currency ?? null,
    ...mapDocumentPreview(item, 'purchase-orders', item.id),
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
    sentAt: item.sentAt ?? null,
    dueDate: item.dueDate ?? null,
    ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}),
    ...(typeof item.createdBy === 'string' ? { createdBy: item.createdBy } : {}),
    displayStatus: item.displayStatus ?? null,
    total: item.total ?? null,
    currency: item.currency ?? null,
    ...mapDocumentPreview(item, 'estimates', item.id),
    projects: (item.projects ?? []) as InternalProjectRef[],
  };
}

function mapInternalInvoice(item: Record<string, any>) {
  return {
    type: 'invoices' as const,
    id: item.id,
    documentNumber: item.docNumber ?? null,
    url: buildDocumentUrl('invoices', item.id),
    issueDate: item.issueDate ?? null,
    approvedAt: item.approvedAt ?? null,
    ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}),
    ...(typeof item.createdBy === 'string' ? { createdBy: item.createdBy } : {}),
    dueDate: item.dueDate ?? null,
    lifecycleStatus: item.lifecycleStatus ?? null,
    collectionStatus: item.collectionStatus ?? null,
    isOverdue: Boolean(item.isOverdue),
    displayStatus: item.displayStatus ?? null,
    amounts: item.amounts ?? null,
    projects: (item.projects ?? []) as InternalProjectRef[],
    sourceDocuments: item.sourceDocuments ?? [],
    ...mapDocumentPreview(item, 'invoices', item.id),
  };
}

interface InternalAttachmentPage {
  items?: Array<Record<string, any>>;
  hasMore?: boolean;
  nextCursor?: string | null;
}

function decodePathSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded && decoded.length <= 200 ? decoded : null;
  } catch {
    return null;
  }
}

function decodeAttachmentId(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded &&
      decoded.length <= 240 &&
      !/[\u0000-\u001f\u007f\\/]/.test(decoded)
      ? decoded
      : null;
  } catch {
    return null;
  }
}

function attachmentRoute(url: URL): {
  type: V2AttachmentDocumentType;
  documentId: string;
  attachmentId: string | null;
} | null {
  const match = url.pathname.match(
    /^\/v2\/documents\/([^/]+)\/([^/]+)\/attachments(?:\/([^/]+))?$/,
  );
  if (!match || !V2_ATTACHMENT_DOCUMENT_TYPES.includes(match[1] as V2AttachmentDocumentType)) {
    return null;
  }
  const documentId = decodePathSegment(match[2]);
  const attachmentId = match[3] ? decodeAttachmentId(match[3]) : null;
  if (!documentId || (match[3] && !attachmentId)) return null;
  return {
    type: match[1] as V2AttachmentDocumentType,
    documentId,
    attachmentId,
  };
}

function authenticatedAttachmentPath(
  downloadUrl: string,
  route: NonNullable<ReturnType<typeof attachmentRoute>>,
): string | null {
  if (!route.attachmentId) return null;
  try {
    const source = new URL(downloadUrl);
    const base = new URL(INTERNAL_API_BASE);
    if (source.origin !== base.origin || source.username || source.password || source.hash) return null;

    const basePath = base.pathname.replace(/\/$/, '');
    if (!source.pathname.startsWith(`${basePath}/`)) return null;
    const pathSegments = source.pathname
      .slice(basePath.length + 1)
      .split('/');
    if (pathSegments.length !== 4 || pathSegments[2] !== 'attachments') return null;

    const sourceType = decodeURIComponent(pathSegments[0]);
    const sourceDocumentId = decodeURIComponent(pathSegments[1]);
    const sourceAttachmentId = decodeAttachmentId(pathSegments[3]);
    if (
      sourceType !== route.type ||
      sourceDocumentId !== route.documentId ||
      sourceAttachmentId !== route.attachmentId
    ) return null;

    return `${source.pathname.slice(basePath.length)}${source.search}`;
  } catch {
    return null;
  }
}

function attachmentErrorResponse(err: unknown): Response {
  if (err instanceof InternalApiError) {
    const status = err.status >= 400 ? err.status : 502;
    const message = err.code === 'NOT_FOUND'
      ? 'No se encontró el adjunto.'
      : 'No se pudieron cargar los adjuntos.';
    return jsonResponse({ error: { code: err.code, message } }, status);
  }
  return jsonResponse({ error: { code: 'UNKNOWN', message: 'Error inesperado.' } }, 502);
}

async function handleV2AttachmentList(
  url: URL,
  env: Env,
  route: NonNullable<ReturnType<typeof attachmentRoute>>,
): Promise<Response> {
  const apiKey = env.EF_INTERNAL_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: { code: 'CONFIG', message: 'Internal API key not configured in worker' } }, 500);
  }

  try {
    const page = await internalApiGet<InternalAttachmentPage>(
      `/${route.type}/${encodeURIComponent(route.documentId)}/attachments`,
      apiKey,
      { query: { cursor: url.searchParams.get('cursor') } },
    );
    const basePath = attachmentProxyPath(route.type, route.documentId);
    const items = (page.items ?? [])
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => {
        const name = typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : 'Adjunto';
        const params = new URLSearchParams({ name });
        const sourceRoute = { ...route, attachmentId: item.id };
        if (
          typeof item.downloadUrl === 'string' &&
          authenticatedAttachmentPath(item.downloadUrl, sourceRoute)
        ) {
          params.set('source', item.downloadUrl);
        }
        return {
          id: item.id,
          name,
          mimeType: typeof item.contentType === 'string'
            ? item.contentType
            : 'application/octet-stream',
          ...(typeof item.size === 'number' ? { size: item.size } : {}),
          ...(typeof item.createdAt === 'string' ? { createdAt: item.createdAt } : {}),
          url: `${basePath}/${encodeURIComponent(item.id)}?${params.toString()}`,
        };
      });
    return jsonResponse({
      items,
      hasMore: Boolean(page.hasMore),
      nextCursor: page.nextCursor ?? null,
    });
  } catch (err) {
    return attachmentErrorResponse(err);
  }
}

function safeAttachmentFilename(value: string | null): string {
  const name = String(value || 'adjunto')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '_')
    .replace(/[^\x20-\x7e]/g, '_')
    .trim();
  return (name || 'adjunto').slice(0, 180);
}

async function handleV2AttachmentBinary(
  url: URL,
  env: Env,
  route: NonNullable<ReturnType<typeof attachmentRoute>>,
): Promise<Response> {
  const apiKey = env.EF_INTERNAL_API_KEY;
  if (!apiKey || !route.attachmentId) {
    return jsonResponse({ error: { code: 'CONFIG', message: 'Internal API key not configured in worker' } }, 500);
  }

  try {
    const source = url.searchParams.get('source');
    const sourcePath = source ? authenticatedAttachmentPath(source, route) : null;
    if (source && !sourcePath) {
      return jsonResponse({
        error: { code: 'INVALID_REQUEST', message: 'La URL del adjunto no es válida.' },
      }, 400);
    }
    const response = await internalApiResponse(
      sourcePath ||
        `/${route.type}/${encodeURIComponent(route.documentId)}/attachments/${encodeURIComponent(route.attachmentId)}`,
      apiKey,
      { accept: 'application/octet-stream' },
    );
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
    const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
    const disposition = mediaType === 'application/pdf' || mediaType.startsWith('image/')
      ? 'inline'
      : 'attachment';
    const headers: Record<string, string> = {
      ...CORS_HEADERS,
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${safeAttachmentFilename(url.searchParams.get('name'))}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) headers['Content-Length'] = contentLength;
    return new Response(response.body, { status: 200, headers });
  } catch (err) {
    return attachmentErrorResponse(err);
  }
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
const SALES_ORDER_PAGE_SIZE = 100;
const RELATED_WAYBILL_PAGE_SIZE = 100;
const RELATED_WAYBILL_MAX_PAGES = 10;
const WAYBILL_CATEGORY_MAX_PAGES = 40;
const ORDERS_VIEW_MAX_PAGES = 15;
const ORDER_WAYBILL_KINDS = ['material', 'refund', 'unclassified'];

function isWaybillCategory(value: string | null): value is WaybillCategory {
  return Boolean(value && WAYBILL_CATEGORIES.includes(value as WaybillCategory));
}

// Related documents are fetched by customer/project with bounded page loops,
// then grouped through sourceOrder under the sales orders visible on the
// current page. Orphans and relations to off-page sales orders are dropped.
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

async function fetchCustomerWaybills(
  apiKey: string,
  contactId: string,
  projectId: string | null,
): Promise<Array<Record<string, any>>> {
  const items: Array<Record<string, any>> = [];
  for (let page = 1; page <= RELATED_WAYBILL_MAX_PAGES; page += 1) {
    const result = await internalApiGet<InternalPage>('/waybills', apiKey, {
      query: {
        customerId: contactId,
        projectId,
        page: String(page),
        pageSize: String(RELATED_WAYBILL_PAGE_SIZE),
      },
    });
    items.push(...(result.items ?? []));
    if (!result.pagination?.hasMore) break;
  }
  return items;
}

async function fetchWaybillCategoryPage(
  apiKey: string,
  contactId: string,
  projectId: string | null,
  category: WaybillCategory,
  requestedPage: number,
): Promise<{ items: Array<Record<string, any>>; hasMore: boolean }> {
  const matches: Array<Record<string, any>> = [];
  const start = (requestedPage - 1) * V2_PAGE_SIZE;
  const end = start + V2_PAGE_SIZE;

  for (let page = 1; page <= WAYBILL_CATEGORY_MAX_PAGES; page += 1) {
    const result = await internalApiGet<InternalPage>('/waybills', apiKey, {
      query: {
        customerId: contactId,
        projectId,
        page: String(page),
        pageSize: String(RELATED_WAYBILL_PAGE_SIZE),
      },
    });
    for (const waybill of result.items ?? []) {
      if (WAYBILL_CATEGORY_KINDS[category].includes(waybill.kind ?? 'unclassified')) {
        matches.push(waybill);
      }
    }
    if (matches.length > end) {
      return { items: matches.slice(start, end), hasMore: true };
    }
    if (!result.pagination?.hasMore) {
      return { items: matches.slice(start, end), hasMore: false };
    }
  }

  return { items: matches.slice(start, end), hasMore: false };
}

function nestRelatedDocuments(
  salesOrders: ReturnType<typeof mapInternalSalesOrder>[],
  purchaseOrders: Array<Record<string, any>>,
  waybills: Array<Record<string, any>>,
) {
  const purchaseOrdersByOrderId = new Map<string, ReturnType<typeof mapInternalPurchaseOrder>[]>();
  for (const purchaseOrder of purchaseOrders) {
    const sourceId = purchaseOrder.sourceOrder?.id;
    if (!sourceId) continue;
    const bucket = purchaseOrdersByOrderId.get(sourceId);
    if (bucket) bucket.push(mapInternalPurchaseOrder(purchaseOrder));
    else purchaseOrdersByOrderId.set(sourceId, [mapInternalPurchaseOrder(purchaseOrder)]);
  }

  const waybillsByOrderId = new Map<string, ReturnType<typeof mapInternalWaybill>[]>();
  for (const waybill of waybills) {
    if (!ORDER_WAYBILL_KINDS.includes(waybill.kind ?? 'unclassified')) continue;
    const sourceId = waybill.sourceOrder?.id;
    if (!sourceId) continue;
    const bucket = waybillsByOrderId.get(sourceId);
    if (bucket) bucket.push(mapInternalWaybill(waybill));
    else waybillsByOrderId.set(sourceId, [mapInternalWaybill(waybill)]);
  }

  return salesOrders.map((order) => ({
    ...order,
    purchaseOrders: purchaseOrdersByOrderId.get(order.id) ?? [],
    waybills: waybillsByOrderId.get(order.id) ?? [],
  }));
}

function documentSortDate(item: Record<string, any>): string {
  return String(item.approvedAt ?? item.sentAt ?? item.issueDate ?? '');
}

function combineOrdersWithStandaloneWaybills(
  salesOrderItems: Array<Record<string, any>>,
  purchaseOrders: Array<Record<string, any>>,
  waybills: Array<Record<string, any>>,
) {
  const salesOrders = salesOrderItems.map(mapInternalSalesOrder);
  const standaloneWaybills = waybills
    .filter((waybill) => {
      return ORDER_WAYBILL_KINDS.includes(waybill.kind ?? 'unclassified') && !waybill.sourceOrder?.id;
    })
    .map(mapInternalWaybill);

  return nestRelatedDocuments(salesOrders, purchaseOrders, waybills)
    .concat(standaloneWaybills)
    .sort((left, right) => documentSortDate(right).localeCompare(documentSortDate(left)));
}

interface OrdersViewSources {
  salesOrders: Array<Record<string, any>>;
  waybills: Array<Record<string, any>>;
  waybillsError: boolean;
}

async function fetchOrdersViewSources(
  apiKey: string,
  contactId: string,
  projectId: string | null,
): Promise<OrdersViewSources> {
  const salesOrders: Array<Record<string, any>> = [];
  const waybills: Array<Record<string, any>> = [];
  let salesOrdersHasMore = true;
  let waybillsHasMore = true;
  let waybillsError = false;
  let page = 1;

  while ((salesOrdersHasMore || waybillsHasMore) && page <= ORDERS_VIEW_MAX_PAGES) {
    const [salesOrdersResult, waybillsResult] = await Promise.allSettled([
      salesOrdersHasMore
        ? internalApiGet<InternalPage>('/sales-orders', apiKey, {
            query: {
              customerId: contactId,
              projectId,
              page: String(page),
              pageSize: String(SALES_ORDER_PAGE_SIZE),
            },
          })
        : Promise.resolve(null),
      waybillsHasMore
        ? internalApiGet<InternalPage>('/waybills', apiKey, {
            query: {
              customerId: contactId,
              projectId,
              page: String(page),
              pageSize: String(RELATED_WAYBILL_PAGE_SIZE),
            },
          })
        : Promise.resolve(null),
    ]);

    if (salesOrdersResult.status === 'rejected') throw salesOrdersResult.reason;
    if (salesOrdersResult.value) {
      salesOrders.push(...(salesOrdersResult.value.items ?? []));
      salesOrdersHasMore = Boolean(salesOrdersResult.value.pagination?.hasMore);
    }

    if (waybillsResult.status === 'rejected') {
      waybillsError = true;
      waybillsHasMore = false;
    } else if (waybillsResult.value) {
      for (const waybill of waybillsResult.value.items ?? []) {
        if (!ORDER_WAYBILL_KINDS.includes(waybill.kind ?? 'unclassified')) continue;

        waybills.push(waybill);
      }
      waybillsHasMore = Boolean(waybillsResult.value.pagination?.hasMore);
    }

    page += 1;
  }

  return { salesOrders, waybills, waybillsError };
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
  const category = url.searchParams.get('category');
  const view = url.searchParams.get('view');

  if (!contactId) return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'contactId is required' } }, 400);
  if (!type || !V2_DOCUMENT_TYPES.includes(type)) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'type must be sales-orders, waybills, estimates, or invoices' } }, 400);
  }
  if (scope !== 'matched' && scope !== 'all') {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'scope must be matched or all' } }, 400);
  }
  if (category && (type !== 'waybills' || !isWaybillCategory(category))) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'category must be work or warehouse for waybills' } }, 400);
  }
  if (view && (type !== 'sales-orders' || view !== 'orders')) {
    return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'view must be orders for sales-orders' } }, 400);
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
      const enrichedItems = await enrichDocumentCreationMetadata(page.items ?? [], apiKey, 'estimate');
      return jsonResponse({
        type,
        scope,
        hasMore: Boolean(page.hasMore),
        nextCursor: page.nextCursor ?? null,
        results: enrichedItems.map(mapInternalEstimate),
      });
    }

    const requestedPage = parsePositiveInteger(url.searchParams.get('page'), 1, 10_000);

    if (type === 'sales-orders' && view === 'orders') {
      const [sourcesResult, purchaseOrdersResult] = await Promise.allSettled([
        fetchOrdersViewSources(apiKey, contactId, effectiveProjectId),
        fetchCustomerPurchaseOrders(apiKey, contactId, effectiveProjectId),
      ]);
      if (sourcesResult.status === 'rejected') throw sourcesResult.reason;

      const enrichedWaybills = await enrichDocumentCreationMetadata(
        sourcesResult.value.waybills,
        apiKey,
        'waybill',
      );
      const results = combineOrdersWithStandaloneWaybills(
        sourcesResult.value.salesOrders,
        purchaseOrdersResult.status === 'fulfilled'
          ? await enrichDocumentCreationMetadata(purchaseOrdersResult.value, apiKey, 'purchase-order')
          : [],
        enrichedWaybills,
      );
      const start = (requestedPage - 1) * V2_PAGE_SIZE;
      const pageResults = results.slice(start, start + V2_PAGE_SIZE);
      const enrichedSalesOrders = await enrichDocumentCreationMetadata(
        pageResults.filter((item) => item.type === 'sales-orders'),
        apiKey,
        'sales-order',
      );
      const creationById = new Map(enrichedSalesOrders.map((item) => [item.id, item]));
      return jsonResponse({
        type,
        scope,
        page: requestedPage,
        pageSize: V2_PAGE_SIZE,
        hasMore: start + V2_PAGE_SIZE < results.length,
        results: pageResults.map((item) => creationById.get(item.id) ?? item),
        ...(purchaseOrdersResult.status === 'rejected' ? { purchaseOrdersError: true } : {}),
        ...(sourcesResult.value.waybillsError ? { waybillsError: true } : {}),
      });
    }

    if (type === 'waybills' && isWaybillCategory(category)) {
      const categoryPage = await fetchWaybillCategoryPage(
        apiKey,
        contactId,
        effectiveProjectId,
        category,
        requestedPage,
      );
      const enrichedItems = await enrichDocumentCreationMetadata(categoryPage.items, apiKey, 'waybill');
      return jsonResponse({
        type,
        scope,
        page: requestedPage,
        pageSize: V2_PAGE_SIZE,
        hasMore: categoryPage.hasMore,
        results: enrichedItems.map(mapInternalWaybill),
      });
    }

    const path = type === 'sales-orders' ? '/sales-orders' : type === 'invoices' ? '/invoices' : '/waybills';
    const page = await internalApiGet<InternalPage>(path, apiKey, {
      query: {
        customerId: contactId,
        projectId: effectiveProjectId,
        page: String(requestedPage),
        pageSize: String(V2_PAGE_SIZE),
      },
    });

    if (type === 'sales-orders') {
      const enrichedItems = await enrichDocumentCreationMetadata(page.items ?? [], apiKey, 'sales-order');
      const salesOrders = enrichedItems.map(mapInternalSalesOrder);
      const [purchaseOrdersResult, waybillsResult] = await Promise.allSettled([
        fetchCustomerPurchaseOrders(apiKey, contactId, effectiveProjectId),
        fetchCustomerWaybills(apiKey, contactId, effectiveProjectId),
      ]);
      const purchaseOrdersError = purchaseOrdersResult.status === 'rejected';
      const waybillsError = waybillsResult.status === 'rejected';
      const purchaseOrders = purchaseOrdersResult.status === 'fulfilled'
        ? await enrichDocumentCreationMetadata(purchaseOrdersResult.value, apiKey, 'purchase-order')
        : [];
      const results = nestRelatedDocuments(
        salesOrders,
        purchaseOrders,
        waybillsResult.status === 'fulfilled'
          ? await enrichDocumentCreationMetadata(waybillsResult.value, apiKey, 'waybill')
          : [],
      );
      return jsonResponse({
        type,
        scope,
        page: requestedPage,
        pageSize: V2_PAGE_SIZE,
        hasMore: Boolean(page.pagination?.hasMore),
        results,
        ...(purchaseOrdersError ? { purchaseOrdersError: true } : {}),
        ...(waybillsError ? { waybillsError: true } : {}),
      });
    }

    if (type === 'invoices') {
      const enrichedItems = await enrichDocumentCreationMetadata(page.items ?? [], apiKey, 'invoice');
      return jsonResponse({
        type,
        scope,
        page: requestedPage,
        pageSize: V2_PAGE_SIZE,
        hasMore: Boolean(page.pagination?.hasMore),
        results: enrichedItems.map(mapInternalInvoice),
      });
    }

    const enrichedItems = await enrichDocumentCreationMetadata(page.items ?? [], apiKey, 'waybill');
    return jsonResponse({
      type,
      scope,
      page: requestedPage,
      pageSize: V2_PAGE_SIZE,
      hasMore: Boolean(page.pagination?.hasMore),
      results: enrichedItems.map(mapInternalWaybill),
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

    if (request.method === 'GET') {
      const route = attachmentRoute(url);
      if (route) {
        return route.attachmentId
          ? handleV2AttachmentBinary(url, env, route)
          : handleV2AttachmentList(url, env, route);
      }
    }
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
