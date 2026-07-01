#!/usr/bin/env bash
set -Eeuo pipefail

export DEPLOY_ENVIRONMENT="${DEPLOY_ENVIRONMENT:-production}"
export CONTAINER_PREFIX="${CONTAINER_PREFIX:-kiditem-production}"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
export WEB_ENV_FILE="${WEB_ENV_FILE:-.env.production.web}"
export API_ENV_FILE="${API_ENV_FILE:-.env.production.api}"
export DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-.env.production.deploy}"
export NGINX_TEMPLATE_FILE="${NGINX_TEMPLATE_FILE:-deploy/production/nginx.conf}"
export GENERATED_NGINX_FILE="${GENERATED_NGINX_FILE:-deployments/nginx.conf}"

exec ./deploy/staging/remote-deploy.sh "$@"
