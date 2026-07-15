import { unlinkField } from '../unlink';
import { TRELLO_APP_KEY } from '../config';
import type { TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe({ appKey: TRELLO_APP_KEY, appName: 'Holded' }) as unknown as TrelloContext;

const params = new URLSearchParams(window.location.search);
const field: 'contact' | 'project' = params.get('field') === 'project' ? 'project' : 'contact';

const labelEl = document.getElementById('label') as HTMLSpanElement;
const confirmBtn = document.getElementById('confirm') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement;
const errorEl = document.getElementById('error') as HTMLDivElement;

labelEl.textContent = field === 'contact' ? 'cliente' : 'proyecto';

cancelBtn.addEventListener('click', () => t.closePopup());

confirmBtn.addEventListener('click', async () => {
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;
  errorEl.style.display = 'none';

  try {
    await unlinkField(t, field);
    t.closePopup();
  } catch (err) {
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    errorEl.textContent = (err as Error).message || 'No se pudo desvincular.';
    errorEl.style.display = 'block';
  }
});
