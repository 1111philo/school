#!/usr/bin/env bash
set -e

export PYTHONPATH=src

echo "Running database migrations..."
uv run alembic upgrade head

echo "Starting server..."
exec uv run uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers "${WEB_CONCURRENCY:-2}" \
    --log-level "${LOG_LEVEL:-info}"
