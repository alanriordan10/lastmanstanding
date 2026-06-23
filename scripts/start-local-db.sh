#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Starting local PostgreSQL..."
docker compose up -d postgres

echo -n "Waiting for PostgreSQL"
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${LOCAL_DB_USERNAME:-lmsuser}" -d "${LOCAL_DB_NAME:-lastmanstanding}" >/dev/null 2>&1; then
    echo
    echo "PostgreSQL is ready at localhost:${LOCAL_DB_PORT:-5433}/${LOCAL_DB_NAME:-lastmanstanding}"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo
echo "PostgreSQL did not become healthy in time." >&2
docker compose logs postgres >&2
exit 1
