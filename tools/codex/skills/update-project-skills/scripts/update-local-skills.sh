#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || pwd)"
KIDITEM_ROOT="${KIDITEM_ROOT:-$DEFAULT_ROOT}"
SKILLS_DIR="$KIDITEM_ROOT/.agents/skills"
SHARED_SKILLS_DIR="$KIDITEM_ROOT/tools/codex/skills"
PROFILE_MANAGER="$SCRIPT_DIR/manage-skill-profile.mjs"
PROFILE_MANIFEST="$KIDITEM_ROOT/tools/codex/skill-profiles.json"
SKILL_HUB_ROOT="${AGENT_SKILL_HUB_ROOT:-$HOME/workspace/agent-skill-hub}"
SKILL_HUB_MANAGER="$SKILL_HUB_ROOT/manage.mjs"
CODEX_BIN="${CODEX_BIN:-/Applications/Codex.app/Contents/Resources/codex}"

VERIFY_ONLY=0
NO_PULL=0

usage() {
  cat <<'EOF'
Usage: update-local-skills.sh [--verify-only] [--no-pull]

Updates reusable hub exports and reapplies KidItem's active Codex skill profile.
Source repositories live in the workspace hub; .agents/skills is discovery only.

  --verify-only   Check hub exports, profile drift, links, and prompt scope.
  --no-pull       Regenerate exports from existing source revisions.

Optional environment:
  KIDITEM_ROOT          Override the detected KidItem repository root.
  AGENT_SKILL_HUB_ROOT  Override the reusable skill hub location.
  CODEX_BIN             Override the Codex binary path.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --verify-only) VERIFY_ONLY=1; shift ;;
    --no-pull) NO_PULL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

log() { printf '%s\n' "$*"; }
run() { printf '+ ' >&2; printf '%q ' "$@" >&2; printf '\n' >&2; "$@"; }

require_dir() {
  local dir="$1"
  [ -d "$dir" ] || { echo "Missing directory: $dir" >&2; exit 1; }
}

require_file() {
  local file="$1"
  [ -f "$file" ] || { echo "Missing file: $file" >&2; exit 1; }
}

git_summary() {
  local dir="$1"
  require_dir "$dir"
  log ""
  log "== $(basename "$dir") =="
  git -C "$dir" status --short --branch
}

verify_shared_project_sources() {
  local skill_dir name found=0

  require_dir "$SHARED_SKILLS_DIR"
  log ""
  log "== shared project skill sources =="
  for skill_dir in "$SHARED_SKILLS_DIR"/*; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    name="$(basename "$skill_dir")"
    found=$((found + 1))
    log "$name"
  done
  [ "$found" -gt 0 ] || {
    echo "No shared project skills found in $SHARED_SKILLS_DIR" >&2
    exit 1
  }
}

verify_local_harness_layout() {
  local stale_path

  log ""
  log "== local harness layout =="
  for stale_path in \
    "$KIDITEM_ROOT/.agents/sources" \
    "$KIDITEM_ROOT/.agents/catalog" \
    "$KIDITEM_ROOT/.agents/tmp" \
    "$KIDITEM_ROOT/.agents/understand-anything-plugin"; do
    if [ -e "$stale_path" ] || [ -L "$stale_path" ]; then
      echo "Legacy project-local skill residue must be removed: $stale_path" >&2
      exit 1
    fi
  done
  log "Project-local discovery contains no legacy source or cache roots."
}

update_skill_hub() {
  require_file "$SKILL_HUB_MANAGER"
  log ""
  log "== reusable skill hub =="
  if [ "$NO_PULL" -eq 1 ]; then
    run node "$SKILL_HUB_MANAGER" update --no-pull
  else
    run node "$SKILL_HUB_MANAGER" update
  fi
}

verify_skill_hub() {
  require_file "$SKILL_HUB_MANAGER"
  log ""
  log "== reusable skill hub coverage =="
  run node "$SKILL_HUB_MANAGER" verify
}

apply_active_profile() {
  require_file "$PROFILE_MANIFEST"
  require_file "$PROFILE_MANAGER"
  run node "$PROFILE_MANAGER" apply --root "$KIDITEM_ROOT"
}

verify_active_profile() {
  require_file "$PROFILE_MANIFEST"
  require_file "$PROFILE_MANAGER"
  run node "$PROFILE_MANAGER" verify --root "$KIDITEM_ROOT"
}

verify_shared_project_skills() {
  local skill_dir name

  log ""
  log "== shared project skill coverage =="
  for skill_dir in "$SHARED_SKILLS_DIR"/*; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    name="$(basename "$skill_dir")"
    [ -L "$SKILLS_DIR/$name" ] || {
      echo "Missing shared skill link: $SKILLS_DIR/$name" >&2
      exit 1
    }
    require_file "$SKILLS_DIR/$name/SKILL.md"
    log "$name"
  done
}

verify_symlink_skills() {
  local link

  log ""
  log "== active discovery links =="
  for link in "$SKILLS_DIR"/*; do
    [ -L "$link" ] || continue
    require_file "$link/SKILL.md"
    log "$(basename "$link") -> $(readlink "$link")"
  done
}

report_local_only_skills() {
  local skill

  log ""
  log "== unmanaged discovery directories =="
  for skill in "$SKILLS_DIR"/*; do
    [ -d "$skill" ] || continue
    [ -L "$skill" ] && continue
    log "$(basename "$skill")"
  done
}

verify_prompt_scope() {
  [ -x "$CODEX_BIN" ] || return 0

  log ""
  log "== fresh Codex prompt scope =="
  local kiditem_hits required_names name
  kiditem_hits="$(cd "$KIDITEM_ROOT" && "$CODEX_BIN" debug prompt-input probe 2>/dev/null | perl -pe 's/\\n/\n/g' | grep -E '^- ' || true)"
  required_names="$(node -e '
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const selector of manifest.required || []) console.log(selector.split(":").slice(1).join(":"));
' "$PROFILE_MANIFEST")"

  while IFS= read -r name; do
    [ -n "$name" ] || continue
    echo "$kiditem_hits" | grep -F -- "- $name" >/dev/null || {
      echo "KidItem fresh prompt did not show required project-local skill: $name" >&2
      exit 1
    }
  done <<< "$required_names"
  log "Prompt scope check passed for KidItem."
}

require_dir "$KIDITEM_ROOT"
mkdir -p "$SKILLS_DIR"
git_summary "$KIDITEM_ROOT"
verify_local_harness_layout
verify_shared_project_sources

if [ "$VERIFY_ONLY" -eq 0 ]; then
  update_skill_hub
  apply_active_profile
fi

verify_skill_hub
verify_shared_project_skills
verify_symlink_skills
report_local_only_skills
verify_active_profile
verify_prompt_scope

log ""
log "Done. Start a fresh Codex task to refresh injected skill metadata."
