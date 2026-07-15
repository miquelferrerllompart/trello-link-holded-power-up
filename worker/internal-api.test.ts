import { describe, expect, it, vi } from 'vitest';
import {
  INTERNAL_API_BASE,
  InternalApiError,
  internalApiGet,
  internalApiPost,
} from './internal-api';

const KEY = 'efk_keyid_supersecret';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('internal API client', () => {
  it('sends bearer auth to the internal API base and returns the parsed body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok', version: 'v1' }));

    const body = await internalApiGet<{ status: string }>('/health', KEY, { fetchImpl });

    expect(body).toEqual({ status: 'ok', version: 'v1' });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${INTERNAL_API_BASE}/health`);
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      Authorization: `Bearer ${KEY}`,
      Accept: 'application/json',
    });
  });

  it('appends non-empty query params and drops null/undefined', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));

    await internalApiGet('/sales-orders', KEY, {
      fetchImpl,
      query: { customerId: 'contact-1', projectId: null, page: '2', pageSize: undefined },
    });

    expect(fetchImpl.mock.calls[0][0]).toBe(
      `${INTERNAL_API_BASE}/sales-orders?customerId=contact-1&page=2`,
    );
  });

  it('classifies status codes and keeps the envelope code, never leaking the key', async () => {
    const cases: Array<{ status: number; envelope: unknown; code: string; retryable: boolean }> = [
      { status: 400, envelope: { error: { code: 'INVALID_REQUEST', message: 'bad' } }, code: 'INVALID_REQUEST', retryable: false },
      { status: 401, envelope: { error: { code: 'UNAUTHORIZED', message: 'no' } }, code: 'AUTH_INVALID', retryable: false },
      { status: 404, envelope: { error: { code: 'NOT_FOUND', message: 'gone' } }, code: 'NOT_FOUND', retryable: false },
      { status: 409, envelope: { error: { code: 'IDEMPOTENCY_CONFLICT', message: 'dup' } }, code: 'IDEMPOTENCY_CONFLICT', retryable: false },
      { status: 502, envelope: { error: { code: 'UPSTREAM', message: 'holded down' } }, code: 'UPSTREAM', retryable: false },
      { status: 503, envelope: { error: { code: 'DATA_NOT_READY', message: 'syncing' } }, code: 'DATA_NOT_READY', retryable: true },
      { status: 503, envelope: { error: { code: 'SERVICE_UNAVAILABLE', message: 'later' } }, code: 'SERVICE_UNAVAILABLE', retryable: false },
    ];

    for (const testCase of cases) {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(testCase.envelope, testCase.status));
      const error = await internalApiGet('/sales-orders', KEY, { fetchImpl }).catch((e) => e);

      expect(error, `status ${testCase.status}`).toBeInstanceOf(InternalApiError);
      expect(error.code).toBe(testCase.code);
      expect(error.status).toBe(testCase.status);
      expect(error.retryable).toBe(testCase.retryable);
      expect(JSON.stringify(error)).not.toContain(KEY);
      expect(error.message).not.toContain(KEY);
    }
  });

  it('treats readiness !== "ready" on a 200 body as DATA_NOT_READY', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [], readiness: 'syncing' }));

    const error = await internalApiGet('/sales-orders', KEY, { fetchImpl }).catch((e) => e);

    expect(error).toBeInstanceOf(InternalApiError);
    expect(error.code).toBe('DATA_NOT_READY');
    expect(error.retryable).toBe(true);
  });

  it('classifies an aborted/timed-out request as a retryable UPSTREAM error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(
      Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }),
    );

    const error = await internalApiGet('/sales-orders', KEY, { fetchImpl }).catch((e) => e);

    expect(error).toBeInstanceOf(InternalApiError);
    expect(error.code).toBe('UPSTREAM');
    expect(error.retryable).toBe(true);
  });

  it('POSTs a JSON body with bearer auth and an Idempotency-Key header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: 'contact-1', name: 'Acme' }, 201));

    const result = await internalApiPost('/contacts', KEY, { name: 'Acme' }, 'idem-123', { fetchImpl });

    expect(result).toEqual({ id: 'contact-1', name: 'Acme' });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${INTERNAL_API_BASE}/contacts`);
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'idem-123',
    });
    expect(JSON.parse(init.body)).toEqual({ name: 'Acme' });
  });

  it('keeps the provider validation detail on a 400 write error, without leaking the key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'vatnumber already exists' } }, 400),
    );

    const error = await internalApiPost('/contacts', KEY, { name: 'Acme' }, 'idem-1', { fetchImpl }).catch((e) => e);

    expect(error).toBeInstanceOf(InternalApiError);
    expect(error.code).toBe('INVALID_REQUEST');
    expect(error.detail).toBe('vatnumber already exists');
    expect(JSON.stringify(error)).not.toContain(KEY);
  });
});
