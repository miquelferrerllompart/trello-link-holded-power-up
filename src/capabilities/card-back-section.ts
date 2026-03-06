import type { TrelloContext } from '../types';
import { getCardData } from '../storage';

export async function getCardBackSection(t: unknown, icon: string) {
  const ctx = t as TrelloContext;
  const data = await getCardData(ctx);

  const content: string[] = [];

  if (data.contactName) {
    content.push(`👤 Cliente: **${data.contactName}**`);
  }
  if (data.projectName) {
    content.push(`📁 Proyecto: **${data.projectName}**`);
  }

  if (content.length === 0) return null;

  return {
    title: 'Holded',
    icon,
    content: {
      type: 'iframe',
      url: './src/popups/card-back.html',
      height: 100,
    },
  };
}
