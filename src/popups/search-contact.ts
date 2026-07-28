import { searchContacts, getContactDetail } from '../holded-api';
import { TRELLO_APP_KEY } from '../config';
import { formatSpanishTextCase } from '../spanish-text-case';
import { buildPendingContactSelection, savePendingContactSelection } from '../pending-contact';
import type { HoldedContact, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe({ appKey: TRELLO_APP_KEY, appName: 'Holded' }) as unknown as TrelloContext;
const searchInput = document.getElementById('search') as HTMLInputElement;
const resultsDiv = document.getElementById('results') as HTMLDivElement;

let debounceTimer: ReturnType<typeof setTimeout>;

function clearSelectionError() {
  resultsDiv.querySelector('.selection-error')?.remove();
}

function showSelectionError(message: string) {
  clearSelectionError();
  resultsDiv.insertAdjacentHTML('afterbegin', `<div class="error selection-error">${message}</div>`);
}

function addCreateButton() {
  resultsDiv.insertAdjacentHTML('beforeend',
    '<button class="create-btn" id="create-contact-btn">+ Crear contacto nuevo</button>');
  document.getElementById('create-contact-btn')!.addEventListener('click', (event) => {
    t.popup({
      title: 'Crear contacto',
      url: './create-contact.html',
      height: 420,
      mouseEvent: event,
    });
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

  resultsDiv.querySelectorAll<HTMLElement>('.result-item').forEach((el) => {
    el.addEventListener('click', async (event) => {
      const id = el.dataset.id!;
      const summary = contacts.find((c) => c.id === id)!;
      const contactName = formatSpanishTextCase(summary.name);

      // Search returns summaries; the addresses come from the full detail. If that
      // fetch fails, stop — linking without it could drop the contact's address.
      // Show a retryable error and let the user click the contact again.
      clearSelectionError();
      let contact: HoldedContact;
      try {
        contact = await getContactDetail(id);
      } catch (err) {
        console.error('Holded: error loading contact detail', err);
        showSelectionError('No se pudo cargar el contacto. Pulsa de nuevo para reintentar.');
        return;
      }

      const pending = buildPendingContactSelection(contact, contactName);
      await savePendingContactSelection(t, pending);
      t.popup({
        title: 'Seleccionar dirección',
        url: './select-address.html',
        height: 300,
        mouseEvent: event,
      });
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
    const { results } = await searchContacts(query);
    renderResults(results, query);
  } catch (err) {
    resultsDiv.innerHTML = `<div class="error">Error: ${(err as Error).message}</div>`;
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doSearch, 300);
});

renderResults([], '');
