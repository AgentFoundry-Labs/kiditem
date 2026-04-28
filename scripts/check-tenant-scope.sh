#!/usr/bin/env bash
# Service / controller / DTO tenant-scope scanner.
#
# Companion to scripts/check-queryraw-tenancy.sh, which covers raw SQL tenancy.
# This scanner targets ORM-level tenant-scope risks in apps/server/src:
#
#   1. findUnique({ where: { id } })
#      Bare-id reads are IDOR candidates — companyId must be in the where clause
#      (root AGENTS.md "Multi-tenant scope" rule).
#
#   2. update/delete({ where: { id } })
#      Bare-id mutations without a tenant-scoped read in the preceding ~25 lines
#      of the same file (read-then-write pattern: findFirst({ id, companyId })
#      followed by update/delete by id is allowed; the unscoped bare site by
#      itself is not).
#
#   3. Controller @Body / @Query / @Param receiving 'companyId'
#      companyId must come from @CurrentCompany(), never from client payload.
#
#   4. DTO file declaring a `companyId` property
#      DTOs must not carry companyId — service signatures take it as an explicit
#      argument supplied by the controller from @CurrentCompany().
#
# Exclusions (always):
#   - Test files (__tests__/, *.spec.ts, *.integration.spec.ts)
#   - test-helpers/ infrastructure
#   - Comment-only lines (// ... or * ...)
#
# Exclusions (per-allowlist):
#   - scripts/.tenant-scope-allowlist.txt — narrow, per-path + per-pattern.
#
# Exits 1 if any non-allowlisted, non-comment hit is found.
#
# Requires: ripgrep (rg). Bash 3.2 compatible (macOS default).

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
ALLOWLIST_FILE="$SCRIPT_DIR/.tenant-scope-allowlist.txt"
SERVER_SRC="$REPO_ROOT/apps/server/src"

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: ripgrep (rg) is required. Install: brew install ripgrep" >&2
  exit 2
fi

if [ ! -d "$SERVER_SRC" ]; then
  echo "ERROR: $SERVER_SRC not found." >&2
  exit 2
fi

# ── Allowlist parsing ──────────────────────────────────────────────────────
# Format per non-comment line: <relative-path> [pattern-id]
# pattern-id ∈ { findUnique | idMutation | controllerParam | dtoField | all }
# Whitespace-separated. Default pattern-id is "all".
ALLOW_PATHS=()
ALLOW_PATTERNS=()
if [ -f "$ALLOWLIST_FILE" ]; then
  while IFS= read -r raw_line || [ -n "$raw_line" ]; do
    # strip inline comment + trim
    line="${raw_line%%#*}"
    # trim leading
    line="${line#"${line%%[![:space:]]*}"}"
    # trim trailing
    line="${line%"${line##*[![:space:]]}"}"
    [ -z "$line" ] && continue
    # split into path + pattern
    path_part="${line%%[[:space:]]*}"
    if [ "$path_part" = "$line" ]; then
      pattern_part="all"
    else
      rest="${line#"$path_part"}"
      rest="${rest#"${rest%%[![:space:]]*}"}"
      pattern_part="${rest%%[[:space:]]*}"
      [ -z "$pattern_part" ] && pattern_part="all"
    fi
    ALLOW_PATHS+=("$path_part")
    ALLOW_PATTERNS+=("$pattern_part")
  done < "$ALLOWLIST_FILE"
fi

is_allowlisted() {
  # $1 = pattern-id, $2 = repo-relative file path
  local pid="$1" file="$2" i
  for i in "${!ALLOW_PATHS[@]}"; do
    if [ "${ALLOW_PATHS[$i]}" = "$file" ]; then
      if [ "${ALLOW_PATTERNS[$i]}" = "all" ] || [ "${ALLOW_PATTERNS[$i]}" = "$pid" ]; then
        return 0
      fi
    fi
  done
  return 1
}

relpath() {
  local abs="$1"
  echo "${abs#"$REPO_ROOT"/}"
}

# Skip lines whose first non-blank chars are // or * (line / JSDoc comments).
is_comment_line() {
  local line="$1"
  local trimmed="${line#"${line%%[![:space:]]*}"}"
  case "$trimmed" in
    //*|\**) return 0 ;;
    *) return 1 ;;
  esac
}

# Common rg flags. Test/test-helpers always excluded; the scanner is for prod code.
EXCLUDE_GLOBS=(
  --type ts
  --glob '!**/__tests__/**'
  --glob '!**/*.spec.ts'
  --glob '!**/*.integration.spec.ts'
  --glob '!**/test-helpers/**'
)

FAIL_PATTERNS=0

# ── Pattern 1: findUnique({ where: { id ... } }) without companyId ─────────
echo "🔍 [1/4] findUnique({ where: { id ... } }) without companyId scope..."
P1_HITS=()
while IFS= read -r match; do
  [ -z "$match" ] && continue
  file="${match%%:*}"
  rest="${match#*:}"
  lineno="${rest%%:*}"
  content="${rest#*:}"
  rel="$(relpath "$file")"

  is_comment_line "$content" && continue
  is_allowlisted "findUnique" "$rel" && continue

  # Multi-line where clause: scan the matched line + next 3 lines for companyId.
  end=$((lineno + 3))
  window=$(sed -n "${lineno},${end}p" "$file" 2>/dev/null || true)
  if echo "$window" | rg -q 'companyId'; then
    continue
  fi

  P1_HITS+=("$rel:$lineno: $content")
done < <(rg -n '\.findUnique\s*\(\s*\{\s*where:\s*\{\s*id\b' "$SERVER_SRC" "${EXCLUDE_GLOBS[@]}" 2>/dev/null || true)

