import { describe, it, expect } from 'vitest';
import { getCardBackSection } from './card-back-section';

describe('getCardBackSection', () => {
  it('always renders the Holded card-back section, even with nothing linked', async () => {
    const t = { signUrl: (url: string) => `signed:${url}` };
    const section = await getCardBackSection(t, 'holded-icon.png');

    expect(section).not.toBeNull();
    expect(section?.title).toBe('Holded');
    expect(section?.icon).toBe('holded-icon.png');
    expect(section?.content).toEqual({ type: 'iframe', url: 'signed:./card-back.html', height: 100 });
  });
});
