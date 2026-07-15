export const INTERNAL_API_BASE = 'https://api.app.electricaferrer.es/internal/v1';

/** Default per-request timeout. The internal API reads from a synchronized D1 model. */
export const INTERNAL_API_TIMEOUT_MS = 15_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface InternalRequestOptions {
  fetchImpl?: FetchLike;
  query?: Record<string, string | null | undefined>;
  timeoutMs?: number;
  signal?: AbortSignal;
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
}

/**
 * A classified internal-API failure. Carries the upstream `code` from the
 * `{error:{code,message}}` envelope, a `retryable` hint the UI uses to offer
 * "Reintentar", and the provider's validation `detail` (safe to surface — the
 * bearer key is never part of it). The key is never in `message`/`detail`.
 */
export class InternalApiError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  detail: string;

  constructor(code: string, status: number, retryable: boolean, message: string, detail = '') {
    super(message);
    this.name = 'InternalApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.detail = detail;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

function classifyStatus(status: number, envelopeCode: string | undefined): { code: string; retryable: boolean } {
  switch (status) {
    case 400:
      return { code: 'INVALID_REQUEST', retryable: false };
    case 401:
      return { code: 'AUTH_INVALID', retryable: false };
    case 404:
      return { code: 'NOT_FOUND', retryable: false };
    case 409:
      return { code: envelopeCode || 'CONFLICT', retryable: false };
    case 502:
      return { code: 'UPSTREAM', retryable: false };
    case 503: {
      const code = envelopeCode || 'SERVICE_UNAVAILABLE';
      return { code, retryable: code === 'DATA_NOT_READY' };
    }
    default:
      return { code: envelopeCode || 'UPSTREAM', retryable: false };
  }
}

function buildUrl(path: string, query?: InternalRequestOptions['query']): string {
  const url = new URL(`${INTERNAL_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}

export async function internalApiRequest<T>(
  path: string,
  apiKey: string,
  options: InternalRequestOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const method = options.method ?? 'GET';
  const timeoutMs = options.timeoutMs ?? INTERNAL_API_TIMEOUT_MS;
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let bodyText: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyText = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetchImpl(buildUrl(path, options.query), { method, headers, body: bodyText, signal });
  } catch (err) {
    // Network failure, abort, or timeout — transient, safe to retry.
    const name = (err as Error)?.name;
    const message = name === 'TimeoutError' || name === 'AbortError'
      ? 'La solicitud tardó demasiado.'
      : 'No se pudo contactar con el servidor.';
    throw new InternalApiError('UPSTREAM', 0, true, message);
  }

  const body = await response.text();
  let parsed: unknown;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    throw new InternalApiError('UPSTREAM', response.status, false, 'Respuesta no válida del servidor.');
  }

  if (!response.ok) {
    const envelope = (parsed || {}) as ErrorEnvelope;
    const { code, retryable } = classifyStatus(response.status, envelope.error?.code);
    // The message stays generic (provider-controlled); the validation detail is
    // kept separately so write handlers can surface it. Neither carries the key.
    throw new InternalApiError(code, response.status, retryable, `Internal API error (${response.status})`, envelope.error?.message ?? '');
  }

  // Some read endpoints expose a `readiness` gate; anything other than "ready"
  // means the synchronized model is still catching up.
  const readiness = (parsed as { readiness?: string } | null)?.readiness;
  if (readiness !== undefined && readiness !== 'ready') {
    throw new InternalApiError('DATA_NOT_READY', response.status, true, 'Los datos aún se están sincronizando.');
  }

  return parsed as T;
}

export function internalApiGet<T>(
  path: string,
  apiKey: string,
  options: InternalRequestOptions = {},
): Promise<T> {
  return internalApiRequest<T>(path, apiKey, { ...options, method: 'GET' });
}

export function internalApiPost<T>(
  path: string,
  apiKey: string,
  body: unknown,
  idempotencyKey: string,
  options: InternalRequestOptions = {},
): Promise<T> {
  return internalApiRequest<T>(path, apiKey, { ...options, method: 'POST', body, idempotencyKey });
}