if [ ${#P1_HITS[@]} -gt 0 ]; then
  echo "❌ FAIL [1/4]: ${#P1_HITS[@]} site(s) using findUnique by bare id (IDOR risk):"
  for h in "${P1_HITS[@]}"; do
    echo "   - $h"
  done
  FAIL_PATTERNS=$((FAIL_PATTERNS + 1))
fi

# ── Pattern 2: update/delete({ where: { id ... } }) with no preceding scope ─
echo "🔍 [2/4] update/delete({ where: { id ... } }) without preceding tenant-scoped read..."
P2_HITS=()
while IFS= read -r match; do
  [ -z "$match" ] && continue
  file="${match%%:*}"
  rest="${match#*:}"
  lineno="${rest%%:*}"
  content="${rest#*:}"
  rel="$(relpath "$file")"

  is_comment_line "$content" && continue
  is_allowlisted "idMutation" "$rel" && continue

  # Multi-line where clause: scan matched line + next 3 lines for companyId.
  end_after=$((lineno + 3))
  win_after=$(sed -n "${lineno},${end_after}p" "$file" 2>/dev/null || true)
  if echo "$win_after" | rg -q 'companyId'; then
    continue
  fi

  # Preceding ~25 lines: any tenant-scoped read (findFirst with companyId,
  # or any explicit companyId reference) is treated as "scoped" — the
  # canonical read-then-write pattern.
  start_before=$((lineno - 25))
  [ "$start_before" -lt 1 ] && start_before=1
  end_before=$((lineno - 1))
  if [ "$end_before" -ge "$start_before" ]; then
    win_before=$(sed -n "${start_before},${end_before}p" "$file" 2>/dev/null || true)
    if echo "$win_before" | rg -q 'companyId'; then
      continue
    fi
  fi

  P2_HITS+=("$rel:$lineno: $content")
done < <(rg -n '\.(update|delete)\s*\(\s*\{\s*where:\s*\{\s*id\s*[},]' "$SERVER_SRC" "${EXCLUDE_GLOBS[@]}" 2>/dev/null || true)

if [ ${#P2_HITS[@]} -gt 0 ]; then
  echo "❌ FAIL [2/4]: ${#P2_HITS[@]} site(s) using update/delete by bare id without preceding tenant scope:"
  for h in "${P2_HITS[@]}"; do
    echo "   - $h"
  done
  FAIL_PATTERNS=$((FAIL_PATTERNS + 1))
fi

# ── Pattern 3: Controller @Body / @Query / @Param('companyId') ─────────────
echo "🔍 [3/4] Controller @Body / @Query / @Param receiving 'companyId'..."
P3_HITS=()
while IFS= read -r match; do
  [ -z "$match" ] && continue
  file="${match%%:*}"
  rest="${match#*:}"
  lineno="${rest%%:*}"
  content="${rest#*:}"
  rel="$(relpath "$file")"

  is_comment_line "$content" && continue
  is_allowlisted "controllerParam" "$rel" && continue

  P3_HITS+=("$rel:$lineno: $content")
done < <(rg -n "@(Body|Query|Param)\s*\(\s*['\"]companyId['\"]" "$SERVER_SRC" "${EXCLUDE_GLOBS[@]}" 2>/dev/null || true)

if [ ${#P3_HITS[@]} -gt 0 ]; then
  echo "❌ FAIL [3/4]: ${#P3_HITS[@]} site(s) receiving companyId via @Body/@Query/@Param:"
  for h in "${P3_HITS[@]}"; do
    echo "   - $h"
  done
  FAIL_PATTERNS=$((FAIL_PATTERNS + 1))
fi

# ── Pattern 4: DTO files declaring companyId field ─────────────────────────
# Scope: paths under **/dto/** or filenames ending in *.dto.ts.
echo "🔍 [4/4] DTO files declaring companyId field..."
P4_HITS=()
while IFS= read -r match; do
  [ -z "$match" ] && continue
  file="${match%%:*}"
  rest="${match#*:}"
  lineno="${rest%%:*}"
  content="${rest#*:}"
  rel="$(relpath "$file")"

  # Restrict to actual DTO files (path contains /dto/ OR filename ends .dto.ts).
  case "$rel" in
    */dto/*|*.dto.ts) ;;
    *) continue ;;
  esac

  is_comment_line "$content" && continue
  is_allowlisted "dtoField" "$rel" && continue

  P4_HITS+=("$rel:$lineno: $content")
done < <(rg -n '^\s*companyId\??\s*:' "$SERVER_SRC" "${EXCLUDE_GLOBS[@]}" 2>/dev/null || true)

if [ ${#P4_HITS[@]} -gt 0 ]; then
  echo "❌ FAIL [4/4]: ${#P4_HITS[@]} DTO field(s) declaring companyId:"
  for h in "${P4_HITS[@]}"; do
    echo "   - $h"
  done
  FAIL_PATTERNS=$((FAIL_PATTERNS + 1))
fi

echo ""
if [ "$FAIL_PATTERNS" -gt 0 ]; then
  echo "❌ check:tenant-scope FAIL — $FAIL_PATTERNS pattern(s) failing."
  echo ""
  echo "  Tenant scope rules (root AGENTS.md → Cross-Domain Rules):"
  echo "    - GET/PATCH/DELETE single resource: findFirst({ where: { id, companyId } })"
  echo "    - Mutating service: companyId from @CurrentCompany() as explicit arg"
  echo "    - DTOs do NOT carry companyId; controllers do NOT receive it from clients"
  echo ""
  echo "  Narrow false positives go in scripts/.tenant-scope-allowlist.txt"
  echo "  with a per-pattern entry and a recorded reason."
  exit 1
fi

echo "✅ PASS: tenant-scope scanner clean."
exit 0
