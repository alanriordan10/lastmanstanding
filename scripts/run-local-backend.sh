#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Resolve Java 17 in a way that works on both Linux and macOS.
if [[ -n "${JAVA_HOME:-}" ]]; then
  RESOLVED_JAVA_HOME="$JAVA_HOME"
elif [[ -n "${JAVA_HOME_17:-}" ]]; then
  RESOLVED_JAVA_HOME="$JAVA_HOME_17"
elif [[ "$(uname -s)" == "Darwin" ]] && command -v /usr/libexec/java_home >/dev/null 2>&1; then
  RESOLVED_JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home 2>/dev/null || true)"
else
  RESOLVED_JAVA_HOME=""
fi

if [[ -z "$RESOLVED_JAVA_HOME" || ! -x "$RESOLVED_JAVA_HOME/bin/java" ]]; then
  echo "Unable to resolve a valid JAVA_HOME (Java 17 required)." >&2
  echo "Set JAVA_HOME or JAVA_HOME_17 and retry." >&2
  exit 1
fi

export JAVA_HOME="$RESOLVED_JAVA_HOME"
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
