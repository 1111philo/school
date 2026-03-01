#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to repo root (parent of scripts/)
cd "$(dirname "$0")/.."

echo ""
echo "=== 1111 School Setup ==="
echo ""

# --- Check prerequisites ---

missing=()

if ! command -v docker &>/dev/null; then
  missing+=("docker — install from https://docker.com/get-started")
fi

if ! command -v uv &>/dev/null; then
  missing+=("uv — install with: curl -LsSf https://astral.sh/uv/install.sh | sh")
fi

if ! command -v node &>/dev/null; then
  missing+=("node — install with nvm: https://github.com/nvm-sh/nvm")
fi

if [ ${#missing[@]} -gt 0 ]; then
  echo -e "${RED}Missing prerequisites:${NC}"
  for m in "${missing[@]}"; do
    echo "  - $m"
  done
  exit 1
fi

echo -e "${GREEN}Prerequisites OK${NC} (docker, uv, node)"

# --- Start PostgreSQL ---

echo ""
echo "Starting PostgreSQL..."
docker compose --profile dev up -d db

# --- Backend setup ---

echo ""
echo "Setting up backend..."

# Configure API key
"$(dirname "$0")/configure.sh"

cd backend
uv sync
echo "Running database migrations..."
PYTHONPATH=src uv run alembic upgrade head
cd ..

# --- Frontend setup ---

echo ""
echo "Setting up frontend..."
cd frontend
npm install
cd ..

# --- Root dev dependencies ---

npm install

# --- Done ---

echo ""
echo -e "${GREEN}=== Setup complete ===${NC}"
echo ""
echo "To start developing:"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:5173"
echo ""
