import { describe, expect, it, vi } from 'vitest';
import {
  buildHoldedV2Headers,
  fetchAllPages,
  normalizeV2Contact,
  normalizeV2SalesOrder,
  filterSalesOrdersForProject,
  buildSalesOrderUrl,
  searchContactsV2,
} from './holded-v2';

describe('Holded V2 helpers', () => {
  it('builds Bearer auth headers for V2 requests', () => {
    expect(buildHoldedV2Headers('sk_test')).toEqual({
      Authorization: 'Bearer sk_test',
      Accept: 'application/json',
    });
  });

  it('fetches cursor-paginated list endpoints until the last page', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'first' }],
        cursor: 'next-cursor',
        has_more: true,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'second' }],
        cursor: null,
        has_more: false,
      })));

    const items = await fetchAllPages<{ id: string }>(
      'https://api.holded.com/api/v2/projects',
      'sk_test',
      fetchImpl,
    );

    expect(items).toEqual([{ id: 'first' }, { id: 'second' }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.holded.com/api/v2/projects?limit=100');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://api.holded.com/api/v2/projects?limit=100&cursor=next-cursor');
  });

  it('normalizes V2 contact snake_case fields to the current frontend shape', () => {
    expect(normalizeV2Contact({
      id: 'contact-1',
      custom_id: 'C-1',
      name: 'Cliente Uno',
      code: 'B123',
      vat_number: 'ESB123',
      trade_name: 'Cliente Trade',
      is_person: true,
      email: 'a@example.com',
      mobile: '600',
      phone: '971',
      type: 'client',
      bill_address: { postal_code: '07001', country_code: 'ES' },
      shipping_addresses: [{ shipping_id: 'ship-1', postal_code: '07002' }],
      custom_fields: [{ field: 'trello', value: 'Aviso' }],
    })).toMatchObject({
      id: 'contact-1',
      customId: 'C-1',
      name: 'Cliente Uno',
      vatnumber: 'ESB123',
      tradeName: 'Cliente Trade',
      isperson: 1,
      billAddress: { postalCode: '07001', countryCode: 'ES' },
      shippingAddresses: [{ shippingId: 'ship-1', postalCode: '07002' }],
      customFields: [{ field: 'trello', value: 'Aviso' }],
    });
  });

  it('fans contact search out to V2 name and exact-match filters, then merges duplicates', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: '1', name: 'Acme', code: 'B1' }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: '1', name: 'Acme', code: 'B1' }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: '2', name: 'Other', email: 'acme@example.com' }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })));

    const contacts = await searchContactsV2('Acme', 'sk_test', fetchImpl);

    expect(contacts.map((contact) => contact.id)).toEqual(['1', '2']);
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      'https://api.holded.com/api/v2/contacts/search?limit=100&name=Acme',
      'https://api.holded.com/api/v2/contacts?limit=100&code=Acme',
      'https://api.holded.com/api/v2/contacts?limit=100&email=Acme',
      'https://api.holded.com/api/v2/contacts?limit=100&phone=Acme',
      'https://api.holded.com/api/v2/contacts?limit=100&mobile=Acme',
    ]);
  });

  it('sorts merged contact results by relevance using the old internal-search fields', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [
          { id: 'name-contains', name: 'Servicios Acme Mallorca', code: 'C-1' },
          { id: 'name-prefix', name: 'Acme Instalaciones', code: 'C-2' },
        ],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'code-exact', name: 'Cliente codigo', code: 'Acme' }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'email-exact', name: 'Cliente email', email: 'acme' }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })));

    const contacts = await searchContactsV2('acme', 'sk_test', fetchImpl);

    expect(contacts.map((contact) => contact.id)).toEqual([
      'code-exact',
      'email-exact',
      'name-prefix',
      'name-contains',
    ]);
  });

  it('uses accent-insensitive and digit-only relevance for contact sorting', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [
          { id: 'name-accent', name: 'Ácme Reformas', code: 'C-1' },
          { id: 'phone-match', name: 'Otro cliente', phone: '+34 971 12 34 56' },
        ],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{ id: 'phone-match', name: 'Otro cliente', phone: '+34 971 12 34 56' }],
        cursor: null,
        has_more: false,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], cursor: null, has_more: false })));

    const contacts = await searchContactsV2('971123456', 'sk_test', fetchImpl);

    expect(contacts.map((contact) => contact.id)).toEqual(['phone-match', 'name-accent']);
  });

  it('normalizes sales orders and filters them by document or line project id', () => {
    const orders = [
      normalizeV2SalesOrder({
        id: '6a4f586ee48789d09401f3e6',
        document_number: 'PV-100',
        contact_id: 'contact-1',
        contact_name: 'Cliente',
        date: '2026-07-01',
        total: '121.00',
        status: 'pending',
        project_id: 'project-1',
        lines: [],
      }),
      normalizeV2SalesOrder({
        id: 'order-2',
        document_number: 'PV-101',
        contact_id: 'contact-1',
        status: 'completed',
        lines: [{ project_id: 'project-1' }],
      }),
      normalizeV2SalesOrder({
        id: 'order-3',
        document_number: 'PV-102',
        contact_id: 'contact-1',
        status: 'pending',
        project_id: 'project-2',
        lines: [],
      }),
    ];

    expect(filterSalesOrdersForProject(orders, 'project-1').map((order) => order.id))
      .toEqual(['6a4f586ee48789d09401f3e6', 'order-2']);
    expect(buildSalesOrderUrl('6a4f586ee48789d09401f3e6'))
      .toBe('https://app.holded.com/sales/orders#open:salesorder-6a4f586ee48789d09401f3e6');
  });
});
