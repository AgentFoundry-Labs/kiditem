#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
DEPLOY_ENVIRONMENT="${DEPLOY_ENVIRONMENT:-staging}"
CONTAINER_PREFIX="${CONTAINER_PREFIX:-kiditem-${DEPLOY_ENVIRONMENT}}"
DEPLOYMENTS_DIR="${DEPLOYMENTS_DIR:-deployments}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
WEB_ENV_FILE="${WEB_ENV_FILE:-.env.staging.web}"
API_ENV_FILE="${API_ENV_FILE:-.env.staging.api}"
BROWSER_ENV_FILE="${BROWSER_ENV_FILE:-.env.staging.browser}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-.env.staging.deploy}"
NGINX_TEMPLATE_FILE="${NGINX_TEMPLATE_FILE:-deploy/staging/nginx.conf}"
GENERATED_NGINX_FILE="${GENERATED_NGINX_FILE:-deployments/nginx.conf}"
LOCAL_WEB_URL="${LOCAL_WEB_URL:-http://127.0.0.1:8080/login}"
LOCAL_AUTH_URL="${LOCAL_AUTH_URL:-http://127.0.0.1:8080/api/auth/me}"
SOURCING_CHROME_IMAGE="ghcr.io/linuxserver/chromium:version-b0ddd401@sha256:47fc8bb18cdb0844199a16e1e14b3b38ba97f6ad1659895c243ba5f2384aad1e"
SOURCING_CHROME_CONTAINER="kiditem-staging-sourcing-chrome"
SOURCING_CDP_PROXY_IMAGE="docker.io/alpine/socat:1.8.0.3@sha256:beb4a68d9e4fe6b0f21ea774a0fde6c31f580dde6368939ed70100c5385b015e"
SOURCING_CDP_PROXY_CONTAINER="kiditem-staging-sourcing-cdp-proxy"

usage() {
  cat <<'USAGE'
Usage:
  deploy/staging/remote-deploy.sh deploy
  deploy/staging/remote-deploy.sh quiesce
  deploy/staging/remote-deploy.sh resume
  deploy/staging/remote-deploy.sh status

Deploy mode requires KIDITEM_API_IMAGE and KIDITEM_WEB_IMAGE.
The script deploys to the inactive blue/green slot, switches nginx after
candidate health passes, writes deployments/current.json, and stops the
previous slot to avoid duplicate in-process workers.
Quiesce mode stops both application slots and nginx before a guarded database
rebuild. It is invoked only by the environment-scoped GitHub Actions workflow.
Resume mode restarts the previously active slot after a failure that occurred
before the database reset boundary.
USAGE
}

fail() {
  echo "remote-deploy[$DEPLOY_ENVIRONMENT]: $*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "missing required file: $path"
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || fail "$name is required"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "missing required environment variable: $name"
}

validate_color() {
  case "$1" in
    blue|green) return 0 ;;
    *) return 1 ;;
  esac
}

require_color() {
  local color="$1"
  validate_color "$color" || fail "invalid deployment color: $color"
}

opposite_color() {
  local color="$1"
  require_color "$color"
  if [[ "$color" == "blue" ]]; then
    printf 'green\n'
  else
    printf 'blue\n'
  fi
}

load_api_env() {
  require_file "$API_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$API_ENV_FILE"
  set +a
}

