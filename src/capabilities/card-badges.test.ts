import { describe, expect, it, vi } from 'vitest';
import { getCardBadges, getCardDetailBadges } from './card-badges';
import type { TrelloContext } from '../types';

function makeContext(data: unknown): TrelloContext {
  return {
    get: vi.fn().mockResolvedValue(data),
  } as unknown as TrelloContext;
}

describe('card badges', () => {
  it('returns board badges for linked Holded data', async () => {
    const badges = await getCardBadges(makeContext({
      contactId: 'contact-1',
      contactName: 'Cliente',
      projectId: 'project-1',
      projectName: 'Proyecto',
    }));

    expect(badges).toEqual([
      expect.objectContaining({ text: 'Cliente' }),
      expect.objectContaining({ text: 'Proyecto' }),
    ]);
  });

  it('returns card detail badges without icon fields', async () => {
    const badges = await getCardDetailBadges(makeContext({
      contactId: 'contact-1',
      contactName: 'Cliente',
      projectId: 'project-1',
      projectName: 'Proyecto',
    }));

    expect(badges).toEqual([
      {
        title: 'Cliente Holded',
        text: 'Cliente',
        color: 'blue',
        url: 'https://app.holded.com/contacts/contact-1',
        target: 'Holded Contact',
      },
      {
        title: 'Proyecto Holded',
        text: 'Proyecto',
        color: 'green',
        url: 'https://app.holded.com/projects/p/project-1',
        target: 'Holded Project',
      },
    ]);
    expect(badges.some((badge) => 'icon' in badge)).toBe(false);
  });

  it('returns no badges if Trello storage cannot be read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = {
      get: vi.fn().mockRejectedValue(new Error('storage unavailable')),
    } as unknown as TrelloContext;

    await expect(getCardBadges(ctx)).resolves.toEqual([]);
    await expect(getCardDetailBadges(ctx)).resolves.toEqual([]);

    consoleError.mockRestore();
  });
});
