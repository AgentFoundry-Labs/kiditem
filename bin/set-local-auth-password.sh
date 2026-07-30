#!/usr/bin/env bash

set -euo pipefail

KIDITEM_AUTH_EMAIL=""
KIDITEM_AUTH_PASSWORD=""
KIDITEM_AUTH_PASSWORD_CONFIRM=""

cleanup() {
  unset KIDITEM_AUTH_PASSWORD KIDITEM_AUTH_PASSWORD_CONFIRM
}
trap cleanup EXIT HUP INT TERM

usage() {
  cat <<'EOF'
Usage: npm run auth:password -- [--email EMAIL]

Prompts for a local KidItem login password without echoing it or placing it in
argv, shell history, or an environment file.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      [[ $# -ge 2 ]] || { echo "--email requires a value" >&2; exit 1; }
      KIDITEM_AUTH_EMAIL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -t 0 || ! -t 1 ]]; then
  echo "auth:password must run in an interactive terminal" >&2
  exit 1
fi

KIDITEM_REPO_ROOT="$(git rev-parse --show-toplevel)"
KIDITEM_TSX="$KIDITEM_REPO_ROOT/node_modules/.bin/tsx"

if [[ ! -x "$KIDITEM_TSX" ]]; then
  echo "tsx is unavailable; run npm install first" >&2
  exit 1
fi

if [[ -z "$KIDITEM_AUTH_EMAIL" ]]; then
  read -r -p "로그인 이메일: " KIDITEM_AUTH_EMAIL
fi

if [[ -z "$KIDITEM_AUTH_EMAIL" ]]; then
  echo "email is required" >&2
  exit 1
fi

read -r -s -p "새 비밀번호: " KIDITEM_AUTH_PASSWORD
printf '\n'
read -r -s -p "새 비밀번호 확인: " KIDITEM_AUTH_PASSWORD_CONFIRM
printf '\n'

if [[ "$KIDITEM_AUTH_PASSWORD" != "$KIDITEM_AUTH_PASSWORD_CONFIRM" ]]; then
  echo "password confirmation does not match" >&2
  exit 1
fi

if [[ -z "$KIDITEM_AUTH_PASSWORD" ]]; then
  echo "password is required" >&2
  exit 1
fi

cd "$KIDITEM_REPO_ROOT"
printf '%s\n' "$KIDITEM_AUTH_PASSWORD" | "$KIDITEM_TSX" \
  --tsconfig "$KIDITEM_REPO_ROOT/apps/server/tsconfig.json" \
  apps/server/src/auth/adapter/in/cli/auth-admin.ts \
  set-password --email "$KIDITEM_AUTH_EMAIL" --password-stdin
