import { getCardData, setCardData } from './storage';
import { syncDescriptionSection } from './description-tags';
import { updateCardDescription } from './trello-api';
import type { TrelloContext } from './types';

/**
 * Unlink a contact or project from the card, regenerate or remove the managed
 * description suffix through the reliable REST write path, and clear the
 * entity from card storage. Runs in the unlink popup, not the card-back iframe,
 * so the Trello write token is available.
 */
export async function unlinkField(t: TrelloContext, field: 'contact' | 'project'): Promise<void> {
  const card = await t.card('id', 'desc');
  const data = await getCardData(t);
  if (field === 'contact') {
    delete data.contactId;
    delete data.contactName;
    delete data.email;
    delete data.phone;
    delete data.addressLabel;
    delete data.addressMapQuery;
  } else {
    delete data.projectId;
    delete data.projectName;
  }

  const newDesc = syncDescriptionSection(card.desc || '', data);
  if (newDesc !== (card.desc || '').trim()) {
    await updateCardDescription(t, newDesc);
  }

  await setCardData(t, data);
}
