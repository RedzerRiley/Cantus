import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiUrl, request, requestBlob } from './client';
import { ApiError } from './errors';
import { getToken, onUnauthorized, setToken } from '../auth/tokenStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds URLs with a trailing slash and query string', () => {
    expect(apiUrl('songs', { search: 'ama', tags: [1, 2] })).toBe('/api/v1/songs/?search=ama&tags=1%2C2');
    expect(apiUrl('/lineups/3/use/')).toBe('/api/v1/lineups/3/use/');
  });

  it('sends the token and JSON body', async () => {
    setToken('abc123');
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 1 }));
    const res = await api.post<{ id: number }>('lineups/', { name: 'X' });
    expect(res).toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/lineups/');
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Token abc123');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init!.body).toBe(JSON.stringify({ name: 'X' }));
  });

  it('does not set Content-Type for FormData', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const fd = new FormData();
    fd.append('title', 'T');
    await request('PATCH', 'songs/1/', { form: fd });
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(fetchMock.mock.calls[0]![1]!.body).toBe(fd);
  });

  it('resolves undefined for 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.delete('songs/1/')).resolves.toBeUndefined();
  });

  it('throws ApiError with field errors on 400', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { name: ['A tag with this name already exists.'] }));
    const err = await api.post('tags/', { name: 'Gloria' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).field('name')).toBe('A tag with this name already exists.');
  });

  it('clears the token and notifies listeners on 401', async () => {
    setToken('stale');
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Invalid token.' }));
    await expect(api.get('auth/me/')).rejects.toBeInstanceOf(ApiError);
    expect(getToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('does not trigger global logout for unauthenticated calls (login)', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'nope' }));
    await expect(request('POST', 'auth/login/', { body: {}, auth: false })).rejects.toBeInstanceOf(ApiError);
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('maps network failures to status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = (await api.get('dashboard/').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/reach the server/);
  });

  it('downloads blobs with auth', async () => {
    setToken('t');
    fetchMock.mockResolvedValue(new Response(new Blob(['%PDF']), { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
    const blob = await requestBlob('songs/7/file/');
    expect(blob.size).toBe(4);
    expect((fetchMock.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe('Token t');
  });
});
