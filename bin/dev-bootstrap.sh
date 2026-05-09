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
#   4. Calls scripts/create-dev-preview-session.mjs with the configured dev user,
#      verifies local User + active OrganizationMembership, and writes the
#      resulting callback URL to .dev-auth/callback.url (gitignored).
#   5. Prints a one-liner the AI/preview agent can navigate to in order to
#      hydrate the auth cookie in a fresh Chromium without typing a password.
#
# Usage:
#   ./bin/dev-bootstrap.sh
#   ./bin/dev-bootstrap.sh --email someone-else@example.com
#   ./bin/dev-bootstrap.sh --canonical /Users/yhc125/workspace/kiditem
#   ./bin/dev-bootstrap.sh --web-origin http://localhost:3001
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
WEB_ORIGIN="${DEV_WEB_ORIGIN:-http://localhost:3000}"
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
    --web-origin)
      WEB_ORIGIN="$2"
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
# If we're inside a tool-created worktree and the env files are missing, find a
# sibling checkout that already has the env files. Claude worktrees encode the
# canonical checkout in the path; Codex worktrees do not, so fall back to
# `git worktree list`.

resolve_canonical() {
  if [[ -n "$CANONICAL" ]]; then
    echo "$CANONICAL"
    return
  fi

  local path_guess=""
  local candidate=""

  # Heuristic: REPO_ROOT looks like .../<canonical>/.claude/worktrees/<name>
  case "$REPO_ROOT" in
    */.claude/worktrees/*)
      path_guess="$(echo "$REPO_ROOT" | sed -E 's|/\.claude/worktrees/[^/]+$||')"
      if [[ -f "$path_guess/.env" || -f "$path_guess/apps/web/.env.local" ]]; then
        echo "$path_guess"
        return
      fi
      ;;
  esac

  while IFS= read -r candidate; do
    [[ "$candidate" == "$REPO_ROOT" ]] && continue
    if [[ -f "$candidate/.env" || -f "$candidate/apps/web/.env.local" ]]; then
      echo "$candidate"
      return
    fi
  done < <(git worktree list --porcelain | sed -n 's/^worktree //p')

  # Not in a worktree, or no sibling checkout has env files.
  echo ""
}

CANONICAL="$(resolve_canonical)"

link_env_if_missing() {
  local target="$1"   # path inside this worktree
  local source="$2"   # path inside canonical checkout

  if [[ -e "$target" ]]; then
    return 0
  fi
  if [[ -z "$CANONICAL" ]]; then
    echo "  · $target  (skipped — no canonical checkout with env files found)"
    return 0
  fi
  if [[ ! -f "$source" ]]; then
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

read_env_value() {
  local key="$1"
  local line value
  line="$(grep -E "^${key}=" .env | tail -1 || true)"
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

SUPABASE_URL="${SUPABASE_URL:-$(read_env_value SUPABASE_URL)}"
SUPABASE_SECRET_KEY="${SUPABASE_SECRET_KEY:-$(read_env_value SUPABASE_SECRET_KEY)}"

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SECRET_KEY:-}" ]]; then
  echo "  ✗ SUPABASE_URL or SUPABASE_SECRET_KEY missing in .env."
  echo "    See docs/runbooks/auth-supabase.md for first-time setup."
  exit 1
fi
echo "  · SUPABASE_URL=${SUPABASE_URL}"
echo "  · SUPABASE_SECRET_KEY=*** (set)"

WEB_ORIGIN="${WEB_ORIGIN%/}"
if [[ ! "$WEB_ORIGIN" =~ ^https?://[^/]+(:[0-9]+)?$ ]]; then
  echo "  ✗ DEV_WEB_ORIGIN / --web-origin must be an http(s) origin, got: ${WEB_ORIGIN}"
  exit 1
fi
echo "  · DEV_WEB_ORIGIN=${WEB_ORIGIN}"

# ---------- step 4: mint a dev preview session callback URL -----------------

echo "==> step 4: dev preview session for ${DEV_EMAIL}"
mkdir -p .dev-auth

CALLBACK_OUTPUT="$(SUPABASE_URL="$SUPABASE_URL" SUPABASE_SECRET_KEY="$SUPABASE_SECRET_KEY" DEV_WEB_ORIGIN="$WEB_ORIGIN" node scripts/create-dev-preview-session.mjs "$DEV_EMAIL" "/" 2>&1 || true)"

CALLBACK_URL="$(printf '%s\n' "$CALLBACK_OUTPUT" | sed -n 's/^CALLBACK_URL=//p' | head -1)"
if [[ -z "$CALLBACK_URL" ]]; then
  echo "  ✗ create-dev-preview-session.mjs did not produce a CALLBACK_URL."
  echo "$CALLBACK_OUTPUT"
  exit 1
fi
PREVIEW_USER_ID="$(printf '%s\n' "$CALLBACK_OUTPUT" | sed -n 's/^PREVIEW_USER_ID=//p' | head -1)"
PREVIEW_USER_EMAIL="$(printf '%s\n' "$CALLBACK_OUTPUT" | sed -n 's/^PREVIEW_USER_EMAIL=//p' | head -1)"
PREVIEW_ORGANIZATION_ID="$(printf '%s\n' "$CALLBACK_OUTPUT" | sed -n 's/^PREVIEW_ORGANIZATION_ID=//p' | head -1)"
PREVIEW_MEMBERSHIP_ID="$(printf '%s\n' "$CALLBACK_OUTPUT" | sed -n 's/^PREVIEW_MEMBERSHIP_ID=//p' | head -1)"

if [[ -z "$PREVIEW_USER_ID" || -z "$PREVIEW_ORGANIZATION_ID" || -z "$PREVIEW_MEMBERSHIP_ID" ]]; then
  echo "  ✗ preview identity was not verified."
  echo "$CALLBACK_OUTPUT"
  exit 1
fi

printf '%s\n' "$CALLBACK_URL" > .dev-auth/callback.url
{
  printf 'PREVIEW_USER_ID=%s\n' "$PREVIEW_USER_ID"
  printf 'PREVIEW_USER_EMAIL=%s\n' "$PREVIEW_USER_EMAIL"
  printf 'PREVIEW_ORGANIZATION_ID=%s\n' "$PREVIEW_ORGANIZATION_ID"
  printf 'PREVIEW_MEMBERSHIP_ID=%s\n' "$PREVIEW_MEMBERSHIP_ID"
} > .dev-auth/session.env
echo "  · wrote .dev-auth/callback.url"
echo "  · verified user=${PREVIEW_USER_EMAIL} organization=${PREVIEW_ORGANIZATION_ID}"

# ---------- step 5: print AI-preview snippet --------------------------------

cat <<EOF

==> ready

For an AI preview agent (Claude Preview MCP, Playwright, etc.):

  1. Start the web server (preview_start name=web).
  2. Navigate the preview to:

         $CALLBACK_URL

     The /auth/callback route consumes the token, sets the Supabase auth
     cookie, and redirects to /. Subsequent requests to /api/* are
     authenticated as ${PREVIEW_USER_EMAIL} with organization
     ${PREVIEW_ORGANIZATION_ID}.

  3. When the access token expires (~1h), re-run this script.

For a human:
  - Just paste the URL above into the browser tab the dev server is running in.
  - Or run \`node scripts/create-dev-preview-session.mjs ${DEV_EMAIL}\` directly.
EOF
