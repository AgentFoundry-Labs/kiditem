#!/usr/bin/env bash
set -euo pipefail

# Test DB setup — called by `npm run db:test:prepare`.
# Push schema via Prisma (multi-file via prisma.config.ts).

DB_URL="${DATABASE_URL:-postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test}"
echo "[test-db-setup] prisma db push ..."
DATABASE_URL="$DB_URL" npx prisma db push --accept-data-loss

echo "[test-db-setup] done."
