# Cantus API contract (v1)

This file is the source of truth shared by `backend/` and `frontend/`.
TypeScript mirrors live in `frontend/src/api/types.ts`; keep both in sync.

## Conventions

- Base URL: `/api/v1/` (dev: Vite proxies `/api` → `http://localhost:8000`).
- JSON everywhere except song create/update with a file (`multipart/form-data`).
- Auth: DRF token. Header `Authorization: Token <token>`. All endpoints except
  `auth/register/` and `auth/login/` require auth.
- Timestamps: ISO 8601 strings (UTC).
- IDs: integers.
- Lists are **paginated**: `?page=N` (page size 50, `?page_size=` up to 200):
  ```json
  { "count": 12, "next": "…|null", "previous": "…|null", "results": [ … ] }
  ```
  Exception: `languages/`, `tags/` and `workspace/members/` return a plain array (small sets).
- Errors:
  - 400 validation: `{ "field_name": ["message", …], "non_field_errors": [ … ] }`
  - 401/403/404/409: `{ "detail": "message" }`
- Workspace scoping: every user belongs to exactly one **workspace** (parish/choir group).
  All songs, languages, tags and lineups are scoped to the requesting user's workspace;
  objects from other workspaces return 404.
- Roles: `admin` | `member`. Members may CRUD songs, lineups, languages and tags.
  Only admins may edit the workspace name and manage members.

## Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `auth/register/` | `{ username, password, email?, first_name?, last_name?, workspace_name }` | 201 `AuthResponse` — creates user + new workspace (user is admin) + default languages & tags |
| POST | `auth/login/` | `{ username, password }` | 200 `AuthResponse`; 400 on bad credentials |
| POST | `auth/logout/` | – | 204 (deletes token) |
| GET | `auth/me/` | – | 200 `Me` |
| PATCH | `auth/me/` | `{ first_name?, last_name?, email?, preferred_language? (id or null) }` | 200 `Me` |
| POST | `auth/change-password/` | `{ current_password, new_password }` | 204; 400 if current wrong or new too weak |

`AuthResponse = { token: string, user: Me }`

`Me`:
```json
{
  "id": 1, "username": "ana", "email": "", "first_name": "Ana", "last_name": "Cruz",
  "preferred_language": 2,
  "role": "admin",
  "workspace": { "id": 1, "name": "St. Joseph Parish Choir" }
}
```

Default data created with each new workspace (not demo data):
- Languages: English, Tagalog, Taglish, Latin
- Tags: Entrance, Gloria, Responsorial Psalm, Offertory, Communion, Recessional,
  Marian, Advent, Christmas, Lent, Easter, Ordinary Time, Wedding, Youth

## Workspace & members

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `workspace/` | – | `Workspace` |
| PATCH | `workspace/` | `{ name }` (admin) | `Workspace` |
| GET | `workspace/members/` | – | `Member[]` |
| POST | `workspace/members/` | `{ username, password, first_name?, last_name?, email?, role }` (admin) — creates a new user account in this workspace | 201 `Member` |
| PATCH | `workspace/members/{id}/` | `{ role }` (admin) | `Member`; 400 if it would leave zero admins |
| DELETE | `workspace/members/{id}/` | (admin) | 204 — deletes that user account; 400 if self or last admin |

`Workspace = { id, name, created_at }`
`Member = { id, username, first_name, last_name, email, role, date_joined }` (`id` = user id)

## Languages & tags

Both have the same shape and endpoints; names are unique per workspace (case-insensitive).

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `languages/` | – | `Language[]` ordered by name |
| POST | `languages/` | `{ name }` | 201 `Language` |
| PATCH | `languages/{id}/` | `{ name }` | `Language` |
| DELETE | `languages/{id}/` | – | 204 (songs/lineups referencing it get `null`) |
| GET/POST/PATCH/DELETE | `tags/`, `tags/{id}/` | same | `Tag` (deleting removes it from songs/lineups) |

`Language = { id, name, song_count }`
`Tag = { id, name, song_count }`

## Songs

| Method | Path | Notes |
|---|---|---|
| GET | `songs/` | Query: `search` (title, case-insensitive contains; also matches composer), `language` (id), `tags` (comma-separated ids; song must have **all**), `ordering` (`title` default, `-created_at`, `-updated_at`), `page`, `page_size` |
| POST | `songs/` | JSON or multipart. Fields below. |
| GET | `songs/{id}/` | `Song` |
| PATCH | `songs/{id}/` | JSON or multipart. Partial. To remove the file send `remove_file=true` (multipart or JSON). |
| DELETE | `songs/{id}/` | 204. Also removes the song from any lineups (cascade). |
| GET | `songs/{id}/file/` | Authenticated download/inline view of the attached file (`Content-Disposition: inline`). 404 if none. |

Writable fields: `title` (required, ≤200), `composer` (≤200), `language` (id|null),
`key` (≤20, e.g. "G", "Bb", "F#m"), `notes` (text), `tag_ids` (array of ids; in multipart
send `tag_ids` repeatedly **or** a single comma-separated string), `file` (multipart only),
`remove_file` (bool, write-only).

Upload validation: allowed extensions `.pdf .png .jpg .jpeg .txt .cho .chopro`;
max size `MAX_UPLOAD_MB` (default 10); content sniffed (PDF must start `%PDF`, PNG/JPEG magic
bytes, text files must decode as UTF-8). Error on field `file`.

`Song`:
```json
{
  "id": 7, "title": "Holy God, We Praise Thy Name", "composer": "Trad.",
  "language": 1, "language_name": "English",
  "key": "F", "notes": "",
  "tags": [ { "id": 3, "name": "Entrance" } ],
  "file_name": "holy-god.pdf",   // original filename or null
  "file_size": 48213,             // bytes or null
  "file_type": "pdf",             // extension without dot or null
  "has_file": true,
  "lineup_count": 2,              // number of lineups that include this song
  "created_at": "…", "updated_at": "…"
}
```

