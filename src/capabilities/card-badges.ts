import type { TrelloContext } from '../types';
import { getCardData } from '../storage';

export async function getCardBadges(t: unknown) {
  const ctx = t as TrelloContext;
  const data = await getCardData(ctx);
  const badges: Array<{ text: string; icon: string; color: string | null }> = [];

  if (data.contactName) {
    badges.push({
      text: data.contactName,
      icon: 'https://cdn-icons-png.flaticon.com/512/1077/1077114.png',
      color: null,
    });
  }

  if (data.projectName) {
    badges.push({
      text: data.projectName,
      icon: 'https://cdn-icons-png.flaticon.com/512/716/716784.png',
      color: null,
    });
  }

  return badges;
}
