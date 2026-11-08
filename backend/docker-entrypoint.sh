#!/bin/sh
# Prepares the uploads folder, applies migrations, then starts the app as the
# unprivileged "app" user. Persistent disks (e.g. Render's) mount as root, so
# MEDIA_ROOT is created/chowned before dropping privileges.
set -e

as_app() {
  if [ "$(id -u)" = "0" ]; then
    exec setpriv --reuid=app --regid=app --init-groups "$@"
  else
    exec "$@"
  fi
}

prepare_dir() { # make a directory writable by the app user
  mkdir -p "$1"
  if [ "$(id -u)" = "0" ]; then
    chown app:app "$1"
  fi
}

if [ -n "$MEDIA_ROOT" ]; then
  prepare_dir "$MEDIA_ROOT"
  if [ "$(id -u)" = "0" ]; then
    chown -R app:app "$MEDIA_ROOT"
  fi
fi

# SQLite on a persistent disk (e.g. DATABASE_URL=sqlite:////var/data/db.sqlite3):
# SQLite must be able to create the file and its journal in that directory.
case "${DATABASE_URL:-}" in
  sqlite:///*)
    db_path="${DATABASE_URL#sqlite:///}"
    case "$db_path" in
      /*)
        db_dir="$(dirname "$db_path")"
        prepare_dir "$db_dir"
        if [ "$(id -u)" = "0" ] && [ -e "$db_path" ]; then
          chown app:app "$db_path"
        fi
        ;;
    esac
    ;;
esac

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations…"
  ( as_app python manage.py migrate --noinput )
fi

as_app "$@"
