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
out before exiting. Set SKIP_IMAGE_PULL=1 only for smoke tests that use images
already loaded on the remote host.
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

load_api_env() {
  require_file "$API_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$API_ENV_FILE"
  set +a
}

validate_agent_os_runtime_env() {
  load_api_env

  if [[ "${AGENT_RUNTIME_ALLOW_NOOP:-}" == "1" || "${AGENT_RUNTIME_ALLOW_NOOP:-}" == "true" ]]; then
    fail "AGENT_RUNTIME_ALLOW_NOOP must not be enabled in staging"
  fi

  case "${AGENT_RUNTIME_WORKER_ENABLED:-}" in
    1|true|TRUE)
      ;;
    *)
      fail "missing required API env: set AGENT_RUNTIME_WORKER_ENABLED=1 in $API_ENV_FILE for async Agent OS jobs"
      ;;
  esac

  if [[ -z "${AGENT_DEFAULT_MODEL:-}" && -z "${AGENT_DETAIL_PAGE_GENERATE_MODEL:-}" ]]; then
    fail "missing required API env: set AGENT_DEFAULT_MODEL or AGENT_DETAIL_PAGE_GENERATE_MODEL in $API_ENV_FILE"
  fi
}

compose() {
  require_file "$DEPLOY_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV_FILE"
  set +a
  docker compose --env-file "$WEB_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

seed_agent_os() {
  echo "Seeding Agent OS instances"
  compose run --rm --no-deps api node dist/agent-os/seed-agent-os.js
}

docker_login_if_available() {
  if [[ -z "${GHCR_TOKEN:-}" ]]; then
    return 0
  fi

  local actor="${GHCR_ACTOR:-x-access-token}"
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$actor" --password-stdin >/dev/null
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
}

reclaim_docker_space() {
  echo "Docker disk usage before cleanup:"
  docker system df || true

  echo "Pruning unused Docker resources before pulling staging images"
  docker container prune -f || true
  docker image prune -af || true
  docker builder prune -af || true

  echo "Docker disk usage after cleanup:"
  docker system df || true
}

stop_staging_stack_for_space() {
  echo "Stopping current staging containers to free image layers for retry"
  if [[ -f "$DEPLOY_ENV_FILE" ]]; then
    compose down --remove-orphans
  else
    docker rm -f kiditem-staging-nginx kiditem-staging-web kiditem-staging-api >/dev/null 2>&1 || true
  fi
}

pull_image() {
  local image="$1"
  local log_path
  log_path="$(mktemp)"

  if docker pull "$image" 2>&1 | tee "$log_path"; then
    rm -f "$log_path"
    return 0
  fi

  if grep -qiE 'no space left on device|ENOSPC' "$log_path"; then
    rm -f "$log_path"
    return 75
  fi

  rm -f "$log_path"
  return 1
}

pull_staging_images() {
  local status

  echo "Pulling staging API image"
  status=0
  pull_image "$KIDITEM_API_IMAGE" || status=$?
  if [[ "$status" != "0" ]]; then
    return "$status"
  fi

  echo "Pulling staging web image"
  status=0
  pull_image "$KIDITEM_WEB_IMAGE" || status=$?
  if [[ "$status" != "0" ]]; then
    return "$status"
  fi

  return 0
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
          verify_render_image_runtime
          echo "Staging smoke checks passed: /login=200, /api/auth/me=$code, Puppeteer launch=ok"
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

verify_render_image_runtime() {
  echo "Checking API render-image browser runtime"
  compose exec -T api node - <<'NODE'
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    timeout: 30000,
  });
  await browser.close();
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
NODE
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

  if [[ "${SKIP_IMAGE_PULL:-}" == "1" ]]; then
    echo "Skipping image pull because SKIP_IMAGE_PULL=1"
  else
    local pull_status
    reclaim_docker_space
    pull_status=0
    pull_staging_images || pull_status=$?

    if [[ "$pull_status" == "75" ]]; then
      echo "Image pull ran out of disk after unused-resource cleanup; retrying after stopping the staging stack"
      stop_staging_stack_for_space
      reclaim_docker_space
      pull_staging_images
    elif [[ "$pull_status" != "0" ]]; then
      return "$pull_status"
    fi
  fi

  write_deploy_env

  validate_agent_os_runtime_env
  compose config >/dev/null
  seed_agent_os
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
