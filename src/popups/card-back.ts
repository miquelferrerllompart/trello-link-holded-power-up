const HOLDED_CONTACT_URL = 'https://app.holded.com/contacts/';
const HOLDED_PROJECT_URL = 'https://app.holded.com/projects/p/';

const contentDiv = document.getElementById('content') as HTMLDivElement;

async function render() {
  try {
    const t = window.TrelloPowerUp.iframe();
    const data = (await t.get('card', 'shared', 'holdedData')) || {};

    const rows: string[] = [];

    if (data.contactName) {
      const link = data.contactId
        ? `<a class="value link" href="${HOLDED_CONTACT_URL}${data.contactId}" target="_blank">${data.contactName}</a>`
        : `<div class="value">${data.contactName}</div>`;
      rows.push(`
        <div class="row">
          <div>
            <div class="label">Cliente</div>
            ${link}
          </div>
          <span class="unlink" data-field="contact">Desvincular</span>
        </div>
      `);
    }

    if (data.projectName) {
      const link = data.projectId
        ? `<a class="value link" href="${HOLDED_PROJECT_URL}${data.projectId}" target="_blank">${data.projectName}</a>`
        : `<div class="value">${data.projectName}</div>`;
      rows.push(`
        <div class="row">
          <div>
            <div class="label">Proyecto</div>
            ${link}
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
        const current = (await t.get('card', 'shared', 'holdedData')) || {};
        if (field === 'contact') {
          delete current.contactId;
          delete current.contactName;
        } else {
          delete current.projectId;
          delete current.projectName;
        }
        await t.set('card', 'shared', 'holdedData', current);
        render();
      });
    });

    t.sizeTo(contentDiv).catch(() => {});
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    contentDiv.innerHTML = `<div style="color:red;padding:8px;font-size:12px;">Error: ${msg}</div>`;
  }
}

render();
