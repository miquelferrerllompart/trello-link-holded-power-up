import { getProjects } from '../holded-api';
import { getApiKey, getCardData, setCardData } from '../storage';
import type { HoldedProject, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe() as unknown as TrelloContext;
const searchInput = document.getElementById('search') as HTMLInputElement;
const resultsDiv = document.getElementById('results') as HTMLDivElement;

let debounceTimer: ReturnType<typeof setTimeout>;
let allProjects: HoldedProject[] | null = null;

async function loadProjects(): Promise<HoldedProject[]> {
  if (allProjects) return allProjects;
  const apiKey = await getApiKey(t);
  if (!apiKey) {
    resultsDiv.innerHTML = '<div class="error">API Key no configurada. Usa el botón "Configurar Holded" en el tablero.</div>';
    return [];
  }
  resultsDiv.innerHTML = '<div class="loading">Cargando proyectos...</div>';
  allProjects = await getProjects(apiKey);
  return allProjects;
}

function filterProjects(projects: HoldedProject[], query: string): HoldedProject[] {
  if (!query) return projects;
  const q = query.toLowerCase();
  return projects.filter((p) => p.name.toLowerCase().includes(q));
}

function renderResults(projects: HoldedProject[]) {
  if (projects.length === 0) {
    resultsDiv.innerHTML = '<div class="empty">No se encontraron proyectos.</div>';
    return;
  }
  resultsDiv.innerHTML = projects
    .map(
      (p) => `
    <div class="result-item" data-id="${p.id}" data-name="${p.name}">
      <div class="result-name">${p.name}</div>
      ${p.status ? `<div class="result-status">${p.status}</div>` : ''}
    </div>
  `
    )
    .join('');

  resultsDiv.querySelectorAll('.result-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id!;
      const name = (el as HTMLElement).dataset.name!;
      const data = await getCardData(t);
      data.projectId = id;
      data.projectName = name;
      await setCardData(t, data);
      t.closePopup();
    });
  });
}

async function doSearch() {
  try {
    const projects = await loadProjects();
    const filtered = filterProjects(projects, searchInput.value.trim());
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
