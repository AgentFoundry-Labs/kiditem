#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
DEPLOYMENTS_DIR="${DEPLOYMENTS_DIR:-deployments}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
WEB_ENV_FILE="${WEB_ENV_FILE:-.env.staging.web}"
API_ENV_FILE="${API_ENV_FILE:-.env.staging.api}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-.env.staging.deploy}"
LOCAL_WEB_URL="${LOCAL_WEB_URL:-http://127.0.0.1:8080/login}"
LOCAL_AUTH_URL="${LOCAL_AUTH_URL:-http://127.0.0.1:8080/api/auth/me}"

usage() {
  cat <<'USAGE'
Usage:
  deploy/staging/remote-deploy.sh deploy
  deploy/staging/remote-deploy.sh status

Deploy mode requires KIDITEM_API_IMAGE and KIDITEM_WEB_IMAGE.
If GHCR_TOKEN is set, the script logs into ghcr.io only for the pull and logs
out before exiting.
USAGE
}

fail() {
  echo "remote-deploy: $*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "missing required file: $path"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "missing required environment variable: $name"
}

compose() {
  require_file "$DEPLOY_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV_FILE"
  set +a
  docker compose --env-file "$WEB_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

docker_login_if_available() {
  if [[ -z "${GHCR_TOKEN:-}" ]]; then
    return 0
  fi

  local actor="${GHCR_ACTOR:-x-access-token}"
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$actor" --password-stdin >/dev/null
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
}

write_deploy_env() {
  local tmp
  tmp="$(mktemp "${DEPLOY_ENV_FILE}.tmp.XXXXXX")"
  chmod 600 "$tmp"
  {
    printf 'KIDITEM_API_IMAGE=%s\n' "$KIDITEM_API_IMAGE"
    printf 'KIDITEM_WEB_IMAGE=%s\n' "$KIDITEM_WEB_IMAGE"
  } >"$tmp"
  mv "$tmp" "$DEPLOY_ENV_FILE"
  chmod 600 "$DEPLOY_ENV_FILE"
}

wait_for_health() {
  local code

  for _ in $(seq 1 30); do
    if curl -fsS "$LOCAL_WEB_URL" >/dev/null; then
      code="$(curl -sS -o /dev/null -w '%{http_code}' "$LOCAL_AUTH_URL" || true)"
      case "$code" in
        401|403)
          echo "Staging smoke checks passed: /login=200, /api/auth/me=$code"
          return 0
          ;;
      esac
    fi
    sleep 2
  done

  echo "Staging did not become healthy." >&2
  echo "Compose status:" >&2
  compose ps >&2 || true
  echo "Recent logs:" >&2
  compose logs --tail=100 nginx web api >&2 || true
  exit 1
}

write_manifest() {
  command -v python3 >/dev/null 2>&1 || fail "python3 is required to write deployment manifest"

  mkdir -p "$DEPLOYMENTS_DIR/history"

  local deployed_at deploy_stamp safe_ref manifest_path current_path api_image_id web_image_id
  deployed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  deploy_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  safe_ref="$(printf '%s' "${GIT_SHA:-manual}" | tr -c 'A-Za-z0-9_.-' '_')"
  manifest_path="$DEPLOYMENTS_DIR/history/${deploy_stamp}-${safe_ref}.json"
  current_path="$DEPLOYMENTS_DIR/current.json"
  api_image_id="$(docker image inspect "$KIDITEM_API_IMAGE" --format '{{.Id}}' 2>/dev/null || true)"
  web_image_id="$(docker image inspect "$KIDITEM_WEB_IMAGE" --format '{{.Id}}' 2>/dev/null || true)"

  export DEPLOYED_AT="$deployed_at"
  export API_IMAGE_ID="$api_image_id"
  export WEB_IMAGE_ID="$web_image_id"

  python3 - "$manifest_path" <<'PY'
import json
import os
import sys

path = sys.argv[1]

manifest = {
    "schemaVersion": "kiditem.staging.deploy.v1",
    "deployedAt": os.environ.get("DEPLOYED_AT"),
    "operation": os.environ.get("DEPLOY_OPERATION", "deploy"),
    "gitSha": os.environ.get("GIT_SHA"),
    "apiImage": os.environ.get("KIDITEM_API_IMAGE"),
    "webImage": os.environ.get("KIDITEM_WEB_IMAGE"),
    "apiImageTag": os.environ.get("KIDITEM_API_IMAGE_TAG"),
    "webImageTag": os.environ.get("KIDITEM_WEB_IMAGE_TAG"),
    "apiImageDigest": os.environ.get("API_IMAGE_DIGEST"),
    "webImageDigest": os.environ.get("WEB_IMAGE_DIGEST"),
    "apiImageId": os.environ.get("API_IMAGE_ID"),
    "webImageId": os.environ.get("WEB_IMAGE_ID"),
    "stagingUrl": os.environ.get("STAGING_URL"),
    "github": {
        "actor": os.environ.get("GITHUB_ACTOR"),
        "repository": os.environ.get("GITHUB_REPOSITORY"),
        "runId": os.environ.get("GITHUB_RUN_ID"),
        "runAttempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "runUrl": os.environ.get("GITHUB_RUN_URL"),
    },
}

with open(path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

  cp "$manifest_path" "$current_path"
  echo "Wrote deployment manifest: $manifest_path"
}

deploy() {
  cd "$APP_DIR"
  require_env KIDITEM_API_IMAGE
  require_env KIDITEM_WEB_IMAGE
  require_file "$COMPOSE_FILE"
  require_file "$WEB_ENV_FILE"
  require_file "$API_ENV_FILE"
  require_file deploy/staging/nginx.conf

  docker_login_if_available

  echo "Pulling staging images"
  docker pull "$KIDITEM_API_IMAGE"
  docker pull "$KIDITEM_WEB_IMAGE"

  write_deploy_env

  compose config >/dev/null
  compose up -d --remove-orphans --force-recreate
  compose ps

  wait_for_health
  write_manifest
}

status() {
  cd "$APP_DIR"

  if [[ -f "$DEPLOYMENTS_DIR/current.json" ]]; then
    echo "Current deployment manifest:"
    cat "$DEPLOYMENTS_DIR/current.json"
  else
    echo "No deployment manifest found at $DEPLOYMENTS_DIR/current.json"
  fi

  echo
  echo "Compose status:"
  if [[ -f "$DEPLOY_ENV_FILE" ]]; then
    compose ps
  else
    echo "No $DEPLOY_ENV_FILE found; compose image variables are not available."
    echo "Matching containers:"
    docker ps \
      --filter 'name=kiditem-staging' \
      --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' || true
  fi

  echo
  echo "Local smoke endpoints:"
  printf '/login -> '
  curl -sS -o /dev/null -w '%{http_code}\n' "$LOCAL_WEB_URL" || true
  printf '/api/auth/me -> '
  curl -sS -o /dev/null -w '%{http_code}\n' "$LOCAL_AUTH_URL" || true
}

case "${1:-}" in
  deploy)
    deploy
    ;;
  status)
    status
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
