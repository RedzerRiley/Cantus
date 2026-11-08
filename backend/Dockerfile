# Cantus API (Django + gunicorn)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000 \
    MEDIA_ROOT=/var/data/media

WORKDIR /app

# Unprivileged runtime user (the entrypoint drops to it after preparing MEDIA_ROOT).
RUN groupadd --system app && useradd --system --gid app --home-dir /app --no-create-home app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Collect Django admin static files (served by WhiteNoise). The key is only for this build step.
RUN DJANGO_SECRET_KEY=collectstatic-only python manage.py collectstatic --noinput \
    && chmod +x docker-entrypoint.sh \
    && chown -R app:app /app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/api/v1/health/', timeout=4)" || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT} --workers ${WEB_CONCURRENCY:-2} --timeout 120 --access-logfile - --error-logfile -"]
