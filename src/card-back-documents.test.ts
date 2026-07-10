// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

function buildDocumentsPage(documents: Record<string, unknown[]>, requestUrl: string): Record<string, unknown> {
  const url = new URL(requestUrl);
  const typeToKey = {
    'sales-orders': 'salesOrders',
    waybills: 'waybills',
    estimates: 'estimates',
  };
  const key = typeToKey[url.searchParams.get('type')] || 'salesOrders';
  const scope = url.searchParams.get('scope') || 'matched';
  const page = Number(url.searchParams.get('page')) || 1;
  const pageSize = Number(url.searchParams.get('pageSize')) || 10;
  const other = documents.other || {};
  const matchedItems = documents[key] || [];
  const otherItems = other[key] || [];
  const items = scope === 'other' ? otherItems : matchedItems;

  return {
    type: url.searchParams.get('type'),
    scope,
    page,
    pageSize,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    otherTotal: otherItems.length,
    results: items.slice((page - 1) * pageSize, page * pageSize),
  };
}

function loadCardBackWithDocuments(
  documents: Record<string, unknown[]>,
  options: { documentDelayMs?: number } = {},
): JSDOM {
  const html = readFileSync(resolve(__dirname, '../public/card-back.html'), 'utf8')
    .replace('<script src="https://p.trellocdn.com/power-up.min.js"></script>', '');

  return new JSDOM(html, {
    url: 'http://127.0.0.1/card-back.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.confirm = () => false;
      window.fetch = async (url) => {
        if (String(url).includes('/documents/search')) {
          if (options.documentDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, options.documentDelayMs));
          }
          return new Response(JSON.stringify(buildDocumentsPage(documents, String(url))), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (String(url).includes('/api/v2/contacts/')) {
          return new Response(JSON.stringify({ customFields: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response('{}', { status: 200 });
      };
      window.TrelloPowerUp = {
        iframe: () => ({
          get: () => Promise.resolve({
            contactId: 'contact-1',
            contactName: 'Cliente largo',
            addressLabel: 'Calle Mayor 123, Palma',
            projectId: 'project-1',
            projectName: 'Proyecto largo',
          }),
          card: () => Promise.resolve({ id: 'card-1', desc: '' }),
          getRestApi: () => ({ getToken: () => Promise.resolve(null) }),
          set: () => Promise.resolve(),
          sizeTo: () => Promise.resolve(),
          render: () => undefined,
        }),
      };
    },
  });
}

async function waitForRender(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

describe('card-back document status rendering', () => {
  it('renders the full customer address and color-inheriting open-link icons', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [],
      purchaseOrders: [],
      waybills: [],
      estimates: [],
    });

    await waitForRender();

    const text = dom.window.document.querySelector('#content')?.textContent || '';
    const openIcon = dom.window.document.querySelector('.tag-open-icon');

    expect(text).toContain('Calle Mayor 123, Palma');
    expect(text).not.toContain('Calle Ma…');
    expect(openIcon).not.toBeNull();
    expect(dom.window.getComputedStyle(openIcon as Element).fill.toLowerCase()).toBe('currentcolor');
  });

  it('renders sales order shipment state from shipped items and not Holded PV status', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [{
        id: 'sales-order-1',
        type: 'sales-orders',
        documentNumber: 'PV-1',
        status: 'completed',
        shippedItems: {
          count: 1,
          fields: ['pending', 'sent', 'total'],
          items: [{ total: 4, sent: 4, pending: 0 }],
        },
      }],
      purchaseOrders: [],
      waybills: [],
      estimates: [],
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();

    const text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(text).toContain('Preparado');
    expect(text).not.toContain('Servido');
    expect(text).not.toContain('Completado');
  });

  it('renders delivered sales orders when all linked waybills are accepted', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [{
        id: 'sales-order-1',
        type: 'sales-orders',
        documentNumber: 'PV-1',
        status: 'completed',
        shippedItems: {
          count: 1,
          fields: ['pending', 'sent', 'total', 'waybill_id'],
          items: [{ total: 4, sent: 4, pending: 0, waybill_id: 'waybill-1' }],
          waybillStatuses: [{ id: 'waybill-1', status: 'completed' }],
        },
      }],
      purchaseOrders: [],
      waybills: [],
      estimates: [],
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();

    const text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(text).toContain('Entregado');
    expect(text).not.toContain('Preparado');
  });

  it('renders waybill status as Pendiente or Aceptado', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [],
      purchaseOrders: [],
      estimates: [],
      waybills: [
        { id: 'waybill-1', type: 'waybills', documentNumber: 'ALB-1', status: 'pending' },
        { id: 'waybill-2', type: 'waybills', documentNumber: 'ALB-2', status: 'completed' },
      ],
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('[data-tab="waybills"]')?.click();
    await waitForRender();

    const text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(text).toContain('Pendiente');
    expect(text).toContain('Aceptado');
    expect(text).not.toContain('Completado');
  });

  it('switches between the linked project and the customer’s other projects without stacking lists', async () => {
    let documentFetches = 0;
    const html = readFileSync(resolve(__dirname, '../public/card-back.html'), 'utf8')
      .replace('<script src="https://p.trellocdn.com/power-up.min.js"></script>', '');
    const dom = new JSDOM(html, {
      url: 'http://127.0.0.1/card-back.html',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.confirm = () => false;
        window.fetch = async (url) => {
          if (String(url).includes('/documents/search')) {
            documentFetches += 1;
            return new Response(JSON.stringify(buildDocumentsPage({
              salesOrders: [
                { id: 'sales-order-1', type: 'sales-orders', documentNumber: 'PV-1', shippedItems: { count: 1, fields: [], items: [{ total: 1, sent: 1, pending: 0 }] } },
              ],
              purchaseOrders: [],
              waybills: [],
              estimates: [],
              other: {
                salesOrders: [
                  { id: 'sales-order-2', type: 'sales-orders', documentNumber: 'PV-2', shippedItems: { count: 1, fields: [], items: [{ total: 2, sent: 0, pending: 2 }] } },
                ],
                purchaseOrders: [],
                waybills: [],
                estimates: [],
              },
            }, String(url))), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (String(url).includes('/api/v2/contacts/')) {
            return new Response(JSON.stringify({ customFields: [] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          return new Response('{}', { status: 200 });
        };
        window.TrelloPowerUp = {
          iframe: () => ({
            get: () => Promise.resolve({
              contactId: 'contact-1',
              contactName: 'Cliente largo',
              projectId: 'project-1',
              projectName: 'Proyecto largo',
            }),
            card: () => Promise.resolve({ id: 'card-1', desc: '' }),
            getRestApi: () => ({ getToken: () => Promise.resolve(null) }),
            set: () => Promise.resolve(),
            sizeTo: () => Promise.resolve(),
            render: () => undefined,
          }),
        };
      },
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();

    let text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(text).toContain('#PV-1');
    expect(text).not.toContain('#PV-2');
    expect(text).toContain('Este cliente');
    expect(Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>('.documents-scope-button'))
      .map((button) => button.textContent?.trim())).toEqual([
      'Proyecto vinculado 1',
      'Otros proyectos 1',
    ]);

    dom.window.document.querySelector<HTMLButtonElement>('[data-document-scope="other"]')?.click();
    await waitForRender();

    text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(text).toContain('#PV-2');
    expect(text).not.toContain('#PV-1');
    expect(dom.window.document.querySelectorAll('.document-list')).toHaveLength(1);
    expect(documentFetches).toBe(2);
  });

  it('renders estimates as a document tab and can switch to estimates from other projects', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [],
      purchaseOrders: [],
      waybills: [],
      estimates: [
        { id: 'estimate-1', type: 'estimates', documentNumber: 'PRE-1', status: 'pending' },
      ],
      other: {
        salesOrders: [],
        purchaseOrders: [],
        waybills: [],
        estimates: [
          { id: 'estimate-2', type: 'estimates', documentNumber: 'PRE-2', status: 'pending' },
        ],
      },
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();

    const estimateTab = dom.window.document.querySelector<HTMLButtonElement>('[data-tab="estimates"]');
    expect(estimateTab?.textContent?.trim()).toBe('Presupuestos');
    estimateTab?.click();
    await waitForRender();

    let text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(dom.window.document.querySelector<HTMLButtonElement>('[data-tab="estimates"]')?.textContent).toContain('Presupuestos 1');
    expect(text).toContain('#PRE-1');
    expect(text).toContain('Otros proyectos 1');
    expect(text).not.toContain('#PRE-2');

    dom.window.document.querySelector<HTMLButtonElement>('[data-document-scope="other"]')?.click();
    await waitForRender();

    text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(text).toContain('#PRE-2');
    expect(text).not.toContain('#PRE-1');
  });

  it('does not render purchase orders in the customer document tabs or count', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [
        { id: 'sales-order-1', type: 'sales-orders', documentNumber: 'PV-1', shippedItems: { count: 0, fields: [], items: [] } },
      ],
      purchaseOrders: [
        { id: 'purchase-order-1', type: 'purchase-orders', documentNumber: 'PC-1', status: 'completed' },
      ],
      waybills: [],
      estimates: [],
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();

    const text = dom.window.document.querySelector('#content')?.textContent || '';
    const tabs = Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>('.documents-tab'))
      .map((tab) => tab.textContent?.trim());
    const count = dom.window.document.querySelector('.documents-count')?.textContent;

    expect(tabs).toEqual(['Pedidos venta 1', 'Albaranes', 'Presupuestos']);
    expect(count).toBe('1 documento');
    expect(text).not.toContain('Pedidos Compra');
    expect(text).not.toContain('#PC-1');
  });

  it('renders at most ten documents and moves between numbered pages', async () => {
    const salesOrders = Array.from({ length: 23 }, (_, index) => ({
      id: `sales-order-${index + 1}`,
      type: 'sales-orders',
      documentNumber: `PV-${index + 1}`,
      shippedItems: { count: 0, fields: [], items: [] },
    }));
    const dom = loadCardBackWithDocuments({
      salesOrders,
      purchaseOrders: [],
      waybills: [],
      estimates: [],
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();

    expect(dom.window.document.querySelectorAll('.document-row')).toHaveLength(10);
    expect(dom.window.document.querySelector('.documents-range')?.textContent).toBe('1–10 de 23');
    expect(dom.window.document.querySelector('.documents-page-label')?.textContent).toContain('Página 1 de 3');
    expect(dom.window.document.querySelector('#content')?.textContent).toContain('#PV-1');
    expect(dom.window.document.querySelector('#content')?.textContent).not.toContain('#PV-11');

    dom.window.document.querySelector<HTMLButtonElement>('.documents-page-button[aria-label="Página siguiente"]')?.click();
    await waitForRender();

    expect(dom.window.document.querySelectorAll('.document-row')).toHaveLength(10);
    expect(dom.window.document.querySelector('.documents-range')?.textContent).toBe('11–20 de 23');
    expect(dom.window.document.querySelector('.documents-page-label')?.textContent).toContain('Página 2 de 3');
    const pageTwoNumbers = Array.from(dom.window.document.querySelectorAll('.document-number'))
      .map((element) => element.textContent);
    expect(pageTwoNumbers).toContain('#PV-11');
    expect(pageTwoNumbers).not.toContain('#PV-1');
  });

  it('does not show pagination controls when the active scope fits on one page', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [
        { id: 'sales-order-1', type: 'sales-orders', documentNumber: 'PV-1', shippedItems: { count: 0, fields: [], items: [] } },
      ],
      purchaseOrders: [],
      waybills: [],
      estimates: [],
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();

    expect(dom.window.document.querySelector('.documents-pagination')).toBeNull();
  });

  it('moves focus and lazy-loads document tabs with the arrow keys', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [],
      purchaseOrders: [],
      waybills: [
        { id: 'waybill-1', type: 'waybills', documentNumber: 'ALB-1', status: 'pending' },
      ],
      estimates: [],
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();

    const salesTab = dom.window.document.querySelector<HTMLButtonElement>('[data-tab="salesOrders"]');
    salesTab?.focus();
    salesTab?.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    }));
    await waitForRender();

    const waybillTab = dom.window.document.querySelector<HTMLButtonElement>('[data-tab="waybills"]');
    expect(waybillTab?.getAttribute('aria-selected')).toBe('true');
    expect(waybillTab?.tabIndex).toBe(0);
    expect(dom.window.document.activeElement).toBe(waybillTab);
    expect(dom.window.document.querySelector('#content')?.textContent).toContain('#ALB-1');
  });

  it('announces a stable loading panel while a document page is pending', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [
        { id: 'sales-order-1', type: 'sales-orders', documentNumber: 'PV-1', shippedItems: { count: 0, fields: [], items: [] } },
      ],
      purchaseOrders: [],
      waybills: [],
      estimates: [],
    }, { documentDelayMs: 200 });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
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

  it('uses an accurate empty message for the customer’s other projects', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [
        { id: 'sales-order-1', type: 'sales-orders', documentNumber: 'PV-1', shippedItems: { count: 0, fields: [], items: [] } },
      ],
      purchaseOrders: [],
      waybills: [],
      estimates: [],
      other: {
        salesOrders: [],
        purchaseOrders: [],
        waybills: [],
        estimates: [],
      },
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('[data-document-scope="other"]')?.click();
    await waitForRender();

    expect(dom.window.document.querySelector('.documents-note')?.textContent)
      .toBe('No hay pedidos de venta en otros proyectos.');
  });

  it('renders estimate completion and cancellation with estimate wording', async () => {
    const dom = loadCardBackWithDocuments({
      salesOrders: [],
      purchaseOrders: [],
      waybills: [],
      estimates: [
        { id: 'estimate-1', type: 'estimates', documentNumber: 'PRE-1', status: 'completed' },
        { id: 'estimate-2', type: 'estimates', documentNumber: 'PRE-2', status: 'cancelled' },
      ],
    });

    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('#load-documents')?.click();
    await waitForRender();
    dom.window.document.querySelector<HTMLButtonElement>('[data-tab="estimates"]')?.click();
    await waitForRender();

    const text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(text).toContain('Aceptado');
    expect(text).toContain('Denegado');
    expect(text).not.toContain('Completado');
    expect(text).not.toContain('Cancelado');
  });
});
