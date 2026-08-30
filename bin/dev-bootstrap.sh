#!/usr/bin/env bash

set -euo pipefail

KIDITEM_REPO_ROOT="$(git rev-parse --show-toplevel)"
exec node "$KIDITEM_REPO_ROOT/scripts/setup-macos-development.mjs" "$@"
