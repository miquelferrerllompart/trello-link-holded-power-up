// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

function loadCardBackWithDocuments(documents: Record<string, unknown[]>): JSDOM {
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
          return new Response(JSON.stringify({ results: documents }), {
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

  it('reveals already-loaded customer documents without the selected project', async () => {
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
            return new Response(JSON.stringify({
              results: {
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
              },
            }), {
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
    expect(text).toContain('Ver otros sin proyecto');
    expect(text).not.toContain('#PV-2');

    dom.window.document.querySelector<HTMLButtonElement>('.documents-other-button')?.click();
    await waitForRender();

    text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(text).toContain('#PV-2');
    expect(text).toContain('Ocultar otros sin proyecto');
    expect(documentFetches).toBe(1);
  });

  it('renders estimates as a document tab with already-loaded other estimates', async () => {
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
    expect(estimateTab?.textContent).toContain('Presupuestos 1');
    estimateTab?.click();
    await waitForRender();

    let text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(text).toContain('#PRE-1');
    expect(text).toContain('Ver otros sin proyecto');
    expect(text).not.toContain('#PRE-2');

    dom.window.document.querySelector<HTMLButtonElement>('.documents-other-button')?.click();
    await waitForRender();

    text = dom.window.document.querySelector('#content')?.textContent || '';
    expect(text).toContain('#PRE-2');
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

    expect(tabs).toEqual(['Pedidos venta 1', 'Albaranes 0', 'Presupuestos 0']);
    expect(count).toBe('1');
    expect(text).not.toContain('Pedidos Compra');
    expect(text).not.toContain('#PC-1');
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
