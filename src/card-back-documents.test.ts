// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const PAGE_SIZE = 10;
const TYPE_TO_KEY = {
  'sales-orders': 'salesOrders',
  waybills: 'waybills',
  estimates: 'estimates',
  invoices: 'invoices',
};
const WAYBILL_CATEGORY_KINDS = {
  work: ['labour', 'mixed', 'extra', 'unclassified'],
  warehouse: ['material', 'refund', 'unclassified'],
};

// Mirrors the worker's /v2/documents/search response shape.
function buildDocumentsPage(documents, requestUrl, options) {
  const url = new URL(requestUrl);
  const type = url.searchParams.get('type');
  const scope = url.searchParams.get('scope') || 'matched';
  const key = TYPE_TO_KEY[type] || 'salesOrders';
  const source = scope === 'all' ? (documents.all || documents) : documents;
  const category = url.searchParams.get('category');
  const sourceItems = type === 'sales-orders' && url.searchParams.get('view') === 'orders'
    ? [...(source.salesOrders || []), ...(source.orderWaybills || [])]
    : source[key] || [];
  const items = type === 'waybills' && WAYBILL_CATEGORY_KINDS[category]
    ? sourceItems.filter((item) => WAYBILL_CATEGORY_KINDS[category].includes(item.kind || 'unclassified'))
    : sourceItems;

  if (type === 'estimates') {
    const start = Number(url.searchParams.get('cursor')) || 0;
    const slice = items.slice(start, start + PAGE_SIZE);
    const hasMore = start + PAGE_SIZE < items.length;
    return { type, scope, hasMore, nextCursor: hasMore ? String(start + PAGE_SIZE) : null, results: slice };
  }

  const page = Number(url.searchParams.get('page')) || 1;
  const startIndex = (page - 1) * PAGE_SIZE;
  const slice = items.slice(startIndex, startIndex + PAGE_SIZE);
  const hasMore = startIndex + PAGE_SIZE < items.length;
  const body = { type, scope, page, pageSize: PAGE_SIZE, hasMore, results: slice };
  if (type === 'sales-orders' && options.purchaseOrdersError) body.purchaseOrdersError = true;
  if (type === 'sales-orders' && options.waybillsError) body.waybillsError = true;
  return body;
}

