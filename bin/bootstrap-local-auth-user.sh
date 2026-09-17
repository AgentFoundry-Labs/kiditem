#!/usr/bin/env bash

set -euo pipefail

KIDITEM_AUTH_EMAIL=""
KIDITEM_AUTH_NAME=""
KIDITEM_AUTH_PASSWORD=""
KIDITEM_AUTH_PASSWORD_CONFIRM=""
KIDITEM_ORGANIZATION_NAME="KidItem Dev"
KIDITEM_ORGANIZATION_SLUG=""

cleanup() {
  unset KIDITEM_AUTH_PASSWORD KIDITEM_AUTH_PASSWORD_CONFIRM
}
trap cleanup EXIT HUP INT TERM

usage() {
  cat <<'EOF'
Usage: npm run dev:bootstrap-user -- [--email EMAIL] [--name NAME]
       [--organization-name NAME] [--organization-slug SLUG]

Creates or refreshes one local-only User, Organization, active membership, and
password, and installs the organization's absolute ABC formula when it has
none. Password input is interactive and never enters argv or an env file.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email|--name|--organization-name|--organization-slug)
      [[ $# -ge 2 ]] || { echo "$1 requires a value" >&2; exit 1; }
      case "$1" in
        --email) KIDITEM_AUTH_EMAIL="$2" ;;
        --name) KIDITEM_AUTH_NAME="$2" ;;
        --organization-name) KIDITEM_ORGANIZATION_NAME="$2" ;;
        --organization-slug) KIDITEM_ORGANIZATION_SLUG="$2" ;;
      esac
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
  echo "dev:bootstrap-user must run in an interactive terminal" >&2
  exit 1
fi

if [[ -z "$KIDITEM_AUTH_EMAIL" ]]; then
  read -r -p "로그인 이메일: " KIDITEM_AUTH_EMAIL
fi
if [[ -z "$KIDITEM_AUTH_NAME" ]]; then
  read -r -p "표시 이름: " KIDITEM_AUTH_NAME
fi
if [[ -z "$KIDITEM_AUTH_EMAIL" || -z "$KIDITEM_AUTH_NAME" || -z "$KIDITEM_ORGANIZATION_NAME" ]]; then
  echo "email, name, and organization name are required" >&2
  exit 1
fi

read -r -s -p "새 비밀번호: " KIDITEM_AUTH_PASSWORD
printf '\n'
read -r -s -p "새 비밀번호 확인: " KIDITEM_AUTH_PASSWORD_CONFIRM
printf '\n'
if [[ -z "$KIDITEM_AUTH_PASSWORD" ]]; then
  echo "password is required" >&2
  exit 1
fi
if [[ "$KIDITEM_AUTH_PASSWORD" != "$KIDITEM_AUTH_PASSWORD_CONFIRM" ]]; then
  echo "password confirmation does not match" >&2
  exit 1
fi

KIDITEM_REPO_ROOT="$(git rev-parse --show-toplevel)"
KIDITEM_TSX="$KIDITEM_REPO_ROOT/node_modules/.bin/tsx"
if [[ ! -x "$KIDITEM_TSX" ]]; then
  echo "tsx is unavailable; run npm run setup:macos first" >&2
  exit 1
fi

KIDITEM_BOOTSTRAP_ARGS=(
  --email "$KIDITEM_AUTH_EMAIL"
  --name "$KIDITEM_AUTH_NAME"
  --organization-name "$KIDITEM_ORGANIZATION_NAME"
  --password-stdin
)
if [[ -n "$KIDITEM_ORGANIZATION_SLUG" ]]; then
  KIDITEM_BOOTSTRAP_ARGS+=(--organization-slug "$KIDITEM_ORGANIZATION_SLUG")
fi

cd "$KIDITEM_REPO_ROOT"
printf '%s\n' "$KIDITEM_AUTH_PASSWORD" | "$KIDITEM_TSX" \
  scripts/bootstrap-local-auth-user.ts "${KIDITEM_BOOTSTRAP_ARGS[@]}"
