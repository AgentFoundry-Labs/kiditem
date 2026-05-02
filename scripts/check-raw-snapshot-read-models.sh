#!/usr/bin/env bash
set -euo pipefail

# Raw scrape snapshots are audit/debug/replay evidence. Production read-models
# must not derive UI/API rows directly from ChannelScrapeSnapshot JSON.
# Counts for status screens and write-side ingest/persistence are allowed.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGETS=(apps/server/src apps/web/src packages/shared/src)

echo "Scanning for raw ChannelScrapeSnapshot read-model access..."

FAIL=0

if rg -n \
  --glob '!**/__tests__/**' \
  --glob '!**/*.spec.ts' \
  --glob '!**/*.test.ts' \
  'channelScrapeSnapshot\.(findMany|findFirst|findUnique|aggregate|groupBy)' \
  "${TARGETS[@]}"; then
  FAIL=1
fi

if rg -n \
  --glob '!**/__tests__/**' \
  --glob '!**/*.spec.ts' \
  --glob '!**/*.test.ts' \
  '(?i)(from|join)[[:space:]]+channel_scrape_snapshots' \
  "${TARGETS[@]}"; then
  FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "check:raw-snapshot-read-models FAIL"
  echo "Use normalized daily facts + product/listing/account schemas for UI/API reads."
  echo "Allowed raw snapshot uses: ingest writes, replay/debug, and status counts."
  exit 1
fi

echo "PASS: no raw snapshot table is used as a production read model."
