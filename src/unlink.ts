import { getCardData, setCardData } from './storage';
import { removeTag } from './description-tags';
import { updateCardDescription } from './trello-api';
import type { TrelloContext } from './types';

/**
 * Unlink a contact or project from the card: remove its `{{ … }}` tag from the
 * description (through the reliable REST write path) and clear it from card
 * storage. Runs in the unlink popup, not the card-back iframe, so the Trello
 * write token is available.
 */
export async function unlinkField(t: TrelloContext, field: 'contact' | 'project'): Promise<void> {
  const card = await t.card('id', 'desc');
  const newDesc = removeTag(card.desc || '', field);
  if (newDesc !== (card.desc || '').trim()) {
    await updateCardDescription(t, newDesc);
  }

  const data = await getCardData(t);
  if (field === 'contact') {
    delete data.contactId;
    delete data.contactName;
    delete data.addressLabel;
  } else {
    delete data.projectId;
    delete data.projectName;
  }
  await setCardData(t, data);
}
