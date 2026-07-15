import { describe, expect, it } from 'vitest';
import { createSubmissionKeyer } from './idempotency';

describe('createSubmissionKeyer', () => {
  it('reuses the key across retries of the same submission', () => {
    let n = 0;
    const keyer = createSubmissionKeyer(() => `key-${++n}`);

    const first = keyer.keyFor('payload-A');
    const retry = keyer.keyFor('payload-A');

    expect(first).toBe('key-1');
    expect(retry).toBe('key-1'); // same signature → same key, no duplicate write
    expect(n).toBe(1);
  });

  it('issues a fresh key when the submission payload changes', () => {
    let n = 0;
    const keyer = createSubmissionKeyer(() => `key-${++n}`);

    expect(keyer.keyFor('payload-A')).toBe('key-1');
    expect(keyer.keyFor('payload-B')).toBe('key-2'); // edited payload → new operation
  });

  it('starts a fresh key after reset (a completed submission)', () => {
    let n = 0;
    const keyer = createSubmissionKeyer(() => `key-${++n}`);

    expect(keyer.keyFor('payload-A')).toBe('key-1');
    keyer.reset();
    expect(keyer.keyFor('payload-A')).toBe('key-2');
  });
});
