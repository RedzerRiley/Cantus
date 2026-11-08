import { api, request, requestBlob } from './client';
import type {
  AuthResponse,
  Dashboard,
  ID,
  Language,
  Lineup,
  LineupQuery,
  LineupSummary,
  LineupWrite,
  LoginInput,
  Me,
  MeUpdate,
  Member,
  MemberCreate,
  Paginated,
  PublicLineup,
  RegisterInput,
  Role,
  Song,
  SongQuery,
  Tag,
  Workspace,
} from './types';
import type { SongRequestBody } from '../lib/songForm';

export const authApi = {
  login: (input: LoginInput) => request<AuthResponse>('POST', 'auth/login/', { body: input, auth: false }),
  register: (input: RegisterInput) => request<AuthResponse>('POST', 'auth/register/', { body: input, auth: false }),
  logout: () => api.post<void>('auth/logout/'),
  me: (signal?: AbortSignal) => api.get<Me>('auth/me/', { signal }),
  updateMe: (patch: MeUpdate) => api.patch<Me>('auth/me/', patch),
  changePassword: (current_password: string, new_password: string) =>
    api.post<void>('auth/change-password/', { current_password, new_password }),
};

export const workspaceApi = {
  get: (signal?: AbortSignal) => api.get<Workspace>('workspace/', { signal }),
  update: (name: string) => api.patch<Workspace>('workspace/', { name }),
  members: (signal?: AbortSignal) => api.get<Member[]>('workspace/members/', { signal }),
  addMember: (input: MemberCreate) => api.post<Member>('workspace/members/', input),
  setRole: (id: ID, role: Role) => api.patch<Member>(`workspace/members/${id}/`, { role }),
  removeMember: (id: ID) => api.delete(`workspace/members/${id}/`),
};

export type CatalogKind = 'languages' | 'tags';

function catalogApi<T extends Language | Tag>(kind: CatalogKind) {
  return {
    list: (signal?: AbortSignal) => api.get<T[]>(`${kind}/`, { signal }),
    create: (name: string) => api.post<T>(`${kind}/`, { name }),
    rename: (id: ID, name: string) => api.patch<T>(`${kind}/${id}/`, { name }),
    remove: (id: ID) => api.delete(`${kind}/${id}/`),
  };
}

export const languagesApi = catalogApi<Language>('languages');
export const tagsApi = catalogApi<Tag>('tags');

function songQuery(q: SongQuery) {
  return {
    search: q.search,
    language: q.language,
    tags: q.tags,
    ordering: q.ordering,
    page: q.page,
    page_size: q.page_size,
  };
}

export const songsApi = {
  list: (q: SongQuery = {}, signal?: AbortSignal) => api.get<Paginated<Song>>('songs/', { query: songQuery(q), signal }),
  get: (id: ID, signal?: AbortSignal) => api.get<Song>(`songs/${id}/`, { signal }),
  create: (req: SongRequestBody) =>
    req.kind === 'form' ? request<Song>('POST', 'songs/', { form: req.body }) : api.post<Song>('songs/', req.body),
  update: (id: ID, req: SongRequestBody) =>
    req.kind === 'form'
      ? request<Song>('PATCH', `songs/${id}/`, { form: req.body })
      : api.patch<Song>(`songs/${id}/`, req.body),
  patch: (id: ID, body: Partial<Record<string, unknown>>) => api.patch<Song>(`songs/${id}/`, body),
  remove: (id: ID) => api.delete(`songs/${id}/`),
  file: (id: ID, signal?: AbortSignal) => requestBlob(`songs/${id}/file/`, signal),
};

export const lineupsApi = {
  list: (q: LineupQuery = {}, signal?: AbortSignal) =>
    api.get<Paginated<LineupSummary>>('lineups/', {
      query: { search: q.search, language: q.language, tags: q.tags, ordering: q.ordering, page: q.page, page_size: q.page_size },
      signal,
    }),
  get: (id: ID, signal?: AbortSignal) => api.get<Lineup>(`lineups/${id}/`, { signal }),
  create: (body: LineupWrite) => api.post<Lineup>('lineups/', body),
  replace: (id: ID, body: LineupWrite) => api.put<Lineup>(`lineups/${id}/`, body),
  remove: (id: ID) => api.delete(`lineups/${id}/`),
  duplicate: (id: ID, name?: string) => api.post<Lineup>(`lineups/${id}/duplicate/`, name ? { name } : {}),
  markUsed: (id: ID) => api.post<{ last_used_at: string }>(`lineups/${id}/use/`),
  /** Turn on the public share link (returns the existing token if already shared). */
  share: (id: ID) => api.post<{ share_token: string }>(`lineups/${id}/share/`),
  unshare: (id: ID) => api.delete(`lineups/${id}/share/`),
};

/** Public share links: no auth header, and a 401/404 must never log the viewer out. */
export const publicApi = {
  lineup: (token: string, signal?: AbortSignal) =>
    request<PublicLineup>('GET', `public/lineups/${encodeURIComponent(token)}/`, { signal, auth: false }),
  file: (token: string, songId: ID, signal?: AbortSignal) =>
    requestBlob(`public/lineups/${encodeURIComponent(token)}/songs/${songId}/file/`, signal, { auth: false }),
};

export const dashboardApi = {
  get: (signal?: AbortSignal) => api.get<Dashboard>('dashboard/', { signal }),
};
