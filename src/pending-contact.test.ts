import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildPendingContactSelection, savePendingContactSelection } from './pending-contact';
import type { HoldedContact, PendingContactSelection, TrelloContext } from './types';

describe('buildPendingContactSelection', () => {
  it('keeps only the address fields needed by the address popup', () => {
    const contact = {
      id: 'contact-1',
      billAddress: {
        address: '  C/ Mayor 1  ',
        city: '  Palma  ',
        postalCode: ' 07001 ',
        province: ' Illes Balears ',
        country: 'España',
        countryCode: 'ES',
        info: 'unused',
      },
      shippingAddresses: [
        {
          shippingId: 'shipping-1',
          name: ' Obra Son Vida ',
          address: ' Carrer 2 ',
          city: ' Calvia ',
          postalCode: '07184',
          province: ' Illes Balears ',
          country: 'España',
          countryCode: 'ES',
          notes: 'large public notes that should not be stored in pluginData',
          privateNotes: 'large private notes that should not be stored in pluginData',
        },
      ],
    } as HoldedContact;

    const pending = buildPendingContactSelection(contact, 'Cliente');

    expect(pending).toEqual({
      contactId: 'contact-1',
      contactName: 'Cliente',
      billAddress: {
        address: 'C/ Mayor 1',
        city: 'Palma',
        postalCode: '07001',
        province: 'Illes Balears',
        country: 'España',
      },
      shippingAddresses: [
        {
          name: 'Obra Son Vida',
          address: 'Carrer 2',
          city: 'Calvia',
          postalCode: '07184',
          province: 'Illes Balears',
          country: 'España',
        },
      ],
    });
    expect(JSON.stringify(pending)).not.toContain('privateNotes');
    expect(JSON.stringify(pending)).not.toContain('shippingId');
  });
});

describe('savePendingContactSelection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores only a localStorage marker in Trello pluginData', async () => {
    const localStorageData = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        setItem: (key: string, value: string) => localStorageData.set(key, value),
      },
    });

    const set = vi.fn();
    const t = {
      card: vi.fn().mockResolvedValue({ id: 'card-1' }),
      set,
    } as unknown as TrelloContext;
    const pending: PendingContactSelection = {
      contactId: 'contact-1',
      contactName: 'Cliente',
      billAddress: { address: 'C/ Mayor 1', city: 'Palma', postalCode: '07001', province: 'Illes Balears' },
      shippingAddresses: [],
    };

    await savePendingContactSelection(t, pending);

    expect(set).toHaveBeenCalledWith('card', 'shared', 'holdedPendingContact', {
      localStorageKey: 'holdedPendingContact:card-1',
    });
    expect(localStorageData.get('holdedPendingContact:card-1')).toBe(JSON.stringify(pending));
  });
});
