import { searchContacts } from '../holded-api';
import { getApiKey } from '../storage';
import { getCardData, setCardData } from '../storage';
import type { HoldedContact, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe() as unknown as TrelloContext;
const searchInput = document.getElementById('search') as HTMLInputElement;
const resultsDiv = document.getElementById('results') as HTMLDivElement;

let debounceTimer: ReturnType<typeof setTimeout>;
let allContacts: HoldedContact[] | null = null;

async function loadContacts(): Promise<HoldedContact[]> {
  if (allContacts) return allContacts;
  const apiKey = await getApiKey(t);
  if (!apiKey) {
    resultsDiv.innerHTML = '<div class="error">API Key no configurada. Usa el botón "Configurar Holded" en el tablero.</div>';
    return [];
  }
  resultsDiv.innerHTML = '<div class="loading">Cargando clientes...</div>';
  allContacts = await searchContacts(apiKey, '');
  return allContacts;
}

function filterContacts(contacts: HoldedContact[], query: string): HoldedContact[] {
  if (!query) return contacts;
  const q = query.toLowerCase();
  return contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.vatnumber && c.vatnumber.toLowerCase().includes(q))
  );
}

function renderResults(contacts: HoldedContact[]) {
  if (contacts.length === 0) {
    resultsDiv.innerHTML = '<div class="empty">No se encontraron clientes.</div>';
    return;
  }
  resultsDiv.innerHTML = contacts
    .map(
      (c) => `
    <div class="result-item" data-id="${c.id}" data-name="${c.name}">
      <div class="result-name">${c.name}</div>
      ${c.email ? `<div class="result-email">${c.email}</div>` : ''}
    </div>
  `
    )
    .join('');

  resultsDiv.querySelectorAll('.result-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id!;
      const name = (el as HTMLElement).dataset.name!;
      const data = await getCardData(t);
      data.contactId = id;
      data.contactName = name;
      await setCardData(t, data);
      t.closePopup();
    });
  });
}

async function doSearch() {
  try {
    const contacts = await loadContacts();
    const filtered = filterContacts(contacts, searchInput.value.trim());
    renderResults(filtered);
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
