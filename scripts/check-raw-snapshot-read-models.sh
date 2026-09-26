#!/usr/bin/env bash
set -euo pipefail

# Consumers use owner read ports, not ChannelScrapeSnapshot JSON. Every source
# owner that selected capture evidence moved to the operation contract (K1-K7,
# KID-362), so no production code may read these snapshots any more; the
# tables stay only for the rows H' still writes until N drops them.

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: ripgrep (rg) is required. Install: brew install ripgrep" >&2
  exit 2
fi

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
  echo "Use the source owner's published read port for UI/API reads."
  exit 1
fi

echo "PASS: no production code reads raw ChannelScrapeSnapshot evidence."
