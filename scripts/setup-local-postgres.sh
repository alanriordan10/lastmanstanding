#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${LOCAL_DB_NAME:-lastmanstanding}"
DB_USER="${LOCAL_DB_USERNAME:-lmsuser}"
DB_PASSWORD="${LOCAL_DB_PASSWORD:-lmspassword}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed. Install PostgreSQL client/server first." >&2
  exit 1
fi

if ! pg_isready -h 127.0.0.1 -p "${LOCAL_DB_PORT:-5432}" >/dev/null 2>&1; then
  echo "PostgreSQL is not running on localhost:${LOCAL_DB_PORT:-5432}." >&2
  exit 1
fi

echo "Creating/updating local PostgreSQL role '$DB_USER' and database '$DB_NAME'."
echo "Your sudo password may be requested once."

sudo -u postgres psql -v ON_ERROR_STOP=1 \
  --set=db_user="$DB_USER" \
  --set=db_password="$DB_PASSWORD" \
  --set=db_name="$DB_NAME" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user')\gexec

SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'db_user', :'db_password')\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'db_user')\gexec
SQL

echo "Local PostgreSQL is configured."
echo "Database: $DB_NAME"
echo "Username: $DB_USER"
