#!/usr/bin/env bash
set -euo pipefail

# Consumers use owner read ports, not ChannelScrapeSnapshot JSON. These exact
# owners may validate staged captures, expose scoped replay evidence, or select
# normalized COMPLETE snapshots. Their HTTP/PostgreSQL tests cover visibility;
# this guard covers the module boundary, not publication correctness.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGETS=(apps/server/src apps/web/src packages/shared/src)
OWNER_GLOBS=()
for owner in keyword-serp-source wing-rank-source seller-identity-source wing-itemwinner-kpi-source ad-traffic-source; do
  OWNER_GLOBS+=(--glob "!apps/server/src/advertising/adapter/out/repository/${owner}.repository.ts")
done

echo "Scanning for raw ChannelScrapeSnapshot read-model access..."

FAIL=0

if rg -n \
  --glob '!**/__tests__/**' \
  --glob '!**/*.spec.ts' \
  --glob '!**/*.test.ts' \
  "${OWNER_GLOBS[@]}" \
  'channelScrapeSnapshot\.(findMany|findFirst|findUnique|aggregate|groupBy)' \
  "${TARGETS[@]}"; then
  FAIL=1
fi

if rg -n \
  --glob '!**/__tests__/**' \
  --glob '!**/*.spec.ts' \
  --glob '!**/*.test.ts' \
  "${OWNER_GLOBS[@]}" \
  '(?i)(from|join)[[:space:]]+channel_scrape_snapshots' \
  "${TARGETS[@]}"; then
  FAIL=1
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "check:raw-snapshot-read-models FAIL"
  echo "Use the source owner's published read port for UI/API reads."
  echo "Only the named source owners may select capture evidence or normalized COMPLETE snapshots."
  exit 1
fi

echo "PASS: snapshot reads remain inside the named source owners."
