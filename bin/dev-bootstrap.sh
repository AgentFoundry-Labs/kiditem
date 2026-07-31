#!/usr/bin/env bash
# Boot a worktree or fresh clone into a runnable local development state.
# Authentication uses the normal KidItem email/password login; this script does
# not mint tokens, store passwords, or bypass the server session boundary.

set -euo pipefail

CANONICAL=""
SKIP_INSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --canonical)
      CANONICAL="$2"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    -h|--help)
      sed -n '1,24p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

resolve_canonical() {
  if [[ -n "$CANONICAL" ]]; then
    echo "$CANONICAL"
    return
  fi
  local candidate=""
  while IFS= read -r candidate; do
    [[ "$candidate" == "$REPO_ROOT" ]] && continue
    if [[ -f "$candidate/.env" || -f "$candidate/apps/server/.env" ]]; then
      echo "$candidate"
      return
    fi
  done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
  echo ""
}

CANONICAL="$(resolve_canonical)"

copy_env_if_missing() {
  local target="$1"
  local source="$2"
  if [[ -e "$target" ]]; then
    echo "  · $target (already present)"
    return
  fi
  if [[ -z "$CANONICAL" || ! -f "$source" ]]; then
    echo "  · $target (missing; copy its committed example and populate locally)"
    return
  fi
  cp "$source" "$target"
  echo "  · $target (copied from canonical checkout)"
}

echo "==> step 1: local env files"
copy_env_if_missing ".env" "$CANONICAL/.env"
copy_env_if_missing "apps/server/.env" "$CANONICAL/apps/server/.env"
copy_env_if_missing "apps/web/.env.local" "$CANONICAL/apps/web/.env.local"

echo "==> step 2: git hooks"
git config core.hooksPath .githooks
echo "  · core.hooksPath=.githooks"

echo "==> step 3: dependencies"
if [[ "$SKIP_INSTALL" -eq 1 ]]; then
  echo "  · skipped (--skip-install)"
elif [[ -d node_modules ]]; then
  echo "  · already present"
else
  npm install --legacy-peer-deps
fi

echo "==> step 4: configuration check"
missing=0
for path in .env apps/server/.env apps/web/.env.local; do
  if [[ ! -f "$path" ]]; then
    echo "  ✗ missing $path"
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  echo "Copy the matching .env.example files and populate them without committing secrets." >&2
  exit 1
fi

cat <<'EOF'

==> ready

Start the API and web app, then use the normal /login page. Local auth requires
an existing User + active OrganizationMembership and a password set through the
interactive secure prompt:

  npm run auth:password

The lower-level stdin-only administrator CLI is documented in:

  docs/runbooks/auth-office-local.md

No callback URL or reusable development token is created by this script.
EOF
