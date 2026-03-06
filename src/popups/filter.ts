import { searchContacts, getProjects } from '../holded-api';
import type { HoldedContact, HoldedProject, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe() as unknown as TrelloContext;

// Tab switching
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tabContents.forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    const target = (tab as HTMLElement).dataset.tab!;
    document.getElementById(`tab-${target}`)!.classList.add('active');
  });
});

// State
let selectedContacts: Set<string> = new Set();
let selectedProjects: Set<string> = new Set();
let allContacts: HoldedContact[] = [];
let allProjects: HoldedProject[] = [];

const contactsSearch = document.getElementById('search-contacts') as HTMLInputElement;
const projectsSearch = document.getElementById('search-projects') as HTMLInputElement;
const contactsDiv = document.getElementById('options-contacts') as HTMLDivElement;
const projectsDiv = document.getElementById('options-projects') as HTMLDivElement;

function filterByWords<T>(items: T[], getText: (item: T) => string, query: string): T[] {
  if (!query) return items;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const text = getText(item).toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

function renderContacts(query: string) {
  const filtered = filterByWords(allContacts, (c) => [c.name, c.code, c.email, c.tradeName].filter(Boolean).join(' '), query);
  if (filtered.length === 0) {
    contactsDiv.innerHTML = '<div class="empty">No se encontraron clientes.</div>';
    return;
  }
  contactsDiv.innerHTML = filtered
    .map((c) => `
      <div class="option-item${selectedContacts.has(c.id) ? ' selected' : ''}" data-id="${c.id}" data-name="${c.name}">
        <div class="option-check"></div>
        <div class="option-label">${c.name}</div>
      </div>`)
    .join('');

  contactsDiv.querySelectorAll('.option-item').forEach((el) => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id!;
      if (selectedContacts.has(id)) {
        selectedContacts.delete(id);
      } else {
        selectedContacts.add(id);
      }
      el.classList.toggle('selected');
      saveFilter();
    });
  });
}

function renderProjects(query: string) {
  const filtered = filterByWords(allProjects, (p) => [p.name, p.status].filter(Boolean).join(' '), query);
  if (filtered.length === 0) {
    projectsDiv.innerHTML = '<div class="empty">No se encontraron proyectos.</div>';
    return;
  }
  projectsDiv.innerHTML = filtered
    .map((p) => `
      <div class="option-item${selectedProjects.has(p.id) ? ' selected' : ''}" data-id="${p.id}" data-name="${p.name}">
        <div class="option-check"></div>
        <div class="option-label">${p.name}</div>
      </div>`)
    .join('');

  projectsDiv.querySelectorAll('.option-item').forEach((el) => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id!;
      if (selectedProjects.has(id)) {
        selectedProjects.delete(id);
      } else {
        selectedProjects.add(id);
      }
      el.classList.toggle('selected');
      saveFilter();
    });
  });
}

function saveFilter() {
  t.filterCards({
    contactIds: Array.from(selectedContacts),
    projectIds: Array.from(selectedProjects),
  });
}

let contactsDebounce: ReturnType<typeof setTimeout>;
let projectsDebounce: ReturnType<typeof setTimeout>;

contactsSearch.addEventListener('input', () => {
  clearTimeout(contactsDebounce);
  contactsDebounce = setTimeout(() => renderContacts(contactsSearch.value.trim()), 200);
});

projectsSearch.addEventListener('input', () => {
  clearTimeout(projectsDebounce);
  projectsDebounce = setTimeout(() => renderProjects(projectsSearch.value.trim()), 200);
});

// Load data
async function init() {
  contactsDiv.innerHTML = '<div class="loading">Cargando clientes...</div>';
  projectsDiv.innerHTML = '<div class="loading">Cargando proyectos...</div>';

  try {
    allContacts = await searchContacts('');
    renderContacts('');
  } catch {
    contactsDiv.innerHTML = '<div class="empty">Error cargando clientes.</div>';
  }

  try {
    allProjects = await getProjects();
    renderProjects('');
  } catch {
    projectsDiv.innerHTML = '<div class="empty">Error cargando proyectos.</div>';
  }
}

init();
