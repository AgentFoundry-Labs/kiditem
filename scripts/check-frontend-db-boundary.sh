#!/usr/bin/env bash
# Frontend database boundary scanner.
#
# apps/web is frontend-only: it must fetch data through the NestJS API and must
# not carry Prisma/Postgres package dependencies, db:* package scripts, or direct
# database imports in src.
#
# Exits 1 if the frontend DB boundary is violated.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
WEB_PACKAGE="$REPO_ROOT/apps/web/package.json"
WEB_SRC="$REPO_ROOT/apps/web/src"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required." >&2
  exit 2
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: ripgrep (rg) is required. Install: brew install ripgrep" >&2
  exit 2
fi

if [ ! -f "$WEB_PACKAGE" ]; then
  echo "ERROR: $WEB_PACKAGE not found." >&2
  exit 2
fi

if [ ! -d "$WEB_SRC" ]; then
  echo "ERROR: $WEB_SRC not found." >&2
  exit 2
fi

echo "Scanning apps/web package scripts and dependencies..."

PACKAGE_FAILURES=$(
  WEB_PACKAGE="$WEB_PACKAGE" node <<'NODE'
const fs = require('fs');

const packagePath = process.env.WEB_PACKAGE;
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const forbiddenScripts = ['db:generate', 'db:push', 'db:migrate', 'db:studio'];
const forbiddenPackages = ['@prisma/client', '@prisma/adapter-pg', 'prisma', 'pg', '@types/pg'];
const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

const failures = [];

for (const scriptName of forbiddenScripts) {
  if (pkg.scripts && Object.prototype.hasOwnProperty.call(pkg.scripts, scriptName)) {
    failures.push(`script:${scriptName}`);
  }
}

for (const field of dependencyFields) {
  const deps = pkg[field] || {};
  for (const packageName of forbiddenPackages) {
    if (Object.prototype.hasOwnProperty.call(deps, packageName)) {
      failures.push(`${field}:${packageName}`);
    }
  }
}

console.log(failures.join('\n'));
NODE
)

FAILURES=0

if [ -n "$PACKAGE_FAILURES" ]; then
  echo "FAIL: apps/web/package.json contains frontend-forbidden DB entries:"
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    echo "  - $entry"
  done <<< "$PACKAGE_FAILURES"
  FAILURES=$((FAILURES + 1))
fi

echo "Scanning apps/web/src for direct database imports..."

# Matches executable module-load syntax only:
#   import ... from 'pg'
#   export ... from 'pg'
#   } from 'pg'      # multi-line import/export ending line
#   import 'pg'
#   import('pg')
#   require('pg')
# The optional subpath catches imports like `pg/lib/...` without matching
# local identifiers such as `pg` pagination variables.
IMPORT_PATTERN="(^|[[:space:];({=,:])(((import|export)[[:space:]]+type[[:space:]]+[^;]*[[:space:]]+from[[:space:]]*)|((import|export)[[:space:]]+[^;]*[[:space:]]+from[[:space:]]*)|(from[[:space:]]*)|(import[[:space:]]*)|(import[[:space:]]*\\([[:space:]]*)|(require[[:space:]]*\\([[:space:]]*))['\"](@prisma/client|@prisma/adapter-pg|pg|postgres|prisma)(/[^'\"]*)?['\"]"

IMPORT_HITS=$(
  rg -n "$IMPORT_PATTERN" "$WEB_SRC" \
    --glob '*.ts' \
    --glob '*.tsx' \
    --glob '*.js' \
    --glob '*.jsx' \
    --glob '*.mts' \
    --glob '*.cts' \
    --glob '*.mjs' \
    --glob '*.cjs' \
    --glob '!**/.next/**' \
    2>/dev/null || true
)

if [ -n "$IMPORT_HITS" ]; then
  echo "FAIL: direct DB package imports found in apps/web/src:"
  echo "$IMPORT_HITS" | sed 's/^/  - /'
  FAILURES=$((FAILURES + 1))
fi

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "check:web-db-boundary FAIL — apps/web must use NestJS APIs, not direct DB access."
  exit 1
fi

echo "PASS: frontend DB boundary clean."
