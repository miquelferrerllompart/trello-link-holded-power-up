import type { TrelloContext } from './types';

const TRELLO_API_KEY = '81d86f6c21c827e54947d36746561233'; // TODO: replace with real key

async function ensureAuthorized(t: TrelloContext): Promise<string> {
  const restApi = t.getRestApi();
  const authorized = await restApi.isAuthorized();
  if (!authorized) {
    await restApi.authorize({ expiration: 'never', scope: 'read,write' });
  }
  const token = await restApi.getToken();
  if (!token) throw new Error('No se pudo obtener el token de Trello');
  return token;
}

export async function updateCardDescription(t: TrelloContext, newDesc: string): Promise<void> {
  const token = await ensureAuthorized(t);
  const card = await t.card('id');
  const response = await fetch(
    `https://api.trello.com/1/cards/${card.id}?key=${TRELLO_API_KEY}&token=${token}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desc: newDesc }),
    }
  );
  if (!response.ok) {
    throw new Error(`Error actualizando descripción: ${response.status}`);
  }
}
