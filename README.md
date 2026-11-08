# Cantus

Cantus is a songbook and **reusable song lineup** builder for parish choirs and music
ministries. A choir keeps its songs (title, composer, language, key, tags, notes and an
optional PDF / image / chord-sheet file) in one shared workspace, and builds ordered
lineups such as “Sunday Mass — Tagalog” or “Wedding — English” that can be reused,
duplicated and adjusted.

Cantus is **manual-first**: people choose the songs. It makes no automatic song
recommendations and does not generate lineups.

## Features

- **Workspaces** — each parish/choir group has its own private workspace. The person who
  registers becomes its admin; admins add members (with an initial password) and manage
  roles.
- **Songbook** — search by title or composer, filter by language and tags (songs must
  have all selected tags), attach one file per song (PDF, PNG, JPG, TXT, ChordPro).
- **Lineups** — ordered lists of songs with a per-song part label (Entrance, Gloria,
  Communion…), key override, notes and “assigned to” (e.g. “Ben (guitar)”). The same song
  may appear more than once. Lineups have no dates. You can reorder with Move buttons, the
  keyboard (Alt + ↑/↓, Alt + Home/End) or drag and drop, then duplicate a lineup without
  touching the original. There is also a large-type “music stand” view.
- **Home dashboard** — recently used and recently edited lineups, newest songs.
- **Languages & tags** — per-workspace lists. New workspaces start with English, Tagalog,
  Taglish, Latin and common Mass-part/season tags.
- **Responsive & accessible** — bottom tab bar on phones/tablets, sidebar on desktop
  (≥ 1024 px), 44 px touch targets, labelled form controls, skip link, native `<dialog>`
  modals.
- **Installable PWA** — app shell works offline once loaded. Data needs a connection.

## Stack

| Part | Tech |
|---|---|
| Backend | Python 3.11+, Django 5.1, Django REST Framework 3.15 (token auth), django-cors-headers, dj-database-url, python-dotenv |
| Database | SQLite by default (local); PostgreSQL 14+ recommended for production (psycopg 3) |
| Frontend | React 19 + TypeScript, Vite 6, Vitest + Testing Library. No UI framework; small built-in router |
| Contract | [`docs/API.md`](docs/API.md), mirrored by `frontend/src/api/types.ts` |

## Repository layout

```
backend/                Django project
  config/               settings, urls, wsgi/asgi
  cantus/               the app: models, serializers, views, validators, signals,
                        migrations/, management/commands/seed_demo.py, tests/
  requirements.txt
  .env.example
frontend/               Vite + React SPA
  src/api/              fetch client, endpoints, error normalisation, contract types
  src/pages/            route pages (Home, Songbook, Lineups, Lineup editor, Settings…)
  src/components/       shared UI (Dialog, TagPicker, SongPicker, LineupItemList…)
  src/lib/              pure helpers (query building, form payloads, reordering…)
  public/               manifest, service worker, icons
  .env.example
docs/API.md             REST API contract (the source of truth for both sides)
```

## Prerequisites

- Python **3.11+**
- Node.js **20+** (with npm)
- PostgreSQL **14+** — optional. Local development uses SQLite by default.

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # local dev: DJANGO_DEBUG=true, SQLite
python manage.py makemigrations --check   # should report "No changes detected"
python manage.py migrate
python manage.py seed_demo           # optional demo data (see below)
python manage.py runserver           # http://localhost:8000
```

**Demo account (demo data only):** `seed_demo` creates (or refreshes) a workspace called
“Demo Parish Choir (demo data)” with placeholder songs and lineups:

- username: `demo`
- password: `cantus-demo-2026`

This login is public. Use it only for local trials and never on a deployed server.

**Admin users:** `createsuperuser` gives you a Django admin login (`/admin/`). That user has
no workspace, though, so the app will refuse it. To use the app, create accounts through
**Register** in the UI (or `seed_demo`).

`DJANGO_DEBUG` defaults to **false** when unset. In that case `DJANGO_SECRET_KEY` must be
set, or Django refuses to start. `.env.example` sets `DJANGO_DEBUG=true` for local work.

### PostgreSQL (optional)

```bash
createuser --pwprompt cantus          # choose a password
createdb --owner=cantus cantus
# backend/.env
DATABASE_URL=postgres://cantus:<password>@localhost:5432/cantus
```

Then run `python manage.py migrate` again.

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env      # VITE_API_BASE_URL=/api/v1, proxy target http://localhost:8000
npm run dev               # http://localhost:5173 — /api is proxied to Django on :8000
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | type-check (`tsc -b`) and build to `frontend/dist/` |
| `npm run preview` | serve the production build (also proxies `/api`) |
| `npm test` | Vitest unit/component tests (jsdom) |
| `npm run typecheck` | TypeScript only |

If the SPA and API are served from different origins, set `VITE_API_BASE_URL` to the full
API URL (e.g. `https://api.example.org/api/v1`). Then add the SPA origin to
`CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` in the backend `.env`.

## Running tests

```bash
cd backend && python manage.py test cantus      # Django/DRF API tests
cd frontend && npm test                         # Vitest
```