## Lineups

A lineup is a reusable, ordered collection of songs. No dates or liturgical events.

| Method | Path | Notes |
|---|---|---|
| GET | `lineups/` | Query: `search` (name/description contains), `language` (id of default_language), `tags` (comma ids, must have all), `ordering` (`-updated_at` default, `name`, `-last_used_at`, `-created_at`). Returns `LineupSummary` items. `ordering=-last_used_at` excludes never-used lineups. |
| POST | `lineups/` | `LineupWrite` → 201 `Lineup` |
| GET | `lineups/{id}/` | `Lineup` (with items) |
| PUT | `lineups/{id}/` | `LineupWrite` — full replace, **items replaced atomically in the given order** |
| PATCH | `lineups/{id}/` | partial `LineupWrite`; if `items` present they replace all items |
| DELETE | `lineups/{id}/` | 204 |
| POST | `lineups/{id}/duplicate/` | Body `{ name? }` (default: `"<name> (copy)"`). 201 `Lineup` — deep copy of fields, tags and items; original untouched; `last_used_at` null. |
| POST | `lineups/{id}/use/` | Marks as used now (frontend calls this when a lineup is opened). 200 `{ "last_used_at": "…" }` |

`LineupWrite`:
```json
{
  "name": "Sunday Mass — Tagalog",       // required, ≤200
  "description": "",
  "default_language": 2,                  // id | null
  "tag_ids": [5],
  "items": [
    { "song": 7, "label": "Entrance", "key": "G", "notes": "Capo 2", "assigned_to": "Ben (guitar)" }
  ]
}
```
Item fields: `song` (required, must belong to workspace), `label` (≤60, e.g. part of Mass),
`key` (≤20, per-lineup override), `notes` (text), `assigned_to` (≤120, free text musician/role).
Order = array order. The same song may appear more than once.

`Lineup`:
```json
{
  "id": 3, "name": "Sunday Mass — Tagalog", "description": "",
  "default_language": 2, "default_language_name": "Tagalog",
  "tags": [ { "id": 5, "name": "Ordinary Time" } ],
  "items": [
    {
      "id": 11, "position": 0,
      "song": 7,
      "song_detail": { "id": 7, "title": "…", "composer": "…", "key": "F",
                       "language_name": "English", "has_file": true },
      "label": "Entrance", "key": "G", "notes": "Capo 2", "assigned_to": "Ben (guitar)"
    }
  ],
  "item_count": 1,
  "created_at": "…", "updated_at": "…", "last_used_at": "…|null"
}
```

`LineupSummary` = `Lineup` without `items`, plus `preview_titles: string[]` (first 3 song titles).

## Dashboard

| Method | Path | Response |
|---|---|---|
| GET | `dashboard/` | `{ "saved_lineups": LineupSummary[] (6, by -updated_at), "recent_lineups": LineupSummary[] (6, by -last_used_at, used only), "recent_songs": Song[] (6, by -created_at), "counts": { "songs": n, "lineups": n } }` |

## Health

`GET /api/v1/health/` (no auth) → `{ "status": "ok" }`

## Implementation notes (actual backend behaviour)

These clarify details the tables above leave open; the Django backend behaves as follows.

- **Lineup PUT**: `name` is required. `items` and `tag_ids` are optional even on PUT —
  if omitted they are **kept**, not wiped. When `items` is present it replaces all items
  atomically in array order (positions are re-numbered 0..n-1). Every saved item needs `song`,
  also on PATCH. Item errors come back as a list aligned with the request:
  `{ "items": [ {}, { "song": ["…"] } ] }`.
- **Lineup `use/`** sets `last_used_at` without bumping `updated_at` (opening a lineup does not
  reorder the "saved" list). The SPA calls it only when opening an existing lineup, not right
  after creating or duplicating one.
- **Song multipart**: `language=""` or `"null"` means `null`. `tag_ids` may be repeated keys,
  a comma-separated string, or a single empty value (`tag_ids=` → clears tags). Omitting
  `tag_ids` in a PATCH leaves tags untouched; JSON `{ "tag_ids": [] }` clears them.
  (The SPA clears tags with a follow-up JSON PATCH when a file upload is combined with
  removing all tags.)
- **Song file**: `file=""` / `null` is ignored (no change). Remove a file with
  `remove_file=true` (multipart) or `true` (JSON); if a new `file` is sent in the same request
  it wins. Replaced/removed files are deleted from storage after the transaction commits.
  `GET songs/{id}/file/` needs the `Authorization: Token …` header (the SPA uses
  `fetch` → `Blob` → object URL), returns `Cache-Control: private, no-store`,
  `X-Content-Type-Options: nosniff`, and text/ChordPro files as `text/plain; charset=utf-8`.
- **Query params**: a non-integer `language` or a non-integer entry in `tags` → 400
  (`{ "language": [...] }` / `{ "tags": [...] }`). Unknown `ordering` values silently fall
  back to the default.
- **Languages/tags**: `PUT` is disabled (405); use `PATCH`.
- **Members**: deleting yourself or the last admin → 400 `{ "non_field_errors": [...] }`;
  demoting the last admin → 400 `{ "role": [...] }`. New members are created by an admin
  with an initial password (no email invites).
- **Auth**: login of an account that has no workspace → 403 `{ "detail": … }`.
  `change-password/` keeps the current token valid. `logout/` deletes the user's token
  (all devices).
- **Unauthenticated** requests → 401 with `WWW-Authenticate: Token`; authenticated users
  without a workspace → 403.
