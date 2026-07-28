import { afterEach, describe, expect, it, vi } from 'vitest';
import { unlinkField } from './unlink';
import { syncDescriptionSection } from './description-tags';

function makeContext(desc: string, data: Record<string, unknown>) {
  return {
    card: vi.fn(async () => ({ id: 'card-1', desc })),
    get: vi.fn(async () => ({ ...data })),
    set: vi.fn(async () => undefined),
    getRestApi: () => ({
      isAuthorized: async () => true,
      authorize: async () => undefined,
      getToken: async () => 'tok',
    }),
  } as unknown as Parameters<typeof unlinkField>[0] & {
    set: ReturnType<typeof vi.fn>;
  };
}

describe('unlinkField', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('removes the contact tag from the description and clears it from storage', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const data = {
      contactId: 'c1',
      contactName: 'Cliente',
      addressLabel: 'Calle Mayor 1',
      addressMapQuery: 'Calle Mayor 1, 07001 Palma, Illes Balears',
      projectId: 'p1',
      projectName: 'Obra Norte',
    };
    const t = makeContext(syncDescriptionSection('Notas del cliente', data), data);

    await unlinkField(t, 'contact');

    const put = fetchImpl.mock.calls[0];
    expect(put[0]).toContain('api.trello.com/1/cards/card-1');
    expect(put[1].method).toBe('PUT');
    const desc = JSON.parse(put[1].body).desc;
    expect(desc).not.toContain('{{ contact:');
    expect(desc).not.toContain('**Cliente:**');
    expect(desc).toContain('{{ project: Obra Norte }}'); // project tag preserved
    expect(desc).toContain('**Proyecto:** [Obra Norte ↗]');
    expect(desc).not.toContain('### Acciones rápidas');

    const saved = t.set.mock.calls[t.set.mock.calls.length - 1][3];
    expect(saved.contactId).toBeUndefined();
    expect(saved.contactName).toBeUndefined();
    expect(saved.addressLabel).toBeUndefined();
    expect(saved.addressMapQuery).toBeUndefined();
    expect(saved.projectId).toBe('p1'); // project link preserved
  });

  it('removes a project tag whose value contains braces', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const data = { projectId: 'p1', projectName: 'Obra {Fase 2}' };
    const t = makeContext(syncDescriptionSection('Nota previa', data), data);

    await unlinkField(t, 'project');

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).desc).toBe('Nota previa');
    expect(t.set.mock.calls[t.set.mock.calls.length - 1][3].projectId).toBeUndefined();
  });

  it('still clears storage when the description has no tag (no REST write)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const t = makeContext('Just some notes, no tags', { contactId: 'c1', contactName: 'Cliente' });

    await unlinkField(t, 'contact');

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(t.set.mock.calls[t.set.mock.calls.length - 1][3].contactId).toBeUndefined();
  });
});
