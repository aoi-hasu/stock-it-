#!/usr/bin/env bash
set -euo pipefail

# =====================================================================
# verify-baseline-diff.sh
# StockItEase: Verifies schema equivalence between incremental migrations (01-16)
# and squashed baseline (supabase/migrations/20261101000000_baseline.sql).
# Exits with 0 if diff is 100% empty, non-zero otherwise.
# =====================================================================

PSQL_BIN="${PSQL_BIN:-psql}"
PGDUMP_BIN="${PGDUMP_BIN:-pg_dump}"
PG_USER="${PG_USER:-pguser}"

# Fallback to postgres 15 binary path if psql is not in standard PATH
if ! command -v "$PSQL_BIN" >/dev/null 2>&1 && [ -x /usr/lib/postgresql/15/bin/psql ]; then
  PSQL_BIN="/usr/lib/postgresql/15/bin/psql"
fi
if ! command -v "$PGDUMP_BIN" >/dev/null 2>&1 && [ -x /usr/lib/postgresql/15/bin/pg_dump ]; then
  PGDUMP_BIN="/usr/lib/postgresql/15/bin/pg_dump"
fi

run_psql() {
  if [ -n "${PGHOST:-}" ]; then
    "$PSQL_BIN" "$@"
  elif [ "$(id -u)" -eq 0 ]; then
    su "$PG_USER" -c "$PSQL_BIN $(printf ' %q' "$@")"
  else
    "$PSQL_BIN" "$@"
  fi
}

run_pgdump() {
  if [ -n "${PGHOST:-}" ]; then
    "$PGDUMP_BIN" "$@"
  elif [ "$(id -u)" -eq 0 ]; then
    su "$PG_USER" -c "$PGDUMP_BIN $(printf ' %q' "$@")"
  else
    "$PGDUMP_BIN" "$@"
  fi
}

echo ">>> [1/5] Initializing mock auth environment in PostgreSQL..."
run_psql -d postgres << 'EOF' > /dev/null
CREATE SCHEMA IF NOT EXISTS auth;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim', true), ''), '{}')::jsonb;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')::text;
$$;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS file_size_limit bigint;
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS allowed_mime_types text[];

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(name, '/');
$$;
EOF

echo ">>> [2/5] Building database from incremental migrations 01-16 (db_test_01_16)..."
run_psql -d postgres -c 'DROP DATABASE IF EXISTS db_test_01_16;' > /dev/null
run_psql -d postgres -c 'CREATE DATABASE db_test_01_16 TEMPLATE postgres;' > /dev/null

MIGRATIONS=(
  "supabase/01_schema.sql"
  "supabase/03_functions.sql"
  "supabase/04_fix_company_ids.sql"
  "supabase/05_fix_functions.sql"
  "supabase/06_suspension_works.sql"
  "supabase/07_lead_phone_index.sql"
  "supabase/08_hardening.sql"
  "supabase/09_fix_password_ack.sql"
  "supabase/10_multi_tenant_integrations.sql"
  "supabase/11_money_stock_enforcement.sql"
  "supabase/12_platform_admin_and_support.sql"
  "supabase/13_subscription_seat_enforcement.sql"
  "supabase/14_access_control_and_audit_triggers.sql"
  "supabase/15_fix_valid_until_null.sql"
  "supabase/16_platform_roles.sql"
)

for mig in "${MIGRATIONS[@]}"; do
  run_psql -d db_test_01_16 -f "$mig" -v ON_ERROR_STOP=1 > /dev/null
done

echo ">>> [3/5] Building database from squashed baseline (db_test_baseline)..."
run_psql -d postgres -c 'DROP DATABASE IF EXISTS db_test_baseline;' > /dev/null
run_psql -d postgres -c 'CREATE DATABASE db_test_baseline TEMPLATE postgres;' > /dev/null
run_psql -d db_test_baseline -f supabase/migrations/20261101000000_baseline.sql -v ON_ERROR_STOP=1 > /dev/null

echo ">>> [4/5] Extracting schema dumps for public schema..."
normalize_dump() {
  grep -v -E '^\\(un)?restrict' | grep -v '^-- Dumped by' | grep -v '^-- Dumped from'
}

run_pgdump -d db_test_01_16 --schema-only --schema=public --no-owner | normalize_dump > /tmp/schema_01_16.sql
run_pgdump -d db_test_baseline --schema-only --schema=public --no-owner | normalize_dump > /tmp/schema_baseline.sql

echo ">>> [5/5] Diffing schemas..."
if diff -u /tmp/schema_01_16.sql /tmp/schema_baseline.sql; then
  echo "=========================================================="
  echo " SUCCESS: Empty diff! Schemas are 100% strictly identical."
  echo "=========================================================="
  exit 0
else
  echo "=========================================================="
  echo " FAILURE: Schemas differ! See diff above."
  echo "=========================================================="
  exit 1
fi