load_deploy_env_if_exists() {
  if [[ -f "$DEPLOY_ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$DEPLOY_ENV_FILE"
    set +a
  fi
}

normalize_slot_deploy_env() {
  local legacy_api="${KIDITEM_API_IMAGE:-}"
  local legacy_web="${KIDITEM_WEB_IMAGE:-}"

  if ! validate_color "${KIDITEM_ACTIVE_COLOR:-}"; then
    KIDITEM_ACTIVE_COLOR="blue"
  fi

  if [[ -n "$legacy_api" ]]; then
    KIDITEM_BLUE_API_IMAGE="${KIDITEM_BLUE_API_IMAGE:-$legacy_api}"
    KIDITEM_GREEN_API_IMAGE="${KIDITEM_GREEN_API_IMAGE:-$legacy_api}"
  fi
  if [[ -n "$legacy_web" ]]; then
    KIDITEM_BLUE_WEB_IMAGE="${KIDITEM_BLUE_WEB_IMAGE:-$legacy_web}"
    KIDITEM_GREEN_WEB_IMAGE="${KIDITEM_GREEN_WEB_IMAGE:-$legacy_web}"
  fi

  export KIDITEM_ACTIVE_COLOR
  export KIDITEM_BLUE_API_IMAGE KIDITEM_BLUE_WEB_IMAGE
  export KIDITEM_GREEN_API_IMAGE KIDITEM_GREEN_WEB_IMAGE
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

  [[ -n "${AGENT_DEFAULT_MODEL:-}" ]] || fail "missing required API env: set AGENT_DEFAULT_MODEL in $API_ENV_FILE"
  [[ -n "${AI_TEXT_MODEL:-}" ]] || fail "missing required API env: set AI_TEXT_MODEL in $API_ENV_FILE for direct detail page generation"
  [[ -n "${AI_IMAGE_MODEL:-}" ]] || fail "missing required API env: set AI_IMAGE_MODEL in $API_ENV_FILE for direct detail page/thumbnail/image-edit generation"
  [[ -n "${AI_IMAGE_ANALYSIS_MODEL:-}" ]] || fail "missing required API env: set AI_IMAGE_ANALYSIS_MODEL in $API_ENV_FILE for direct detail page vision inference"
}

compose() (
  require_file "$DEPLOY_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV_FILE"
  set +a
  normalize_slot_deploy_env
  docker compose --env-file "$WEB_ENV_FILE" -f "$COMPOSE_FILE" "$@"
)

manifest_color() {
  local manifest="$1"

  python3 - "$manifest" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        color = json.load(handle).get("activeColor", "")
except Exception:
    color = ""

print(color if color in {"blue", "green"} else "")
PY
}

current_color() {
  require_command python3

  local manifest="$DEPLOYMENTS_DIR/current.json"
  local color=""

  if [[ -f "$manifest" ]]; then
    color="$(manifest_color "$manifest")"
    if validate_color "$color"; then
      printf '%s\n' "$color"
      return 0
    fi
  fi

  if [[ -f "$DEPLOY_ENV_FILE" ]]; then
    load_deploy_env_if_exists
    normalize_slot_deploy_env
    color="${KIDITEM_ACTIVE_COLOR:-}"
    if validate_color "$color"; then
      printf '%s\n' "$color"
      return 0
    fi
  fi

  printf 'blue\n'
}

api_service() {
  local color="$1"
  require_color "$color"
  printf 'api-%s\n' "$color"
}

web_service() {
  local color="$1"
  require_color "$color"
  printf 'web-%s\n' "$color"
}

worker_service() {
  local color="$1"
  require_color "$color"
  printf 'worker-%s\n' "$color"
}

slot_services() {
  local color="$1"
  printf '%s %s %s\n' "$(api_service "$color")" "$(web_service "$color")" "$(worker_service "$color")"
}

write_slot_deploy_env() {
  local target_color="$1"
  local active_color="$2"
  local candidate_api="$KIDITEM_API_IMAGE"
  local candidate_web="$KIDITEM_WEB_IMAGE"
  require_color "$target_color"
  require_color "$active_color"
  [[ -n "$candidate_api" ]] || fail "missing required environment variable: KIDITEM_API_IMAGE"
  [[ -n "$candidate_web" ]] || fail "missing required environment variable: KIDITEM_WEB_IMAGE"

  load_deploy_env_if_exists
  normalize_slot_deploy_env
  KIDITEM_API_IMAGE="$candidate_api"
  KIDITEM_WEB_IMAGE="$candidate_web"
  export KIDITEM_API_IMAGE KIDITEM_WEB_IMAGE

  local blue_api="${KIDITEM_BLUE_API_IMAGE:-}"
  local blue_web="${KIDITEM_BLUE_WEB_IMAGE:-}"
  local green_api="${KIDITEM_GREEN_API_IMAGE:-}"
  local green_web="${KIDITEM_GREEN_WEB_IMAGE:-}"

  if [[ "$target_color" == "blue" ]]; then
    blue_api="$candidate_api"
    blue_web="$candidate_web"
  else
    green_api="$candidate_api"
    green_web="$candidate_web"
  fi

  blue_api="${blue_api:-$candidate_api}"
  blue_web="${blue_web:-$candidate_web}"
  green_api="${green_api:-$candidate_api}"
  green_web="${green_web:-$candidate_web}"

  local tmp
  tmp="$(mktemp "${DEPLOY_ENV_FILE}.tmp.XXXXXX")"
  chmod 600 "$tmp"
  {
    printf 'KIDITEM_ACTIVE_COLOR=%s\n' "$active_color"
    printf 'KIDITEM_BLUE_API_IMAGE=%s\n' "$blue_api"
    printf 'KIDITEM_BLUE_WEB_IMAGE=%s\n' "$blue_web"
    printf 'KIDITEM_GREEN_API_IMAGE=%s\n' "$green_api"
    printf 'KIDITEM_GREEN_WEB_IMAGE=%s\n' "$green_web"
  } >"$tmp"
  mv "$tmp" "$DEPLOY_ENV_FILE"
  chmod 600 "$DEPLOY_ENV_FILE"
}

seed_agent_os() {
  local color="$1"
  local service
  service="$(api_service "$color")"
  echo "Seeding Agent OS instances with $service"
  compose run --rm --no-deps "$service" node dist/agent-os/seed-agent-os.js
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
  echo "Stopping current $DEPLOY_ENVIRONMENT containers to free image layers for retry"
  if [[ -f "$DEPLOY_ENV_FILE" ]]; then
    compose down --remove-orphans
  else
    docker rm -f \
      "${CONTAINER_PREFIX}-nginx" \
      "${CONTAINER_PREFIX}-web-blue" \
      "${CONTAINER_PREFIX}-api-blue" \
      "${CONTAINER_PREFIX}-worker-blue" \
      "${CONTAINER_PREFIX}-web-green" \
      "${CONTAINER_PREFIX}-api-green" \
      "${CONTAINER_PREFIX}-worker-green" \
      "$SOURCING_CHROME_CONTAINER" \
      "$SOURCING_CDP_PROXY_CONTAINER" >/dev/null 2>&1 || true
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

  echo "Pulling $DEPLOY_ENVIRONMENT API image"
  status=0
  pull_image "$KIDITEM_API_IMAGE" || status=$?
  [[ "$status" == "0" ]] || return "$status"

  echo "Pulling $DEPLOY_ENVIRONMENT web image"
  status=0
  pull_image "$KIDITEM_WEB_IMAGE" || status=$?
  [[ "$status" == "0" ]] || return "$status"

  echo "Pulling staging sourcing Chrome image"
  status=0
  pull_image "$SOURCING_CHROME_IMAGE" || status=$?
  [[ "$status" == "0" ]] || return "$status"

  echo "Pulling staging sourcing CDP proxy image"
  status=0
  pull_image "$SOURCING_CDP_PROXY_IMAGE" || status=$?
  [[ "$status" == "0" ]] || return "$status"

  return 0
}

wait_for_container_health() {
  local service="$1"
  local cid=""
  local status=""

  for _ in $(seq 1 90); do
    cid="$(compose ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      case "$status" in
        healthy)
          echo "$service is healthy"
          return 0
          ;;
        running)
          echo "$service is running"
          return 0
          ;;
        unhealthy|exited|dead)
          break
          ;;
      esac
    fi
    sleep 2
  done

  echo "$service did not become healthy; last status=${status:-unknown}" >&2
  return 1
}

