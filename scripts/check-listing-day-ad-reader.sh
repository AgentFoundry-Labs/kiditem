#!/usr/bin/env bash
set -euo pipefail

# Listing-day advertising values are read through one door (ADR-0006).
#
# `channel_listing_daily_snapshots.adSpend` and its siblings are `Int
# @default(0)`: an uncollected day and a zero-spend day are the same number,
# and only `adObservedAt` tells them apart. `apps/server/src/common/ad-window-facts.ts`
# is the one reader that applies that gate. Every other production read of an
# ad value from that table, and every read of the write-only coverage-status
# columns, is a new reader that bypassed the door.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

READER='apps/server/src/common/ad-window-facts.ts'
TARGETS=(apps/server/src apps/web/src packages/shared/src)
# Source owners write the columns; they are not readers.
WRITER_GLOBS=(
  --glob '!apps/server/src/advertising/adapter/out/repository/channel-listing-daily.repository.adapter.ts'
  --glob '!apps/server/src/advertising/adapter/out/repository/ad-traffic-source.repository.ts'
  --glob '!apps/server/src/advertising/application/service/listing-ad-metric-accumulator.ts'
  --glob '!apps/server/src/analytics/traffic/traffic-upload.ts'
)
COMMON_GLOBS=(
  --glob '!**/__tests__/**'
  --glob '!**/*.spec.ts'
  --glob '!**/*.spec.tsx'
  --glob '!**/*.test.ts'
  --glob '!**/test-helpers/**'
  --glob "!${READER}"
)

echo "Scanning for listing-day ad reads outside ${READER}..."

FAIL=0

# 1. The coverage-status columns are write-only.
if rg -n "${COMMON_GLOBS[@]}" "${WRITER_GLOBS[@]}" \
  '\b(adCoverageStatus|trafficCoverageStatus)\b' "${TARGETS[@]}"; then
  FAIL=1
fi

# 2. No Prisma read of the table may name an ad value column.
if rg -nU --multiline-dotall "${COMMON_GLOBS[@]}" "${WRITER_GLOBS[@]}" \
  'channelListingDailySnapshot(s)?\.(findMany|findFirst|findUnique|aggregate|groupBy)\([^;]*?\bad(Spend|Revenue|Impressions|Clicks|Conversions|Orders)\b' \
  "${TARGETS[@]}"; then
  FAIL=1
fi

# 3. Nor may raw SQL over the table.
if rg -nU --multiline-dotall "${COMMON_GLOBS[@]}" "${WRITER_GLOBS[@]}" \
  '(?i)(from|join)[[:space:]]+channel_listing_daily_snapshots[^;]*?\bad_(spend|revenue|impressions|clicks|conversions|orders)\b' \
  "${TARGETS[@]}"; then
  FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "check:listing-day-ad-reader FAIL"
  echo "Read listing-day ad values through ${READER} (readAdWindowFacts, readListingAdWindowFacts, readListingDayAdFacts, readLatestAdDate)."
  echo "The gate is adObservedAt; the coverage-status columns are write-only."
  exit 1
fi

echo "PASS: listing-day ad values are read only through ${READER}."
