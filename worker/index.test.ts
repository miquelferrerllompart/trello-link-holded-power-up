import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

const env = {
  EF_INTERNAL_API_KEY: 'efk_test',
};

describe('Holded proxy Worker V2 routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches contacts through the internal API and maps summaries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: 'contact-1',
        name: 'Acme',
        code: 'B123',
        vatnumber: 'ESB123',
        tradeName: 'Acme SL',
        email: 'a@acme.es',
        phone: '971',
        mobile: '600',
        type: 'client',
        customId: 'C-1',
      }],
    }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/contacts/search?q=Acme'),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.app.electricaferrer.es/internal/v1/contacts?query=Acme&limit=30');
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer efk_test' });
    expect(body).toEqual({
      total: 1,
      results: [{
        id: 'contact-1',
        name: 'Acme',
        code: 'B123',
        vatnumber: 'ESB123',
        tradeName: 'Acme SL',
        email: 'a@acme.es',
        phone: '971',
        mobile: '600',
        type: 'client',
        customId: 'C-1',
      }],
    });
  });

  it('returns an empty contact search without hitting the internal API for a blank query', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(new Request('https://proxy.test/contacts/search?q='), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ total: 0, results: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('searches projects through the internal API and surfaces the client and code', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: 'project-1',
        name: 'Obra Norte',
        key: 'AUT3',
        contactName: 'Melchor Mascaró S.A.',
        status: '0',
        archived: false,
      }],
    }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/projects/search?q=Obra'),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.app.electricaferrer.es/internal/v1/projects?query=Obra&limit=30');
    expect(body).toEqual({
      total: 1,
      results: [{ id: 'project-1', name: 'Obra Norte', contactName: 'Melchor Mascaró S.A.', key: 'AUT3' }],
    });
  });

});

const INTERNAL_BASE = 'https://api.app.electricaferrer.es/internal/v1';
const envV2 = { ...env, EF_INTERNAL_API_KEY: 'efk_test' };

function internalJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Worker /v2 internal-API document routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('proxies paginated attachment metadata with safe local download URLs', async () => {
    const attachmentId = '2026-07-24 16.45.02 cuadro final instalación.jpg';
    const downloadUrl = `${INTERNAL_BASE}/waybills/abcdef0123456789abcdef01/attachments/${encodeURIComponent(attachmentId)}`;
    const fetchImpl = vi.fn().mockResolvedValue(internalJson({
      items: [{
        id: attachmentId,
        name: attachmentId,
        contentType: 'image/jpeg',
        size: 2048,
        createdAt: '2026-07-24T12:00:00Z',
        downloadUrl,
      }],
      hasMore: true,
      nextCursor: 'next-page',
    }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/waybills/abcdef0123456789abcdef01/attachments?cursor=current-page'),
      envV2,
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${INTERNAL_BASE}/waybills/abcdef0123456789abcdef01/attachments?cursor=current-page`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer efk_test' }),
      }),
    );
    const body = await response.json();
    expect(body).toEqual({
      items: [{
        id: attachmentId,
        name: attachmentId,
        mimeType: 'image/jpeg',
        size: 2048,
        createdAt: '2026-07-24T12:00:00Z',
        url: expect.any(String),
      }],
      hasMore: true,
      nextCursor: 'next-page',
    });
    const proxyUrl = new URL(body.items[0].url, 'https://proxy.test');
    expect(decodeURIComponent(proxyUrl.pathname.split('/').at(-1))).toBe(attachmentId);
    expect(proxyUrl.searchParams.get('name')).toBe(attachmentId);
    expect(proxyUrl.searchParams.get('source')).toBe(downloadUrl);
    expect(body.items[0].url).not.toContain('efk_test');
  });

  it('streams an attachment without exposing the internal integration key', async () => {
    const attachmentId = '2026-07-24 16.45.02 cuadro final instalación.jpg';
    const downloadUrl = `${INTERNAL_BASE}/waybills/abcdef0123456789abcdef01/attachments/${encodeURIComponent(attachmentId)}?version=2`;
    const proxyUrl = new URL(
      `https://proxy.test/v2/documents/waybills/abcdef0123456789abcdef01/attachments/${encodeURIComponent(attachmentId)}`,
    );
    proxyUrl.searchParams.set('name', 'cuadro.jpg');
    proxyUrl.searchParams.set('source', downloadUrl);
    const fetchImpl = vi.fn().mockResolvedValue(new Response('image-body', {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': '10',
        'Content-Disposition': 'attachment; filename="upstream.jpg"',
      },
    }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request(proxyUrl),
      envV2,
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(
      downloadUrl,
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/octet-stream',
          Authorization: 'Bearer efk_test',
        },
      }),
    );
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Content-Disposition')).toBe('inline; filename="cuadro.jpg"');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Authorization')).toBeNull();
    expect(await response.text()).toBe('image-body');
  });

  it('rejects a tampered attachment source without sending the integration key', async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const proxyUrl = new URL(
      'https://proxy.test/v2/documents/waybills/abcdef0123456789abcdef01/attachments/foto.png',
    );
    proxyUrl.searchParams.set(
      'source',
      'https://api.app.electricaferrer.es/internal/v1/contacts/contact-1',
    );

    const response = await worker.fetch(new Request(proxyUrl), envV2);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'INVALID_REQUEST', message: 'La URL del adjunto no es válida.' },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps sales-orders with no shipped-items and an empty relation when no POs match', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (input.includes('/purchase-orders')) {
        return internalJson({ items: [], pagination: { page: 1, pageSize: 100, hasMore: false }, readiness: 'ready' });
      }
      return internalJson({
        items: [{
          id: 'so-1',
          docNumber: 'PV-26-008005',
          issueDate: '2026-07-14',
          dueDate: null,
          status: 'partial',
          rawStatus: 'processing',
          isDraft: false,
          approvedAt: '2026-07-14T08:45:00Z',
          customer: { id: 'contact-1', name: 'Acme' },
          projects: [{ id: 'project-1', name: 'Obra', color: '#fff' }],
          totalUnits: 10,
          deliveryCount: 1,
          internalStatus: 'partially_prepared',
          notes: 'Entregar por fases.',
          internalNotes: 'Coordinar con almacén.',
          attachmentsUrl: '/internal/v1/sales-orders/so-1/attachments',
        }],
        pagination: { page: 1, pageSize: 10, hasMore: true },
        readiness: 'ready',
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders&page=1&scope=matched&projectId=project-1'),
      envV2,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const calledUrls = fetchImpl.mock.calls.map((call) => call[0]);
    expect(calledUrls).toContain(`${INTERNAL_BASE}/sales-orders?customerId=contact-1&projectId=project-1&page=1&pageSize=10`);
    expect(calledUrls).toContain(`${INTERNAL_BASE}/purchase-orders?customerId=contact-1&projectId=project-1&page=1&pageSize=100`);
    expect(calledUrls).toContain(`${INTERNAL_BASE}/waybills?customerId=contact-1&projectId=project-1&page=1&pageSize=100`);
    expect(calledUrls.some((url: string) => url.includes('/shipped-items'))).toBe(false);
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer efk_test' });
    expect(body).toEqual({
      type: 'sales-orders',
      scope: 'matched',
      page: 1,
      pageSize: 10,
      hasMore: true,
      results: [{
        type: 'sales-orders',
        id: 'so-1',
        documentNumber: 'PV-26-008005',
        url: 'https://app.holded.com/sales/orders#open:salesorder-so-1',
        internalStatus: 'partially_prepared',
        issueDate: '2026-07-14',
        approvedAt: '2026-07-14T08:45:00Z',
        dueDate: null,
        deliveryCount: 1,
        totalUnits: 10,
        notes: 'Entregar por fases.',
        internalNotes: 'Coordinar con almacén.',
        attachmentsUrl: '/v2/documents/sales-orders/so-1/attachments',
        projects: [{ id: 'project-1', name: 'Obra', color: '#fff' }],
        purchaseOrders: [],
        waybills: [],
      }],
    });
  });

  it('nests purchase orders under their source sales order and drops orphan/off-page POs', async () => {
    const salesOrder = (id: string, docNumber: string) => ({
      id,
      docNumber,
      issueDate: '2026-07-14',
      dueDate: null,
      status: 'partial',
      rawStatus: 'processing',
      isDraft: false,
      approvedAt: null,
      customer: { id: 'contact-1', name: 'Acme' },
      projects: [],
      totalUnits: 5,
      deliveryCount: 0,
      internalStatus: 'in_process',
    });
    const purchaseOrder = (id: string, docNumber: string, sourceId: string | null) => ({
      id,
      docNumber,
      issueDate: '2026-07-13',
      dueDate: null,
      status: 'partial',
      rawStatus: 'processing',
      isDraft: false,
      approvedAt: '2026-07-13T10:15:00Z',
      supplier: { id: 'supplier-1', name: 'Rexel' },
      projects: [],
      totalUnits: 5,
      total: 250,
      currency: 'EUR',
      receiptCount: 0,
      internalStatus: 'awaiting_receipt',
      notes: 'Material reservado.',
      internalNotes: 'Confirmar plazo con proveedor.',
      attachments: [],
      sourceOrder: sourceId ? { id: sourceId, docNumber: 'PV-26-008005' } : null,
    });

    const fetchImpl = vi.fn(async (input: string) => {
      if (input.includes('/purchase-orders')) {
        return internalJson({
          items: [
            purchaseOrder('po-1', 'PC-26-001101', 'so-1'),
            purchaseOrder('po-2', 'PC-26-001102', 'so-1'),
            purchaseOrder('po-3', 'PC-26-001103', null),        // orphan, dropped
            purchaseOrder('po-4', 'PC-26-001104', 'so-off-page'), // off page, dropped
          ],
          pagination: { page: 1, pageSize: 100, hasMore: false },
          readiness: 'ready',
        });
      }
      return internalJson({
        items: [salesOrder('so-1', 'PV-26-008005'), salesOrder('so-2', 'PV-26-008006')],
        pagination: { page: 1, pageSize: 10, hasMore: false },
        readiness: 'ready',
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders&page=1&scope=all'),
      envV2,
    );
    const body = await response.json() as { results: Array<{ id: string; purchaseOrders: Array<Record<string, unknown>> }> };

    expect(response.status).toBe(200);
    expect(body.results[0].id).toBe('so-1');
    expect(body.results[0].purchaseOrders).toEqual([
      {
        type: 'purchase-orders',
        id: 'po-1',
        documentNumber: 'PC-26-001101',
        url: 'https://app.holded.com/sales/orders#open:order-po-1',
        internalStatus: 'awaiting_receipt',
        issueDate: '2026-07-13',
        approvedAt: '2026-07-13T10:15:00Z',
        supplier: { id: 'supplier-1', name: 'Rexel' },
        total: 250,
        currency: 'EUR',
        notes: 'Material reservado.',
        internalNotes: 'Confirmar plazo con proveedor.',
        attachments: [],
        projects: [],
      },
      expect.objectContaining({ id: 'po-2', documentNumber: 'PC-26-001102' }),
    ]);
    expect(body.results[1].id).toBe('so-2');
    expect(body.results[1].purchaseOrders).toEqual([]);
  });

  it('nests only material and refund waybills and drops orphan/off-page relations', async () => {
    const salesOrder = (id: string, docNumber: string) => ({
      id,
      docNumber,
      issueDate: '2026-07-14',
      dueDate: null,
      projects: [],
      totalUnits: 5,
      deliveryCount: 1,
      internalStatus: 'in_process',
    });
    const waybill = (id: string, docNumber: string, sourceId: string | null, kind: string) => ({
      id,
      docNumber,
      kind,
      issueDate: '2026-07-15',
      workflowStatus: 'delivered',
      approvedAt: '2026-07-16',
      projects: [],
      sourceOrder: sourceId ? { id: sourceId, docNumber: 'PV-26-008005' } : null,
    });

    const fetchImpl = vi.fn(async (input: string) => {
      if (input.includes('/purchase-orders')) {
        return internalJson({ items: [], pagination: { page: 1, pageSize: 100, hasMore: false } });
      }
      if (input.includes('/waybills')) {
        return internalJson({
          items: [
            waybill('wb-1', 'ALB-26-000123', 'so-1', 'material'),
            waybill('wb-2', 'ALB-26-000124', 'so-1', 'refund'),
            waybill('wb-3', 'ALB-26-000125', 'so-1', 'labour'),
            waybill('wb-4', 'ALB-26-000126', 'so-1', 'extra'),
            waybill('wb-5', 'ALB-26-000127', null, 'material'),
            waybill('wb-6', 'ALB-26-000128', 'so-off-page', 'refund'),
          ],
          pagination: { page: 1, pageSize: 100, hasMore: false },
        });
      }
      return internalJson({
        items: [salesOrder('so-1', 'PV-26-008005'), salesOrder('so-2', 'PV-26-008006')],
        pagination: { page: 1, pageSize: 10, hasMore: false },
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders&scope=all'),
      envV2,
    );
    const body = await response.json() as {
      results: Array<{ id: string; waybills: Array<Record<string, unknown>> }>;
    };

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls.map((call) => call[0])).toContain(
      `${INTERNAL_BASE}/waybills?customerId=contact-1&page=1&pageSize=100`,
    );
    expect(body.results[0].waybills).toEqual([
      {
        type: 'waybills',
        id: 'wb-1',
        documentNumber: 'ALB-26-000123',
        url: 'https://app.holded.com/sales/waybills#open:waybill-wb-1',
        kind: 'material',
        issueDate: '2026-07-15',
        workflowStatus: 'delivered',
        approvedAt: '2026-07-16',
        sourceOrder: { id: 'so-1', docNumber: 'PV-26-008005' },
        projects: [],
      },
      {
        type: 'waybills',
        id: 'wb-2',
        documentNumber: 'ALB-26-000124',
        url: 'https://app.holded.com/sales/waybills#open:waybill-wb-2',
        kind: 'refund',
        issueDate: '2026-07-15',
        workflowStatus: 'delivered',
        approvedAt: '2026-07-16',
        sourceOrder: { id: 'so-1', docNumber: 'PV-26-008005' },
        projects: [],
      },
    ]);
    expect(body.results[1].waybills).toEqual([]);
  });

  it('combines linked warehouse movements and standalone returns in the Pedidos view', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (input.includes('/purchase-orders')) {
        return internalJson({ items: [], pagination: { page: 1, pageSize: 100, hasMore: false } });
      }
      if (input.includes('/waybills')) {
        return internalJson({
          items: [
            { id: 'material', docNumber: 'ALB-MATERIAL', kind: 'material', issueDate: '2026-07-15', workflowStatus: 'delivered', sourceOrder: { id: 'so-1', docNumber: 'PV-1' }, projects: [] },
            { id: 'refund', docNumber: 'ALB-DEVOLUCION', kind: 'refund', issueDate: '2026-07-16', workflowStatus: 'prepared', sourceOrder: null, projects: [] },
            { id: 'unclassified', docNumber: 'ALB-SIN-CLASIFICAR', kind: 'unclassified', issueDate: '2026-07-13', workflowStatus: 'prepared', sourceOrder: null, projects: [] },
            { id: 'labour', docNumber: 'ALB-TRABAJO', kind: 'labour', issueDate: '2026-07-17', workflowStatus: 'prepared', sourceOrder: null, projects: [] },
          ],
          pagination: { page: 1, pageSize: 100, hasMore: false },
        });
      }
      return internalJson({
        items: [{ id: 'so-1', docNumber: 'PV-1', issueDate: '2026-07-14', internalStatus: 'in_process', projects: [] }],
        pagination: { page: 1, pageSize: 100, hasMore: false },
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders&view=orders&page=1&scope=all'),
      envV2,
    );
    const body = await response.json() as {
      results: Array<{ id: string; waybills?: Array<{ id: string }> }>;
    };

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls.map((call) => call[0])).toContain(
      `${INTERNAL_BASE}/sales-orders?customerId=contact-1&page=1&pageSize=100`,
    );
    expect(body.results.map((item) => item.id)).toEqual(['refund', 'so-1', 'unclassified']);
    expect(body.results[1].waybills?.map((item) => item.id)).toEqual(['material']);
  });

  it('keeps sales orders and flags purchaseOrdersError when the PO fetch fails', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (input.includes('/purchase-orders')) {
        return internalJson({ error: { code: 'SERVICE_UNAVAILABLE', message: 'later' } }, 503);
      }
      if (input.includes('/waybills')) {
        return internalJson({ items: [], pagination: { page: 1, pageSize: 100, hasMore: false } });
      }
      return internalJson({
        items: [{
          id: 'so-1',
          docNumber: 'PV-26-008005',
          issueDate: '2026-07-14',
          dueDate: null,
          status: 'partial',
          rawStatus: 'processing',
          isDraft: false,
          approvedAt: null,
          customer: { id: 'contact-1', name: 'Acme' },
          projects: [],
          totalUnits: 5,
          deliveryCount: 0,
          internalStatus: 'in_process',
        }],
        pagination: { page: 1, pageSize: 10, hasMore: false },
        readiness: 'ready',
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders&scope=all'),
      envV2,
    );
    const body = await response.json() as { purchaseOrdersError?: boolean; results: Array<{ id: string; purchaseOrders: unknown[] }> };

    expect(response.status).toBe(200);
    expect(body.purchaseOrdersError).toBe(true);
    expect(body.results[0].id).toBe('so-1');
    expect(body.results[0].purchaseOrders).toEqual([]);
  });

  it('keeps sales orders and flags waybillsError when the related waybill fetch fails', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (input.includes('/purchase-orders')) {
        return internalJson({ items: [], pagination: { page: 1, pageSize: 100, hasMore: false } });
      }
      if (input.includes('/waybills')) {
        return internalJson({ error: { code: 'SERVICE_UNAVAILABLE', message: 'later' } }, 503);
      }
      return internalJson({
        items: [{
          id: 'so-1',
          docNumber: 'PV-26-008005',
          issueDate: '2026-07-14',
          dueDate: null,
          projects: [],
          totalUnits: 5,
          deliveryCount: 0,
          internalStatus: 'in_process',
        }],
        pagination: { page: 1, pageSize: 10, hasMore: false },
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders&scope=all'),
      envV2,
    );
    const body = await response.json() as {
      purchaseOrdersError?: boolean;
      waybillsError?: boolean;
      results: Array<{ id: string; waybills: unknown[] }>;
    };

    expect(response.status).toBe(200);
    expect(body.purchaseOrdersError).toBeUndefined();
    expect(body.waybillsError).toBe(true);
    expect(body.results[0].id).toBe('so-1');
    expect(body.results[0].waybills).toEqual([]);
  });

  it('maps waybills passing through workflowStatus, approvedAt and sourceOrder', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(internalJson({
      items: [{
        id: 'wb-1',
        docNumber: 'ALB-26-000123',
        issueDate: '2026-07-10',
        status: 'completed',
        rawStatus: 'delivered',
        approvedAt: '2026-07-11',
        workflowStatus: 'delivered',
        kind: 'material',
        notes: 'Dejar el material junto al cuadro eléctrico.',
        internalNotes: 'La foto de entrega es obligatoria.',
        attachments: [
          {
            id: 'attachment-1',
            name: 'entrega.jpg',
            url: 'https://cdn.example.com/entrega.jpg',
            mimeType: 'image/jpeg',
            thumbnailUrl: 'https://cdn.example.com/entrega-thumb.jpg',
            internalToken: 'must-not-leak',
          },
          {
            id: 'attachment-2',
            name: 'albaran-firmado.pdf',
            url: 'https://cdn.example.com/albaran-firmado.pdf',
            mimeType: 'application/pdf',
            thumbnailUrl: null,
          },
        ],
        customer: { id: 'contact-1', name: 'Acme' },
        projects: [],
        sourceOrder: { id: 'so-1', docNumber: 'PV-26-008005' },
      }],
      pagination: { page: 1, pageSize: 10, hasMore: false },
      readiness: 'ready',
    }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=waybills&page=1&scope=all'),
      envV2,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `${INTERNAL_BASE}/waybills?customerId=contact-1&page=1&pageSize=10`,
    );
    expect(body).toEqual({
      type: 'waybills',
      scope: 'all',
      page: 1,
      pageSize: 10,
      hasMore: false,
      results: [{
        type: 'waybills',
        id: 'wb-1',
        documentNumber: 'ALB-26-000123',
        url: 'https://app.holded.com/sales/waybills#open:waybill-wb-1',
        issueDate: '2026-07-10',
        kind: 'material',
        workflowStatus: 'delivered',
        approvedAt: '2026-07-11',
        notes: 'Dejar el material junto al cuadro eléctrico.',
        internalNotes: 'La foto de entrega es obligatoria.',
        attachments: [
          {
            id: 'attachment-1',
            name: 'entrega.jpg',
            url: 'https://cdn.example.com/entrega.jpg',
            mimeType: 'image/jpeg',
            thumbnailUrl: 'https://cdn.example.com/entrega-thumb.jpg',
          },
          {
            id: 'attachment-2',
            name: 'albaran-firmado.pdf',
            url: 'https://cdn.example.com/albaran-firmado.pdf',
            mimeType: 'application/pdf',
            thumbnailUrl: null,
          },
        ],
        sourceOrder: { id: 'so-1', docNumber: 'PV-26-008005' },
        projects: [],
      }],
    });
  });

  it('returns only work waybills for the Partes de trabajo category before paginating', async () => {
    const waybill = (id: string, kind: string) => ({
      id,
      docNumber: `ALB-${id}`,
      kind,
      issueDate: '2026-07-10',
      workflowStatus: 'prepared',
      projects: [],
    });
    const fetchImpl = vi.fn().mockResolvedValue(internalJson({
      items: [
        waybill('material', 'material'),
        waybill('labour', 'labour'),
        waybill('mixed', 'mixed'),
        waybill('extra', 'extra'),
        waybill('refund', 'refund'),
        waybill('unclassified', 'unclassified'),
      ],
      pagination: { page: 1, pageSize: 100, hasMore: false },
    }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=waybills&category=work&page=1&scope=all'),
      envV2,
    );
    const body = await response.json() as { results: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `${INTERNAL_BASE}/waybills?customerId=contact-1&page=1&pageSize=100`,
    );
    expect(body.results.map((item) => item.id)).toEqual(['labour', 'mixed', 'extra', 'unclassified']);
  });

  it('keeps fetching category results after the relation-loader page limit', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      const page = Number(new URL(input).searchParams.get('page'));
      const isEleventhPage = page === 11;
      return internalJson({
        items: [{
          id: isEleventhPage ? 'labour-after-1000' : `material-${page}`,
          docNumber: isEleventhPage ? 'ALB-TRABAJO-1001' : `ALB-MATERIAL-${page}`,
          kind: isEleventhPage ? 'labour' : 'material',
          issueDate: '2026-07-10',
          workflowStatus: 'prepared',
          projects: [],
        }],
        pagination: { page, pageSize: 100, hasMore: !isEleventhPage },
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=waybills&category=work&page=1&scope=all'),
      envV2,
    );
    const body = await response.json() as { results: Array<{ id: string }>; hasMore: boolean };

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(11);
    expect(body.results.map((item) => item.id)).toEqual(['labour-after-1000']);
    expect(body.hasMore).toBe(false);
  });

  it('bounds category scans when upstream pagination does not terminate', async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      const page = Number(new URL(input).searchParams.get('page'));
      return internalJson({
        items: [{
          id: `material-${page}`,
          docNumber: `ALB-MATERIAL-${page}`,
          kind: 'material',
          issueDate: '2026-07-10',
          workflowStatus: 'prepared',
          projects: [],
        }],
        pagination: { page, pageSize: 100, hasMore: true },
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=waybills&category=work&page=10000&scope=all'),
      envV2,
    );
    const body = await response.json() as { results: Array<{ id: string }>; hasMore: boolean };

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(40);
    expect(body.results).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it('includes material, returns, and unclassified waybills in the Almacén category', async () => {
    const waybill = (id: string, kind: string) => ({
      id,
      docNumber: `ALB-${id}`,
      kind,
      issueDate: '2026-07-10',
      workflowStatus: 'prepared',
      projects: [],
    });
    const fetchImpl = vi.fn().mockResolvedValue(internalJson({
      items: [
        waybill('labour', 'labour'),
        waybill('material', 'material'),
        waybill('refund', 'refund'),
        waybill('unclassified', 'unclassified'),
      ],
      pagination: { page: 1, pageSize: 100, hasMore: false },
    }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=waybills&category=warehouse&page=1&scope=all'),
      envV2,
    );
    const body = await response.json() as { results: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.results.map((item) => item.id)).toEqual(['material', 'refund', 'unclassified']);
  });

  it('maps estimates through the cursor model with total, currency and displayStatus', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(internalJson({
      items: [{
        id: 'est-1',
        docNumber: 'PRE-26-000045',
        issueDate: '2026-07-01',
        dueDate: null,
        subtotal: 100,
        tax: 21,
        total: 121,
        currency: 'EUR',
        customer: { id: 'contact-1', name: 'Acme' },
        projects: [],
        status: 'pending',
        rawStatus: 'sent',
        displayStatus: 'sent',
        sentAt: '2026-07-01T11:30:00Z',
        notes: 'Incluye transporte.',
        internalNotes: 'Revisar margen antes de aceptar.',
        attachments: [],
        freshness: 'live',
        syncPending: false,
      }],
      hasMore: true,
      nextCursor: 'cursor-2',
    }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=estimates&scope=all&cursor=cursor-1'),
      envV2,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `${INTERNAL_BASE}/estimates?customerId=contact-1&cursor=cursor-1&limit=10`,
    );
    expect(body).toEqual({
      type: 'estimates',
      scope: 'all',
      hasMore: true,
      nextCursor: 'cursor-2',
      results: [{
        type: 'estimates',
        id: 'est-1',
        documentNumber: 'PRE-26-000045',
        url: 'https://app.holded.com/sales/estimates#open:estimate-est-1',
        issueDate: '2026-07-01',
        sentAt: '2026-07-01T11:30:00Z',
        dueDate: null,
        displayStatus: 'sent',
        total: 121,
        currency: 'EUR',
        notes: 'Incluye transporte.',
        internalNotes: 'Revisar margen antes de aceptar.',
        attachments: [],
        projects: [],
      }],
    });
  });

  it('maps invoices for the card-linked customer and project with amounts and source relationships', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(internalJson({
      items: [{
        id: 'invoice-1',
        docNumber: 'F-26-000321',
        issueDate: '2026-07-15',
        dueDate: '2026-08-15',
        accountingDate: '2026-07-15',
        forecastDate: '2026-08-15',
        customer: { id: 'contact-1', name: 'Acme' },
        projects: [
          { id: 'project-1', name: 'Obra Norte', color: '#4bce97' },
          { id: 'project-2', name: 'Ampliación', color: null },
        ],
        rawStatus: 'paid',
        isDraft: false,
        approvedAt: '2026-07-15T09:00:00Z',
        lifecycleStatus: 'issued',
        collectionStatus: 'partial',
        isOverdue: false,
        displayStatus: 'partial',
        amounts: {
          subtotal: '1000.00',
          tax: '210.00',
          total: '1210.00',
          paid: '210.00',
          pending: '1000.00',
          refunded: '0.00',
          currency: 'EUR',
        },
        paymentMethodId: null,
        siiStatus: null,
        verifactuStatus: null,
        description: 'Trabajo finalizado.',
        internalNotes: 'Pendiente comprobar el cobro.',
        attachments: [],
        sourceDocuments: [
          { type: 'waybill', id: 'wb-1', docNumber: 'ALB-26-000123' },
          { type: 'salesorder', id: 'so-1', docNumber: 'PV-26-008005' },
        ],
      }],
      pagination: { page: 2, pageSize: 10, hasMore: true },
      readiness: 'ready',
    }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=invoices&page=2&scope=matched&projectId=project-1'),
      envV2,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `${INTERNAL_BASE}/invoices?customerId=contact-1&projectId=project-1&page=2&pageSize=10`,
    );
    expect(body).toEqual({
      type: 'invoices',
      scope: 'matched',
      page: 2,
      pageSize: 10,
      hasMore: true,
      results: [{
        type: 'invoices',
        id: 'invoice-1',
        documentNumber: 'F-26-000321',
        url: 'https://app.holded.com/sales/revenue#open:invoice-invoice-1',
        issueDate: '2026-07-15',
        approvedAt: '2026-07-15T09:00:00Z',
        dueDate: '2026-08-15',
        lifecycleStatus: 'issued',
        collectionStatus: 'partial',
        isOverdue: false,
        displayStatus: 'partial',
        amounts: {
          subtotal: '1000.00',
          tax: '210.00',
          total: '1210.00',
          paid: '210.00',
          pending: '1000.00',
          refunded: '0.00',
          currency: 'EUR',
        },
        projects: [
          { id: 'project-1', name: 'Obra Norte', color: '#4bce97' },
          { id: 'project-2', name: 'Ampliación', color: null },
        ],
        notes: 'Trabajo finalizado.',
        internalNotes: 'Pendiente comprobar el cobro.',
        attachments: [],
        sourceDocuments: [
          { type: 'waybill', id: 'wb-1', docNumber: 'ALB-26-000123' },
          { type: 'salesorder', id: 'so-1', docNumber: 'PV-26-008005' },
        ],
      }],
    });
  });

  it('omits projectId in the "all" scope and rejects an unknown scope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(internalJson({ items: [], pagination: { hasMore: false }, readiness: 'ready' }));
    vi.stubGlobal('fetch', fetchImpl);

    await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders&scope=all&projectId=project-1'),
      envV2,
    );
    expect(fetchImpl.mock.calls[0][0]).toBe(`${INTERNAL_BASE}/sales-orders?customerId=contact-1&page=1&pageSize=10`);

    const bad = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders&scope=weird'),
      envV2,
    );
    expect(bad.status).toBe(400);
  });

  it('returns 503 DATA_NOT_READY when the internal API is still syncing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      internalJson({ error: { code: 'DATA_NOT_READY', message: 'sync in progress' } }, 503),
    );
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders'),
      envV2,
    );
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('DATA_NOT_READY');
  });

  it('treats a non-ready readiness flag as DATA_NOT_READY', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      internalJson({ items: [], pagination: { hasMore: false }, readiness: 'pending' }),
    );
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders'),
      envV2,
    );

    expect(response.status).toBe(503);
    expect((await response.json() as { error: { code: string } }).error.code).toBe('DATA_NOT_READY');
  });

  it('returns a config error without leaking the key when the internal API rejects auth', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      internalJson({ error: { code: 'UNAUTHORIZED', message: 'bad key' } }, 401),
    );
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/documents/search?contactId=contact-1&type=sales-orders'),
      envV2,
    );
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain('efk_test');
    expect(JSON.parse(raw).error.code).toBe('CONFIG');
  });

  it('proxies internal contact detail through /v2/contacts/:id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(internalJson({
      id: 'contact-1',
      name: 'Acme',
      customFields: [{ field: 'trello', value: 'Aviso' }],
      shippingAddresses: [],
    }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/contacts/contact-1'),
      envV2,
    );
    const body = await response.json() as { id: string; customFields: unknown[] };

    expect(response.status).toBe(200);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${INTERNAL_BASE}/contacts/contact-1`);
    expect(body).toMatchObject({ id: 'contact-1', customFields: [{ field: 'trello', value: 'Aviso' }] });
  });

  it('creates a contact through the internal API forwarding the idempotency key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(internalJson({ id: 'contact-9', name: 'Nuevo' }, 201));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/contacts?idempotencyKey=idem-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nuevo', code: 'B1' }),
      }),
      envV2,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${INTERNAL_BASE}/contacts`);
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer efk_test', 'Idempotency-Key': 'idem-1' });
    expect(JSON.parse(init.body)).toEqual({ name: 'Nuevo', code: 'B1' });
    expect(body).toEqual({ id: 'contact-9', name: 'Nuevo' });
  });

  it('appends a shipping address through the internal API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(internalJson({ contactId: 'contact-9', address: { name: 'Obra' } }, 201));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/contacts/contact-9/shipping-addresses?idempotencyKey=idem-2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Obra', address: 'Calle 1' }),
      }),
      envV2,
    );

    expect(response.status).toBe(201);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${INTERNAL_BASE}/contacts/contact-9/shipping-addresses`);
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ 'Idempotency-Key': 'idem-2' });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ name: 'Obra', address: 'Calle 1' });
  });

  it('surfaces the internal validation detail on a failed create', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      internalJson({ error: { code: 'INVALID_REQUEST', message: 'code already used' } }, 400),
    );
    vi.stubGlobal('fetch', fetchImpl);

    const response = await worker.fetch(
      new Request('https://proxy.test/v2/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }),
      envV2,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'code already used' });
  });
});
