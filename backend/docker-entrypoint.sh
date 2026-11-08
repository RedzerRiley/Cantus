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

if [ -n "$MEDIA_ROOT" ]; then
  mkdir -p "$MEDIA_ROOT"
  if [ "$(id -u)" = "0" ]; then
    chown -R app:app "$MEDIA_ROOT"
  fi
fi

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations…"
  ( as_app python manage.py migrate --noinput )
fi

as_app "$@"
