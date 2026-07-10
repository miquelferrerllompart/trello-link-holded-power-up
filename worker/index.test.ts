import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

const env = {
  HOLDED_API_KEY: 'sk_test',
  HOLDED_API_V2: 'sk_v2_test',
  CACHE: {
    get: vi.fn(),
    put: vi.fn(),
  },
};

describe('Holded proxy Worker V2 routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches contacts through V2 fan-out and returns the existing response shape', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'contact-1', name: 'Acme' }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/contacts/search?q=Acme'),
      env,
    );
    const body = await response.json() as { total: number; results: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body).toEqual({ total: 1, results: [{ id: 'contact-1', name: 'Acme', customId: null, vatnumber: '', tradeName: null, isperson: 0, billAddress: {}, shippingAddresses: [], customFields: [] }] });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.holded.com/api/v2/contacts/search?limit=100&name=Acme');
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer sk_v2_test',
      Accept: 'application/json',
    });
  });

  it('returns contact-filtered sales orders and narrows by project when provided', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [
          {
            id: 'order-1',
            document_number: 'PV-100',
            contact_id: 'contact-1',
            status: 'pending',
            project_id: 'project-1',
            lines: [],
          },
          {
            id: 'order-2',
            document_number: 'PV-101',
            contact_id: 'contact-1',
            status: 'completed',
            project_id: 'project-2',
            lines: [],
          },
        ],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ waybill_id: 'waybill-1', units: '2' }],
      })));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/sales-orders/search?contactId=contact-1&projectId=project-1'),
      env,
    );
    const body = await response.json() as { results: Array<{ id: string; documentNumber: string; url: string }> };

    expect(response.status).toBe(200);
    expect(body.results).toEqual([expect.objectContaining({
      id: 'order-1',
      documentNumber: 'PV-100',
      shippedItems: {
        count: 1,
        fields: ['units', 'waybill_id'],
        items: [{ waybill_id: 'waybill-1', units: '2' }],
      },
      url: 'https://app.holded.com/sales/orders#open:salesorder-order-1',
    })]);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.holded.com/api/v2/sales-orders?limit=100&contact_id=contact-1');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://api.holded.com/api/v2/sales-orders/order-1/shipped-items');
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer sk_v2_test',
    });
  });

  it('returns grouped Holded documents for the card-back tabs', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{
          id: 'sales-order-1',
          document_number: 'PV-100',
          contact_id: 'contact-1',
          status: 'pending',
          date: '2026-07-01',
          project_id: 'project-1',
          lines: [],
        }, {
          id: 'sales-order-2',
          document_number: 'PV-101',
          contact_id: 'contact-1',
          status: 'pending',
          date: '2026-07-01',
          project_id: 'project-2',
          lines: [],
        }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{
          id: 'purchase-order-1',
          document_number: 'PC-200',
          contact_id: 'contact-1',
          status: 'completed',
          date: '2026-07-02',
          project_id: 'project-1',
          lines: [],
        }, {
          id: 'purchase-order-2',
          document_number: 'PC-201',
          contact_id: 'contact-1',
          status: 'completed',
          date: '2026-07-02',
          project_id: null,
          lines: [],
        }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{
          id: 'waybill-1',
          document_number: 'ALB-300',
          contact_id: 'contact-1',
          status: 'partial',
          date: '2026-07-03',
          project_id: 'project-2',
          lines: [],
        }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{
          id: 'estimate-1',
          document_number: 'PRE-400',
          contact_id: 'contact-1',
          status: 'pending',
          date: '2026-07-04',
          project_id: 'project-1',
          lines: [],
        }, {
          id: 'estimate-2',
          document_number: 'PRE-401',
          contact_id: 'contact-1',
          status: 'pending',
          date: '2026-07-04',
          project_id: null,
          lines: [],
        }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ waybill_id: 'waybill-1', quantity: '1' }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ waybill_id: 'waybill-2', quantity: '1' }],
      })));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/documents/search?contactId=contact-1&projectId=project-1'),
      env,
    );
    const body = await response.json() as {
      totals: { salesOrders: number; purchaseOrders: number; waybills: number };
      results: {
        salesOrders: Array<{ id: string; type: string }>;
        purchaseOrders: Array<{ id: string; type: string }>;
        waybills: Array<{ id: string; type: string }>;
        estimates: Array<{ id: string; type: string }>;
        other: {
          salesOrders: Array<{ id: string; type: string }>;
          purchaseOrders: Array<{ id: string; type: string }>;
          waybills: Array<{ id: string; type: string }>;
          estimates: Array<{ id: string; type: string }>;
        };
      };
      otherTotals: { salesOrders: number; purchaseOrders: number; waybills: number; estimates: number };
    };

    expect(response.status).toBe(200);
    expect(body.totals).toEqual({ salesOrders: 1, purchaseOrders: 1, waybills: 0, estimates: 1 });
    expect(body.otherTotals).toEqual({ salesOrders: 1, purchaseOrders: 1, waybills: 1, estimates: 1 });
    expect(body.results.salesOrders).toEqual([expect.objectContaining({
      id: 'sales-order-1',
      type: 'sales-orders',
      shippedItems: {
        count: 1,
        fields: ['quantity', 'waybill_id'],
        items: [{ waybill_id: 'waybill-1', quantity: '1' }],
      },
    })]);
    expect(body.results.purchaseOrders).toEqual([expect.objectContaining({ id: 'purchase-order-1', type: 'purchase-orders' })]);
    expect(body.results.waybills).toEqual([]);
    expect(body.results.estimates).toEqual([expect.objectContaining({ id: 'estimate-1', type: 'estimates' })]);
    expect(body.results.other.salesOrders).toEqual([expect.objectContaining({ id: 'sales-order-2', type: 'sales-orders' })]);
    expect(body.results.other.purchaseOrders).toEqual([expect.objectContaining({ id: 'purchase-order-2', type: 'purchase-orders' })]);
    expect(body.results.other.waybills).toEqual([expect.objectContaining({ id: 'waybill-1', type: 'waybills' })]);
    expect(body.results.other.estimates).toEqual([expect.objectContaining({ id: 'estimate-2', type: 'estimates' })]);
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      'https://api.holded.com/api/v2/sales-orders?limit=100&contact_id=contact-1',
      'https://api.holded.com/api/v2/purchase-orders?limit=100&contact_id=contact-1',
      'https://api.holded.com/api/v2/waybills?limit=100&contact_id=contact-1',
      'https://api.holded.com/api/v2/estimates?limit=100&contact_id=contact-1',
      'https://api.holded.com/api/v2/sales-orders/sales-order-1/shipped-items',
      'https://api.holded.com/api/v2/sales-orders/sales-order-2/shipped-items',
    ]);
  });

  it('paginates a complete customer document scan and enriches only visible sales orders', async () => {
    const matched = Array.from({ length: 12 }, (_, index) => ({
      id: `sales-order-${index + 1}`,
      document_number: `PV-${index + 1}`,
      contact_id: 'contact-1',
      status: 'pending',
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      project_id: 'project-1',
      lines: [],
    }));
    const other = {
      id: 'sales-order-other',
      document_number: 'PV-OTHER',
      contact_id: 'contact-1',
      status: 'pending',
      date: '2026-07-13',
      project_id: 'project-2',
      lines: [],
    };
    const fetchImpl = vi.fn(async (input: string) => {
      if (input.includes('/shipped-items')) {
        return new Response(JSON.stringify({ items: [] }));
      }
      if (input.includes('cursor=next-cursor')) {
        return new Response(JSON.stringify({
          items: [...matched.slice(6), other],
          cursor: null,
          has_more: false,
        }));
      }
      return new Response(JSON.stringify({
        items: matched.slice(0, 6),
        cursor: 'next-cursor',
        has_more: true,
      }));
    });
    vi.stubGlobal('fetch', fetchImpl);

    let cachedDocuments: string | null = null;
    const cache = {
      get: vi.fn(async () => cachedDocuments ? JSON.parse(cachedDocuments) : null),
      put: vi.fn(async (_key: string, value: string) => {
        cachedDocuments = value;
      }),
    };
    const paginatedEnv = { ...env, CACHE: cache };

    const firstResponse = await worker.fetch(
      new Request('https://proxy.test/documents/search?contactId=contact-1&projectId=project-1&type=sales-orders&page=1&pageSize=10'),
      paginatedEnv,
    );
    const firstPage = await firstResponse.json() as {
      page: number;
      total: number;
      totalPages: number;
      otherTotal: number;
      results: Array<{ id: string; shippedItems?: { count: number } }>;
    };

    expect(firstResponse.status).toBe(200);
    expect(firstPage).toMatchObject({ page: 1, total: 12, totalPages: 2, otherTotal: 1 });
    expect(firstPage.results).toHaveLength(10);
    expect(firstPage.results[0]).toMatchObject({ id: 'sales-order-12', shippedItems: { count: 0 } });
    expect(firstPage.results.at(-1)?.id).toBe('sales-order-3');

    const secondResponse = await worker.fetch(
      new Request('https://proxy.test/documents/search?contactId=contact-1&projectId=project-1&type=sales-orders&page=2&pageSize=10'),
      paginatedEnv,
    );
    const secondPage = await secondResponse.json() as {
      page: number;
      results: Array<{ id: string }>;
    };

    expect(secondPage.page).toBe(2);
    expect(secondPage.results.map((document) => document.id)).toEqual(['sales-order-2', 'sales-order-1']);
    const listCalls = fetchImpl.mock.calls.map((call) => call[0])
      .filter((requestUrl) => requestUrl.includes('/api/v2/sales-orders?'));
    const shippedItemCalls = fetchImpl.mock.calls.map((call) => call[0])
      .filter((requestUrl) => requestUrl.includes('/shipped-items'));
    expect(listCalls).toEqual([
      'https://api.holded.com/api/v2/sales-orders?limit=100&contact_id=contact-1',
      'https://api.holded.com/api/v2/sales-orders?limit=100&contact_id=contact-1&cursor=next-cursor',
    ]);
    expect(shippedItemCalls).toHaveLength(12);
    expect(cache.put).toHaveBeenCalledOnce();
    expect(cache.put.mock.calls[0][2]).toEqual({ expirationTtl: 5 * 60 });
  });

  it('keeps legacy V1 pass-through calls on the key header when a V1 key is configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 1 })));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/api/invoicing/v1/contacts/contact-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingAddresses: [] }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.holded.com/api/invoicing/v1/contacts/contact-1');
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      key: 'sk_test',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });
});
