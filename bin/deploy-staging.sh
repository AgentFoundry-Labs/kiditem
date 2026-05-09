#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_STAGING_ENV_DIR="$ROOT_DIR/.secrets/staging"

if [[ -f "$DEFAULT_STAGING_ENV_DIR/deploy.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$DEFAULT_STAGING_ENV_DIR/deploy.env"
  set +a
fi

if [[ -z "${STAGING_HOST:-}" ]]; then
  echo "STAGING_HOST is required, for example STAGING_HOST=ec2-1-2-3-4.ap-northeast-2.compute.amazonaws.com" >&2
  exit 2
fi

STAGING_USER="${STAGING_USER:-ubuntu}"
STAGING_REMOTE_DIR="${STAGING_REMOTE_DIR:-/opt/kiditem}"
STAGING_SSH_KEY="${STAGING_SSH_KEY:-}"
STAGING_ENV_DIR="${STAGING_ENV_DIR:-$DEFAULT_STAGING_ENV_DIR}"
STAGING_WEB_ENV_FILE="${STAGING_WEB_ENV_FILE:-$STAGING_ENV_DIR/.env.staging.web}"
STAGING_API_ENV_FILE="${STAGING_API_ENV_FILE:-$STAGING_ENV_DIR/.env.staging.api}"

env_value() {
  local file="$1"
  local key="$2"
  awk -F= -v key="$key" '
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      sub(/^[^=]*=/, "", $0)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
      gsub(/^"|"$/, "", $0)
      gsub(/^'\''|'\''$/, "", $0)
      value=$0
    }
    END { print value }
  ' "$file"
}

if [[ -z "$STAGING_WEB_ENV_FILE" || ! -f "$STAGING_WEB_ENV_FILE" ]]; then
  echo "A local web env file is required for Docker build args." >&2
  echo "Set STAGING_WEB_ENV_FILE or create $DEFAULT_STAGING_ENV_DIR/.env.staging.web." >&2
  exit 2
fi

if [[ -z "$STAGING_API_ENV_FILE" || ! -f "$STAGING_API_ENV_FILE" ]]; then
  echo "A local API env file is required for the EC2 runtime." >&2
  echo "Set STAGING_API_ENV_FILE or create $DEFAULT_STAGING_ENV_DIR/.env.staging.api." >&2
  exit 2
fi

DATABASE_URL_VALUE="$(env_value "$STAGING_API_ENV_FILE" DATABASE_URL)"
if [[ -z "$DATABASE_URL_VALUE" ]]; then
  echo "DATABASE_URL is missing in $STAGING_API_ENV_FILE." >&2
  echo "Use the Supabase Cloud Postgres URL, not local localhost." >&2
  exit 2
fi

if [[ "$DATABASE_URL_VALUE" == *localhost* || "$DATABASE_URL_VALUE" == *127.0.0.1* ]]; then
  echo "DATABASE_URL in $STAGING_API_ENV_FILE points at localhost; EC2 cannot use that." >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "$STAGING_WEB_ENV_FILE"
set +a

: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL is required in $STAGING_WEB_ENV_FILE}"
: "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required in $STAGING_WEB_ENV_FILE}"

IMAGE_TAG="${IMAGE_TAG:-$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
API_IMAGE="${API_IMAGE:-kiditem-staging-api:${IMAGE_TAG}}"
WEB_IMAGE="${WEB_IMAGE:-kiditem-staging-web:${IMAGE_TAG}}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
INSTALL_CHROMIUM="${INSTALL_CHROMIUM:-false}"

SSH_TARGET="${STAGING_USER}@${STAGING_HOST}"
SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)

if [[ -n "$STAGING_SSH_KEY" ]]; then
  SSH_OPTS+=(-i "$STAGING_SSH_KEY")
fi

RSYNC_SSH="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
if [[ -n "$STAGING_SSH_KEY" ]]; then
  RSYNC_SSH+=" -i $(printf '%q' "$STAGING_SSH_KEY")"
fi

REMOTE_DIR_ESCAPED="$(printf '%q' "$STAGING_REMOTE_DIR")"
echo "Building local Docker images:"
echo "  API: $API_IMAGE"
echo "  WEB: $WEB_IMAGE"
echo "  PLATFORM: $DOCKER_PLATFORM"
echo "  INSTALL_CHROMIUM: $INSTALL_CHROMIUM"

docker build \
  --platform "$DOCKER_PLATFORM" \
  -f "$ROOT_DIR/apps/server/Dockerfile" \
  -t "$API_IMAGE" \
  --build-arg INSTALL_CHROMIUM="$INSTALL_CHROMIUM" \
  "$ROOT_DIR"

docker build \
  --platform "$DOCKER_PLATFORM" \
  -f "$ROOT_DIR/apps/web/Dockerfile" \
  -t "$WEB_IMAGE" \
  --build-arg NEXT_PUBLIC_API_URL="${STAGING_NEXT_PUBLIC_API_URL:-}" \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  "$ROOT_DIR"

echo "Creating remote directory: ${SSH_TARGET}:${STAGING_REMOTE_DIR}"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p ${REMOTE_DIR_ESCAPED}"

echo "Uploading staging runtime env files"
scp "${SSH_OPTS[@]}" "$STAGING_WEB_ENV_FILE" "$SSH_TARGET:$STAGING_REMOTE_DIR/.env.staging.web"
scp "${SSH_OPTS[@]}" "$STAGING_API_ENV_FILE" "$SSH_TARGET:$STAGING_REMOTE_DIR/.env.staging.api"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "chmod 600 ${REMOTE_DIR_ESCAPED}/.env.staging.web ${REMOTE_DIR_ESCAPED}/.env.staging.api"

echo "Syncing staging compose and nginx assets"
rsync -az \
  -e "$RSYNC_SSH" \
  "$ROOT_DIR/docker-compose.staging.yml" \
  "$ROOT_DIR/deploy" \
  "$SSH_TARGET:$STAGING_REMOTE_DIR/"

echo "Streaming Docker images into the staging host"
docker save "$API_IMAGE" "$WEB_IMAGE" \
  | gzip -1 \
  | ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "gzip -dc | docker load"

API_IMAGE_ESCAPED="$(printf '%q' "$API_IMAGE")"
WEB_IMAGE_ESCAPED="$(printf '%q' "$WEB_IMAGE")"

echo "Loading images and restarting staging compose services"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" \
  "STAGING_REMOTE_DIR=${REMOTE_DIR_ESCAPED} API_IMAGE=${API_IMAGE_ESCAPED} WEB_IMAGE=${WEB_IMAGE_ESCAPED} bash -s" <<'REMOTE'
set -Eeuo pipefail

cd "$STAGING_REMOTE_DIR"

if [[ ! -f .env.staging.web ]]; then
  echo "Missing .env.staging.web on the staging host" >&2
  exit 2
fi

if [[ ! -f .env.staging.api ]]; then
  echo "Missing .env.staging.api on the staging host" >&2
  exit 2
fi

COMPOSE=(docker compose --env-file .env.staging.web -f docker-compose.staging.yml)

compose() {
  KIDITEM_API_IMAGE="$API_IMAGE" KIDITEM_WEB_IMAGE="$WEB_IMAGE" "${COMPOSE[@]}" "$@"
}

compose config >/dev/null
compose up -d --remove-orphans --force-recreate
compose ps

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/login >/dev/null; then
    echo "Staging web is responding through the container reverse proxy"
    exit 0
  fi
  sleep 2
done

echo "Staging did not become healthy through http://127.0.0.1:8080/login" >&2
compose logs --tail=100 nginx web api >&2
exit 1
REMOTE
