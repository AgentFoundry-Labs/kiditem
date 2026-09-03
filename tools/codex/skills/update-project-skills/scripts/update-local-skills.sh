#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || pwd)"
KIDITEM_ROOT="${KIDITEM_ROOT:-$DEFAULT_ROOT}"
SKILLS_DIR="$KIDITEM_ROOT/.agents/skills"
SOURCES_DIR="$KIDITEM_ROOT/tools/codex/skills"
CODEX_BIN="${CODEX_BIN:-$(command -v codex || true)}"
VERIFY_ONLY=0

usage() {
  cat <<'EOF'
Usage: update-local-skills.sh [--verify-only]

Reconciles KidItem-owned skills into .agents/skills. Shared development skills
are managed globally by development@agent-skill-hub and are not touched here.

  --verify-only  Check project-local links and prompt discovery without changes.

Optional environment:
  KIDITEM_ROOT  Override the detected KidItem repository root.
  CODEX_BIN     Override the Codex binary path.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --verify-only) VERIFY_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

log() { printf '%s\n' "$*"; }

require_dir() {
  local dir="$1"
  [ -d "$dir" ] || { echo "Missing directory: $dir" >&2; exit 1; }
}

reconcile_project_skills() {
  local entry name source link target found=0

  if [ "$VERIFY_ONLY" -eq 1 ]; then
    require_dir "$SKILLS_DIR"
  else
    mkdir -p "$SKILLS_DIR"
  fi

  for entry in "$SKILLS_DIR"/*; do
    [ -e "$entry" ] || [ -L "$entry" ] || continue
    name="$(basename "$entry")"
    source="$SOURCES_DIR/$name"
    [ -f "$source/SKILL.md" ] && continue
    if [ ! -L "$entry" ]; then
      echo "Unexpected real path in project skill discovery: $entry" >&2
      exit 1
    fi
    if [ "$VERIFY_ONLY" -eq 1 ]; then
      echo "Unexpected project skill link: $entry -> $(readlink "$entry")" >&2
      exit 1
    fi
    unlink "$entry"
  done

  log ""
  log "== KidItem-owned skills =="
  for source in "$SOURCES_DIR"/*; do
    [ -f "$source/SKILL.md" ] || continue
    found=$((found + 1))
    name="$(basename "$source")"
    link="$SKILLS_DIR/$name"
    target="../../tools/codex/skills/$name"

    if [ "$VERIFY_ONLY" -eq 0 ]; then
      if [ -e "$link" ] && [ ! -L "$link" ]; then
        echo "Refusing to replace real path: $link" >&2
        exit 1
      fi
      if [ -L "$link" ] && [ "$(readlink "$link")" != "$target" ]; then
        unlink "$link"
      fi
      [ -L "$link" ] || ln -s "$target" "$link"
    fi

    [ -L "$link" ] || { echo "Missing project skill link: $link" >&2; exit 1; }
    [ "$(readlink "$link")" = "$target" ] || {
      echo "Incorrect project skill link: $link -> $(readlink "$link")" >&2
      exit 1
    }
    [ -f "$link/SKILL.md" ] || { echo "Missing SKILL.md through $link" >&2; exit 1; }
    log "$name -> $target"
  done

  [ "$found" -gt 0 ] || {
    echo "No KidItem-owned skills found in $SOURCES_DIR" >&2
    exit 1
  }
}

verify_prompt_scope() {
  [ -x "$CODEX_BIN" ] || return 0

  log ""
  log "== fresh Codex prompt scope =="
  local prompt_skills source name
  prompt_skills="$(cd "$KIDITEM_ROOT" && "$CODEX_BIN" debug prompt-input probe 2>/dev/null | perl -pe 's/\\n/\n/g' | grep -E '^- ' || true)"
  for source in "$SOURCES_DIR"/*; do
    [ -f "$source/SKILL.md" ] || continue
    name="$(basename "$source")"
    echo "$prompt_skills" | grep -F -- "- $name:" >/dev/null || {
      echo "KidItem fresh prompt did not show project skill: $name" >&2
      exit 1
    }
  done
  log "Prompt scope check passed for KidItem-owned skills."
}

require_dir "$KIDITEM_ROOT"
require_dir "$SOURCES_DIR"
log "== $(basename "$KIDITEM_ROOT") =="
git -C "$KIDITEM_ROOT" status --short --branch
reconcile_project_skills
verify_prompt_scope

log ""
log "Done. Start a fresh Codex task to refresh injected skill metadata."
