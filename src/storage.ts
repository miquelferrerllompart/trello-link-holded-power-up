import type { CardHoldedData, TrelloContext } from './types';

const STORAGE_KEY = 'holdedData';
const API_KEY_STORAGE = 'holdedApiKey';

export async function getCardData(t: TrelloContext): Promise<CardHoldedData> {
  const data = await t.get('card', 'shared', STORAGE_KEY);
  return (data as CardHoldedData) || {};
}

export async function setCardData(t: TrelloContext, data: CardHoldedData): Promise<void> {
  await t.set('card', 'shared', STORAGE_KEY, data);
}

export async function removeCardData(t: TrelloContext, field: 'contact' | 'project'): Promise<void> {
  const data = await getCardData(t);
  if (field === 'contact') {
    delete data.contactId;
    delete data.contactName;
  } else {
    delete data.projectId;
    delete data.projectName;
  }
  await t.set('card', 'shared', STORAGE_KEY, data);
}

export async function getApiKey(t: TrelloContext): Promise<string> {
  const key = await t.get('board', 'shared', API_KEY_STORAGE);
  return (key as string) || '';
}

export async function setApiKey(t: TrelloContext, apiKey: string): Promise<void> {
  await t.set('board', 'shared', API_KEY_STORAGE, apiKey);
}
