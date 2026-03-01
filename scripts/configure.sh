#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Navigate to repo root (parent of scripts/)
cd "$(dirname "$0")/.."

# Ensure .env exists
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env from .env.example"
fi

# Check for API key
api_key_value=$(grep '^ANTHROPIC_API_KEY=' backend/.env 2>/dev/null | cut -d'=' -f2-)
if [ -z "$api_key_value" ] || [ "$api_key_value" = "sk-ant-..." ]; then
  echo ""
  echo -e "${YELLOW}Anthropic API key not set.${NC}"
  echo "You need an API key from https://console.anthropic.com"
  echo "Each course costs ~\$0.60 to generate. A few dollars is plenty for testing."
  echo ""
  read -rp "Enter your Anthropic API key (or press Enter to skip): " api_key
  if [ -n "$api_key" ]; then
    sed -i.bak "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$api_key|" backend/.env
    rm -f backend/.env.bak
    echo -e "${GREEN}API key saved to backend/.env${NC}"
  else
    echo -e "${YELLOW}Skipped. Edit backend/.env manually before running.${NC}"
  fi
else
  echo -e "${GREEN}API key already configured.${NC}"
fi
