import { getCardData, removeCardData } from '../storage';
import type { TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe() as unknown as TrelloContext;
const contentDiv = document.getElementById('content') as HTMLDivElement;

async function render() {
  const data = await getCardData(t);
  const rows: string[] = [];

  if (data.contactName) {
    rows.push(`
      <div class="row">
        <div>
          <div class="label">Cliente</div>
          <div class="value">${data.contactName}</div>
        </div>
        <span class="unlink" data-field="contact">Desvincular</span>
      </div>
    `);
  }

  if (data.projectName) {
    rows.push(`
      <div class="row">
        <div>
          <div class="label">Proyecto</div>
          <div class="value">${data.projectName}</div>
        </div>
        <span class="unlink" data-field="project">Desvincular</span>
      </div>
    `);
  }

  if (rows.length === 0) {
    contentDiv.innerHTML = '<div class="empty">No hay datos vinculados de Holded.</div>';
  } else {
    contentDiv.innerHTML = rows.join('');
  }

  contentDiv.querySelectorAll('.unlink').forEach((el) => {
    el.addEventListener('click', async () => {
      const field = (el as HTMLElement).dataset.field as 'contact' | 'project';
      await removeCardData(t, field);
      render();
    });
  });

  t.sizeTo(contentDiv);
}

render();
