import { API_BASE_URL } from '../lib/env';
import { buildQuery, type QueryValue } from '../lib/query';
import { clearToken, emitUnauthorized, getToken } from '../auth/tokenStore';
import { ApiError, normalizeError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  /** JSON body (ignored if `form` is given). */
  body?: unknown;
  /** Multipart body. Content-Type is left to the browser. */
  form?: FormData;
  signal?: AbortSignal;
  /** Set false for login/register so a 400/401 there doesn't trigger a global logout. */
  auth?: boolean;
}

/** Join base + path, ensuring the DRF trailing slash. */
export function apiUrl(path: string, query?: Record<string, QueryValue>): string {
  let p = path.replace(/^\/+/, '');
  if (!p.endsWith('/')) p += '/';
  return `${API_BASE_URL}/${p}${buildQuery(query)}`;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('json')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

async function send(method: HttpMethod, path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const useAuth = opts.auth !== false;
  const token = useAuth ? getToken() : null;
  if (token) headers.Authorization = `Token ${token}`;

  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(path, opts.query), { method, headers, body, signal: opts.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new ApiError(0, normalizeError(0, null));
  }

  if (!res.ok) {
    const parsed = await parseBody(res).catch(() => undefined);
    if (res.status === 401 && useAuth) {
      clearToken();
      emitUnauthorized();
    }
    throw new ApiError(res.status, normalizeError(res.status, parsed));
  }
  return res;
}

/** JSON request; resolves with the parsed body (undefined for 204). */
export async function request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(method, path, opts);
  return (await parseBody(res)) as T;
}

/** Authenticated binary download (e.g. a song's attached file). */
export async function requestBlob(path: string, signal?: AbortSignal, opts: Pick<RequestOptions, 'auth'> = {}): Promise<Blob> {
  const res = await send('GET', path, { ...opts, signal });
  return res.blob();
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body }),
  delete: (path: string, opts?: RequestOptions) => request<void>('DELETE', path, opts),
};
