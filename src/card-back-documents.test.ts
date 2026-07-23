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

// Mirrors the worker's /v2/documents/search response shape.
function buildDocumentsPage(documents, requestUrl, options) {
  const url = new URL(requestUrl);
  const type = url.searchParams.get('type');
  const scope = url.searchParams.get('scope') || 'matched';
  const key = TYPE_TO_KEY[type] || 'salesOrders';
  const source = scope === 'all' ? (documents.all || documents) : documents;
  const items = source[key] || [];

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
      window.confirm = () => options.confirmUnlink === true;
      window.fetch = async (url, init) => {
        const requestUrl = String(url);
        urls.push(requestUrl);
        requests.push({ url: requestUrl, init });

        if (requestUrl.includes('/v2/documents/search')) {
          if (options.documentDelayMs) {
            await new Promise((r) => setTimeout(r, options.documentDelayMs));
          }
          if (options.dataNotReady) {
            return new Response(JSON.stringify({ error: { code: 'DATA_NOT_READY', message: 'sync' } }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify(buildDocumentsPage(documents, requestUrl, options)), {
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
          render: () => undefined,
        }),
      };
    },
  });

  return { dom, urls, requests, setCalls, popupCalls, authState };
}

async function waitForRender() {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

function expand(dom) {
  dom.window.document.querySelector('#load-documents')?.click();
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
    await waitForRender();

    expect(contentText(dom)).toContain('Parcialmente preparado');
    expect(contentText(dom)).not.toContain('Completado');
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
    await waitForRender();
    dom.window.document.querySelector('[data-tab="waybills"]')?.click();
    await waitForRender();

    const text = contentText(dom);
    expect(text).toContain('Sin aprobar');
    expect(text).toContain('Aprobado');
    expect(text).not.toContain('Preparado');
  });

  it('shows estimate displayStatus labels (Aceptado / Denegado)', async () => {
    const { dom } = loadCardBack({
      salesOrders: [],
      waybills: [],
      estimates: [
        { id: 'est-1', type: 'estimates', documentNumber: 'PRE-1', displayStatus: 'accepted', issueDate: '2026-07-01', total: 1234.56, currency: 'EUR', projects: [] },
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
    expect(totals).toEqual(['1.234,56 €', '50,00 $']);
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
    expect(row?.textContent).toContain('#F-26-000321');
    expect(row?.textContent).toContain('Parcial');
    expect(row?.textContent).toContain('1.210,00 €');
    expect(row?.textContent).toContain('Pendiente 1.000,00 €');

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
    await waitForRender();

    expect(Array.from(dom.window.document.querySelectorAll('.documents-scope-button')).map((b) => b.textContent?.trim()))
      .toEqual(['Proyecto vinculado', 'Todos']);
    expect(contentText(dom)).toContain('#PV-1');
    expect(contentText(dom)).not.toContain('#PV-2');

    dom.window.document.querySelector('[data-document-scope="all"]')?.click();
    await waitForRender();

    const text = contentText(dom);
    expect(text).toContain('#PV-1');
    expect(text).toContain('#PV-2');
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
    expect(numbers).toContain('#PV-11');
    expect(numbers).not.toContain('#PV-1');
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
    expect(contentText(dom)).toContain('#PRE-11');
    expect(urls.some((u) => u.includes('type=estimates') && u.includes('cursor=10'))).toBe(true);
    expect(dom.window.document.querySelector('.documents-page-button[aria-label="Página siguiente"]')?.disabled).toBe(true);

    dom.window.document.querySelector('.documents-page-button[aria-label="Página anterior"]')?.click();
    await waitForRender();
    expect(dom.window.document.querySelector('.documents-page-label')?.textContent).toBe('Página 1');
    expect(contentText(dom)).toContain('#PRE-1');
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
    await waitForRender();

    const subRow = dom.window.document.querySelector('.purchase-order-row');
    expect(subRow).not.toBeNull();
    expect(subRow.querySelector('.document-link--ef')?.getAttribute('href'))
      .toBe('https://app.electricaferrer.es/pedido-compra/po-1');
    expect(subRow.querySelector('.document-link--holded')?.getAttribute('href'))
      .toBe('https://app.holded.com/sales/orders#open:order-po-1');
    const text = contentText(dom);
    expect(text).toContain('#PC-1');
    expect(text).toContain('Rexel');
    expect(text).toContain('Pendiente recibir');

    // Purchase orders remain nested; invoices are the fourth top-level tab.
    expect(Array.from(dom.window.document.querySelectorAll('.documents-tab')).map((t) => t.textContent?.trim()))
      .toEqual(['Pedidos venta', 'Albaranes', 'Facturas', 'Presupuestos']);
  });

  it('shows material and refund kinds as subtitles beneath each waybill number', async () => {
    const { dom } = loadCardBack({
      salesOrders: [salesOrder('so-1', 'PV-1', {
        waybills: [
          {
            id: 'wb-1',
            type: 'waybills',
            documentNumber: 'ALB-1',
            kind: 'material',
            workflowStatus: 'delivered',
            approvedAt: '2026-07-16',
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
    await waitForRender();

    const rows = dom.window.document.querySelectorAll('.related-waybill-row');
    expect(rows).toHaveLength(2);
    const materialIdentity = rows[0].querySelector('.related-waybill-identity');
    expect(materialIdentity?.children[0].classList.contains('related-waybill-number')).toBe(true);
    expect(materialIdentity?.children[0].textContent).toContain('#ALB-1');
    expect(materialIdentity?.children[1].classList.contains('waybill-kind--material')).toBe(true);
    expect(materialIdentity?.children[1].textContent).toContain('Material');
    expect(rows[0].textContent).toContain('Aprobado');
    expect(rows[0].querySelector('.document-link--ef')?.getAttribute('href'))
      .toBe('https://app.electricaferrer.es/albaran/wb-1');
    expect(rows[0].querySelector('.document-link--holded')?.getAttribute('href'))
      .toBe('https://app.holded.com/sales/waybills#open:waybill-wb-1');
    const refundIdentity = rows[1].querySelector('.related-waybill-identity');
    expect(refundIdentity?.children[0].textContent).toContain('#ALB-2');
    expect(refundIdentity?.children[1].classList.contains('waybill-kind--refund')).toBe(true);
    expect(refundIdentity?.children[1].textContent).toContain('Devolución');
    expect(rows[1].textContent).toContain('Sin aprobar');
  });

  it('keeps sales orders visible and warns quietly when purchase orders fail to load', async () => {
    const { dom } = loadCardBack(
      { salesOrders: [salesOrder('so-1', 'PV-1')], waybills: [], estimates: [] },
      { purchaseOrdersError: true },
    );
    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(contentText(dom)).toContain('#PV-1');
    expect(contentText(dom)).toContain('No se pudieron cargar las compras.');
  });

  it('keeps sales orders visible and warns quietly when related waybills fail to load', async () => {
    const { dom } = loadCardBack(
      { salesOrders: [salesOrder('so-1', 'PV-1')], waybills: [], estimates: [] },
      { waybillsError: true },
    );
    await waitForRender();
    expand(dom);
    await waitForRender();

    expect(contentText(dom)).toContain('#PV-1');
    expect(contentText(dom)).toContain('No se pudieron cargar los albaranes relacionados.');
  });

  it('moves focus and lazy-loads document tabs with the arrow keys', async () => {
    const { dom } = loadCardBack({
      salesOrders: [],
      estimates: [],
      waybills: [{ id: 'wb-1', type: 'waybills', documentNumber: 'ALB-1', workflowStatus: 'prepared', issueDate: '2026-07-10', projects: [] }],
    });
    await waitForRender();
    expand(dom);
    await waitForRender();

    const salesTab = dom.window.document.querySelector('[data-tab="salesOrders"]');
    salesTab?.focus();
    salesTab?.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await waitForRender();

    const waybillTab = dom.window.document.querySelector('[data-tab="waybills"]');
    expect(waybillTab?.getAttribute('aria-selected')).toBe('true');
    expect(waybillTab?.tabIndex).toBe(0);
    expect(dom.window.document.activeElement).toBe(waybillTab);
    expect(contentText(dom)).toContain('#ALB-1');
  });

  it('announces a stable loading panel while a document page is pending', async () => {
    const { dom } = loadCardBack(
      { salesOrders: [salesOrder('so-1', 'PV-1')], waybills: [], estimates: [] },
      { documentDelayMs: 200 },
    );
    await waitForRender();
    expand(dom);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const pendingPanel = dom.window.document.querySelector('#documents-panel');
    expect(pendingPanel?.getAttribute('aria-busy')).toBe('true');
    expect(pendingPanel?.textContent).toContain('Cargando pedidos de venta');
    expect(pendingPanel?.querySelectorAll('.documents-skeleton-row')).toHaveLength(3);

    await new Promise((resolve) => setTimeout(resolve, 220));

    const loadedPanel = dom.window.document.querySelector('#documents-panel');
    expect(loadedPanel?.getAttribute('aria-busy')).toBe('false');
    expect(loadedPanel?.querySelectorAll('.documents-skeleton-row')).toHaveLength(0);
    expect(loadedPanel?.textContent).toContain('#PV-1');
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
      .toBe('Este cliente no tiene pedidos de venta.');
  });
});
