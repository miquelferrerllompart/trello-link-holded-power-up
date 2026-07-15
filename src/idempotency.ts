import { generateIdempotencyKey } from './holded-api';

export interface SubmissionKeyer {
  /** Key for a submission identified by `signature`: stable across retries of the
   *  same signature, fresh when the signature changes. */
  keyFor(signature: string): string;
  /** Call once the whole workflow succeeds so the next submission gets a fresh key. */
  reset(): void;
}

/**
 * Tracks one idempotency key per logical write submission. Reusing the key across
 * retries of the *same* payload lets the internal API dedupe (no duplicate write);
 * a changed payload is a new operation and gets a new key.
 */
export function createSubmissionKeyer(generate: () => string = generateIdempotencyKey): SubmissionKeyer {
  let current: { signature: string; key: string } | null = null;
  return {
    keyFor(signature: string): string {
      if (!current || current.signature !== signature) {
        current = { signature, key: generate() };
      }
      return current.key;
    },
    reset(): void {
      current = null;
    },
  };
}
