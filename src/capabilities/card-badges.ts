import type { TrelloContext } from '../types';
import { getCardData } from '../storage';
import { CONTACT_ICON, PROJECT_ICON } from '../icons';

export async function getCardBadges(t: unknown) {
  const ctx = t as TrelloContext;
  const data = await getCardData(ctx);
  const badges: Array<{ text: string; icon: string | { dark: string; light: string }; color: string | null }> = [];

  if (data.contactName) {
    badges.push({
      text: data.contactName,
      icon: CONTACT_ICON,
      color: null,
    });
  }

  if (data.projectName) {
    badges.push({
      text: data.projectName,
      icon: PROJECT_ICON,
      color: null,
    });
  }

  return badges;
}
