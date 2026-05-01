#!/usr/bin/env bash
# Service / controller / DTO tenant-scope scanner.
#
# Companion to scripts/check-queryraw-tenancy.sh, which covers raw SQL tenancy.
# This scanner targets ORM-level tenant-scope risks in apps/server/src:
#
#   1. findUnique({ where: { id } })
#      Bare-id reads are IDOR candidates — organizationId must be in the where clause
#      (root AGENTS.md "Multi-tenant scope" rule).
#
#   2. update/delete({ where: { id } })
#      Bare-id mutations without a tenant-scoped read in the preceding ~25 lines
#      of the same file (read-then-write pattern: findFirst({ id, organizationId })
#      followed by update/delete by id is allowed; the unscoped bare site by
#      itself is not).
#
#   3. Controller @Body / @Query / @Param receiving 'organizationId'
#      organizationId must come from @CurrentOrganization(), never from client payload.
#
#   4. DTO file declaring a `organizationId` property
#      DTOs must not carry organizationId — service signatures take it as an explicit
#      argument supplied by the controller from @CurrentOrganization().
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

# Loaded per file by scan_file_lines. Bash 3.2 compatible replacement for mapfile.
FILE_LINES=()

load_file_lines() {
  local file="$1"
  FILE_LINES=()
  while IFS= read -r line || [ -n "$line" ]; do
    FILE_LINES+=("$line")
  done < "$file"
}

window_from_index() {
  # $1 = zero-based start index, $2 = zero-based end index
  local start="$1" end="$2" i
  [ "$start" -lt 0 ] && start=0
  [ "$end" -ge "${#FILE_LINES[@]}" ] && end=$((${#FILE_LINES[@]} - 1))
  for ((i = start; i <= end; i++)); do
    printf '%s\n' "${FILE_LINES[$i]}"
  done
}

# ── Pattern 1: findUnique({ where: { id ... } }) without organizationId ─────────
echo "🔍 [1/4] findUnique({ where: { id ... } }) without organizationId scope..."
P1_HITS=()
while IFS= read -r file; do
  [ -z "$file" ] && continue
  rel="$(relpath "$file")"
  is_allowlisted "findUnique" "$rel" && continue
  load_file_lines "$file"

  for i in "${!FILE_LINES[@]}"; do
    content="${FILE_LINES[$i]}"
    is_comment_line "$content" && continue
    case "$content" in
      *".findUnique"*"("*) ;;
      *) continue ;;
    esac

    # Prisma calls in this repo normally close within a few lines. Keep the
    # window wide enough for formatted multi-line `where` objects without
    # attempting to parse TypeScript in shell.
    window=$(window_from_index "$i" "$((i + 10))")
    [[ "$window" =~ where[[:space:]]*: ]] || continue
    [[ "$window" =~ (^|[^[:alnum:]_])id[[:space:]]*[:},] ]] || continue
    if [[ "$window" == *organizationId* ]]; then
      continue
    fi

    P1_HITS+=("$rel:$((i + 1)): $content")
  done
done < <(rg --files "$SERVER_SRC" "${EXCLUDE_GLOBS[@]}" 2>/dev/null || true)

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
while IFS= read -r file; do
  [ -z "$file" ] && continue
  rel="$(relpath "$file")"
  is_allowlisted "idMutation" "$rel" && continue
  load_file_lines "$file"

  for i in "${!FILE_LINES[@]}"; do
    content="${FILE_LINES[$i]}"
    is_comment_line "$content" && continue
    [[ "$content" =~ (this\.prisma|prisma|tx|db)\.[A-Za-z0-9_]+\.(update|delete)[[:space:]]*\( ]] || continue

    win_after=$(window_from_index "$i" "$((i + 10))")
    [[ "$win_after" =~ where[[:space:]]*: ]] || continue
    [[ "$win_after" =~ (^|[^[:alnum:]_])id[[:space:]]*[:},] ]] || continue
    if [[ "$win_after" == *organizationId* ]]; then
      continue
    fi

    # Preceding ~25 lines: any tenant-scoped read (findFirst with organizationId,
    # or any explicit organizationId reference) is treated as "scoped" — the
    # canonical read-then-write pattern.
    win_before=$(window_from_index "$((i - 25))" "$((i - 1))")
    if [[ "$win_before" == *organizationId* ]]; then
      continue
    fi

    P2_HITS+=("$rel:$((i + 1)): $content")
  done
done < <(rg --files "$SERVER_SRC" "${EXCLUDE_GLOBS[@]}" 2>/dev/null || true)

if [ ${#P2_HITS[@]} -gt 0 ]; then
  echo "❌ FAIL [2/4]: ${#P2_HITS[@]} site(s) using update/delete by bare id without preceding tenant scope:"
  for h in "${P2_HITS[@]}"; do
    echo "   - $h"
  done
  FAIL_PATTERNS=$((FAIL_PATTERNS + 1))
fi

# ── Pattern 3: Controller @Body / @Query / @Param('organizationId') ─────────────
echo "🔍 [3/4] Controller @Body / @Query / @Param receiving 'organizationId'..."
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
done < <(rg -n "@(Body|Query|Param)\s*\(\s*['\"]organizationId['\"]" "$SERVER_SRC" "${EXCLUDE_GLOBS[@]}" 2>/dev/null || true)

if [ ${#P3_HITS[@]} -gt 0 ]; then
  echo "❌ FAIL [3/4]: ${#P3_HITS[@]} site(s) receiving organizationId via @Body/@Query/@Param:"
  for h in "${P3_HITS[@]}"; do
    echo "   - $h"
  done
  FAIL_PATTERNS=$((FAIL_PATTERNS + 1))
fi

# ── Pattern 4: DTO files declaring organizationId field ─────────────────────────
# Scope: paths under **/dto/** or filenames ending in *.dto.ts.
echo "🔍 [4/4] DTO files declaring organizationId field..."
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
done < <(rg -n '^\s*organizationId\??\s*:' "$SERVER_SRC" "${EXCLUDE_GLOBS[@]}" 2>/dev/null || true)

if [ ${#P4_HITS[@]} -gt 0 ]; then
  echo "❌ FAIL [4/4]: ${#P4_HITS[@]} DTO field(s) declaring organizationId:"
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
  echo "    - GET/PATCH/DELETE single resource: findFirst({ where: { id, organizationId } })"
  echo "    - Mutating service: organizationId from @CurrentOrganization() as explicit arg"
  echo "    - DTOs do NOT carry organizationId; controllers do NOT receive it from clients"
  echo ""
  echo "  Narrow false positives go in scripts/.tenant-scope-allowlist.txt"
  echo "  with a per-pattern entry and a recorded reason."
  exit 1
fi

echo "✅ PASS: tenant-scope scanner clean."
exit 0