function loadCardBack(documents, options = {}) {
  const html = readFileSync(resolve(__dirname, '../public/card-back.html'), 'utf8')
    .replace('<script src="https://p.trellocdn.com/power-up.min.js"></script>', '');
  const urls = [];
  const requests = [];
  const setCalls = [];
  const popupCalls = [];
  const authState = { authorizeCalls: 0 };
  let renderCallback;
  let nextScheduledRefreshId = 1;
  const scheduledRefreshes = new Map();
  let restApiAuthorized = options.authorized !== false;
  let cardData = {
    contactId: options.contactId === null ? undefined : 'contact-1',
    contactName: options.contactId === null ? undefined : 'Cliente largo',
    addressLabel: options.contactId === null ? undefined : (options.addressLabel || 'Calle Mayor 123, Palma'),
    projectId: options.projectId === null ? undefined : 'project-1',
    projectName: options.projectId === null ? undefined : 'Proyecto largo',
  };

  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1/card-back.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      const nativeSetTimeout = window.setTimeout.bind(window);
      const nativeClearTimeout = window.clearTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 5_000) {
          const id = nextScheduledRefreshId++;
          scheduledRefreshes.set(id, () => callback(...args));
          return id;
        }
        return nativeSetTimeout(callback, delay, ...args);
      };
      window.clearTimeout = (id) => {
        if (!scheduledRefreshes.delete(id)) nativeClearTimeout(id);
      };
      window.confirm = () => options.confirmUnlink === true;
      window.fetch = async (url, init) => {
        const requestUrl = String(url);
        urls.push(requestUrl);
        requests.push({ url: requestUrl, init });

        if (requestUrl.includes('/v2/documents/search')) {
          const responseBody = buildDocumentsPage(documents, requestUrl, options);
          if (options.documentDelayMs) {
            await new Promise((r) => setTimeout(r, options.documentDelayMs));
          }
          if (options.dataNotReady) {
            return new Response(JSON.stringify({ error: { code: 'DATA_NOT_READY', message: 'sync' } }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (requestUrl.includes('/v2/documents/') && requestUrl.includes('/attachments')) {
          if (options.attachmentDelayMs) {
            await new Promise((r) => setTimeout(r, options.attachmentDelayMs));
          }
          return new Response(JSON.stringify({
            items: options.attachments || [],
            hasMore: false,
            nextCursor: null,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (requestUrl.includes('/v2/contacts/')) {
          return new Response(JSON.stringify({ customFields: options.customFields || [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response('{}', { status: 200 });
      };
      window.TrelloPowerUp = {
        iframe: () => ({
          get: () => Promise.resolve({ ...cardData }),
          card: () => Promise.resolve({ id: 'card-1', desc: options.cardDesc || '' }),
          getRestApi: () => ({
            // Stateful: a token only exists once authorized. When options.authorized
            // is false the card-back starts tokenless (the original bug) until
            // authorize() grants it. authorizeCalls guards that we only authorize once.
            isAuthorized: () => Promise.resolve(restApiAuthorized),
            authorize: () => { authState.authorizeCalls += 1; restApiAuthorized = true; return Promise.resolve(); },
            getToken: () => Promise.resolve(restApiAuthorized ? (options.trelloToken || 'tok') : null),
          }),
          set: (...args) => { setCalls.push(args); cardData = args[3]; return Promise.resolve(); },
          popup: (opts) => { popupCalls.push(opts); },
          closePopup: () => undefined,
          sizeTo: () => Promise.resolve(),
          render: (callback) => { renderCallback = callback; },
        }),
      };
    },
  });

  return {
    dom,
    urls,
    requests,
    setCalls,
    popupCalls,
    authState,
    rerender: () => renderCallback?.(),
    runScheduledDocumentRefresh: () => {
      const next = scheduledRefreshes.entries().next().value;
      if (!next) return false;
      const [id, callback] = next;
      scheduledRefreshes.delete(id);
      callback();
      return true;
    },
  };
}

async function waitForRender() {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

function expand(dom) {
  dom.window.document.querySelector('#load-documents')?.click();
}

function selectDocumentTab(dom, key) {
  dom.window.document.querySelector(`[data-tab="${key}"]`)?.click();
}

function contentText(dom) {
  return dom.window.document.querySelector('#content')?.textContent || '';
}

const salesOrder = (id, documentNumber, extra = {}) => ({
  id,
  type: 'sales-orders',
  documentNumber,
  internalStatus: 'in_process',
  issueDate: '2026-07-14',
  projects: [{ id: 'project-1', name: 'Obra', color: null }],
  purchaseOrders: [],
  ...extra,
});

describe('card-back document view (internal API v2)', () => {
  it('shows Partes de trabajo and Pedidos without a separate Almacén tab', async () => {
    const { dom, urls } = loadCardBack({ salesOrders: [], waybills: [], estimates: [] });
    await waitForRender();

    const tabs = Array.from(dom.window.document.querySelectorAll('.documents-tab'));
    expect(tabs.map((tab) => tab.textContent?.trim()))
      .toEqual(['Partes de trabajo', 'Pedidos', 'Facturas', 'Presupuestos']);
    expect(tabs[0]?.getAttribute('data-tab')).toBe('waybills');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(urls.some((url) => url.includes('/v2/documents/search') && url.includes('type=waybills') && url.includes('category=work')))
      .toBe(true);
    expect(urls.some((url) => url.includes('/v2/documents/search') && url.includes('type=sales-orders')))
      .toBe(false);
  });

  it('keeps only work reports in Partes de trabajo and combines standalone movements in Pedidos', async () => {
    const { dom, urls } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1')],
      orderWaybills: [
        { id: 'refund-order', type: 'waybills', documentNumber: 'ALB-DEVOLUCION-PEDIDO', kind: 'refund', workflowStatus: 'prepared', issueDate: '2026-07-11', projects: [] },
      ],
      estimates: [],
      waybills: [
        { id: 'material', type: 'waybills', documentNumber: 'ALB-MATERIAL', kind: 'material', workflowStatus: 'prepared', issueDate: '2026-07-10', projects: [] },
        { id: 'labour', type: 'waybills', documentNumber: 'ALB-TRABAJO', kind: 'labour', workflowStatus: 'prepared', issueDate: '2026-07-10', projects: [] },
        { id: 'mixed', type: 'waybills', documentNumber: 'ALB-MIXTO', kind: 'mixed', workflowStatus: 'prepared', issueDate: '2026-07-10', projects: [] },
        { id: 'extra', type: 'waybills', documentNumber: 'ALB-EXTRA', kind: 'extra', workflowStatus: 'prepared', issueDate: '2026-07-10', projects: [] },
        { id: 'refund', type: 'waybills', documentNumber: 'ALB-DEVOLUCION', kind: 'refund', workflowStatus: 'prepared', issueDate: '2026-07-10', projects: [] },
        { id: 'unclassified', type: 'waybills', documentNumber: 'ALB-SIN-CLASIFICAR', kind: 'unclassified', workflowStatus: 'prepared', issueDate: '2026-07-10', projects: [] },
      ],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(Array.from(dom.window.document.querySelectorAll('.document-number')).map((item) => item.textContent))
      .toEqual(['ALB-TRABAJO', 'ALB-MIXTO', 'ALB-EXTRA', 'ALB-SIN-CLASIFICAR']);

    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(Array.from(dom.window.document.querySelectorAll('.document-number')).map((item) => item.textContent))
      .toEqual(['PV-1', 'ALB-DEVOLUCION-PEDIDO']);
    expect(urls.some((url) => url.includes('type=sales-orders') && url.includes('view=orders'))).toBe(true);
  });

  it('renders the full customer address and dual app destinations for the customer and project', async () => {
    const { dom } = loadCardBack({ salesOrders: [], waybills: [], estimates: [] });
    await waitForRender();

    expect(contentText(dom)).toContain('Calle Mayor 123, Palma');
    expect(contentText(dom)).not.toContain('Calle Ma…');

    const contact = dom.window.document.querySelector('.tag-contact');
    expect(contact?.tagName).toBe('DIV');
    expect(contact?.querySelector('.document-link--ef')?.getAttribute('href'))
      .toBe('https://app.electricaferrer.es/contacto/contact-1');
    expect(contact?.querySelector('.document-link--holded')?.getAttribute('href'))
      .toBe('https://app.holded.com/contacts/contact-1');

    const project = dom.window.document.querySelector('.tag-project');
    expect(project?.tagName).toBe('DIV');
    expect(project?.querySelector('.document-link--ef')?.getAttribute('href'))
      .toBe('https://app.electricaferrer.es/proyecto/project-1');
    expect(project?.querySelector('.document-link--holded')?.getAttribute('href'))
      .toBe('https://app.holded.com/projects/p/project-1');
  });

  it('fetches the linked contact detail from /v2/contacts/:id', async () => {
    const { dom, urls } = loadCardBack({ salesOrders: [], waybills: [], estimates: [] });
    await waitForRender();
    expect(urls.some((url) => url.includes('/v2/contacts/contact-1'))).toBe(true);
  });

  it('shows the sales-order internalStatus label, not the document status', async () => {
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1', { internalStatus: 'partially_prepared' })],
      waybills: [],
      estimates: [],
    });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(contentText(dom)).toContain('Parcialmente preparado');
    expect(contentText(dom)).not.toContain('Completado');
  });

  it('shows who created a sales order and when it was created', async () => {
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-creator', 'PV-26-008783', {
        createdAt: '2026-08-18T13:25:44.078Z',
        createdBy: 'Andrés Gamundí Campomar',
      })],
      waybills: [],
      estimates: [],
    });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    const creator = dom.window.document.querySelector('.document-creator');
    expect(creator?.textContent).toContain('Creado por Andrés Gamundí Campomar');
    expect(creator?.textContent).toContain('18/08/2026');
  });

  it('shows who completed a work report and when it was created', async () => {
    const { dom } = loadCardBack({
      salesOrders: [],
      waybills: [{
        id: 'wb-creator',
        type: 'waybills',
        documentNumber: 'ALB-26-000123',
        kind: 'labour',
        workflowStatus: 'prepared',
        issueDate: '2026-08-18',
        createdAt: '2026-08-18T13:25:44.078Z',
        createdBy: 'Marta Ferrer',
        projects: [],
      }],
      estimates: [],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    const creator = dom.window.document.querySelector('.document-creator');
    expect(creator?.textContent).toContain('Realizado por Marta Ferrer');
    expect(creator?.textContent).toContain('18/08/2026');
  });

  it('fetches fresh document data whenever a tab is activated again', async () => {
    const documents = {
      salesOrders: [salesOrder('so-1', 'PV-1', { internalStatus: 'partially_delivered' })],
      waybills: [],
      invoices: [],
      estimates: [],
    };
    const { dom, urls } = loadCardBack(documents);
    const salesOrderRequests = () => urls.filter((url) => url.includes('type=sales-orders'));

    await waitForRender();
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(contentText(dom)).toContain('Parcialmente entregado');
    expect(salesOrderRequests()).toHaveLength(1);

    documents.salesOrders[0].internalStatus = 'all_delivered';
    selectDocumentTab(dom, 'invoices');
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(salesOrderRequests()).toHaveLength(2);
    expect(contentText(dom)).toContain('Totalmente entregado');
  });

  it('keeps an unchanged open document panel stable without scheduled refreshes', async () => {
    const documents = {
      salesOrders: [salesOrder('so-1', 'PV-1', { internalStatus: 'partially_delivered' })],
      waybills: [],
      invoices: [],
      estimates: [],
    };
    const { dom, urls, runScheduledDocumentRefresh } = loadCardBack(documents);
    const salesOrderRequests = () => urls.filter((url) => url.includes('type=sales-orders'));

    await waitForRender();
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(contentText(dom)).toContain('Parcialmente entregado');
    expect(salesOrderRequests()).toHaveLength(1);

    documents.salesOrders[0].internalStatus = 'all_delivered';
    expect(runScheduledDocumentRefresh()).toBe(false);
    await waitForRender();

    expect(salesOrderRequests()).toHaveLength(1);
    expect(contentText(dom)).toContain('Parcialmente entregado');
  });

  it('fetches fresh document data on a Trello rerender', async () => {
    const documents = {
      salesOrders: [salesOrder('so-1', 'PV-1', { internalStatus: 'partially_delivered' })],
      waybills: [],
      invoices: [],
      estimates: [],
    };
    const { dom, urls, rerender } = loadCardBack(documents);
    const salesOrderRequests = () => urls.filter((url) => url.includes('type=sales-orders'));

    await waitForRender();
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(contentText(dom)).toContain('Parcialmente entregado');
    expect(salesOrderRequests()).toHaveLength(1);

    documents.salesOrders[0].internalStatus = 'all_delivered';
    rerender();
    await waitForRender();

    expect(salesOrderRequests()).toHaveLength(2);
    expect(contentText(dom)).toContain('Totalmente entregado');
  });

  it('replaces an in-flight document request when Trello rerenders', async () => {
    const documents = {
      salesOrders: [salesOrder('so-1', 'PV-1', { internalStatus: 'partially_delivered' })],
      waybills: [],
      invoices: [],
      estimates: [],
    };
    const { dom, urls, requests, rerender } = loadCardBack(documents, { documentDelayMs: 80 });
    const salesOrderRequests = () => urls.filter((url) => url.includes('type=sales-orders'));

    await waitForRender();
    selectDocumentTab(dom, 'salesOrders');
    expect(salesOrderRequests()).toHaveLength(1);

    documents.salesOrders[0].internalStatus = 'all_delivered';
    rerender();
    expect(requests.find(({ url }) => url.includes('type=sales-orders'))?.init?.signal?.aborted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 180));

    expect(salesOrderRequests()).toHaveLength(2);
    expect(contentText(dom)).toContain('Totalmente entregado');
    expect(contentText(dom)).not.toContain('Parcialmente entregado');
  });

  it('asks the browser not to reuse its HTTP cache for document requests', async () => {
    const { requests } = loadCardBack({
      salesOrders: [],
      waybills: [],
      invoices: [],
      estimates: [],
    });

    await waitForRender();

    const documentRequest = requests.find(({ url }) => url.includes('/v2/documents/search'));
    expect(documentRequest?.init?.cache).toBe('no-store');
  });

  it('offers branded Holded and Eléctrica Ferrer destinations for sales orders', async () => {
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so/with spaces', 'PV-1', {
        url: 'https://app.holded.com/sales/orders#open:salesorder-so-1',
      })],
      waybills: [],
      estimates: [],
    });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    const row = dom.window.document.querySelector('.document-row');
    const links = row?.querySelectorAll('.document-link');
    expect(row?.tagName).toBe('DIV');
    expect(links).toHaveLength(2);
    expect(row?.querySelector('.document-link--ef')?.getAttribute('href'))
      .toBe('https://app.electricaferrer.es/pedido/so%2Fwith%20spaces');
    expect(row?.querySelector('.document-link--holded')?.getAttribute('href'))
      .toBe('https://app.holded.com/sales/orders#open:salesorder-so-1');
    expect(row?.querySelector('.document-link--ef')?.getAttribute('aria-label'))
      .toBe('Abrir PV-1 en Eléctrica Ferrer (pestaña nueva)');
    expect(row?.querySelector('.document-link--holded')?.getAttribute('aria-label'))
      .toBe('Abrir PV-1 en Holded (pestaña nueva)');
    expect(row?.querySelector('.document-link--ef img')?.getAttribute('src')).toBe('/icons/ef-app.png');
    expect(row?.querySelector('.document-link--holded img')?.getAttribute('src')).toBe('/icons/holded-app.jpg');
    expect(Array.from(links || []).every((link) => link.getAttribute('target') === '_blank')).toBe(true);
    expect(row?.querySelector('.document-link--ef')?.getAttribute('title'))
      .toBe('Abrir en la app de Eléctrica Ferrer');
    expect(row?.querySelector('.document-link--holded')?.getAttribute('title')).toBe('Abrir en Holded');
    expect(dom.window.getComputedStyle(row?.querySelector('.document-actions')).gap).toBe('6px');
    expect(dom.window.getComputedStyle(row?.querySelector('.document-app-icon')).width).toBe('28px');
  });

  it('keeps destination actions visible whenever any available pointer is coarse', () => {
    const { dom } = loadCardBack({ salesOrders: [], waybills: [], estimates: [] });
    const css = Array.from(dom.window.document.querySelectorAll('style'))
      .map((style) => style.textContent)
      .join('\n');

    expect(css).toContain('@media (hover: none), (any-pointer: coarse)');
  });

  it('keeps document times clear of always-visible touch actions', () => {
    const { dom } = loadCardBack({ salesOrders: [], waybills: [], estimates: [] });
    const css = Array.from(dom.window.document.querySelectorAll('style'))
      .map((style) => style.textContent)
      .join('\n');

    expect(css).toContain('.document-time { padding-right: 76px; }');
  });

  it('shows waybill approval labels (Sin aprobar / Aprobado)', async () => {
    const { dom } = loadCardBack({
      salesOrders: [],
      estimates: [],
      waybills: [
        { id: 'wb-1', type: 'waybills', documentNumber: 'ALB-1', workflowStatus: 'prepared', issueDate: '2026-07-10', projects: [] },
        { id: 'wb-2', type: 'waybills', documentNumber: 'ALB-2', workflowStatus: 'delivered', issueDate: '2026-07-11', projects: [] },
      ],
    });
    await waitForRender();
    expand(dom);
    dom.window.document.querySelector('[data-tab="waybills"]')?.click();
    await waitForRender();

    const text = contentText(dom);
    expect(text).toContain('Sin aprobar');
    expect(text).toContain('Aprobado');
    expect(text).not.toContain('Preparado');
  });

  it('groups consecutive documents by day and leaves only the hour on each row', async () => {
    const { dom } = loadCardBack({
      salesOrders: [],
      estimates: [],
      waybills: [
        {
          id: 'wb-1',
          type: 'waybills',
          documentNumber: 'ALB-1',
          workflowStatus: 'delivered',
          approvedAt: '2026-07-15T09:12:00',
          issueDate: '2026-07-15',
          projects: [],
        },
        {
          id: 'wb-2',
          type: 'waybills',
          documentNumber: 'ALB-2',
          workflowStatus: 'delivered',
          approvedAt: '2026-07-15T16:40:00',
          issueDate: '2026-07-15',
          projects: [],
        },
        {
          id: 'wb-3',
          type: 'waybills',
          documentNumber: 'ALB-3',
          workflowStatus: 'prepared',
          issueDate: '2026-07-14',
          projects: [],
        },
      ],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    const groups = dom.window.document.querySelectorAll('.document-day-group');
    expect(groups).toHaveLength(2);
    expect(Array.from(groups).map((group) => group.querySelector('.document-day-label')?.textContent))
      .toEqual([
        'Miércoles, 15 de julio de 2026',
        'Martes, 14 de julio de 2026',
      ]);
    expect(Array.from(groups).map((group) => group.querySelectorAll('.document-row').length))
      .toEqual([2, 1]);
    expect(Array.from(dom.window.document.querySelectorAll('.document-row .document-time'))
      .map((time) => time.textContent))
      .toEqual(['16:40', '09:12', '']);
    expect(groups[1].querySelector('.document-time')?.classList.contains('document-time--empty'))
      .toBe(true);
    expect(groups[1].querySelector('.document-time')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('sorts by the displayed day before grouping documents', async () => {
    const { dom } = loadCardBack({
      salesOrders: [],
      estimates: [],
      waybills: [
        { id: 'first-14', type: 'waybills', documentNumber: 'ALB-PRIMERO-14', workflowStatus: 'prepared', issueDate: '2026-07-15', approvedAt: '2026-07-14T09:00:00', projects: [] },
        { id: 'only-15', type: 'waybills', documentNumber: 'ALB-15', workflowStatus: 'prepared', issueDate: '2026-07-14', approvedAt: '2026-07-15T08:00:00', projects: [] },
        { id: 'second-14', type: 'waybills', documentNumber: 'ALB-SEGUNDO-14', workflowStatus: 'prepared', issueDate: '2026-07-13', approvedAt: '2026-07-14T16:00:00', projects: [] },
      ],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    const groups = dom.window.document.querySelectorAll('.document-day-group');
    expect(Array.from(groups).map((group) => group.querySelector('.document-day-label')?.textContent))
      .toEqual(['Miércoles, 15 de julio de 2026', 'Martes, 14 de julio de 2026']);
    expect(Array.from(groups[1].querySelectorAll('.document-number')).map((item) => item.textContent))
      .toEqual(['ALB-SEGUNDO-14', 'ALB-PRIMERO-14']);
  });

  it('opens the previews of the most recent work-report day by default and leaves older days unchanged', async () => {
    const { dom } = loadCardBack({
      salesOrders: [],
      estimates: [],
      waybills: [
        { id: 'newer', type: 'waybills', documentNumber: 'ALB-NUEVO', kind: 'labour', workflowStatus: 'prepared', issueDate: '2026-07-15', notes: 'Nota del último día', projects: [] },
        { id: 'older', type: 'waybills', documentNumber: 'ALB-ANTERIOR', kind: 'labour', workflowStatus: 'prepared', issueDate: '2026-07-14', notes: 'Nota anterior', projects: [] },
      ],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    const groups = dom.window.document.querySelectorAll('.document-day-group');
    const latestToggle = groups[0].querySelector('.document-preview-toggle');
    const olderToggle = groups[1].querySelector('.document-preview-toggle');
    const latestPreview = groups[0].querySelector('.document-preview');
    const olderPreview = groups[1].querySelector('.document-preview');

    expect(groups[0].querySelector('.document-day-toggle')).toBeNull();
    expect(latestToggle?.getAttribute('aria-expanded')).toBe('true');
    expect(latestToggle?.textContent).toContain('Ver menos');
    expect(latestPreview?.hasAttribute('hidden')).toBe(false);
    expect(olderToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(olderToggle?.textContent).toContain('Ver más');
    expect(olderPreview?.hasAttribute('hidden')).toBe(true);
  });

  it('keeps a manually collapsed latest work-report preview closed after the panel rerenders', async () => {
    const { dom, urls } = loadCardBack({
      salesOrders: [],
      invoices: [],
      estimates: [],
      waybills: [
        { id: 'latest', type: 'waybills', documentNumber: 'ALB-ULTIMO', kind: 'labour', workflowStatus: 'prepared', issueDate: '2026-07-15', notes: 'Nota del último día', attachmentsUrl: '/v2/documents/waybills/latest/attachments', projects: [] },
      ],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    dom.window.document.querySelector('.document-preview-toggle')?.click();
    expect(dom.window.document.querySelector('.document-preview-toggle')?.getAttribute('aria-expanded')).toBe('false');
    const attachmentRequests = urls.filter((url) => url.includes('/waybills/latest/attachments')).length;
    expect(attachmentRequests).toBe(1);

    selectDocumentTab(dom, 'invoices');
    await waitForRender();
    selectDocumentTab(dom, 'waybills');
    await waitForRender();

    expect(dom.window.document.querySelector('.document-preview-toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(dom.window.document.querySelector('.document-preview')?.hasAttribute('hidden')).toBe(true);
    expect(urls.filter((url) => url.includes('/waybills/latest/attachments'))).toHaveLength(attachmentRequests);
  });

  it('does not retain attachment metadata after the panel rerenders', async () => {
    const { dom, urls, requests } = loadCardBack({
      salesOrders: [],
      invoices: [],
      estimates: [],
      waybills: [
        { id: 'latest', type: 'waybills', documentNumber: 'ALB-ULTIMO', kind: 'labour', workflowStatus: 'prepared', issueDate: '2026-07-15', notes: 'Nota del último día', attachmentsUrl: '/v2/documents/waybills/latest/attachments', projects: [] },
      ],
    }, {
      attachments: [{ id: 'photo', name: 'parte.jpg', url: 'https://cdn.example.com/parte.jpg', mimeType: 'image/jpeg' }],
      attachmentDelayMs: 200,
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(dom.window.document.querySelector('.document-preview-toggle')?.getAttribute('aria-expanded')).toBe('true');
    expect(urls.filter((url) => url.includes('/waybills/latest/attachments'))).toHaveLength(1);

    selectDocumentTab(dom, 'invoices');
    selectDocumentTab(dom, 'waybills');
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(dom.window.document.querySelector('.document-preview-toggle')?.getAttribute('aria-expanded')).toBe('true');
    const preview = dom.window.document.querySelector('.document-preview');
    expect(preview?.querySelector('.document-preview-image-link')).not.toBeNull();
    expect(preview?.textContent).not.toContain('Cargando adjuntos…');
    expect(urls.filter((url) => url.includes('/waybills/latest/attachments'))).toHaveLength(2);
    expect(requests.find(({ url }) => url.includes('/waybills/latest/attachments'))?.init?.cache).toBe('no-store');
  });

  it('does not open previews by default on later work-report pages', async () => {
    const waybills = Array.from({ length: 11 }, (_, index) => ({
      id: `wb-${index + 1}`,
      type: 'waybills',
      documentNumber: `ALB-${index + 1}`,
      kind: 'labour',
      workflowStatus: 'prepared',
      issueDate: '2026-07-15',
      notes: `Nota ${index + 1}`,
      projects: [],
    }));
    const { dom } = loadCardBack({ salesOrders: [], estimates: [], waybills });
    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(dom.window.document.querySelector('.document-preview-toggle')?.getAttribute('aria-expanded')).toBe('true');
    dom.window.document.querySelector('.documents-page-button[aria-label="Página siguiente"]')?.click();
    await waitForRender();

    expect(dom.window.document.querySelector('.documents-page-label')?.textContent).toBe('Página 2');
    expect(dom.window.document.querySelector('.document-preview-toggle')?.getAttribute('aria-expanded')).toBe('false');
    expect(dom.window.document.querySelector('.document-preview')?.hasAttribute('hidden')).toBe(true);
  });

  it('renders work-report images in batches of five', async () => {
    const attachments = Array.from({ length: 11 }, (_, index) => ({
      id: `photo-${index + 1}`,
      name: `foto-${index + 1}.jpg`,
      url: `https://cdn.example.com/foto-${index + 1}.jpg`,
      mimeType: 'image/jpeg',
    }));
    const { dom } = loadCardBack({
      salesOrders: [],
      invoices: [],
      estimates: [],
      waybills: [
        { id: 'many-images', type: 'waybills', documentNumber: 'ALB-FOTOS', kind: 'labour', workflowStatus: 'prepared', issueDate: '2026-07-15', attachmentsUrl: '/v2/documents/waybills/many-images/attachments', projects: [] },
      ],
    }, { attachments });

    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(dom.window.document.querySelectorAll('.document-preview-image-link')).toHaveLength(5);
    const loadMore = dom.window.document.querySelector('.document-preview-load-more');
    expect(loadMore?.textContent).toContain('Cargar más');

    loadMore?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(dom.window.document.querySelectorAll('.document-preview-image-link')).toHaveLength(10);

    dom.window.document.querySelector('.document-preview-load-more')?.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true }),
    );
    expect(dom.window.document.querySelectorAll('.document-preview-image-link')).toHaveLength(11);
    expect(dom.window.document.querySelector('.document-preview-load-more')).toBeNull();
  });

  it('only omits a Pedido child day divider when it is immediately below its parent', async () => {
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1', {
        issueDate: '2026-07-14',
        waybills: [
          {
            id: 'wb-newer',
            type: 'waybills',
            documentNumber: 'ALB-16',
            kind: 'material',
            workflowStatus: 'prepared',
            issueDate: '2026-07-16',
            projects: [],
          },
          {
            id: 'wb-same-day',
            type: 'waybills',
            documentNumber: 'ALB-14',
            kind: 'material',
            workflowStatus: 'prepared',
            issueDate: '2026-07-14',
            projects: [],
          },
        ],
      })],
      estimates: [],
      waybills: [],
    });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    const relationGroups = dom.window.document.querySelectorAll('.relation-day-group');
    expect(relationGroups).toHaveLength(2);
    expect(Array.from(relationGroups).map((group) => group.querySelector('.relation-day-heading')?.textContent))
      .toEqual(['Jueves, 16 de julio de 2026', 'Martes, 14 de julio de 2026']);
    expect(relationGroups[1]?.classList.contains('relation-day-group--same-parent-day')).toBe(false);
    expect(relationGroups[1]?.querySelector('.related-waybill-number')?.textContent).toBe('ALB-14');
  });

  it('does not repeat a day divider for a Pedido child immediately below its parent', async () => {
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1', {
        issueDate: '2026-07-15',
        waybills: [{
          id: 'wb-1',
          type: 'waybills',
          documentNumber: 'ALB-1',
          kind: 'material',
          workflowStatus: 'prepared',
          issueDate: '2026-07-15',
          projects: [],
        }],
      })],
      estimates: [],
      waybills: [],
    });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    const relationGroup = dom.window.document.querySelector('.relation-day-group');
    expect(relationGroup?.classList.contains('relation-day-group--same-parent-day')).toBe(true);
    expect(relationGroup?.querySelector('.relation-day-heading')).toBeNull();
  });

  it('uses a quiet, accessible date divider that remains legible in dark mode', async () => {
    const { dom } = loadCardBack({
      salesOrders: [],
      estimates: [],
      waybills: [{
        id: 'wb-1',
        type: 'waybills',
        documentNumber: 'ALB-1',
        workflowStatus: 'prepared',
        issueDate: '2026-07-15',
        projects: [],
      }],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    const group = dom.window.document.querySelector('.document-day-group');
    const heading = group?.querySelector('.document-day-heading');
    const styles = dom.window.getComputedStyle(heading);
    const css = Array.from(dom.window.document.querySelectorAll('style'))
      .map((style) => style.textContent)
      .join('\n');

    expect(heading?.tagName).toBe('H4');
    expect(group?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(styles.display).toBe('flex');
    expect(styles.fontSize).toBe('11px');
    expect(styles.fontWeight).toBe('700');
    expect(styles.color).toBe('rgb(94, 108, 132)');
    expect(css).toContain('.document-day-heading::after');
    expect(css).toContain('.document-day-heading { color: #8c9bab; }');
  });

  it('calls the previous calendar day Ayer while keeping its full date', async () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const issueDate = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, '0'),
      String(yesterday.getDate()).padStart(2, '0'),
    ].join('-');
    const expectedDate = yesterday.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const { dom } = loadCardBack({
      salesOrders: [],
      estimates: [],
      waybills: [{
        id: 'wb-yesterday',
        type: 'waybills',
        documentNumber: 'ALB-AYER',
        workflowStatus: 'prepared',
        issueDate,
        projects: [],
      }],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(dom.window.document.querySelector('.document-day-label')?.textContent)
      .toBe(`Ayer, ${expectedDate}`);
  });

  it('calls the current calendar day Hoy while keeping its full date', async () => {
    const today = new Date();
    const issueDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    const expectedDate = today.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const { dom } = loadCardBack({
      salesOrders: [],
      estimates: [],
      waybills: [{
        id: 'wb-today',
        type: 'waybills',
        documentNumber: 'ALB-HOY',
        workflowStatus: 'prepared',
        issueDate,
        projects: [],
      }],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(dom.window.document.querySelector('.document-day-label')?.textContent)
      .toBe(`Hoy, ${expectedDate}`);
  });

  it('shows every work-report kind as a subtitle beneath its number', async () => {
    const kinds = [
      ['labour', 'Trabajo'],
      ['mixed', 'Trabajo con material'],
      ['extra', 'Trabajo extra'],
      ['unclassified', 'Sin clasificar'],
    ];
    const { dom } = loadCardBack({
      salesOrders: [],
      estimates: [],
      waybills: kinds.map(([kind], index) => ({
        id: `wb-${index + 1}`,
        type: 'waybills',
        documentNumber: `ALB-${index + 1}`,
        kind,
        workflowStatus: 'prepared',
        issueDate: '2026-07-10',
        projects: [],
      })),
    });
    await waitForRender();
    expand(dom);
    dom.window.document.querySelector('[data-tab="waybills"]')?.click();
    await waitForRender();

    const identities = dom.window.document.querySelectorAll('.document-waybill-identity');
    expect(identities).toHaveLength(kinds.length);
    kinds.forEach(([kind, label], index) => {
      expect(identities[index].children[0].classList.contains('document-number')).toBe(true);
      expect(identities[index].children[0].textContent).toBe(`ALB-${index + 1}`);
      expect(identities[index].children[1].classList.contains(`waybill-kind--${kind}`)).toBe(true);
      expect(identities[index].children[1].textContent).toBe(label);
    });
  });

  it('expands document notes and attachments from the action tray without embedding PDFs', async () => {
    const { dom, urls } = loadCardBack({
      salesOrders: [],
      estimates: [],
      waybills: [
        {
          id: 'wb-latest',
          type: 'waybills',
          documentNumber: 'ALB-SIN-VISTA',
          kind: 'labour',
          workflowStatus: 'delivered',
          issueDate: '2026-07-11',
          projects: [],
        },
        {
          id: 'wb-preview',
          type: 'waybills',
          documentNumber: 'ALB-PREVIEW',
          kind: 'labour',
          workflowStatus: 'delivered',
          issueDate: '2026-07-10',
          notes: 'Dejar el material junto al cuadro.\nAvisar al encargado.',
          internalNotes: 'Comprobar la firma antes de cerrar.',
          attachmentsUrl: '/v2/documents/waybills/wb-preview/attachments',
          projects: [],
        },
      ],
    }, {
      attachments: [
          {
            id: 'image-1',
            name: 'entrega.jpg',
            url: 'https://cdn.example.com/entrega.jpg',
            mimeType: 'image/jpeg',
            thumbnailUrl: 'https://cdn.example.com/entrega-thumb.jpg',
          },
          {
            id: 'pdf-1',
            name: 'albaran-firmado.pdf',
            url: 'https://cdn.example.com/albaran-firmado.pdf',
            mimeType: 'application/pdf',
          },
          {
            id: '2026-07-24 16.45.02 cuadro final.png',
            name: '2026-07-24 16.45.02 cuadro final.png',
            url: '/v2/documents/waybills/wb-preview/attachments/2026-07-24%2016.45.02%20cuadro%20final.png?name=cuadro+final.png&source=https%3A%2F%2Fapi.app.electricaferrer.es%2Finternal%2Fv1%2Fwaybills%2Fwb-preview%2Fattachments%2F2026-07-24%252016.45.02%2520cuadro%2520final.png',
            mimeType: 'image/png',
          },
        ],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    const toggle = dom.window.document.querySelector('.document-preview-toggle');
    const preview = dom.window.document.querySelector('.document-preview');
    expect(toggle?.textContent?.trim()).toBe('Ver más');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(preview?.hasAttribute('hidden')).toBe(true);
    expect(urls.some((url) => url.includes('/waybills/wb-preview/attachments'))).toBe(false);

    toggle?.click();
    await waitForRender();

    expect(toggle?.textContent?.trim()).toBe('Ver menos');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(preview?.hasAttribute('hidden')).toBe(false);
    expect(preview?.getAttribute('data-static-motion')).toBe('true');
    expect(preview?.textContent).toContain('Notas');
    expect(preview?.textContent).toContain('Dejar el material junto al cuadro.');
    expect(preview?.textContent).toContain('Internas');
    expect(preview?.textContent).toContain('Comprobar la firma antes de cerrar.');

    const notes = preview?.querySelector('.document-preview-notes');
    const noteSections = notes?.querySelectorAll('.document-preview-note');
    const internalNote = noteSections?.[0];
    const waybillNote = noteSections?.[1];
    expect(notes).not.toBeNull();
    expect(noteSections).toHaveLength(2);
    expect(notes?.querySelectorAll('.document-preview-label')[0]?.textContent).toBe('Internas');
    expect(notes?.querySelectorAll('.document-preview-label')[1]?.textContent).toBe('Notas');
    expect(internalNote?.classList.contains('document-preview-note--secondary')).toBe(false);
    expect(waybillNote?.classList.contains('document-preview-note--secondary')).toBe(true);
    expect(dom.window.getComputedStyle(notes).backgroundColor).toBe('rgb(241, 242, 244)');
    expect(dom.window.getComputedStyle(internalNote).borderLeftWidth).toBe('0px');
    expect(dom.window.getComputedStyle(internalNote).backgroundColor).toBe('transparent');
    expect(dom.window.getComputedStyle(internalNote?.querySelector('.document-preview-text')).color)
      .toBe('rgb(68, 84, 111)');
    expect(dom.window.getComputedStyle(waybillNote?.querySelector('.document-preview-text')).color)
      .toBe('rgb(98, 111, 134)');

    const previewStyles = dom.window.getComputedStyle(preview);
    expect(previewStyles.marginLeft).toBe('0px');
    expect(previewStyles.marginRight).toBe('0px');
    expect(previewStyles.borderLeftWidth).toBe('1px');
    expect(previewStyles.borderLeftColor).not.toBe('rgb(87, 157, 255)');

    const imageLink = preview?.querySelector('.document-preview-image-link');
    expect(imageLink?.getAttribute('href')).toBe('https://cdn.example.com/entrega.jpg');
    expect(imageLink?.getAttribute('target')).toBe('_blank');
    expect(imageLink?.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/entrega-thumb.jpg');
    expect(imageLink?.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    expect(preview?.querySelectorAll('.document-preview-image-link')).toHaveLength(2);
    expect(preview?.querySelector('.document-preview-images-heading')?.textContent).toBe('Imágenes · 2');
    expect(preview?.querySelector('.document-preview-files-heading')?.textContent).toBe('Archivos · 1');
    const proxiedImage = preview?.querySelectorAll('.document-preview-image-link')[1];
    expect(proxiedImage?.getAttribute('href')).toContain(
      'https://holded-proxy.electricaferrer.workers.dev/v2/documents/waybills/wb-preview/attachments/2026-07-24%2016.45.02%20cuadro%20final.png',
    );
    expect(dom.window.getComputedStyle(imageLink?.querySelector('img')).objectFit).toBe('contain');
    expect(urls.some((url) => url.includes('/waybills/wb-preview/attachments'))).toBe(true);

    const pdfLink = preview?.querySelector('.document-preview-file--pdf');
    expect(pdfLink?.getAttribute('href')).toBe('https://cdn.example.com/albaran-firmado.pdf');
    expect(pdfLink?.getAttribute('target')).toBe('_blank');
    expect(preview?.querySelector('iframe, embed, object')).toBeNull();

    const rowTime = dom.window.document.querySelector('.document-row .document-time');
    const previewDate = preview?.querySelector('.document-preview-date');
    expect(rowTime?.textContent).toBe('');
    expect(rowTime?.getAttribute('aria-hidden')).toBe('true');
    expect(previewDate?.textContent).toBe('10/07/2026');
    expect(preview?.lastElementChild).toBe(previewDate);

    toggle?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(preview?.getAttribute('data-static-motion')).toBe('false');
    const css = Array.from(dom.window.document.querySelectorAll('style'))
      .map((style) => style.textContent)
      .join('\n');
    expect(css).toContain('animation: document-preview-content-in 180ms cubic-bezier(0.23, 1, 0.32, 1) both');
    expect(css).toContain('> .document-preview-attachments { animation: none; }');
  });

  it('offers the same preview control for sales orders, purchase orders, invoices and estimates', async () => {
    const withPreview = {
      notes: null,
      internalNotes: null,
      attachmentsUrl: '/v2/documents/shared/document-id/attachments',
    };
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-preview', 'PV-PREVIEW', {
        ...withPreview,
        purchaseOrders: [{
          id: 'po-preview',
          type: 'purchase-orders',
          documentNumber: 'PC-PREVIEW',
          internalStatus: 'awaiting_receipt',
          supplier: { id: 'supplier-1', name: 'Rexel' },
          projects: [],
          ...withPreview,
        }],
      })],
      waybills: [],
      invoices: [{
        id: 'invoice-preview',
        type: 'invoices',
        documentNumber: 'F-PREVIEW',
        displayStatus: 'paid',
        issueDate: '2026-07-11',
        amounts: { total: '100', pending: '0', currency: 'EUR' },
        projects: [],
        ...withPreview,
      }],
      estimates: [{
        id: 'estimate-preview',
        type: 'estimates',
        documentNumber: 'PRE-PREVIEW',
        displayStatus: 'sent',
        issueDate: '2026-07-11',
        total: 100,
        currency: 'EUR',
        projects: [],
        ...withPreview,
      }],
    });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(dom.window.document.querySelector('.document-row .document-preview-toggle')).not.toBeNull();
    expect(dom.window.document.querySelector('.purchase-order-row .document-preview-toggle')).not.toBeNull();
    const nestedPreview = dom.window.document.querySelector('.relation-day-group > .document-preview');
    const nestedPreviewStyles = dom.window.getComputedStyle(nestedPreview);
    expect(nestedPreviewStyles.marginLeft).toBe('-20px');
    expect(nestedPreviewStyles.width).toBe('calc(100% + 20px)');

    dom.window.document.querySelector('[data-tab="invoices"]')?.click();
    await waitForRender();
    expect(dom.window.document.querySelector('.document-row .document-preview-toggle')).not.toBeNull();

    dom.window.document.querySelector('[data-tab="estimates"]')?.click();
    await waitForRender();
    expect(dom.window.document.querySelector('.document-row .document-preview-toggle')).not.toBeNull();
  });

  it('classifies top-level and related document rows with an icon at the left edge', async () => {
    const waybillKinds = ['material', 'labour', 'mixed', 'extra', 'refund', 'unclassified'];
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1', {
        approvedAt: '2026-07-14T08:45:00',
        waybills: [{
          id: 'related-waybill',
          type: 'waybills',
          documentNumber: 'ALB-REL',
          kind: 'refund',
          workflowStatus: 'prepared',
          issueDate: '2026-07-15',
          projects: [],
        }],
        purchaseOrders: [{
          id: 'po-1',
          type: 'purchase-orders',
          documentNumber: 'PC-1',
          internalStatus: 'awaiting_receipt',
          supplier: { id: 'supplier-1', name: 'Rexel' },
          projects: [],
        }],
      })],
      waybills: waybillKinds.map((kind, index) => ({
        id: `wb-${index + 1}`,
        type: 'waybills',
        documentNumber: `ALB-${index + 1}`,
        kind,
        workflowStatus: 'prepared',
        issueDate: '2026-07-10',
        projects: [],
      })),
      invoices: [{
        id: 'invoice-1',
        type: 'invoices',
        documentNumber: 'F-1',
        displayStatus: 'paid',
        issueDate: '2026-07-11',
        amounts: { total: '100', pending: '0', currency: 'EUR' },
        projects: [],
      }],
      estimates: [{
        id: 'estimate-1',
        type: 'estimates',
        documentNumber: 'PRE-1',
        displayStatus: 'sent',
        issueDate: '2026-07-12',
        total: 100,
        currency: 'EUR',
        projects: [],
      }],
    });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    const salesOrderRow = dom.window.document.querySelector('.document-row');
    const salesOrderIcon = salesOrderRow?.firstElementChild;
    expect(salesOrderIcon?.classList.contains('document-kind-icon')).toBe(true);
    expect(salesOrderIcon?.getAttribute('src')).toBe('/icons/document-kinds/sales-order.svg');
    expect(salesOrderIcon?.getAttribute('alt')).toBe('');
    expect(salesOrderIcon?.getAttribute('aria-hidden')).toBe('true');
    expect(dom.window.getComputedStyle(salesOrderIcon).width).toBe('26px');
    expect(dom.window.getComputedStyle(salesOrderIcon).height).toBe('26px');
    expect(dom.window.getComputedStyle(salesOrderIcon).borderRadius).toBe('5px');
    expect(dom.window.getComputedStyle(salesOrderRow).minHeight).toBe('36px');
    expect(dom.window.getComputedStyle(salesOrderRow?.querySelector('.document-number')).color)
      .toBe('rgb(68, 84, 111)');
    expect(dom.window.document.querySelector('.document-day-label')?.textContent)
      .toBe('Martes, 14 de julio de 2026');
    expect(salesOrderRow?.querySelector('.document-time')?.textContent).toBe('08:45');

    const relatedWaybillRow = dom.window.document.querySelector('.related-waybill-row');
    const relatedWaybillIcon = relatedWaybillRow?.firstElementChild;
    expect(relatedWaybillIcon?.getAttribute('src')).toBe('/icons/document-kinds/waybill-refund.svg');
    expect(dom.window.getComputedStyle(relatedWaybillIcon).width).toBe('24px');
    expect(dom.window.getComputedStyle(relatedWaybillIcon).height).toBe('24px');
    expect(dom.window.getComputedStyle(relatedWaybillIcon).borderRadius).toBe('4px');
    expect(dom.window.getComputedStyle(relatedWaybillRow).minHeight).toBe('36px');
    expect(dom.window.getComputedStyle(relatedWaybillRow?.querySelector('.related-waybill-number')).color)
      .toBe('rgb(68, 84, 111)');

    const purchaseOrderRow = dom.window.document.querySelector('.purchase-order-row');
    expect(purchaseOrderRow?.firstElementChild?.getAttribute('src'))
      .toBe('/icons/document-kinds/purchase-order.svg');
    expect(dom.window.getComputedStyle(purchaseOrderRow).minHeight).toBe('34px');
    expect(dom.window.getComputedStyle(purchaseOrderRow?.querySelector('.purchase-order-number')).color)
      .toBe('rgb(68, 84, 111)');

    dom.window.document.querySelector('[data-tab="waybills"]')?.click();
    await waitForRender();
    expect(Array.from(dom.window.document.querySelectorAll('.document-row .document-kind-icon'))
      .map((icon) => icon.getAttribute('src')))
      .toEqual(['labour', 'mixed', 'extra', 'unclassified']
        .map((kind) => `/icons/document-kinds/waybill-${kind}.svg`));

    dom.window.document.querySelector('[data-tab="invoices"]')?.click();
    await waitForRender();
    expect(dom.window.document.querySelector('.document-row .document-kind-icon')?.getAttribute('src'))
      .toBe('/icons/document-kinds/invoice.svg');

    dom.window.document.querySelector('[data-tab="estimates"]')?.click();
    await waitForRender();
    expect(dom.window.document.querySelector('.document-row .document-kind-icon')?.getAttribute('src'))
      .toBe('/icons/document-kinds/estimate.svg');
  });

  it('uses a solid light-blue background for the sales-order icon', () => {
    const salesOrderIcon = readFileSync(resolve(__dirname, '../public/icons/document-kinds/sales-order.svg'), 'utf8');

    expect(salesOrderIcon).toContain('<rect width="42" height="42" rx="8" fill="#E0E7FF"/>');
  });

  it('shows estimate displayStatus labels (Aceptado / Denegado)', async () => {
    const { dom } = loadCardBack({
      salesOrders: [],
      waybills: [],
      estimates: [
        { id: 'est-1', type: 'estimates', documentNumber: 'PRE-1', displayStatus: 'accepted', sentAt: '2026-07-01T12:05:00', issueDate: '2026-07-01', total: 1234.56, currency: 'EUR', projects: [] },
        { id: 'est-2', type: 'estimates', documentNumber: 'PRE-2', displayStatus: 'rejected', issueDate: '2026-07-02', total: 50, currency: 'EUR', projects: [] },
      ],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();
    dom.window.document.querySelector('[data-tab="estimates"]')?.click();
    await waitForRender();

    const text = contentText(dom);
    expect(text).toContain('Aceptado');
    expect(text).toContain('Denegado');
    expect(text).toContain('1.234,56 €');
    expect(text).not.toContain('Completado');
    expect(Array.from(dom.window.document.querySelectorAll('.document-day-label')).map((label) => label.textContent))
      .toEqual(['Jueves, 2 de julio de 2026', 'Miércoles, 1 de julio de 2026']);
    expect(Array.from(dom.window.document.querySelectorAll('.document-row .document-time')).map((time) => time.textContent))
      .toEqual(['', '12:05']);
  });

  it('shows currency symbols instead of three-letter codes for estimate totals', async () => {
    const { dom } = loadCardBack({
      salesOrders: [],
      waybills: [],
      estimates: [
        { id: 'est-eur', type: 'estimates', documentNumber: 'PRE-EUR', displayStatus: 'sent', issueDate: '2026-07-01', total: 1234.56, currency: 'eur', projects: [] },
        { id: 'est-usd', type: 'estimates', documentNumber: 'PRE-USD', displayStatus: 'sent', issueDate: '2026-07-02', total: 50, currency: 'USD', projects: [] },
      ],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();
    dom.window.document.querySelector('[data-tab="estimates"]')?.click();
    await waitForRender();

    const totals = Array.from(dom.window.document.querySelectorAll('.document-total'))
      .map((element) => element.textContent);
    expect(totals).toEqual(['50,00 $', '1.234,56 €']);
  });

  it('shows invoices for the card-linked customer and project with status and exact amounts', async () => {
    const { dom, urls } = loadCardBack({
      salesOrders: [],
      waybills: [],
      estimates: [],
      invoices: [{
        id: 'invoice-1',
        type: 'invoices',
        documentNumber: 'F-26-000321',
        url: 'https://app.holded.com/sales/revenue#open:invoice-invoice-1',
        issueDate: '2026-07-15',
        approvedAt: '2026-07-15T09:00:00',
        dueDate: '2026-08-15',
        displayStatus: 'partial',
        lifecycleStatus: 'issued',
        collectionStatus: 'partial',
        isOverdue: false,
        amounts: {
          total: '1210.00',
          paid: '210.00',
          pending: '1000.00',
          currency: 'EUR',
        },
        projects: [{ id: 'project-1', name: 'Obra', color: null }],
        sourceDocuments: [],
      }],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();
    dom.window.document.querySelector('[data-tab="invoices"]')?.click();
    await waitForRender();

    const row = dom.window.document.querySelector('.document-row');
    expect(row?.querySelectorAll('.document-link')).toHaveLength(1);
    expect(row?.querySelector('.document-link--ef')).toBeNull();
    expect(row?.querySelector('.document-link--holded')?.getAttribute('href'))
      .toBe('https://app.holded.com/sales/revenue#open:invoice-invoice-1');
    expect(row?.textContent).toContain('F-26-000321');
    expect(row?.textContent).toContain('Parcial');
    expect(row?.textContent).toContain('1.210,00 €');
    expect(row?.textContent).toContain('Pendiente 1.000,00 €');
    expect(dom.window.document.querySelector('.document-day-label')?.textContent)
      .toBe('Miércoles, 15 de julio de 2026');
    expect(row?.querySelector('.document-time')?.textContent).toBe('09:00');

    const invoiceCall = urls.find((url) => url.includes('type=invoices'));
    expect(invoiceCall).toContain('contactId=contact-1');
    expect(invoiceCall).toContain('scope=matched');
    expect(invoiceCall).toContain('projectId=project-1');
    expect(invoiceCall).toContain('page=1');
  });

  it('offers Proyecto vinculado | Todos (no counts) and drops projectId in Todos', async () => {
    const { dom, urls } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1')],
      waybills: [],
      estimates: [],
      all: {
        salesOrders: [
          salesOrder('so-1', 'PV-1'),
          salesOrder('so-2', 'PV-2', { projects: [{ id: 'project-2', name: 'Otra obra', color: null }] }),
        ],
        waybills: [],
        estimates: [],
      },
    });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(Array.from(dom.window.document.querySelectorAll('.documents-scope-button')).map((b) => b.textContent?.trim()))
      .toEqual(['Proyecto vinculado', 'Todos']);
    expect(contentText(dom)).toContain('PV-1');
    expect(contentText(dom)).not.toContain('PV-2');

    dom.window.document.querySelector('[data-document-scope="all"]')?.click();
    await waitForRender();

    const text = contentText(dom);
    expect(text).toContain('PV-1');
    expect(text).toContain('PV-2');
    expect(text).toContain('Otra obra'); // muted project chip on the off-project row
    expect(dom.window.document.querySelectorAll('.document-list')).toHaveLength(1);

    const matchedCall = urls.find((u) => u.includes('type=sales-orders') && u.includes('scope=matched'));
    const allCall = urls.find((u) => u.includes('type=sales-orders') && u.includes('scope=all'));
    expect(matchedCall).toContain('projectId=project-1');
    expect(allCall).not.toContain('projectId=');
  });

  it('omits the scope toggle when there is no linked project', async () => {
    const { dom } = loadCardBack({ salesOrders: [salesOrder('so-1', 'PV-1')], waybills: [], estimates: [] }, { projectId: null });
    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(dom.window.document.querySelector('.documents-scope')).toBeNull();
    expect(contentText(dom)).toContain('Este cliente');
  });

  it('paginates offset tabs with ‹ Página N › driven by hasMore, without totals', async () => {
    const salesOrders = Array.from({ length: 23 }, (_, index) => salesOrder(`so-${index + 1}`, `PV-${index + 1}`));
    const { dom } = loadCardBack({ salesOrders, waybills: [], estimates: [] });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(dom.window.document.querySelectorAll('.document-row')).toHaveLength(10);
    expect(dom.window.document.querySelector('.documents-page-label')?.textContent).toBe('Página 1');
    expect(dom.window.document.querySelector('.documents-range')).toBeNull();
    expect(dom.window.document.querySelector('.documents-count')).toBeNull();
    expect(dom.window.document.querySelector('.documents-page-button[aria-label="Página anterior"]')?.disabled).toBe(true);
    expect(dom.window.document.querySelector('.documents-page-button[aria-label="Página siguiente"]')?.disabled).toBe(false);

    dom.window.document.querySelector('.documents-page-button[aria-label="Página siguiente"]')?.click();
    await waitForRender();

    expect(dom.window.document.querySelector('.documents-page-label')?.textContent).toBe('Página 2');
    const numbers = Array.from(dom.window.document.querySelectorAll('.document-number')).map((el) => el.textContent);
    expect(numbers).toContain('PV-11');
    expect(numbers).not.toContain('PV-1');
  });

  it('hides pagination when a single short page fits', async () => {
    const { dom } = loadCardBack({ salesOrders: [salesOrder('so-1', 'PV-1')], waybills: [], estimates: [] });
    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(dom.window.document.querySelector('.documents-pagination')).toBeNull();
  });

  it('walks estimates by cursor and returns to the previous page', async () => {
    const estimates = Array.from({ length: 15 }, (_, index) => ({
      id: `est-${index + 1}`,
      type: 'estimates',
      documentNumber: `PRE-${index + 1}`,
      displayStatus: 'sent',
      issueDate: '2026-07-01',
      total: 10,
      currency: 'EUR',
      projects: [],
    }));
    const { dom, urls } = loadCardBack({ salesOrders: [], waybills: [], estimates });
    await waitForRender();
    expand(dom);
    await waitForRender();
    dom.window.document.querySelector('[data-tab="estimates"]')?.click();
    await waitForRender();

    expect(dom.window.document.querySelector('.documents-page-label')?.textContent).toBe('Página 1');
    dom.window.document.querySelector('.documents-page-button[aria-label="Página siguiente"]')?.click();
    await waitForRender();

    expect(dom.window.document.querySelector('.documents-page-label')?.textContent).toBe('Página 2');
    expect(contentText(dom)).toContain('PRE-11');
    expect(urls.some((u) => u.includes('type=estimates') && u.includes('cursor=10'))).toBe(true);
    expect(dom.window.document.querySelector('.documents-page-button[aria-label="Página siguiente"]')?.disabled).toBe(true);

    dom.window.document.querySelector('.documents-page-button[aria-label="Página anterior"]')?.click();
    await waitForRender();
    expect(dom.window.document.querySelector('.documents-page-label')?.textContent).toBe('Página 1');
    expect(contentText(dom)).toContain('PRE-1');
  });

  it('shows a sync message and retry on DATA_NOT_READY', async () => {
    const { dom } = loadCardBack({ salesOrders: [salesOrder('so-1', 'PV-1')], waybills: [], estimates: [] }, { dataNotReady: true });
    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(contentText(dom)).toContain('Sincronizando datos de Holded');
    expect(dom.window.document.querySelector('.documents-retry')).not.toBeNull();
  });

  it('nests purchase orders under their sales order as tree children with a Holded deep link', async () => {
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1', {
        purchaseOrders: [{
          id: 'po-1',
          type: 'purchase-orders',
          documentNumber: 'PC-1',
          internalStatus: 'awaiting_receipt',
          issueDate: '2026-07-13',
          approvedAt: '2026-07-13T09:17:00',
          supplier: { id: 's1', name: 'Rexel' },
          total: 250,
          currency: 'EUR',
          url: 'https://app.holded.com/sales/orders#open:order-po-1',
          projects: [],
        }],
      })],
      waybills: [],
      estimates: [],
    });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    const subRow = dom.window.document.querySelector('.purchase-order-row');
    expect(subRow).not.toBeNull();
    expect(subRow.querySelector('.document-link--ef')?.getAttribute('href'))
      .toBe('https://app.electricaferrer.es/pedido-compra/po-1');
    expect(subRow.querySelector('.document-link--holded')?.getAttribute('href'))
      .toBe('https://app.holded.com/sales/orders#open:order-po-1');
    const identity = subRow.querySelector('.purchase-order-identity');
    expect(identity?.children[0].classList.contains('purchase-order-number')).toBe(true);
    expect(identity?.children[1].classList.contains('purchase-order-supplier')).toBe(true);
    expect(identity?.children[1].textContent).toBe('Rexel');
    expect(identity?.nextElementSibling?.classList.contains('document-pill')).toBe(true);
    expect(identity?.nextElementSibling?.textContent).toBe('Pendiente recibir');
    expect(dom.window.getComputedStyle(identity?.nextElementSibling).justifySelf).toBe('start');
    expect(subRow.querySelector('.document-time')?.textContent).toBe('09:17');
    expect(dom.window.document.querySelector('.relation-day-label')?.textContent)
      .toBe('Lunes, 13 de julio de 2026');
    const text = contentText(dom);
    expect(text).toContain('PC-1');
    expect(text).toContain('Rexel');
    expect(text).toContain('Pendiente recibir');

    // Purchase orders remain nested; Partes de trabajo is the first top-level tab.
    expect(Array.from(dom.window.document.querySelectorAll('.documents-tab')).map((t) => t.textContent?.trim()))
      .toEqual(['Partes de trabajo', 'Pedidos', 'Facturas', 'Presupuestos']);
  });

  it('shows muted kind subtitles, status beside the identity, and dates on related waybills', async () => {
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1', {
        waybills: [
          {
            id: 'wb-1',
            type: 'waybills',
            documentNumber: 'ALB-1',
            kind: 'material',
            workflowStatus: 'delivered',
            approvedAt: '2026-07-16T14:25:00',
            issueDate: '2026-07-15',
            url: 'https://app.holded.com/sales/waybills#open:waybill-wb-1',
            sourceOrder: { id: 'so-1', docNumber: 'PV-1' },
            projects: [],
          },
          {
            id: 'wb-2',
            type: 'waybills',
            documentNumber: 'ALB-2',
            kind: 'refund',
            workflowStatus: 'prepared',
            approvedAt: null,
            issueDate: '2026-07-16',
            url: 'https://app.holded.com/sales/waybills#open:waybill-wb-2',
            sourceOrder: { id: 'so-1', docNumber: 'PV-1' },
            projects: [],
          },
        ],
      })],
      waybills: [],
      estimates: [],
    });
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    const rows = dom.window.document.querySelectorAll('.related-waybill-row');
    expect(rows).toHaveLength(2);
    const materialMain = rows[0].querySelector('.related-waybill-main');
    expect(materialMain?.children[0].classList.contains('related-waybill-identity')).toBe(true);
    expect(materialMain?.children[1].classList.contains('document-pill')).toBe(true);
    expect(materialMain?.children[1].textContent).toBe('Aprobado');
    const materialIdentity = materialMain?.children[0];
    expect(materialIdentity?.children[0].classList.contains('related-waybill-number')).toBe(true);
    expect(materialIdentity?.children[0].textContent).toContain('ALB-1');
    expect(materialIdentity?.children[1].classList.contains('waybill-kind--material')).toBe(true);
    expect(materialIdentity?.children[1].textContent).toContain('Material');
    expect(dom.window.getComputedStyle(materialIdentity?.children[1]).color).toBe('rgb(107, 119, 140)');
    expect(rows[0].textContent).toContain('Aprobado');
    expect(dom.window.document.querySelector('.relation-day-label')?.textContent)
      .toBe('Jueves, 16 de julio de 2026');
    expect(rows[0].querySelector('.document-time')?.textContent).toBe('14:25');
    expect(rows[0].querySelector('.document-link--ef')?.getAttribute('href'))
      .toBe('https://app.electricaferrer.es/albaran/wb-1');
    expect(rows[0].querySelector('.document-link--holded')?.getAttribute('href'))
      .toBe('https://app.holded.com/sales/waybills#open:waybill-wb-1');
    const refundMain = rows[1].querySelector('.related-waybill-main');
    expect(refundMain?.children[1].classList.contains('document-pill')).toBe(true);
    expect(refundMain?.children[1].textContent).toBe('Sin aprobar');
    const refundIdentity = refundMain?.children[0];
    expect(refundIdentity?.children[0].textContent).toContain('ALB-2');
    expect(refundIdentity?.children[1].classList.contains('waybill-kind--refund')).toBe(true);
    expect(refundIdentity?.children[1].textContent).toContain('Devolución');
    expect(dom.window.getComputedStyle(refundIdentity?.children[1]).color).toBe('rgb(107, 119, 140)');
    expect(rows[1].textContent).toContain('Sin aprobar');
    expect(rows[1].querySelector('.document-time')?.textContent).toBe('');
    expect(rows[1].querySelector('.document-time')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps sales orders visible and warns quietly when purchase orders fail to load', async () => {
    const { dom } = loadCardBack(
      { salesOrders: [salesOrder('so-1', 'PV-1')], waybills: [], estimates: [] },
      { purchaseOrdersError: true },
    );
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(contentText(dom)).toContain('PV-1');
    expect(contentText(dom)).toContain('No se pudieron cargar las compras.');
  });

  it('keeps sales orders visible and warns when waybills fail to load in Pedidos', async () => {
    const { dom } = loadCardBack(
      { salesOrders: [salesOrder('so-1', 'PV-1')], waybills: [], estimates: [] },
      { waybillsError: true },
    );
    await waitForRender();
    expand(dom);
    selectDocumentTab(dom, 'salesOrders');
    await waitForRender();

    expect(contentText(dom)).toContain('PV-1');
    expect(contentText(dom)).toContain('No se pudieron cargar los albaranes.');
  });

  it('moves focus and lazy-loads document tabs with the arrow keys', async () => {
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1')],
      estimates: [],
      waybills: [{ id: 'wb-1', type: 'waybills', documentNumber: 'ALB-1', workflowStatus: 'prepared', issueDate: '2026-07-10', projects: [] }],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    const waybillTab = dom.window.document.querySelector('[data-tab="waybills"]');
    waybillTab?.focus();
    waybillTab?.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await waitForRender();
    const salesTab = dom.window.document.querySelector('[data-tab="salesOrders"]');
    expect(salesTab?.getAttribute('aria-selected')).toBe('true');
    expect(salesTab?.tabIndex).toBe(0);
    expect(dom.window.document.activeElement).toBe(salesTab);
    expect(contentText(dom)).toContain('PV-1');
  });

  it('announces a stable loading panel while a document page is pending', async () => {
    const { dom } = loadCardBack(
      {
        salesOrders: [],
        waybills: [{
          id: 'wb-1',
          type: 'waybills',
          documentNumber: 'ALB-1',
          workflowStatus: 'prepared',
          issueDate: '2026-07-10',
          projects: [],
        }],
        estimates: [],
      },
      { documentDelayMs: 200 },
    );
    await waitForRender();
    expand(dom);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const pendingPanel = dom.window.document.querySelector('#documents-panel');
    expect(pendingPanel?.getAttribute('aria-busy')).toBe('true');
    expect(pendingPanel?.textContent).toContain('Cargando partes de trabajo');
    expect(pendingPanel?.querySelectorAll('.documents-skeleton-row')).toHaveLength(3);

    await new Promise((resolve) => setTimeout(resolve, 220));

    const loadedPanel = dom.window.document.querySelector('#documents-panel');
    expect(loadedPanel?.getAttribute('aria-busy')).toBe('false');
    expect(loadedPanel?.querySelectorAll('.documents-skeleton-row')).toHaveLength(0);
    expect(loadedPanel?.textContent).toContain('ALB-1');
  });

  it('shows always-visible link placeholders and opens the link popups when nothing is linked', async () => {
    const { dom, popupCalls } = loadCardBack(
      { salesOrders: [], waybills: [], estimates: [] },
      { contactId: null, projectId: null },
    );
    await waitForRender();

    const addButtons = Array.from(dom.window.document.querySelectorAll('.tag-add'));
    expect(addButtons.map((b) => b.textContent?.trim())).toEqual(['Vincula un cliente', 'Vincula un proyecto']);
    // No documents section without a linked contact.
    expect(dom.window.document.querySelector('#documents')).toBeNull();

    addButtons[0].click();
    addButtons[1].click();
    expect(popupCalls[0].url).toBe('./src/popups/search-contact.html');
    expect(popupCalls[1].url).toBe('./src/popups/search-project.html');
    expect(popupCalls[0].mouseEvent).toBeTruthy();
    expect(popupCalls[1].mouseEvent).toBeTruthy();
  });

  it('shows the client chip alongside the project placeholder when only the contact is linked', async () => {
    const { dom, popupCalls } = loadCardBack(
      { salesOrders: [], waybills: [], estimates: [] },
      { projectId: null },
    );
    await waitForRender();

    expect(dom.window.document.querySelector('.tag-contact')).not.toBeNull();
    const placeholders = Array.from(dom.window.document.querySelectorAll('.tag-add'));
    expect(placeholders.map((b) => b.textContent?.trim())).toEqual(['Vincula un proyecto']);

    placeholders[0].click();
    expect(popupCalls[0].url).toBe('./src/popups/search-project.html');
  });

  it('opens the unlink popup for the contact and the project close buttons', async () => {
    const { dom, popupCalls } = loadCardBack({ salesOrders: [], waybills: [], estimates: [] });
    await waitForRender();

    dom.window.document.querySelector('.tag-close[data-field="contact"]')?.click();
    dom.window.document.querySelector('.tag-close[data-field="project"]')?.click();

    expect(popupCalls).toHaveLength(2);
    expect(popupCalls[0].url).toBe('./src/popups/unlink.html?field=contact');
    expect(popupCalls[1].url).toBe('./src/popups/unlink.html?field=project');
    expect(popupCalls[0].title).toContain('cliente');
    expect(popupCalls[1].title).toContain('proyecto');
    // Opening a popup from inside an iframe requires the mouse event, or Trello rejects it.
    expect(popupCalls[0].mouseEvent).toBeTruthy();
    expect(popupCalls[1].mouseEvent).toBeTruthy();
  });

  it('uses a customer-wide empty message in the Todos scope', async () => {
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1')],
      waybills: [],
      estimates: [],
      all: { salesOrders: [], waybills: [], estimates: [] },
    });
    await waitForRender();
    expand(dom);
    await waitForRender();
    dom.window.document.querySelector('[data-document-scope="all"]')?.click();
    await waitForRender();

    expect(dom.window.document.querySelector('.documents-note')?.textContent)
      .toBe('Este cliente no tiene partes de trabajo.');
  });
});
