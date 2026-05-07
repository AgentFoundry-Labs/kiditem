#!/usr/bin/env bash
# bin/dev-bootstrap.sh
#
# Boot a worktree (or fresh clone) into a runnable dev state without UI clicks.
#
# What it does (idempotent, safe to re-run):
#   1. Symlinks .env files from a canonical checkout if the current tree doesn't
#      have them. Resolves the "git worktrees don't carry .env" friction.
#   2. Runs `npm install --legacy-peer-deps` if node_modules is missing.
#   3. Verifies SUPABASE_URL + SUPABASE_SECRET_KEY are set.
#   4. Calls scripts/login-magiclink.mjs with the configured dev user and writes
#      the resulting CALLBACK_URL to .dev-auth/callback.url (gitignored).
#   5. Prints a one-liner the AI/preview agent can navigate to in order to
#      hydrate the auth cookie in a fresh Chromium without typing a password.
#
# Usage:
#   ./bin/dev-bootstrap.sh
#   ./bin/dev-bootstrap.sh --email someone-else@example.com
#   ./bin/dev-bootstrap.sh --canonical /Users/yhc125/workspace/kiditem
#
# Hard rules:
#   - No password storage; service_role key in .env is the only credential.
#   - .env stays gitignored; .dev-auth/ stays gitignored.
#   - Treats current Supabase project as dev. Stripe-style project split is a
#     separate decision (see docs/runbooks/auth-supabase.md).

set -euo pipefail

# ---------- arg parsing -----------------------------------------------------

DEV_EMAIL="${DEV_USER_EMAIL:-kiditem@naver.com}"
CANONICAL=""
SKIP_INSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      DEV_EMAIL="$2"
      shift 2
      ;;
    --canonical)
      CANONICAL="$2"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    -h|--help)
      sed -n '1,30p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

# ---------- locate worktree root --------------------------------------------

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ---------- detect canonical checkout for env propagation --------------------
# If we're inside .claude/worktrees/<name>/ and the env files are missing,
# walk up to the canonical checkout (the one outside the worktrees dir).

resolve_canonical() {
  if [[ -n "$CANONICAL" ]]; then
    echo "$CANONICAL"
    return
  fi
  # Heuristic: REPO_ROOT looks like .../<canonical>/.claude/worktrees/<name>
  case "$REPO_ROOT" in
    */.claude/worktrees/*)
      echo "$REPO_ROOT" | sed -E 's|/\.claude/worktrees/[^/]+$||'
      ;;
    *)
      # Not in a worktree → no canonical to copy from.
      echo ""
      ;;
  esac
}

CANONICAL="$(resolve_canonical)"

link_env_if_missing() {
  local target="$1"   # path inside this worktree
  local source="$2"   # path inside canonical checkout

  if [[ -e "$target" ]]; then
    return 0
  fi
  if [[ -z "$CANONICAL" || ! -f "$source" ]]; then
    echo "  · $target  (skipped — no canonical source at $source)"
    return 0
  fi
  cp "$source" "$target"
  echo "  · $target  (copied from $source)"
}

echo "==> step 1: env files"
link_env_if_missing ".env" "$CANONICAL/.env"
link_env_if_missing "apps/web/.env.local" "$CANONICAL/apps/web/.env.local"

# ---------- step 2: dependencies --------------------------------------------

echo "==> step 2: node modules"
if [[ "$SKIP_INSTALL" -eq 1 ]]; then
  echo "  · skipped (--skip-install)"
elif [[ -d node_modules ]]; then
  echo "  · already present"
else
  npm install --legacy-peer-deps
fi

# ---------- step 3: env sanity check ----------------------------------------

echo "==> step 3: env sanity"
if [[ ! -f .env ]]; then
  echo "  ✗ .env not found. Either supply --canonical <path> or copy .env.example."
  exit 1
fi

# Source .env safely (only KEY=VALUE pairs, no command substitution).
set -a
# shellcheck disable=SC1091
source <(grep -E '^[A-Z_][A-Z0-9_]*=' .env | sed 's/^/export /')
set +a

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SECRET_KEY:-}" ]]; then
  echo "  ✗ SUPABASE_URL or SUPABASE_SECRET_KEY missing in .env."
  echo "    See docs/runbooks/auth-supabase.md for first-time setup."
  exit 1
fi
echo "  · SUPABASE_URL=${SUPABASE_URL}"
echo "  · SUPABASE_SECRET_KEY=*** (set)"

# ---------- step 4: mint a magic-link callback URL --------------------------

echo "==> step 4: magic-link callback for ${DEV_EMAIL}"
mkdir -p .dev-auth

CALLBACK_OUTPUT="$(node scripts/login-magiclink.mjs "$DEV_EMAIL" "/" 2>&1 || true)"

CALLBACK_URL="$(printf '%s\n' "$CALLBACK_OUTPUT" | grep '^CALLBACK_URL=' | head -1 | sed 's/^CALLBACK_URL=//')"
if [[ -z "$CALLBACK_URL" ]]; then
  echo "  ✗ login-magiclink.mjs did not produce a CALLBACK_URL."
  echo "$CALLBACK_OUTPUT"
  exit 1
fi

printf '%s\n' "$CALLBACK_URL" > .dev-auth/callback.url
echo "  · wrote .dev-auth/callback.url"

# ---------- step 5: print AI-preview snippet --------------------------------

cat <<EOF

==> ready

For an AI preview agent (Claude Preview MCP, Playwright, etc.):

  1. Start the web server (preview_start name=web).
  2. Navigate the preview to:

         $CALLBACK_URL

     The /auth/callback route consumes the token, sets the Supabase auth
     cookie, and redirects to /. Subsequent requests to /api/* are
     authenticated as ${DEV_EMAIL}.

  3. When the access token expires (~1h), re-run this script.

For a human:
  - Just paste the URL above into the browser tab the dev server is running in.
  - Or run \`node scripts/login-magiclink.mjs ${DEV_EMAIL}\` directly.
EOF
