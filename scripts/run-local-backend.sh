#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAVA_HOME="${JAVA_HOME_17:-/usr/lib/jvm/java-17-openjdk-amd64}"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

DB_HOST="${LOCAL_DB_HOST:-127.0.0.1}"
DB_PORT="${LOCAL_DB_PORT:-5432}"
DB_NAME="${LOCAL_DB_NAME:-lastmanstanding}"
DB_USER="${LOCAL_DB_USERNAME:-lmsuser}"
DB_PASSWORD="${LOCAL_DB_PASSWORD:-lmspassword}"

if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
  echo "PostgreSQL is not available at $DB_HOST:$DB_PORT." >&2
  echo "Start the native PostgreSQL service or run ./scripts/start-local-db.sh for Docker." >&2
  exit 1
fi

if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atqc 'select 1' >/dev/null 2>&1; then
  echo "The local database or role has not been configured yet." >&2
  echo "Run this once, then retry:" >&2
  echo "  ./scripts/setup-local-postgres.sh" >&2
  exit 1
fi

cd "$ROOT_DIR/backend"
export SPRING_PROFILES_ACTIVE=local
export LOCAL_DB_URL="${LOCAL_DB_URL:-jdbc:postgresql://$DB_HOST:$DB_PORT/$DB_NAME}"
export LOCAL_DB_USERNAME="$DB_USER"
export LOCAL_DB_PASSWORD="$DB_PASSWORD"
export LOCAL_FIXTURE_PROVIDER="${LOCAL_FIXTURE_PROVIDER:-mock}"
export LOCAL_MAIL_ENABLED="${LOCAL_MAIL_ENABLED:-false}"
export ODDS_ENABLED="${ODDS_ENABLED:-false}"

# Never inherit production database settings from the root .env.
unset DB_URL DB_USERNAME DB_PASSWORD

echo "Starting backend against PostgreSQL at $DB_HOST:$DB_PORT/$DB_NAME..."
exec mvn spring-boot:run -Dspring-boot.run.profiles=local
