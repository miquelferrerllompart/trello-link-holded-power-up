import { afterEach, describe, expect, it, vi } from 'vitest';

describe('connector capabilities', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('registers only the capabilities enabled in Trello admin', async () => {
    const initialize = vi.fn();
    vi.stubGlobal('window', {
      TrelloPowerUp: { initialize },
    });

    await import('./connector');

    expect(initialize).toHaveBeenCalledTimes(1);
    const capabilities = initialize.mock.calls[0][0] as Record<string, unknown>;

    expect(Object.keys(capabilities).sort()).toEqual([
      'board-buttons',
      'card-back-section',
      'card-badges',
      'card-buttons',
      'card-detail-badges',
      'list-sorters',
      'save-attachment',
    ]);
    expect((capabilities['board-buttons'] as () => unknown)()).toEqual([]);
    expect(capabilities['card-detail-badges']).toBeInstanceOf(Function);
    expect((capabilities['card-detail-badges'] as () => unknown)()).toEqual([]);
    expect((capabilities['list-sorters'] as () => unknown)()).toEqual([]);
    expect((capabilities['save-attachment'] as () => { callback: () => unknown })().callback()).toBeUndefined();
  });
});
