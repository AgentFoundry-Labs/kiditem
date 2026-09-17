#!/usr/bin/env bash
# Raw SQL tenancy enforcement
#
# Scans apps/server/src for raw SQL sites (excluding tests/specs/docs) and
# verifies each has an `organization_id` binding within 30 lines after the hit.
#
# Scope — every way this repository reaches raw SQL:
#   - `$queryRaw` / `$executeRaw` tagged template, and their `<T>` generic form.
#   - `$queryRaw(...)` / `$executeRaw(...)` call form, normally `Prisma.sql`.
#   - `$queryRawUnsafe(...)` / `$executeRawUnsafe(...)`, where every argument is
#     an interpolated string and the tenant binding matters most.
#
# Exemptions (auto-detected within the 30-line window):
#   - `FOR UPDATE` row locks on UUID primary key (id = ${uuid}::uuid FOR UPDATE) —
#     tenancy is enforced by the subsequent Prisma findFirst({ id, organizationId }).
#   - `nextval('...')` sequence calls — globally scoped sequence, no tenant data.
#   - Organization-scoped advisory locks. All three are required, so a comment
#     alone never exempts a site: a `queryraw-tenancy-exempt:` marker naming the
#     organization reason, a `pg_advisory_xact_lock` call, and a lock key derived
#     from organizationId at the lock statement (the 8 lines above the hit cover
#     the key composition, which normally sits just above the SQL).
#   - Exact database-clock reads with the
#     `queryraw-tenancy-exempt: database clock only` marker and no table access.
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

# Tagged-template forms, then the call forms. `(Unsafe)?` keeps
# `$queryRawUnsafe(` from being read as `$queryRaw` followed by other text.
RAW_SITE_PATTERN='(\.\$(queryRaw|executeRaw)(Unsafe)?\s*\()|(\.\$(queryRaw|executeRaw)[<`])'

echo "🔍 Scanning apps/server/src for raw SQL sites..."

# Find every .ts file that uses raw SQL. Exclusions:
# - test-helpers/: integration-test infrastructure (DB teardown etc.), not prod.
# - __tests__/ + *.spec.ts + *.integration.spec.ts: tests.
# - .md files: documentation (--type ts handles this).
# Bash 3.2 (macOS default) lacks `mapfile`/`readarray`; collect with a portable loop.
FILES=()
while IFS= read -r _line; do
  [ -z "$_line" ] && continue
  FILES+=("$_line")
done < <(rg -l '\$(queryRaw|executeRaw)' "$REPO_ROOT/apps/server/src" \
  --type ts \
  --glob '!**/__tests__/**' \
  --glob '!**/*.spec.ts' \
  --glob '!**/*.integration.spec.ts' \
  --glob '!**/test-helpers/**' \
  2>/dev/null | sort -u)

if [ ${#FILES[@]} -eq 0 ]; then
  echo "✅ No raw SQL sites found in production code."
  exit 0
fi

echo "  Found raw SQL in ${#FILES[@]} file(s)."
echo ""

FAILURES=()

for file in "${FILES[@]}"; do
  # Collect line numbers of every raw SQL method-call site.
  # Bash 3.2-compatible array assignment (no mapfile/readarray).
  linenos=()
  while IFS= read -r _ln; do
    [ -z "$_ln" ] && continue
    linenos+=("$_ln")
  done < <(rg -n "$RAW_SITE_PATTERN" "$file" 2>/dev/null | cut -d: -f1)

  if [ ${#linenos[@]} -eq 0 ]; then
    # No method-call hits (comment-only file, or a re-exported name). Skip.
    continue
  fi

  file_failed=false
  for lineno in "${linenos[@]}"; do
    [ -z "$lineno" ] && continue
    end=$((lineno + 30))
    window=$(sed -n "${lineno},${end}p" "$file" 2>/dev/null || true)
    # Advisory-lock keys are composed just above the statement that binds them,
    # so the lock evidence window reaches a few lines back as well.
    lock_start=$((lineno - 8))
    [ "$lock_start" -lt 1 ] && lock_start=1
    lock_window=$(sed -n "${lock_start},${end}p" "$file" 2>/dev/null || true)

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

    # Exempt: reviewed organization-scoped advisory lock. The reviewed marker
    # names the organization reason, the statement takes a transaction advisory
    # lock, and the lock key is derived from organizationId — so a lock keyed by
    # anything else, and any other raw SQL wearing the marker, still fails.
    if echo "$window" | rg -q 'queryraw-tenancy-exempt:.*organization' \
      && echo "$window" | rg -q 'pg_advisory_xact_lock' \
      && echo "$lock_window" | rg -q 'organizationId|organization_id'; then
      continue
    fi

    # Exempt: one authoritative transaction timestamp with no table or
    # tenant-row access. The exact marker and clock function are both required.
    if echo "$window" | rg -q 'queryraw-tenancy-exempt: database clock only' \
      && echo "$window" | rg -q 'SELECT clock_timestamp\(\)'; then
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
  echo "❌ FAIL: raw SQL without organization_id binding found in:"
  for f in "${FAILURES[@]}"; do
    echo "   - $f"
  done
  echo ""
  echo "Every raw SQL site must bind WHERE organization_id = \${organizationId}::uuid"
  echo "(Exemptions: FOR UPDATE row-lock on UUID PK, nextval() sequence, reviewed advisory lock keyed by organizationId.)"
  exit 1
fi

echo "✅ PASS: all raw SQL sites bind organization_id or are exempt"
exit 0
