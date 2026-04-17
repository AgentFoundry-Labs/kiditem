#!/usr/bin/env bash
set -euo pipefail

# Test DB setup — called by `npm run db:test:prepare`.
# 1. Push schema via Prisma (multi-file via prisma.config.ts).
# 2. Ensure chatbot_readonly role exists (required by 3layer-setup.sql RLS policies).
# 3. Apply 3layer-setup.sql (sequence + partial unique + CHECK + RLS policies).

DB_URL="${DATABASE_URL:-postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test}"
CONTAINER="${TEST_DB_CONTAINER:-kiditem-postgres-test}"
DB_USER="${TEST_DB_USER:-kiditem_test}"
DB_NAME="${TEST_DB_NAME:-kiditem_test}"

echo "[test-db-setup] prisma db push ..."
DATABASE_URL="$DB_URL" npx prisma db push --accept-data-loss

echo "[test-db-setup] ensure chatbot_readonly role ..."
docker exec "$CONTAINER" psql -U "$DB_USER" "$DB_NAME" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chatbot_readonly') THEN
    CREATE ROLE chatbot_readonly LOGIN PASSWORD 'chatbot_readonly';
  END IF;
END
\$\$;
GRANT CONNECT ON DATABASE $DB_NAME TO chatbot_readonly;
GRANT USAGE ON SCHEMA public TO chatbot_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO chatbot_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO chatbot_readonly;
SQL

echo "[test-db-setup] apply 3layer-setup.sql ..."
docker exec -i "$CONTAINER" psql -U "$DB_USER" "$DB_NAME" < "$(dirname "$0")/3layer-setup.sql"

echo "[test-db-setup] done."
