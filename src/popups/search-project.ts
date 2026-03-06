import { getProjects } from '../holded-api';
import { getCardData, setCardData } from '../storage';
import { addTag } from '../description-tags';
import { updateCardDescription } from '../trello-api';
import type { HoldedProject, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe() as unknown as TrelloContext;
const searchInput = document.getElementById('search') as HTMLInputElement;
const resultsDiv = document.getElementById('results') as HTMLDivElement;

let debounceTimer: ReturnType<typeof setTimeout>;
let allProjects: HoldedProject[] | null = null;

async function loadProjects(): Promise<HoldedProject[]> {
  if (allProjects) return allProjects;
  resultsDiv.innerHTML = '<div class="loading">Cargando proyectos...</div>';
  allProjects = await getProjects();
  return allProjects;
}

function filterProjects(projects: HoldedProject[], query: string): HoldedProject[] {
  if (!query) return projects;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return projects.filter((p) => {
    const text = [p.name, p.status].filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

function renderResults(projects: HoldedProject[]) {
  if (projects.length === 0) {
    resultsDiv.innerHTML = '<div class="empty">No se encontraron proyectos.</div>';
    return;
  }
  resultsDiv.innerHTML = projects
    .map(
      (p) => {
        const initials = p.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        return `
    <div class="result-item" data-id="${p.id}" data-name="${p.name}">
      <div class="result-avatar">${initials}</div>
      <div class="result-info">
        <div class="result-name">${p.name}</div>
        ${p.status ? `<div class="result-status">${p.status}</div>` : ''}
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
      data.projectId = id;
      data.projectName = name;
      await setCardData(t, data);
      try {
        const card = await t.card('id', 'desc');
        const newDesc = addTag(card.desc || '', 'project', name);
        await updateCardDescription(t, newDesc);
      } catch { /* description sync is best-effort */ }
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
