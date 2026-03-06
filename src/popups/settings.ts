import { getApiKey, setApiKey } from '../storage';
import type { TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe() as unknown as TrelloContext;
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const saveButton = document.getElementById('save') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;

// Load existing key
getApiKey(t).then((key) => {
  if (key) apiKeyInput.value = key;
});

saveButton.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    statusDiv.textContent = 'Introduce un API Key válido.';
    statusDiv.style.color = '#de350b';
    return;
  }
  await setApiKey(t, key);
  statusDiv.textContent = 'API Key guardada correctamente.';
  statusDiv.style.color = '#00875a';
});
