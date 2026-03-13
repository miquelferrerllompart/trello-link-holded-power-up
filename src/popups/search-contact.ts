import { searchContacts } from '../holded-api';
import { getCardData, setCardData } from '../storage';
import { addTag } from '../description-tags';
import { updateCardDescription } from '../trello-api';
import { fuzzyFilter } from '../search-utils';
import type { HoldedContact, PendingContactSelection, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe({ appKey: '81d86f6c21c827e54947d36746561233', appName: 'Holded' }) as unknown as TrelloContext;
const searchInput = document.getElementById('search') as HTMLInputElement;
const resultsDiv = document.getElementById('results') as HTMLDivElement;

let debounceTimer: ReturnType<typeof setTimeout>;
let allContacts: HoldedContact[] | null = null;
let contactsPromise: Promise<HoldedContact[]> | null = null;

function fetchContacts(): Promise<HoldedContact[]> {
  if (!contactsPromise) {
    contactsPromise = searchContacts('').then((c) => { allContacts = c; return c; });
  }
  return contactsPromise;
}

function stripNonDigits(v: string | null | undefined): string {
  return v ? v.replace(/\D/g, '') : '';
}

function filterContacts(contacts: HoldedContact[], query: string): HoldedContact[] {
  return fuzzyFilter(contacts, query, (c) =>
    [c.name, c.email, c.code, c.tradeName, c.vatnumber, c.phone, c.mobile,
     stripNonDigits(c.phone), stripNonDigits(c.mobile)].filter(Boolean).join(' ')
  );
}

function addCreateButton() {
  resultsDiv.insertAdjacentHTML('beforeend',
    '<button class="create-btn" id="create-contact-btn">+ Crear contacto nuevo</button>');
  document.getElementById('create-contact-btn')!.addEventListener('click', () => {
    t.popup({ title: 'Crear contacto', url: './create-contact.html', height: 420 });
  });
}

function renderResults(contacts: HoldedContact[], query: string) {
  // Empty state: no query yet
  if (!query) {
    resultsDiv.innerHTML = '<div class="empty">Busca un contacto por nombre, email o NIF</div>';
    addCreateButton();
    return;
  }

  if (contacts.length === 0) {
    resultsDiv.innerHTML = '<div class="empty">No se encontraron clientes.</div>';
    addCreateButton();
    return;
  }
  resultsDiv.innerHTML = contacts
    .map(
      (c) => {
        const initials = c.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        return `
    <div class="result-item" data-id="${c.id}" data-name="${c.name}">
      <div class="result-avatar">${initials}</div>
      <div class="result-info">
        <div class="result-name">${c.name}</div>
        ${c.code || c.email ? `<div class="result-email">${[c.code, c.email].filter(Boolean).join(' · ')}</div>` : ''}
      </div>
    </div>`;
      }
    )
    .join('');

  if (contacts.length <= 3) {
    addCreateButton();
  }

  resultsDiv.querySelectorAll('.result-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id!;
      const contact = contacts.find((c) => c.id === id)!;

      if (contact.shippingAddresses && contact.shippingAddresses.length > 0) {
        // Multiple addresses — open address selection popup
        const pending: PendingContactSelection = {
          contactId: contact.id,
          contactName: contact.name,
          billAddress: contact.billAddress,
          shippingAddresses: contact.shippingAddresses,
        };
        await t.set('card', 'shared', 'holdedPendingContact', pending);
        t.popup({ title: 'Seleccionar dirección', url: './select-address.html', height: 300 });
      } else {
        // Single address — assign directly
        const addressLabel = [contact.billAddress?.address, contact.billAddress?.city]
          .filter(Boolean).join(', ') || undefined;
        const data = await getCardData(t);
        data.contactId = contact.id;
        data.contactName = contact.name;
        data.addressLabel = addressLabel;
        await setCardData(t, data);
        try {
          const card = await t.card('id', 'desc');
          const newDesc = addTag(card.desc || '', 'contact', contact.name, addressLabel);
          await updateCardDescription(t, newDesc);
        } catch (err) { console.error('Holded: error syncing description', err); }
        t.closePopup();
      }
    });
  });
}

async function doSearch() {
  const query = searchInput.value.trim();

  if (!query) {
    renderResults([], query);
    // Pre-load contacts in background for faster first search
    fetchContacts().catch(() => {});
    return;
  }

  // Show spinner only when user has typed and contacts aren't cached yet
  if (!allContacts) {
    resultsDiv.innerHTML = '<div class="loading">Cargando clientes...</div>';
  }

  try {
    const contacts = await fetchContacts();
    const filtered = filterContacts(contacts, query);
    renderResults(filtered, query);
  } catch (err) {
    resultsDiv.innerHTML = `<div class="error">Error: ${(err as Error).message}</div>`;
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doSearch, 300);
});

// Initial load
doSearch();
