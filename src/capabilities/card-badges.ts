import type { TrelloContext } from '../types';
import { getCardData } from '../storage';
import { CONTACT_ICON_URL, PROJECT_ICON_URL } from '../icons';

export async function getCardBadges(t: unknown) {
  const ctx = t as TrelloContext;
  const data = await getCardData(ctx);
  const badges: Array<{ text: string; icon: string; color: string | null }> = [];

  if (data.contactName) {
    badges.push({
      text: data.contactName,
      icon: CONTACT_ICON_URL,
      color: null,
    });
  }

  if (data.projectName) {
    badges.push({
      text: data.projectName,
      icon: PROJECT_ICON_URL,
      color: null,
    });
  }

  return badges;
}
