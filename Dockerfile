# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


# Stage 2: Python runtime
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.10.7 /uv /usr/local/bin/uv

# Mirror repo structure so relative paths resolve the same way
WORKDIR /app

# Install Python dependencies first (cached layer)
COPY backend/pyproject.toml backend/uv.lock* backend/
RUN cd backend && uv sync --no-dev --frozen || \
    (echo "WARNING: --frozen failed, running unfrozen sync" && uv sync --no-dev)

# Copy backend source + alembic config
COPY backend/ backend/

# Copy predefined course catalog
COPY app/courses/ app/courses/

# Copy built frontend into backend/static/ for FastAPI to serve
COPY --from=frontend-build /build/dist backend/static/

# Run as non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser
ENV UV_CACHE_DIR=/tmp/uv-cache
USER appuser

EXPOSE 8000

WORKDIR /app/backend
ENTRYPOINT ["bash", "entrypoint.sh"]