ensure_sourcing_browser() {
  echo "Starting shared staging sourcing Chrome and private CDP proxy"
  compose up -d sourcing-chrome sourcing-cdp-proxy
  wait_for_container_health sourcing-chrome
  wait_for_container_health sourcing-cdp-proxy
}

verify_sourcing_browser_cdp() {
  local service="$1"
  echo "Checking sourcing Chrome CDP connectivity from $service"
  compose exec -T "$service" node - <<'NODE'
const { chromium } = require('playwright');
const endpoint = process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT;

if (!endpoint) {
  throw new Error('SOURCING_PLAYWRIGHT_CDP_ENDPOINT is missing');
}

(async () => {
  const versionUrl = new URL('/json/version', endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
  const response = await fetch(versionUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`CDP version endpoint returned HTTP ${response.status}`);
  }

  const version = await response.json();
  if (typeof version.webSocketDebuggerUrl !== 'string' || !version.webSocketDebuggerUrl) {
    throw new Error('CDP version response is missing webSocketDebuggerUrl');
  }

  const browser = await chromium.connectOverCDP(endpoint, { timeout: 10000 });
  if (!browser.isConnected() || browser.contexts().length === 0) {
    throw new Error('Playwright connected to CDP without a default browser context');
  }
  await browser.close();
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
NODE
}

verify_render_image_runtime() {
  local service="$1"
  echo "Checking API render-image browser runtime in $service"
  compose exec -T "$service" node - <<'NODE'
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

candidate_logs() {
  local color="$1"
  echo "Compose status:" >&2
  compose ps >&2 || true
  echo "Recent candidate logs:" >&2
  compose logs --tail=100 nginx sourcing-chrome sourcing-cdp-proxy "$(web_service "$color")" "$(api_service "$color")" "$(worker_service "$color")" >&2 || true
}

wait_for_candidate_health() {
  local color="$1"
  local api web worker
  api="$(api_service "$color")"
  web="$(web_service "$color")"
  worker="$(worker_service "$color")"

  wait_for_container_health "$api" || return 1
  verify_sourcing_browser_cdp "$api" || return 1
  wait_for_container_health "$web" || return 1
  wait_for_container_health "$worker" || return 1
  verify_render_image_runtime "$api"
}

render_nginx_for_color() {
  local color="$1"
  require_color "$color"
  require_command python3
  require_file "$NGINX_TEMPLATE_FILE"

  mkdir -p "$(dirname "$GENERATED_NGINX_FILE")"

  local tmp
  tmp="$(mktemp "${GENERATED_NGINX_FILE}.tmp.XXXXXX")"
  KIDITEM_API_UPSTREAM="$(api_service "$color"):4000" \
  KIDITEM_WEB_UPSTREAM="$(web_service "$color"):3000" \
    python3 - "$NGINX_TEMPLATE_FILE" "$tmp" <<'PY'
import os
import sys

source_path, target_path = sys.argv[1:3]
with open(source_path, "r", encoding="utf-8") as handle:
    text = handle.read()

replacements = {
    "${KIDITEM_API_UPSTREAM}": os.environ["KIDITEM_API_UPSTREAM"],
    "${KIDITEM_WEB_UPSTREAM}": os.environ["KIDITEM_WEB_UPSTREAM"],
}

for placeholder, value in replacements.items():
    if placeholder not in text:
        raise SystemExit(f"missing nginx template placeholder: {placeholder}")
    text = text.replace(placeholder, value)

with open(target_path, "w", encoding="utf-8") as handle:
    handle.write(text)
PY

  if [[ -f "$GENERATED_NGINX_FILE" ]]; then
    cat "$tmp" >"$GENERATED_NGINX_FILE"
    rm -f "$tmp"
  else
    mv "$tmp" "$GENERATED_NGINX_FILE"
  fi
  chmod 644 "$GENERATED_NGINX_FILE"
  echo "Rendered nginx config for $color"
}

nginx_config_mount_matches() {
  [[ -f "$GENERATED_NGINX_FILE" ]] || return 1
  cmp -s "$GENERATED_NGINX_FILE" <(compose exec -T nginx cat /etc/nginx/conf.d/default.conf 2>/dev/null)
}

reload_or_start_nginx() {
  if [[ -n "$(compose ps -q nginx 2>/dev/null || true)" ]]; then
    if ! nginx_config_mount_matches; then
      echo "Recreating nginx so its file bind mount sees the rendered config"
      compose up -d --force-recreate nginx
    fi
    compose exec -T nginx nginx -t
    compose exec -T nginx nginx -s reload
  else
    compose up -d nginx
    compose exec -T nginx nginx -t
  fi
}

wait_for_public_health() {
  local code

  for _ in $(seq 1 30); do
    if curl -fsS "$LOCAL_WEB_URL" >/dev/null; then
      code="$(curl -sS -o /dev/null -w '%{http_code}' "$LOCAL_AUTH_URL" || true)"
      case "$code" in
        401|403)
          echo "$DEPLOY_ENVIRONMENT public smoke checks passed: /login=200, /api/auth/me=$code"
          return 0
          ;;
      esac
    fi
    sleep 2
  done

  echo "$DEPLOY_ENVIRONMENT public route did not become healthy." >&2
  return 1
}

switch_traffic() {
  local target_color="$1"
  local previous_color="$2"
  local target_services
  require_color "$target_color"
  require_color "$previous_color"
  read -r -a target_services <<<"$(slot_services "$target_color")"

  render_nginx_for_color "$target_color"
  reload_or_start_nginx

  if wait_for_public_health; then
    return 0
  fi

  echo "Public smoke failed after switch; restoring nginx to $previous_color" >&2
  render_nginx_for_color "$previous_color"
  reload_or_start_nginx || true
  compose stop "${target_services[@]}" >/dev/null 2>&1 || true
  candidate_logs "$target_color"
  return 1
}

cleanup_previous_slot() {
  local previous_color="$1"
  local previous_services
  require_color "$previous_color"
  read -r -a previous_services <<<"$(slot_services "$previous_color")"

  echo "Stopping previous $DEPLOY_ENVIRONMENT slot: $previous_color"
  compose stop "${previous_services[@]}" >/dev/null 2>&1 || true
  compose rm -f "${previous_services[@]}" >/dev/null 2>&1 || true
}

write_manifest() {
  local active_color="$1"
  local previous_color="$2"
  require_color "$active_color"
  require_color "$previous_color"
  require_command python3

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
  export ACTIVE_COLOR="$active_color"
  export PREVIOUS_COLOR="$previous_color"
  export DEPLOY_ENVIRONMENT="$DEPLOY_ENVIRONMENT"

  python3 - "$manifest_path" <<'PY'
import json
import os
import sys

path = sys.argv[1]

manifest = {
    "schemaVersion": f"kiditem.{os.environ.get('DEPLOY_ENVIRONMENT', 'staging')}.deploy.v2",
    "appVersion": os.environ.get("APP_VERSION"),
    "deployedAt": os.environ.get("DEPLOYED_AT"),
    "operation": os.environ.get("DEPLOY_OPERATION", "deploy"),
    "activeColor": os.environ.get("ACTIVE_COLOR"),
    "previousColor": os.environ.get("PREVIOUS_COLOR"),
    "gitSha": os.environ.get("GIT_SHA"),
    "apiImage": os.environ.get("KIDITEM_API_IMAGE"),
    "webImage": os.environ.get("KIDITEM_WEB_IMAGE"),
    "apiImageTag": os.environ.get("KIDITEM_API_IMAGE_TAG"),
    "webImageTag": os.environ.get("KIDITEM_WEB_IMAGE_TAG"),
    "apiImageDigest": os.environ.get("API_IMAGE_DIGEST"),
    "webImageDigest": os.environ.get("WEB_IMAGE_DIGEST"),
    "apiImageId": os.environ.get("API_IMAGE_ID"),
    "webImageId": os.environ.get("WEB_IMAGE_ID"),
    "apiImageRevision": os.environ.get("API_IMAGE_REVISION"),
    "webImageRevision": os.environ.get("WEB_IMAGE_REVISION"),
    "publicUrl": os.environ.get("PUBLIC_URL") or os.environ.get("STAGING_URL"),
    "slotServices": {
        "api": f"api-{os.environ.get('ACTIVE_COLOR')}",
        "web": f"web-{os.environ.get('ACTIVE_COLOR')}",
        "worker": f"worker-{os.environ.get('ACTIVE_COLOR')}",
    },
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

validate_image_revisions() {
  require_env GIT_SHA
  local api_revision web_revision
  api_revision="$(docker image inspect "$KIDITEM_API_IMAGE" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"
  web_revision="$(docker image inspect "$KIDITEM_WEB_IMAGE" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"
  [[ -n "$api_revision" && "$api_revision" != "<no value>" ]] || fail "API image revision label is missing"
  [[ -n "$web_revision" && "$web_revision" != "<no value>" ]] || fail "Web image revision label is missing"
  [[ "$api_revision" == "$GIT_SHA" ]] || fail "API image revision does not match guarded git SHA"
  [[ "$web_revision" == "$GIT_SHA" ]] || fail "Web image revision does not match guarded git SHA"
  export API_IMAGE_REVISION="$api_revision"
  export WEB_IMAGE_REVISION="$web_revision"
}

deploy() {
  cd "$APP_DIR"
  require_command docker
  require_command curl
  require_env KIDITEM_API_IMAGE
  require_env KIDITEM_WEB_IMAGE
  require_file "$COMPOSE_FILE"
  require_file "$WEB_ENV_FILE"
  require_file "$API_ENV_FILE"
  require_file "$BROWSER_ENV_FILE"
  require_file "$NGINX_TEMPLATE_FILE"

  local active_color target_color pull_status allow_downtime_for_space target_services
  active_color="$(current_color)"
  target_color="$(opposite_color "$active_color")"
  echo "Current $DEPLOY_ENVIRONMENT slot: $active_color"
  echo "Candidate $DEPLOY_ENVIRONMENT slot: $target_color"

  docker_login_if_available

  if [[ "${SKIP_IMAGE_PULL:-}" == "1" ]]; then
    echo "Skipping image pull because SKIP_IMAGE_PULL=1"
  else
    allow_downtime_for_space="${ALLOW_STAGING_DOWNTIME_FOR_SPACE:-1}"
    reclaim_docker_space
    pull_status=0
    pull_staging_images || pull_status=$?

    if [[ "$pull_status" == "75" ]]; then
      if [[ "$allow_downtime_for_space" != "1" ]]; then
        fail "Refusing to stop the running staging stack after image pull ran out of disk. Free disk or grow the EC2 volume, then retry. Set ALLOW_STAGING_DOWNTIME_FOR_SPACE=1 only for an explicitly approved downtime deploy."
      fi
      echo "Image pull ran out of disk after unused-resource cleanup; retrying after stopping the staging stack"
      stop_staging_stack_for_space
      reclaim_docker_space
      pull_staging_images
      active_color="blue"
      target_color="green"
    elif [[ "$pull_status" != "0" ]]; then
      return "$pull_status"
    fi
  fi

  validate_image_revisions

  write_slot_deploy_env "$target_color" "$active_color"

  validate_agent_os_runtime_env
  compose config >/dev/null
  ensure_sourcing_browser
  render_nginx_for_color "$active_color"
  seed_agent_os "$target_color"
  read -r -a target_services <<<"$(slot_services "$target_color")"
  compose up -d --force-recreate "${target_services[@]}"
  compose ps

  if ! wait_for_candidate_health "$target_color"; then
    candidate_logs "$target_color"
    compose stop "${target_services[@]}" >/dev/null 2>&1 || true
    if [[ "$allow_downtime_for_space" != "1" ]]; then
      fail "candidate slot $target_color failed health checks"
    fi

    echo "Candidate slot $target_color failed while previous slot $active_color was still running; retrying after stopping current stack because downtime is approved"
    stop_staging_stack_for_space
    reclaim_docker_space
    pull_staging_images
    active_color="blue"
    target_color="green"
    write_slot_deploy_env "$target_color" "$active_color"
    validate_agent_os_runtime_env
    compose config >/dev/null
    ensure_sourcing_browser
    render_nginx_for_color "$active_color"
    seed_agent_os "$target_color"
    read -r -a target_services <<<"$(slot_services "$target_color")"
    compose up -d --force-recreate "${target_services[@]}"
    compose ps

    if ! wait_for_candidate_health "$target_color"; then
      candidate_logs "$target_color"
      compose stop "${target_services[@]}" >/dev/null 2>&1 || true
      fail "candidate slot $target_color failed health checks after downtime recovery"
    fi
  fi

  switch_traffic "$target_color" "$active_color"
  write_slot_deploy_env "$target_color" "$target_color"
  write_manifest "$target_color" "$active_color"
  cleanup_previous_slot "$active_color"
  status
}

quiesce() {
  cd "$APP_DIR"
  require_command docker
  require_file "$COMPOSE_FILE"
  require_file "$DEPLOY_ENV_FILE"
  require_file "$WEB_ENV_FILE"

  echo "Quiescing $DEPLOY_ENVIRONMENT application traffic for guarded database rebuild"
  compose config >/dev/null
  compose stop api-blue web-blue worker-blue api-green web-green worker-green nginx
  compose ps
}

resume() {
  cd "$APP_DIR"
  require_command docker
  require_file "$COMPOSE_FILE"
  require_file "$DEPLOY_ENV_FILE"
  require_file "$WEB_ENV_FILE"
  require_file "$BROWSER_ENV_FILE"
  require_file "$NGINX_TEMPLATE_FILE"

  local active_color active_services
  active_color="$(current_color)"
  read -r -a active_services <<<"$(slot_services "$active_color")"
  echo "Resuming previous $DEPLOY_ENVIRONMENT runtime on $active_color after pre-reset failure"
  compose config >/dev/null
  ensure_sourcing_browser
  render_nginx_for_color "$active_color"
  compose up -d "${active_services[@]}"
  wait_for_candidate_health "$active_color"
  reload_or_start_nginx
  wait_for_public_health
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
  echo "Active color: $(current_color)"

  if [[ -f "$DEPLOY_ENV_FILE" ]]; then
    load_deploy_env_if_exists
    normalize_slot_deploy_env
    echo "Slot images:"
    printf '  blue api:  %s\n' "${KIDITEM_BLUE_API_IMAGE:-unset}"
    printf '  blue web:  %s\n' "${KIDITEM_BLUE_WEB_IMAGE:-unset}"
    printf '  green api: %s\n' "${KIDITEM_GREEN_API_IMAGE:-unset}"
    printf '  green web: %s\n' "${KIDITEM_GREEN_WEB_IMAGE:-unset}"
  fi

  echo
  echo "Compose status:"
  if [[ -f "$DEPLOY_ENV_FILE" ]]; then
    compose ps

    local active_api browser_cid proxy_cid browser_health proxy_health
    active_api="$(api_service "$(current_color)")"
    browser_cid="$(compose ps -q sourcing-chrome 2>/dev/null || true)"
    proxy_cid="$(compose ps -q sourcing-cdp-proxy 2>/dev/null || true)"
    [[ -n "$browser_cid" ]] || fail "shared sourcing Chrome is not running"
    [[ -n "$proxy_cid" ]] || fail "shared sourcing CDP proxy is not running"
    browser_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$browser_cid")"
    proxy_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$proxy_cid")"
    [[ "$browser_health" == "healthy" ]] || fail "shared sourcing Chrome status is $browser_health"
    [[ "$proxy_health" == "healthy" ]] || fail "shared sourcing CDP proxy status is $proxy_health"
    verify_sourcing_browser_cdp "$active_api"
  else
    echo "No $DEPLOY_ENV_FILE found; compose image variables are not available."
    echo "Matching containers:"
    docker ps \
      --filter "name=${CONTAINER_PREFIX}" \
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
  quiesce)
    quiesce
    ;;
  resume)
    resume
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
