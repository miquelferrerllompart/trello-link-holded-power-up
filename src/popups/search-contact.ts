import { searchContacts } from '../holded-api';
import { getCardData, setCardData } from '../storage';
import { addTag } from '../description-tags';
import { updateCardDescription } from '../trello-api';
import type { HoldedContact, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe() as unknown as TrelloContext;
const searchInput = document.getElementById('search') as HTMLInputElement;
const resultsDiv = document.getElementById('results') as HTMLDivElement;

let debounceTimer: ReturnType<typeof setTimeout>;
let allContacts: HoldedContact[] | null = null;

async function loadContacts(): Promise<HoldedContact[]> {
  if (allContacts) return allContacts;
  resultsDiv.innerHTML = '<div class="loading">Cargando clientes...</div>';
  allContacts = await searchContacts('');
  return allContacts;
}

function filterContacts(contacts: HoldedContact[], query: string): HoldedContact[] {
  if (!query) return contacts;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return contacts.filter((c) => {
    const text = [c.name, c.email, c.code, c.tradeName, c.vatnumber]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

function renderResults(contacts: HoldedContact[]) {
  if (contacts.length === 0) {
    resultsDiv.innerHTML = '<div class="empty">No se encontraron clientes.</div>';
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

  resultsDiv.querySelectorAll('.result-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id!;
      const name = (el as HTMLElement).dataset.name!;
      const data = await getCardData(t);
      data.contactId = id;
      data.contactName = name;
      await setCardData(t, data);
      try {
        const card = await t.card('id', 'desc');
        const newDesc = addTag(card.desc || '', 'contact', name);
        await updateCardDescription(t, newDesc);
      } catch { /* description sync is best-effort */ }
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
