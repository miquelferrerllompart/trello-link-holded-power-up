import type { CardHoldedData, TrelloContext } from '../types';
import { getCardData } from '../storage';
import { CONTACT_ICON_URL, PROJECT_ICON_URL } from '../icons';

const CONTACT_URL = 'https://app.holded.com/contacts/';
const PROJECT_URL = 'https://app.holded.com/projects/p/';

function emptyCardData(): CardHoldedData {
  return {};
}

export async function getCardBadges(t: unknown) {
  const ctx = t as TrelloContext;
  const data = await getCardData(ctx).catch((err) => {
    console.error('Holded: error loading card badges', err);
    return emptyCardData();
  });
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

export async function getCardDetailBadges(t: unknown) {
  const ctx = t as TrelloContext;
  const data = await getCardData(ctx).catch((err) => {
    console.error('Holded: error loading card detail badges', err);
    return emptyCardData();
  });
  const badges: Array<{ title: string; text: string; color: string | null; url?: string; target?: string }> = [];

  if (data.contactName) {
    badges.push({
      title: 'Cliente Holded',
      text: data.contactName,
      color: 'blue',
      ...(data.contactId ? { url: CONTACT_URL + data.contactId, target: 'Holded Contact' } : {}),
    });
  }

  if (data.projectName) {
    badges.push({
      title: 'Proyecto Holded',
      text: data.projectName,
      color: 'green',
      ...(data.projectId ? { url: PROJECT_URL + data.projectId, target: 'Holded Project' } : {}),
    });
  }

  return badges;
}
