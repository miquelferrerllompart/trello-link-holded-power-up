import { searchProjects } from '../holded-api';
import { getCardData, setCardData } from '../storage';
import { addTag } from '../description-tags';
import { updateCardDescription } from '../trello-api';
import { TRELLO_APP_KEY } from '../config';
import type { HoldedProject, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe({ appKey: TRELLO_APP_KEY, appName: 'Holded' }) as unknown as TrelloContext;
const searchInput = document.getElementById('search') as HTMLInputElement;
const resultsDiv = document.getElementById('results') as HTMLDivElement;

let debounceTimer: ReturnType<typeof setTimeout>;

function renderResults(projects: HoldedProject[], query: string) {
  if (!query) {
    resultsDiv.innerHTML = '<div class="empty">Busca un proyecto por nombre</div>';
    return;
  }

  if (projects.length === 0) {
    resultsDiv.innerHTML = '<div class="empty">No se encontraron proyectos.</div>' +
      '<button class="create-btn" id="create-project-btn">+ Crear proyecto en Holded</button>';
    document.getElementById('create-project-btn')!.addEventListener('click', () => {
      window.open('https://app.holded.com/projects/view', '_blank');
    });
    return;
  }
  resultsDiv.innerHTML = projects
    .map(
      (p) => {
        const initials = p.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        const subtitle = p.contactName || p.key || '';
        return `
    <div class="result-item" data-id="${p.id}" data-name="${p.name}">
      <div class="result-avatar">${initials}</div>
      <div class="result-info">
        <div class="result-name">${p.name}</div>
        ${subtitle ? `<div class="result-status">${subtitle}</div>` : ''}
      </div>
    </div>`;
      }
    )
    .join('');

  if (projects.length <= 3) {
    resultsDiv.insertAdjacentHTML('beforeend',
      '<button class="create-btn" id="create-project-btn">+ Crear proyecto en Holded</button>');
    document.getElementById('create-project-btn')!.addEventListener('click', () => {
      window.open('https://app.holded.com/projects/view', '_blank');
    });
  }

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
      } catch (err) { console.error('Holded: error syncing description', err); }
      t.closePopup();
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
    const { results } = await searchProjects(query);
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
