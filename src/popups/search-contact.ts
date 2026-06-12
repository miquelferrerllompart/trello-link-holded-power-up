import { searchContacts, refreshContacts } from '../holded-api';
import { getCardData, setCardData } from '../storage';
import { addTag } from '../description-tags';
import { updateCardDescription } from '../trello-api';
import { TRELLO_APP_KEY } from '../config';
import { formatSpanishTextCase } from '../spanish-text-case';
import type { HoldedContact, PendingContactSelection, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe({ appKey: TRELLO_APP_KEY, appName: 'Holded' }) as unknown as TrelloContext;
const searchInput = document.getElementById('search') as HTMLInputElement;
const resultsDiv = document.getElementById('results') as HTMLDivElement;
const reloadBtn = document.getElementById('reload-btn') as HTMLButtonElement;
const tooltipEl = reloadBtn.querySelector('.tooltip') as HTMLSpanElement;

let debounceTimer: ReturnType<typeof setTimeout>;
let totalContacts: number | null = null;

function updateTooltip() {
  if (totalContacts !== null) {
    tooltipEl.textContent = `${totalContacts} contactos en caché — pulsa para recargar desde Holded`;
  } else {
    tooltipEl.textContent = 'Cargar lista de contactos desde Holded';
  }
}

function addCreateButton() {
  resultsDiv.insertAdjacentHTML('beforeend',
    '<button class="create-btn" id="create-contact-btn">+ Crear contacto nuevo</button>');
  document.getElementById('create-contact-btn')!.addEventListener('click', () => {
    t.popup({ title: 'Crear contacto', url: './create-contact.html', height: 420 });
  });
}

function renderResults(contacts: HoldedContact[], query: string) {
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
      const contactName = formatSpanishTextCase(contact.name);

      if (contact.shippingAddresses && contact.shippingAddresses.length > 0) {
        const pending: PendingContactSelection = {
          contactId: contact.id,
          contactName,
          billAddress: contact.billAddress,
          shippingAddresses: contact.shippingAddresses,
        };
        await t.set('card', 'shared', 'holdedPendingContact', pending);
        t.popup({ title: 'Seleccionar dirección', url: './select-address.html', height: 300 });
      } else {
        const addressLabel = [
          formatSpanishTextCase(contact.billAddress?.address || ''),
          formatSpanishTextCase(contact.billAddress?.city || ''),
        ]
          .filter(Boolean).join(', ') || undefined;
        const data = await getCardData(t);
        data.contactId = contact.id;
        data.contactName = contactName;
        data.addressLabel = addressLabel;
        await setCardData(t, data);
        try {
          const card = await t.card('id', 'desc');
          const newDesc = addTag(card.desc || '', 'contact', contactName, addressLabel);
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
    return;
  }

  resultsDiv.innerHTML = '<div class="loading">Buscando...</div>';
  try {
    const { total, results } = await searchContacts(query);
    totalContacts = total;
    updateTooltip();
    renderResults(results, query);
  } catch (err) {
    resultsDiv.innerHTML = `<div class="error">Error: ${(err as Error).message}</div>`;
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doSearch, 300);
});

reloadBtn.addEventListener('click', async () => {
  reloadBtn.classList.add('spinning');
  try {
    const { total } = await refreshContacts();
    totalContacts = total;
    updateTooltip();
    // Re-run current search with fresh data
    const query = searchInput.value.trim();
    if (query) {
      const { results } = await searchContacts(query);
      renderResults(results, query);
    }
  } catch (err) {
    resultsDiv.innerHTML = `<div class="error">Error: ${(err as Error).message}</div>`;
  }
  reloadBtn.classList.remove('spinning');
});

// Warm up: trigger a no-query search so the worker loads contacts into KV if not cached
searchContacts('').then(({ total }) => {
  totalContacts = total;
  updateTooltip();
}).catch(() => {});

renderResults([], '');
