#!/usr/bin/env bash
# bin/check-dev-auth.sh
#
# Wired to .claude/settings.json SessionStart hook. Runs at session start
# and prints a one-line reminder when this worktree needs dev-bootstrap.sh.
#
# Triggers a reminder when ANY of the following is true:
#   - Inside .claude/worktrees/<name>/ AND .env is missing
#   - apps/web/.env.local is missing
#   - .dev-auth/callback.url / session.env is missing or older than 50 minutes
#     (Supabase access token TTL is ~1h; 50min gives a safety buffer)
#
# Exit 0 always — this hook is informational, never blocking.

set -u

# Resolve repo root (works in worktree or canonical checkout).
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

reasons=()

# 1. env files
if [[ ! -e .env ]]; then
  reasons+=(".env missing")
fi
if [[ ! -e apps/web/.env.local ]]; then
  reasons+=("apps/web/.env.local missing")
fi

# 2. callback URL existence + age
CALLBACK_FILE=".dev-auth/callback.url"
if [[ ! -s "$CALLBACK_FILE" ]]; then
  reasons+=(".dev-auth/callback.url not minted yet")
else
  # Cross-platform mtime: BSD stat first, GNU stat fallback.
  mtime="$(stat -f %m "$CALLBACK_FILE" 2>/dev/null || stat -c %Y "$CALLBACK_FILE" 2>/dev/null || echo 0)"
  now="$(date +%s)"
  age=$(( now - mtime ))
  if (( age > 3000 )); then
    reasons+=(".dev-auth/callback.url is $((age / 60))min old (Supabase access token TTL ~1h)")
  fi
fi
if [[ ! -s .dev-auth/session.env ]]; then
  reasons+=(".dev-auth/session.env missing (preview user/org identity not verified)")
fi

if (( ${#reasons[@]} == 0 )); then
  exit 0
fi

# Print compact, AI-readable reminder.
{
  printf '\n══ Dev Preview Auth Reminder ══\n\n'
  printf 'This worktree needs `./bin/dev-bootstrap.sh` because:\n'
  for r in "${reasons[@]}"; do
    printf '  · %s\n' "$r"
  done
  printf '\nRun:\n  ./bin/dev-bootstrap.sh\n\n'
  printf 'Then for AI preview agents: navigate the preview to the URL in\n'
  printf '.dev-auth/callback.url. The bootstrap verifies local User + active\n'
  printf 'OrganizationMembership before minting the callback. Full flow:\n'
  printf 'docs/runbooks/dev-preview-with-auth.md\n\n'
} >&2

exit 0
