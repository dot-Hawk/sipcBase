import { ApiError, normalizeApiError } from './errors';
import { parseTotalCount, type Paged } from './page';

export const API_BASE = '/api';

type Query = Record<string, string | number | boolean | undefined | null>;

interface AuthHooks {
  getToken: () => string | null;
  onUnauthorized: () => void;
}

let hooks: AuthHooks = { getToken: () => null, onUnauthorized: () => undefined };

export function configureApiAuth(next: AuthHooks): void {
  hooks = next;
}

export function buildUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
  }
  const s = qs.toString();
  return `${API_BASE}${path}${s ? `?${s}` : ''}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Query;
  json?: unknown;
  raw?: { body: Blob; contentType: string };
  signal?: AbortSignal;
  as?: 'json' | 'blob' | 'none';
  /** Login must not trigger the global 401 handler. */
  skipUnauthorizedHandler?: boolean;
}

/** Sends the request and returns the OK response; every failure is thrown as an ApiError. */
async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = hooks.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.raw) {
    headers['Content-Type'] = opts.raw.contentType;
    body = opts.raw.body;
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: opts.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError({ status: 0, message: 'Network error' });
  }

  if (!response.ok) {
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      /* non-JSON error body */
    }
    const error = normalizeApiError(response.status, parsed, response.headers.get('Retry-After'));
    if (response.status === 401 && !opts.skipUnauthorizedHandler) hooks.onUnauthorized();
    throw error;
  }
  return response;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const response = await send(path, opts);
  if (opts.as === 'none' || response.status === 204) return undefined as T;
  if (opts.as === 'blob') return (await response.blob()) as T;
  return (await response.json()) as T;
}

/** A list endpoint with `X-Total-Count`: the body stays a plain array, the total is `null` when the header is absent. */
export async function requestPage<T>(path: string, opts: RequestOptions = {}): Promise<Paged<T>> {
  const response = await send(path, opts);
  const items = (await response.json()) as T[];
  return { items, total: parseTotalCount(response.headers.get('X-Total-Count')) };
}
