import type { HoldedContact, PendingContactSelection, TrelloContext } from './types';
import { extractTrelloCustomField } from './holded-custom-fields';

const TRELLO_PENDING_KEY = 'holdedPendingContact';
const LOCAL_PENDING_PREFIX = 'holdedPendingContact';

interface PendingContactMarker {
  localStorageKey: string;
}

function clean(value: string | null | undefined): string {
  return (value || '').trim();
}

function isPendingContactMarker(value: unknown): value is PendingContactMarker {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as PendingContactMarker).localStorageKey === 'string',
  );
}

async function getLocalStorageKey(t: TrelloContext): Promise<string> {
  const card = await t.card('id');
  return `${LOCAL_PENDING_PREFIX}:${card.id}`;
}

export function buildPendingContactSelection(contact: HoldedContact, contactName: string): PendingContactSelection {
  return {
    contactId: contact.id,
    contactName,
    contactTrelloMessage: extractTrelloCustomField(contact.customFields),
    billAddress: {
      address: clean(contact.billAddress?.address),
      city: clean(contact.billAddress?.city),
      postalCode: clean(contact.billAddress?.postalCode),
      province: clean(contact.billAddress?.province),
    },
    shippingAddresses: (contact.shippingAddresses || []).map((address) => ({
      name: clean(address.name),
      address: clean(address.address),
      city: clean(address.city),
      postalCode: clean(address.postalCode),
      province: clean(address.province),
      country: clean(address.country),
    })),
  };
}

export async function savePendingContactSelection(t: TrelloContext, pending: PendingContactSelection): Promise<void> {
  let localStorageKey: string;

  try {
    localStorageKey = await getLocalStorageKey(t);
    window.localStorage.setItem(localStorageKey, JSON.stringify(pending));
  } catch {
    await t.set('card', 'shared', TRELLO_PENDING_KEY, pending);
    return;
  }

  await t.set('card', 'shared', TRELLO_PENDING_KEY, { localStorageKey });
}

export async function getPendingContactSelection(t: TrelloContext): Promise<PendingContactSelection | null> {
  const stored = await t.get('card', 'shared', TRELLO_PENDING_KEY);

  if (isPendingContactMarker(stored)) {
    try {
      const serialized = window.localStorage.getItem(stored.localStorageKey);
      return serialized ? JSON.parse(serialized) as PendingContactSelection : null;
    } catch {
      return null;
    }
  }

  return (stored as PendingContactSelection) || null;
}

export async function removePendingContactSelection(t: TrelloContext): Promise<void> {
  const stored = await t.get('card', 'shared', TRELLO_PENDING_KEY);

  if (isPendingContactMarker(stored)) {
    try {
      window.localStorage.removeItem(stored.localStorageKey);
    } catch {}
  }

  await t.remove('card', 'shared', TRELLO_PENDING_KEY);
}
