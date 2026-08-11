#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${LOCAL_DB_NAME:-lastmanstanding}"
DB_USER="${LOCAL_DB_USERNAME:-lmsuser}"
DB_PASSWORD="${LOCAL_DB_PASSWORD:-lmspassword}"
DB_HOST="${LOCAL_DB_HOST:-127.0.0.1}"
DB_PORT="${LOCAL_DB_PORT:-5432}"
PG_ADMIN_DB="${LOCAL_PG_ADMIN_DB:-postgres}"
PG_ADMIN_USER="${LOCAL_PG_ADMIN_USER:-${USER}}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed. Install PostgreSQL client/server first." >&2
  exit 1
fi

if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
  echo "PostgreSQL is not running on $DB_HOST:$DB_PORT." >&2
  exit 1
fi

echo "Creating/updating local PostgreSQL role '$DB_USER' and database '$DB_NAME'."
echo "Attempting admin connection via local postgres OS user (Linux) or current user (macOS/Homebrew)."

if id postgres >/dev/null 2>&1; then
  PSQL_ADMIN_CMD=(sudo -u postgres psql -v ON_ERROR_STOP=1)
  PSQL_APP_DB_CMD=(sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME")
else
  PSQL_ADMIN_CMD=(psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$PG_ADMIN_USER" -d "$PG_ADMIN_DB")
  PSQL_APP_DB_CMD=(psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$PG_ADMIN_USER" -d "$DB_NAME")
fi

"${PSQL_ADMIN_CMD[@]}" \
  --set=db_user="$DB_USER" \
  --set=db_password="$DB_PASSWORD" \
  --set=db_name="$DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user')\gexec

SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_password')\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'db_user')\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'db_user')\gexec
SQL

"${PSQL_APP_DB_CMD[@]}" \
  --set=db_user="$DB_USER" <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public TO :"db_user";
ALTER SCHEMA public OWNER TO :"db_user";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO :"db_user";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO :"db_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO :"db_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO :"db_user";

-- Flyway migrations that ALTER existing objects require ownership, not only GRANTs.
SELECT format('ALTER TABLE %I.%I OWNER TO %I', schemaname, tablename, :'db_user')
FROM pg_tables
WHERE schemaname = 'public'\gexec

SELECT format('ALTER SEQUENCE %I.%I OWNER TO %I', sequence_schema, sequence_name, :'db_user')
FROM information_schema.sequences
WHERE sequence_schema = 'public'\gexec

SELECT format('ALTER VIEW %I.%I OWNER TO %I', table_schema, table_name, :'db_user')
FROM information_schema.views
WHERE table_schema = 'public'\gexec
SQL

echo "Local PostgreSQL is configured."
echo "Database: $DB_NAME"
echo "Username: $DB_USER"
