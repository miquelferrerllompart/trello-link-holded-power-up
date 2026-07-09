import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContact, searchSalesOrders } from './holded-api';

describe('Holded frontend API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests sales orders by contact and optional project through the proxy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      total: 1,
      results: [{ id: 'order-1', documentNumber: 'PV-100' }],
    })));
    vi.stubGlobal('fetch', fetchImpl);

    const result = await searchSalesOrders('contact-1', 'project-1');

    expect(result.results).toEqual([{ id: 'order-1', documentNumber: 'PV-100' }]);
    expect(fetchImpl.mock.calls[0][0]).toContain('/sales-orders/search?contactId=contact-1&projectId=project-1');
  });

  it('creates contacts through the V2 endpoint with the documented snake_case payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'contact-1',
    }), { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);

    const result = await createContact({
      name: 'Cliente Uno',
      code: 'B123',
      isperson: 0,
      type: 'lead',
      email: 'cliente@example.com',
      phone: '971123123',
      vatnumber: 'ESB123',
      billAddress: {
        address: 'Calle Uno',
        city: 'Palma',
        postalCode: '07001',
        province: 'Illes Balears',
        country: 'Espana',
        countryCode: 'ES',
      },
      defaults: {
        salesTax: ['s_iva_21'],
        purchasesTax: ['p_iva_21'],
      },
    });

    expect(result).toEqual({ id: 'contact-1' });
    expect(fetchImpl.mock.calls[0][0]).toContain('/api/v2/contacts');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toEqual({
      name: 'Cliente Uno',
      code: 'B123',
      is_person: false,
      type: 'lead',
      email: 'cliente@example.com',
      phone: '971123123',
      vat_number: 'ESB123',
      bill_address: {
        address: 'Calle Uno',
        city: 'Palma',
        postal_code: '07001',
        province: 'Illes Balears',
        country: 'Espana',
        country_code: 'ES',
      },
      defaults: {
        sales_tax: ['s_iva_21'],
        purchases_tax: ['p_iva_21'],
      },
    });
  });
});
