#!/usr/bin/env bash
set -Eeuo pipefail

API_ENV_FILE="${API_ENV_FILE:-.env.staging.api}"
WEB_ENV_FILE="${WEB_ENV_FILE:-.env.staging.web}"

fail() {
  echo "render-runtime-env: $*" >&2
  exit 1
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "missing required environment variable: $name"
}

append_env_line() {
  local file="$1"
  local name="$2"
  local value="$3"

  [[ "$value" != *$'\n'* ]] || fail "$name must not contain a newline"
  [[ "$value" != *$'\r'* ]] || fail "$name must not contain a carriage return"

  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\\$}"
  value="${value//\`/\\\`}"
  printf '%s="%s"\n' "$name" "$value" >> "$file"
}

write_api_env() {
  local tmp
  tmp="$(mktemp "${API_ENV_FILE}.tmp.XXXXXX")"
  chmod 600 "$tmp"

  append_env_line "$tmp" NODE_ENV "${NODE_ENV:-production}"
  append_env_line "$tmp" PORT "${PORT:-4000}"

  for name in "${required_api_env[@]}"; do
    require_env "$name"
    append_env_line "$tmp" "$name" "${!name}"
  done

  for name in "${optional_api_env[@]}"; do
    if [[ -n "${!name:-}" ]]; then
      append_env_line "$tmp" "$name" "${!name}"
    fi
  done

  mv "$tmp" "$API_ENV_FILE"
  chmod 600 "$API_ENV_FILE"
}

write_web_env() {
  local tmp
  tmp="$(mktemp "${WEB_ENV_FILE}.tmp.XXXXXX")"
  chmod 600 "$tmp"

  append_env_line "$tmp" NEXT_PUBLIC_API_URL "${NEXT_PUBLIC_API_URL:-}"

  for name in "${required_web_env[@]}"; do
    require_env "$name"
    append_env_line "$tmp" "$name" "${!name}"
  done

  mv "$tmp" "$WEB_ENV_FILE"
  chmod 600 "$WEB_ENV_FILE"
}

required_api_env=(
  DATABASE_URL
  SUPABASE_URL
  SOURCING_EXTENSION_TOKEN_SECRET
  CORS_ORIGINS
  S3_REGION
  S3_BUCKET
  S3_ENDPOINT
  S3_PUBLIC_URL
  S3_ACCESS_KEY
  S3_SECRET_KEY
  CHANNEL_CREDENTIALS_ENCRYPTION_KEY
  GEMINI_API_KEY
  AI_TEXT_MODEL
  AI_IMAGE_MODEL
  AI_IMAGE_ANALYSIS_MODEL
  AI_IMAGE_ANALYSIS_VERIFY_MODEL
  AGENT_RUNTIME_WORKER_ENABLED
  AGENT_DEFAULT_MODEL
)

required_web_env=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)

optional_api_env=(
  DIRECT_URL
  SOURCING_EXTENSION_TOKEN_TTL_SECONDS
  SOURCING_EXTENSION_TOKEN_MAX_SECONDS
  NAVER_DATALAB_CLIENT_ID
  NAVER_DATALAB_CLIENT_SECRET
  NAVER_DATALAB_BASE_URL
  NAVER_DATALAB_WEB_BASE_URL
  NAVER_SEARCHAD_API_KEY
  NAVER_SEARCHAD_SECRET_KEY
  NAVER_SEARCHAD_CUSTOMER_ID
  NAVER_SEARCHAD_BASE_URL
  TMAPI_TOKEN
  TMAPI_BASE_URL
)

write_api_env
write_web_env

echo "Rendered $API_ENV_FILE and $WEB_ENV_FILE"
