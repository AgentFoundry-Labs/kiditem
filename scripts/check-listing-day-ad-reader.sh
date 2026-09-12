#!/usr/bin/env bash
set -euo pipefail

# Listing-day advertising values are read through one door (ADR-0006).
#
# The ledger is `channel_ad_target_daily_snapshots`, what the campaign sweep
# publishes. `apps/server/src/common/ad-window-facts.ts` is the one reader
# that applies its evidence gate (the current completed sweep, product grain,
# no keyword rows). Outside the Advertising owner, every other production read
# of that table is a new reader that bypassed the door.
#
# `channel_listing_daily_snapshots` still carries ad columns from the
# pre-cutover writer. Nobody writes them and nobody may read them; their
# removal is a schema cutover. The coverage-status columns are write-only.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

READER='apps/server/src/common/ad-window-facts.ts'
TARGETS=(apps/server/src apps/web/src packages/shared/src)
# Source owners write the columns; they are not readers.
WRITER_GLOBS=(
  --glob '!apps/server/src/advertising/adapter/out/repository/channel-listing-daily.repository.adapter.ts'
  --glob '!apps/server/src/advertising/adapter/out/repository/ad-traffic-source.repository.ts'
  --glob '!apps/server/src/analytics/traffic/traffic-upload.ts'
)
# The Advertising owner publishes the target ledger and reads it for its own
# published calculations (campaign list, actions, keyword facts, profitability
# import); those are owner reads, not consumer reads.
OWNER_GLOBS=(
  --glob '!apps/server/src/advertising/**'
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

# 4. Outside the Advertising owner, the target-day ledger is read only here.
if rg -n "${COMMON_GLOBS[@]}" "${OWNER_GLOBS[@]}" \
  'channelAdTargetDailySnapshot\b|channel_ad_target_daily_snapshots' "${TARGETS[@]}"; then
  FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "check:listing-day-ad-reader FAIL"
  echo "Read listing-day ad values through ${READER} (readAdWindowFacts, readListingAdWindowFacts, readListingDayAdFacts, readLatestAdDate)."
  echo "The ledger is channel_ad_target_daily_snapshots; the listing table's ad columns and the coverage-status columns are dead."
  exit 1
fi

echo "PASS: listing-day ad values are read only through ${READER}."
