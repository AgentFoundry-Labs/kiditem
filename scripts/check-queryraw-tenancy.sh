#!/usr/bin/env bash
# ADR-0018 Rule 4 — $queryRaw tenancy enforcement
#
# Scans apps/server/src for $queryRaw tagged templates (excluding tests/specs/docs)
# and verifies each site has `organization_id` binding within 30 lines after the hit.
#
# Scope: $queryRaw (tagged template). $queryRawUnsafe is separately banned by ADR-0009.
#
# Exemptions (auto-detected within the 30-line window):
#   - `FOR UPDATE` row locks on UUID primary key (id = ${uuid}::uuid FOR UPDATE) —
#     tenancy is enforced by the subsequent Prisma findFirst({ id, organizationId }).
#   - `nextval('...')` sequence calls — globally scoped sequence, no tenant data.
#
# Exits 1 if any non-exempt site is missing the binding.
# Uses ripgrep (rg) — BSD grep lacks reliable multi-line context.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)

if ! command -v rg &> /dev/null; then
  echo "ERROR: ripgrep (rg) is required. Install: brew install ripgrep"
  exit 2
fi

echo "🔍 Scanning apps/server/src for \$queryRaw sites..."

# Find every .ts file that uses $queryRaw. Exclusions:
# - test-helpers/: integration-test infrastructure (DB teardown etc.), not prod.
# - __tests__/ + *.spec.ts + *.integration.spec.ts: tests.
# - .md files: documentation (--type ts handles this).
# Bash 3.2 (macOS default) lacks `mapfile`/`readarray`; collect with a portable loop.
FILES=()
while IFS= read -r _line; do
  [ -z "$_line" ] && continue
  FILES+=("$_line")
done < <(rg -l '\$queryRaw' "$REPO_ROOT/apps/server/src" \
  --type ts \
  --glob '!**/__tests__/**' \
  --glob '!**/*.spec.ts' \
  --glob '!**/*.integration.spec.ts' \
  --glob '!**/test-helpers/**' \
  2>/dev/null | sort -u)

if [ ${#FILES[@]} -eq 0 ]; then
  echo "✅ No \$queryRaw sites found in production code."
  exit 0
fi

echo "  Found \$queryRaw in ${#FILES[@]} file(s)."
echo ""

FAILURES=()

for file in "${FILES[@]}"; do
  # Collect line numbers of every $queryRaw method-call site (not comment, not Unsafe).
  # Matches: `.\$queryRaw<T>` (generic) and `.\$queryRaw\`` (bare tagged template).
  # Excludes: `.\$queryRawUnsafe(` (separately banned by ADR-0009).
  # Bash 3.2-compatible array assignment (no mapfile/readarray).
  linenos=()
  while IFS= read -r _ln; do
    [ -z "$_ln" ] && continue
    linenos+=("$_ln")
  done < <(rg -n '\.\$queryRaw[<\`]' "$file" 2>/dev/null | cut -d: -f1)

  if [ ${#linenos[@]} -eq 0 ]; then
    # No method-call hits (comment-only file, or $queryRawUnsafe only). Skip.
    continue
  fi

  file_failed=false
  for lineno in "${linenos[@]}"; do
    [ -z "$lineno" ] && continue
    end=$((lineno + 30))
    window=$(sed -n "${lineno},${end}p" "$file" 2>/dev/null || true)

    # Compliant: has `organization_id` binding anywhere in the window.
    if echo "$window" | rg -q 'organization_id'; then
      continue
    fi

    # Exempt: FOR UPDATE row-lock on UUID primary key. Tenancy enforced by
    # the subsequent Prisma findFirst({ id, organizationId }). (B1/B2a/inventory pattern.)
    if echo "$window" | rg -q 'FOR UPDATE'; then
      continue
    fi

    # Exempt: sequence call via nextval(). No tenant-scoped data.
    if echo "$window" | rg -q "nextval\('"; then
      continue
    fi

    # Not compliant, not exempt.
    file_failed=true
    break
  done

  if [ "$file_failed" = true ]; then
    FAILURES+=("$file")
  fi
done

if [ ${#FAILURES[@]} -gt 0 ]; then
  echo "❌ FAIL: \$queryRaw without organization_id binding found in:"
  for f in "${FAILURES[@]}"; do
    echo "   - $f"
  done
  echo ""
  echo "ADR-0018 Rule 2: every \$queryRaw must bind WHERE organization_id = \${organizationId}::uuid"
  echo "(Exemptions: FOR UPDATE row-lock on UUID PK, nextval() sequence.)"
  exit 1
fi

echo "✅ PASS: all \$queryRaw sites bind organization_id or are exempt (ADR-0018 Rule 2)"
exit 0