## PWA notes

- The service worker (`public/sw.js`) is registered **only in production builds**
  (`npm run build` / `npm run preview` or a real deployment), never by `npm run dev`.
- It caches the app shell and static assets only. `/api/` requests, song files included,
  always go to the network and are never cached.
- To install, use the browser’s own “Install app” / “Add to Home Screen” option. There is
  no in-app install prompt.
- Editing needs a connection. There is no offline editing or sync.

## Uploads & storage

- One file per song. Allowed extensions: `.pdf .png .jpg .jpeg .txt .cho .chopro`. Max size
  `MAX_UPLOAD_MB` (default 10). The content is checked too: PDFs must start with `%PDF-`,
  PNG/JPEG must have the right magic bytes, and text/ChordPro must be valid UTF-8.
- Files are stored under unguessable names (`songs/<workspace>/<uuid>.<ext>`). The original
  file name is kept in the database.
- Files are **private**. Django never serves `MEDIA_URL` publicly; they are only available
  via `GET /api/v1/songs/{id}/file/` with the token header. The SPA fetches the file as a
  blob and opens it in a new tab.
- Replaced, removed and deleted songs’ files are removed from storage after the database
  transaction commits.
- **S3 or compatible storage:** `pip install "django-storages[s3]" boto3`, set
  `DJANGO_FILE_STORAGE=storages.backends.s3.S3Storage` plus the usual `AWS_*` variables
  (see `backend/.env.example`). Keep the bucket private.
- Never commit `backend/media/`, `db.sqlite3` or any `.env` file. `.gitignore` already
  covers them.

## Content policy

Cantus ships **no copyrighted songbooks, lyrics or sheet music**. The app stores song
details and files that each parish uploads, and the UI reminds users to upload only
materials they are licensed to use. The `seed_demo` data is placeholder-only:

- every demo song title and demo lineup name is prefixed `[Demo]`; songs have no lyrics or files;
- English/Latin entries are public-domain hymns or chants;
- Tagalog/Taglish entries use generic titles such as “Tagalog Entrance Song (sample)”.

## API documentation

See [`docs/API.md`](docs/API.md) for every endpoint, payload and error shape. Its
“Implementation notes” section describes backend details such as PUT semantics, multipart
handling and member-removal errors.

## Deployment notes (brief)

- Backend: `DJANGO_DEBUG=false`, a strong `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`,
  `DATABASE_URL` (PostgreSQL), and `CORS_ALLOWED_ORIGINS`/`CSRF_TRUSTED_ORIGINS` if the
  SPA is on another origin. Then run `python manage.py migrate` and
  `python manage.py collectstatic`, and serve with `gunicorn config.wsgi`.
  Behind a TLS proxy set `DJANGO_SECURE_PROXY_SSL_HEADER=true` (and optionally
  `DJANGO_SECURE_SSL_REDIRECT` / `DJANGO_SECURE_HSTS_SECONDS`).
- Uploads: persistent `MEDIA_ROOT` volume, or private S3 storage.
- Frontend: `npm run build` and serve `frontend/dist/` as static files with a history
  fallback to `index.html`. Proxy `/api/` to Django, or set `VITE_API_BASE_URL` at build
  time. Don’t cache `sw.js` and `index.html` aggressively.

## Limitations / verification status

Please read this before relying on the code.

- **Built in a sandbox without package installs.** Django, DRF, Vite, Vitest and the
  React type packages were not available there, so:
  - the **backend tests and migrations were not executed**. The code was compiled
    (`py_compile`), linted with `ruff`, and reviewed by hand against Django 5.1 / DRF 3.15,
    including a field-by-field check of the hand-written `0001_initial.py` against
    `models.py`. Run `makemigrations --check`, `migrate` and `manage.py test` first;
  - the **frontend** was bundled with esbuild and driven end to end with Playwright
    (Chromium) against an in-memory mock of `docs/API.md`, at 375×812 (touch), 820×1180
    (touch) and 1440×900. The run covered registration, song creation with a PDF upload,
    search/filters, building and reordering a lineup, per-song edits, save → reload
    persistence, duplicating, lineup filters and adding a tag in Settings. It also checked
    for horizontal overflow, the navigation pattern, 44 px targets, accessible names,
    dialog Esc/focus return, skip link and console errors. The pure `src/lib` and
    `src/api` unit tests passed under a minimal Vitest shim. The component tests (`*.tsx`),
    `tsc` type-checking and `vite build` have **not** been run.
- **No `package-lock.json` yet.** Run `npm install` once and commit the lockfile.
- Known gaps:
  - leaving a lineup with unsaved changes uses the browser’s native `confirm()` dialog for
    in-app navigation (and `beforeunload` for tab close);
  - opening attached files from an installed iOS home-screen app (standalone mode) may
    not show blob URLs reliably. Use Safari if a file won’t open;
  - no offline editing; the PWA only caches the app shell;
  - members are created by an admin with a temporary password and there are no email
    invites or password-reset emails. Members can change their password in Settings.
