import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContact, addShippingAddress, searchContacts, searchProjects, getContactDetail } from './holded-api';

describe('Holded frontend API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches contacts through the proxy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      total: 1,
      results: [{ id: 'contact-1', name: 'Acme' }],
    })));
    vi.stubGlobal('fetch', fetchImpl);

    const result = await searchContacts('Acme');

    expect(result.results).toEqual([{ id: 'contact-1', name: 'Acme' }]);
    expect(fetchImpl.mock.calls[0][0]).toContain('/contacts/search?q=Acme');
  });

  it('searches projects through the proxy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      total: 1,
      results: [{ id: 'project-1', name: 'Obra' }],
    })));
    vi.stubGlobal('fetch', fetchImpl);

    const result = await searchProjects('Obra');

    expect(result.results).toEqual([{ id: 'project-1', name: 'Obra' }]);
    expect(fetchImpl.mock.calls[0][0]).toContain('/projects/search?q=Obra');
  });

  it('fetches full contact detail from the internal contact route', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'contact-1',
      name: 'Acme',
      shippingAddresses: [],
    })));
    vi.stubGlobal('fetch', fetchImpl);

    const result = await getContactDetail('contact-1');

    expect(result).toMatchObject({ id: 'contact-1', name: 'Acme' });
    expect(fetchImpl.mock.calls[0][0]).toContain('/v2/contacts/contact-1');
  });

  it('creates contacts through the internal endpoint with a camelCase payload and idempotency key', async () => {
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
    expect(fetchImpl.mock.calls[0][0]).toContain('/v2/contacts?idempotencyKey=');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toEqual({
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
  });

  it('appends a shipping address through the internal endpoint with an idempotency key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchImpl);

    await addShippingAddress('contact-1', {
      name: 'Obra Norte',
      address: 'Calle Dos',
      city: 'Inca',
      postalCode: '07300',
      province: 'Illes Balears',
    });

    expect(fetchImpl.mock.calls[0][0]).toContain('/v2/contacts/contact-1/shipping-addresses?idempotencyKey=');
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).toEqual({
      name: 'Obra Norte',
      address: 'Calle Dos',
      city: 'Inca',
      postalCode: '07300',
      province: 'Illes Balears',
      country: 'España',
    });
  });
});
