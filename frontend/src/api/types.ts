// Mirrors docs/API.md — keep in sync with the backend serializers.

export type ID = number;
export type Role = 'admin' | 'member';

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface WorkspaceRef {
  id: ID;
  name: string;
}

export interface Me {
  id: ID;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  preferred_language: ID | null;
  role: Role;
  workspace: WorkspaceRef;
}

export interface AuthResponse {
  token: string;
  user: Me;
}

export interface RegisterInput {
  username: string;
  password: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  workspace_name: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface MeUpdate {
  first_name?: string;
  last_name?: string;
  email?: string;
  preferred_language?: ID | null;
}

export interface Workspace {
  id: ID;
  name: string;
  created_at: string;
}

export interface Member {
  id: ID;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  date_joined: string;
}

export interface MemberCreate {
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role: Role;
}

export interface Language {
  id: ID;
  name: string;
  song_count: number;
}

export interface Tag {
  id: ID;
  name: string;
  song_count: number;
}

export interface TagRef {
  id: ID;
  name: string;
}

export interface Song {
  id: ID;
  title: string;
  composer: string;
  language: ID | null;
  language_name: string | null;
  key: string;
  notes: string;
  /** Color label ('' = none). */
  color: string;
  tags: TagRef[];
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  has_file: boolean;
  lineup_count: number;
  created_at: string;
  updated_at: string;
}

export interface SongWrite {
  title: string;
  composer?: string;
  language?: ID | null;
  key?: string;
  notes?: string;
  tag_ids?: ID[];
  file?: File | null;
  remove_file?: boolean;
}

export interface SongQuery {
  search?: string;
  language?: ID;
  tags?: ID[];
  ordering?: 'title' | '-created_at' | '-updated_at';
  page?: number;
  page_size?: number;
}

export interface SongDetailBrief {
  id: ID;
  title: string;
  composer: string;
  key: string;
  color: string;
  language_name: string | null;
  has_file: boolean;
}

export interface LineupItem {
  id: ID;
  position: number;
  song: ID;
  song_detail: SongDetailBrief;
  label: string;
  key: string;
  notes: string;
  assigned_to: string;
}

export interface LineupItemWrite {
  song: ID;
  label?: string;
  key?: string;
  notes?: string;
  assigned_to?: string;
}

export interface LineupBase {
  id: ID;
  name: string;
  description: string;
  default_language: ID | null;
  default_language_name: string | null;
  color: string;
  tags: TagRef[];
  item_count: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

export interface Lineup extends LineupBase {
  items: LineupItem[];
  /** Token for the public read-only link; null when not shared. */
  share_token: string | null;
}

/** Read-only lineup served at a public share link (no account needed). */
export interface PublicLineupItem {
  id: ID;
  position: number;
  song: ID;
  song_detail: SongDetailBrief;
  label: string;
  key: string;
  notes: string;
}

export interface PublicLineup {
  name: string;
  description: string;
  color: string;
  workspace_name: string;
  updated_at: string;
  items: PublicLineupItem[];
}

export interface LineupSummary extends LineupBase {
  preview_titles: string[];
}

export interface LineupWrite {
  name: string;
  description?: string;
  color?: string;
  default_language?: ID | null;
  tag_ids?: ID[];
  items?: LineupItemWrite[];
}

export interface LineupQuery {
  search?: string;
  language?: ID;
  tags?: ID[];
  ordering?: '-updated_at' | 'name' | '-last_used_at' | '-created_at';
  page?: number;
  page_size?: number;
}

export interface Dashboard {
  saved_lineups: LineupSummary[];
  recent_lineups: LineupSummary[];
  recent_songs: Song[];
  counts: { songs: number; lineups: number };
}

/** Shape of DRF validation errors. */
export type FieldErrors = Record<string, string[]>;
