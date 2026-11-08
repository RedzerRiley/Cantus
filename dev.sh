#!/usr/bin/env bash
# Run the Cantus backend (Django) and frontend (Vite) together for local development.
#
#   ./dev.sh                         → app on http://localhost:5173, API on :8000
#   API_PORT=8001 WEB_PORT=5174 ./dev.sh
#   SKIP_SETUP=1 ./dev.sh            → skip dependency checks / migrations
#
# First run creates backend/.venv, installs Python and npm packages, copies the
# .env.example files and applies migrations. Ctrl+C stops both servers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

if [ -t 1 ]; then
  C_API=$'\033[36m' C_WEB=$'\033[35m' C_INFO=$'\033[1;33m' C_ERR=$'\033[1;31m' C_OFF=$'\033[0m'
else
  C_API='' C_WEB='' C_INFO='' C_ERR='' C_OFF=''
fi
info() { printf '%s==>%s %s\n' "$C_INFO" "$C_OFF" "$*"; }
die() { printf '%serror:%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; exit 1; }

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# ---------------------------------------------------------------- checks
command -v python3 >/dev/null || die "python3 not found (install Python 3.12+)."
command -v npm >/dev/null || die "npm not found (install Node.js 20+)."

for spec in "API_PORT:$API_PORT" "WEB_PORT:$WEB_PORT"; do
  var="${spec%%:*}" port="${spec##*:}"
  if port_in_use "$port"; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN | sed 's/^/    /' >&2
    die "port $port is already in use (maybe Cantus is already running?). Stop that process, or pick another port, e.g. $var=$((port + 1)) ./dev.sh"
  fi
done

# ---------------------------------------------------------------- setup
if [ "${SKIP_SETUP:-0}" != "1" ]; then
  if [ ! -x "$VENV/bin/python" ]; then
    info "Creating Python virtualenv in backend/.venv"
    python3 -m venv "$VENV"
  fi
  # Reinstall Python packages when requirements.txt changes.
  stamp="$VENV/.requirements-installed"
  if [ ! -f "$stamp" ] || [ "$BACKEND/requirements.txt" -nt "$stamp" ]; then
    info "Installing backend packages"
    "$VENV/bin/pip" install --quiet --disable-pip-version-check -r "$BACKEND/requirements.txt"
    touch "$stamp"
  fi
  [ -f "$BACKEND/.env" ] || { info "Creating backend/.env from .env.example"; cp "$BACKEND/.env.example" "$BACKEND/.env"; }

  # Reinstall npm packages when package-lock.json changes.
  if [ ! -d "$FRONTEND/node_modules" ] || [ "$FRONTEND/package-lock.json" -nt "$FRONTEND/node_modules/.package-lock.json" ]; then
    info "Installing frontend packages"
    (cd "$FRONTEND" && npm install --no-audit --no-fund --loglevel=error)
  fi
  [ -f "$FRONTEND/.env" ] || { [ -f "$FRONTEND/.env.example" ] && { info "Creating frontend/.env from .env.example"; cp "$FRONTEND/.env.example" "$FRONTEND/.env"; }; }

  info "Applying database migrations"
  (cd "$BACKEND" && "$VENV/bin/python" manage.py migrate --noinput)
fi

# ---------------------------------------------------------------- run
# Job control gives each server its own process group, so Ctrl+C / exit can
# stop the whole tree (Django's autoreloader, Vite's workers, the log prefixer).
set -m
PIDS=()

prefix() { # prefix <label> <color>
  awk -v p="$2[$1]$C_OFF " '{ print p $0; fflush() }'
}

start() { # start <label> <color> <dir> <command...>
  local label="$1" color="$2" dir="$3"
  shift 3
  ( cd "$dir" && exec "$@" 2>&1 ) | prefix "$label" "$color" &
  PIDS+=("$!")
}

cleanup() {
  trap - INT TERM EXIT
  set +m # no "Terminated" job notices while stopping
  echo
  info "Stopping servers…"
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] || continue
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
    [ -n "$pgid" ] && kill -TERM -- "-$pgid" 2>/dev/null || true
  done
  sleep 1
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] || continue
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
    [ -n "$pgid" ] && kill -KILL -- "-$pgid" 2>/dev/null || true
  done
}
trap cleanup INT TERM EXIT

info "Starting API on http://127.0.0.1:$API_PORT and web app on http://localhost:$WEB_PORT"
start api "$C_API" "$BACKEND" "$VENV/bin/python" manage.py runserver "127.0.0.1:$API_PORT"
# Point Vite's /api proxy at the API port (127.0.0.1 avoids IPv6 'localhost' mismatches).
export VITE_API_PROXY_TARGET="http://127.0.0.1:$API_PORT"
start web "$C_WEB" "$FRONTEND" npm run dev -- --port "$WEB_PORT" --strictPort

info "Open http://localhost:$WEB_PORT — press Ctrl+C to stop both."

# Exit (and stop the other server) as soon as either one stops.
while :; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      printf '%s==>%s A server exited; shutting down.\n' "$C_ERR" "$C_OFF"
      exit 1
    fi
  done
  sleep 1
done
