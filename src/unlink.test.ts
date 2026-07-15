import { afterEach, describe, expect, it, vi } from 'vitest';
import { unlinkField } from './unlink';

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
    const t = makeContext(
      'Notas del cliente\n\n\n{{ contact: Cliente | Calle Mayor 1 }}\n\n\n{{ project: Obra Norte }}',
      { contactId: 'c1', contactName: 'Cliente', addressLabel: 'Calle Mayor 1', projectId: 'p1', projectName: 'Obra Norte' },
    );

    await unlinkField(t, 'contact');

    const put = fetchImpl.mock.calls[0];
    expect(put[0]).toContain('api.trello.com/1/cards/card-1');
    expect(put[1].method).toBe('PUT');
    const desc = JSON.parse(put[1].body).desc;
    expect(desc).not.toContain('{{ contact:');
    expect(desc).toContain('{{ project: Obra Norte }}'); // project tag preserved

    const saved = t.set.mock.calls[t.set.mock.calls.length - 1][3];
    expect(saved.contactId).toBeUndefined();
    expect(saved.contactName).toBeUndefined();
    expect(saved.addressLabel).toBeUndefined();
    expect(saved.projectId).toBe('p1'); // project link preserved
  });

  it('removes a project tag whose value contains braces', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const t = makeContext('{{ project: Obra {Fase 2} }}', { projectId: 'p1', projectName: 'Obra {Fase 2}' });

    await unlinkField(t, 'project');

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).desc).toBe('');
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
